import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { PrismaService } from '../prisma.service';
import { AdminAuthGuard, type AuthedRequest, CurrentUser, type AuthUser } from '../common/auth';
import { randomToken, sha256Hex } from '../common/utils';
import { AuditService } from '../services/audit.service';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(body);
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: { include: { tenant: true } } },
    });
    if (!user || user.disabled) throw new UnauthorizedException('Nieprawidłowy e-mail lub hasło.');
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException('Nieprawidłowy e-mail lub hasło.');

    const token = randomToken(32);
    const csrfToken = randomToken(24);
    await this.prisma.session.create({
      data: {
        id: sha256Hex(token),
        userId: user.id,
        csrfToken,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        ip: req.ip,
        userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
      },
    });
    // W chmurze admin i API bywają na różnych subdomenach (cross-site) -
    // wtedy wymagane SameSite=None; Secure, aby cookie sesji było wysyłane.
    const secure = process.env.NODE_ENV === 'production';
    res.cookie('sid', token, {
      httpOnly: true,
      sameSite: secure ? 'none' : 'lax',
      secure,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    await this.audit.log({ userId: user.id, userEmail: user.email, action: 'login', entity: 'Session' });
    return {
      user: { id: user.id, email: user.email, name: user.name, isPlatformOwner: user.isPlatformOwner },
      csrfToken,
      memberships: user.memberships.map((m) => ({
        tenantSlug: m.tenant.slug,
        tenantName: m.tenant.name,
        role: m.role,
      })),
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.sid;
    if (token) {
      await this.prisma.session.deleteMany({ where: { id: sha256Hex(token) } });
    }
    res.clearCookie('sid', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  async me(@CurrentUser() user: AuthUser, @Req() req: AuthedRequest) {
    const memberships = user.isPlatformOwner
      ? (await this.prisma.tenant.findMany({ orderBy: { name: 'asc' } })).map((t) => ({
          tenantSlug: t.slug,
          tenantName: t.name,
          role: 'platform_owner' as const,
        }))
      : (
          await this.prisma.membership.findMany({
            where: { userId: user.id },
            include: { tenant: true },
          })
        ).map((m) => ({ tenantSlug: m.tenant.slug, tenantName: m.tenant.name, role: m.role }));
    return { user, memberships, csrfToken: req.sessionCsrf };
  }
}
