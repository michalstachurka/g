import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import * as argon2 from 'argon2';
import type { BomItemDef, RenderSpec } from '@door/contracts';
import { PrismaService } from '../prisma.service';
import {
  AdminAuthGuard,
  CurrentTenant,
  CurrentUser,
  RequireRoles,
  type AuthUser,
  type TenantContext,
} from '../common/auth';
import { BOM_ROLES, ROLES, type Role } from '../common/roles';
import { AuditService } from '../services/audit.service';
import { QueueService } from '../services/queue.service';
import { computeBom, computeHingeCount } from '../domain/bom-engine';
import type { SelectionMap } from '../domain/rules-engine';
import { randomToken, signPayload } from '../common/utils';

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminOperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
  ) {}

  // ── Dashboard ────────────────────────────────────────────────────────────

  @Get('dashboard')
  @RequireRoles('tenant_admin', 'sales', 'dealer', 'production', 'viewer')
  async dashboard(@CurrentTenant() t: TenantContext) {
    const tenantId = t.tenantId;
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [configurations, leads, documents, failedJobs, recentAudit, topModels] = await Promise.all([
      this.prisma.configuration.count({ where: { tenantId } }),
      this.prisma.lead.count({ where: { tenantId } }),
      this.prisma.generatedDocument.count({ where: { tenantId, status: 'done' } }),
      this.prisma.generatedModel.count({ where: { tenantId, status: 'failed' } }) ,
      this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.configuration.groupBy({
        by: ['modelKey'],
        where: { tenantId, createdAt: { gte: since } },
        _count: { modelKey: true },
        orderBy: { _count: { modelKey: 'desc' } },
        take: 5,
      }),
    ]);
    const configurationsMonth = await this.prisma.configuration.count({
      where: { tenantId, createdAt: { gte: since } },
    });
    return {
      configurations,
      configurationsLast30Days: configurationsMonth,
      leads,
      documentsGenerated: documents,
      failedModelJobs: failedJobs,
      conversionToLead: configurations > 0 ? Math.round((leads / configurations) * 100) : 0,
      topModels: topModels.map((m) => ({ modelKey: m.modelKey, count: m._count.modelKey })),
      recentChanges: recentAudit,
    };
  }

  // ── Konfiguracje i oferty ────────────────────────────────────────────────

  @Get('configurations')
  @RequireRoles('tenant_admin', 'sales', 'dealer', 'production', 'viewer')
  async configurations(@CurrentTenant() t: TenantContext, @Query('status') status?: string) {
    return this.prisma.configuration.findMany({
      where: { tenantId: t.tenantId, ...(status ? { status } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: { snapshots: { orderBy: { revision: 'desc' }, take: 1 }, leads: true },
    });
  }

  @Get('configurations/:shareId')
  @RequireRoles('tenant_admin', 'sales', 'dealer', 'production', 'viewer')
  async configuration(@CurrentTenant() t: TenantContext, @Param('shareId') shareId: string) {
    const configuration = await this.prisma.configuration.findFirst({
      where: { tenantId: t.tenantId, shareId },
      include: {
        snapshots: { orderBy: { revision: 'desc' } },
        leads: true,
      },
    });
    if (!configuration) throw new NotFoundException();
    return configuration;
  }

  /** Wewnętrzny BOM - wyłącznie role produkcyjne (RBAC na backendzie). */
  @Get('configurations/:shareId/bom')
  async bom(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('shareId') shareId: string) {
    if (t.role !== 'platform_owner' && !BOM_ROLES.includes(t.role)) {
      throw new ForbiddenException('Wewnętrzny BOM jest dostępny tylko dla ról produkcyjnych.');
    }
    const configuration = await this.prisma.configuration.findFirst({
      where: { tenantId: t.tenantId, shareId },
      include: { snapshots: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    const snapshot = configuration?.snapshots[0];
    if (!configuration || !snapshot) throw new NotFoundException();
    if (!configuration.modelKey) throw new BadRequestException('Konfiguracja nie ma modelu.');
    const model = await this.prisma.productModel.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key: configuration.modelKey } },
    });
    if (!model) throw new NotFoundException('Model nie istnieje.');
    const recipe = await this.prisma.bomRecipe.findFirst({
      where: { tenantId: t.tenantId, modelId: model.id, status: 'published' },
      orderBy: { version: 'desc' },
    });
    if (!recipe) {
      return { recipeVersion: null, lines: [], notice: 'Brak opublikowanej receptury BOM dla tego modelu.' };
    }
    const renderSpec = snapshot.renderSpec as RenderSpec | null;
    const widthMm = renderSpec?.widthMm ?? model.baseWidthMm;
    const heightMm = renderSpec?.heightMm ?? model.baseHeightMm;
    const lines = computeBom(recipe.items as unknown as BomItemDef[], {
      widthMm,
      heightMm,
      hingeCount: computeHingeCount(heightMm),
      selections: snapshot.selections as SelectionMap,
    });
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'bom_view', entity: 'Configuration', entityId: configuration.id,
    });
    return { recipeVersion: recipe.version, widthMm, heightMm, lines };
  }

  /** Dokument wewnętrzny (oferta / BOM / karta pomiarowa) przez workera. */
  @Post('configurations/:shareId/documents')
  @HttpCode(200)
  async requestDocument(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('shareId') shareId: string,
    @Body() body: unknown,
  ) {
    const { kind } = z
      .object({ kind: z.enum(['customer_specification', 'sales_quote', 'production_bom', 'measurement_sheet']) })
      .parse(body);
    if (kind === 'production_bom' && t.role !== 'platform_owner' && !BOM_ROLES.includes(t.role)) {
      throw new ForbiddenException('BOM produkcyjny jest dostępny tylko dla ról produkcyjnych.');
    }
    const configuration = await this.prisma.configuration.findFirst({
      where: { tenantId: t.tenantId, shareId },
      include: { snapshots: { orderBy: { revision: 'desc' }, take: 1 } },
    });
    const snapshot = configuration?.snapshots[0];
    if (!configuration || !snapshot) throw new NotFoundException();
    const idempotencyKey = `doc:${kind}:${snapshot.id}`;
    const existing = await this.prisma.generatedDocument.findUnique({ where: { idempotencyKey } });
    if (existing && existing.status !== 'failed') {
      return { documentId: existing.id, status: existing.status };
    }
    const document = existing
      ? await this.prisma.generatedDocument.update({ where: { id: existing.id }, data: { status: 'queued', error: null } })
      : await this.prisma.generatedDocument.create({
          data: { tenantId: t.tenantId, snapshotId: snapshot.id, kind, idempotencyKey, requestedById: u.id },
        });
    await this.queue.enqueue('document.generate', { documentId: document.id });
    return { documentId: document.id, status: document.status };
  }

  @Get('documents/:id')
  @RequireRoles('tenant_admin', 'sales', 'dealer', 'production', 'viewer')
  async documentStatus(@CurrentTenant() t: TenantContext, @Param('id') id: string) {
    const document = await this.prisma.generatedDocument.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!document) throw new NotFoundException();
    if (document.kind === 'production_bom' && t.role !== 'platform_owner' && !BOM_ROLES.includes(t.role)) {
      throw new ForbiddenException('Brak uprawnień do tego dokumentu.');
    }
    return {
      id: document.id,
      kind: document.kind,
      status: document.status,
      error: document.error,
      downloadUrl: document.status === 'done' ? `/files/documents/${signPayload({ d: document.id }, 3600)}` : null,
    };
  }

  // ── Leady ────────────────────────────────────────────────────────────────

  @Get('leads')
  @RequireRoles('tenant_admin', 'sales', 'dealer', 'viewer')
  leads(@CurrentTenant() t: TenantContext) {
    return this.prisma.lead.findMany({
      where: { tenantId: t.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { configuration: { select: { shareId: true, categoryKey: true, modelKey: true } } },
    });
  }

  @Put('leads/:id')
  @RequireRoles('tenant_admin', 'sales')
  async updateLead(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const input = z.object({ status: z.enum(['new', 'contacted', 'closed']) }).parse(body);
    const lead = await this.prisma.lead.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!lead) throw new NotFoundException();
    const updated = await this.prisma.lead.update({ where: { id }, data: { status: input.status } });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'update', entity: 'Lead', entityId: id, after: input });
    return updated;
  }

  // ── Użytkownicy i role ───────────────────────────────────────────────────

  @Get('users')
  @RequireRoles('tenant_admin')
  async users(@CurrentTenant() t: TenantContext) {
    const memberships = await this.prisma.membership.findMany({
      where: { tenantId: t.tenantId },
      include: { user: { select: { id: true, email: true, name: true, disabled: true, createdAt: true } } },
    });
    return memberships.map((m) => ({ ...m.user, role: m.role, membershipId: m.id }));
  }

  @Post('users')
  @RequireRoles('tenant_admin')
  async inviteUser(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).max(200),
        role: z.enum(ROLES.filter((r) => r !== 'platform_owner') as [Role, ...Role[]]),
        password: z.string().min(10).max(200).optional(),
      })
      .parse(body);
    const email = input.email.toLowerCase();
    let user = await this.prisma.user.findUnique({ where: { email } });
    let temporaryPassword: string | null = null;
    if (!user) {
      temporaryPassword = input.password ?? `${randomToken(9)}!A1`;
      user = await this.prisma.user.create({
        data: {
          email,
          name: input.name,
          passwordHash: await argon2.hash(temporaryPassword, { type: argon2.argon2id }),
        },
      });
    }
    await this.prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: t.tenantId } },
      create: { userId: user.id, tenantId: t.tenantId, role: input.role },
      update: { role: input.role },
    });
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'invite', entity: 'User', entityId: user.id, after: { email, role: input.role },
    });
    return { userId: user.id, email, role: input.role, temporaryPassword };
  }

  @Put('users/:membershipId')
  @RequireRoles('tenant_admin')
  async updateMembership(
    @CurrentTenant() t: TenantContext,
    @CurrentUser() u: AuthUser,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown,
  ) {
    const input = z
      .object({
        role: z.enum(ROLES.filter((r) => r !== 'platform_owner') as [Role, ...Role[]]).optional(),
        disabled: z.boolean().optional(),
      })
      .parse(body);
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId: t.tenantId },
    });
    if (!membership) throw new NotFoundException();
    if (input.role) {
      await this.prisma.membership.update({ where: { id: membershipId }, data: { role: input.role } });
    }
    if (input.disabled !== undefined) {
      await this.prisma.user.update({ where: { id: membership.userId }, data: { disabled: input.disabled } });
      if (input.disabled) {
        await this.prisma.session.deleteMany({ where: { userId: membership.userId } });
      }
    }
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'update', entity: 'Membership', entityId: membershipId, after: input,
    });
    return { ok: true };
  }

  // ── Audit log ────────────────────────────────────────────────────────────

  @Get('audit')
  @RequireRoles('tenant_admin')
  audit_(@CurrentTenant() t: TenantContext) {
    return this.prisma.auditLog.findMany({
      where: { tenantId: t.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }
}
