import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { sha256Hex } from './utils';
import type { Role } from './roles';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isPlatformOwner: boolean;
}

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  role: Role;
}

export interface AuthedRequest extends Request {
  authUser?: AuthUser;
  tenantContext?: TenantContext;
  sessionCsrf?: string;
}

export const ROLES_KEY = 'door:roles';
/** Wymagane role w kontekście tenanta. platform_owner zawsze przechodzi. */
export const RequireRoles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.sid;
    if (!token) throw new UnauthorizedException('Brak sesji. Zaloguj się.');

    const session = await this.prisma.session.findUnique({
      where: { id: sha256Hex(token) },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || session.user.disabled) {
      throw new UnauthorizedException('Sesja wygasła. Zaloguj się ponownie.');
    }

    // CSRF: podwójne przesłanie tokenu dla żądań mutujących opartych o cookie.
    if (MUTATING.has(req.method)) {
      const headerToken = req.headers['x-csrf-token'];
      if (headerToken !== session.csrfToken) {
        throw new ForbiddenException('Nieprawidłowy token CSRF.');
      }
    }

    req.authUser = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      isPlatformOwner: session.user.isPlatformOwner,
    };
    req.sessionCsrf = session.csrfToken;

    // Kontekst tenanta: nagłówek x-tenant wskazuje slug; członkostwo jest weryfikowane.
    const slug = (req.headers['x-tenant'] as string | undefined) ?? null;
    if (slug) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
      if (!tenant) throw new ForbiddenException('Nieznany tenant.');
      if (session.user.isPlatformOwner) {
        req.tenantContext = { tenantId: tenant.id, tenantSlug: tenant.slug, role: 'platform_owner' };
      } else {
        const membership = await this.prisma.membership.findUnique({
          where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
        });
        if (!membership) throw new ForbiddenException('Brak dostępu do tego tenanta.');
        req.tenantContext = {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          role: membership.role as Role,
        };
      }
    }

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0) {
      if (!req.tenantContext) {
        throw new ForbiddenException('Wybierz tenanta (nagłówek x-tenant).');
      }
      const role = req.tenantContext.role;
      if (role !== 'platform_owner' && !required.includes(role)) {
        throw new ForbiddenException('Brak uprawnień do tej operacji.');
      }
    }
    return true;
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.authUser) throw new UnauthorizedException();
  return req.authUser;
});

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!req.tenantContext) throw new ForbiddenException('Wybierz tenanta (nagłówek x-tenant).');
    return req.tenantContext;
  },
);

/** Guard endpointów wewnętrznych dla workera (token współdzielony przez env). */
@Injectable()
export class WorkerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-worker-token'];
    const expected = process.env.WORKER_TOKEN ?? 'dev-worker-token';
    if (token !== expected) throw new UnauthorizedException('Nieprawidłowy token workera.');
    return true;
  }
}
