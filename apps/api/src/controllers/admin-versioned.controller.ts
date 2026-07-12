import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  type BomItemDef,
  bomItemDefSchema,
  documentKindSchema,
  evaluateRequestSchema,
  type PriceRuleDef,
  priceListSettingsSchema,
  priceRuleDefSchema,
  type RuleDef,
  ruleDefSchema,
} from '@door/contracts';
import { PrismaService } from '../prisma.service';
import {
  AdminAuthGuard,
  CurrentTenant,
  CurrentUser,
  RequireRoles,
  type AuthUser,
  type TenantContext,
} from '../common/auth';
import { AuditService } from '../services/audit.service';
import { applyRules } from '../domain/rules-engine';
import { computePrice } from '../domain/pricing-engine';
import { computeBom, computeHingeCount } from '../domain/bom-engine';
import { EvaluateService } from '../domain/evaluate.service';

const ruleSetBody = z.object({ name: z.string().min(1).max(200), rules: z.array(ruleDefSchema) });
const priceListBody = z.object({
  name: z.string().min(1).max(200),
  settings: priceListSettingsSchema,
  rules: z.array(priceRuleDefSchema),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
});
const bomBody = z.object({
  modelKey: z.string(),
  name: z.string().min(1).max(200),
  items: z.array(bomItemDefSchema),
});
const templateBody = z.object({
  kind: documentKindSchema,
  name: z.string().min(1).max(200),
  config: z.object({
    accentColor: z.string().max(9).default('#1a1a1a'),
    showLogo: z.boolean().default(true),
    showPrice: z.boolean().default(true),
    showQr: z.boolean().default(true),
    showRender: z.boolean().default(true),
    showWarnings: z.boolean().default(true),
    footerText: z.string().max(1000).default(''),
    introText: z.string().max(2000).default(''),
    sectionsOrder: z.array(z.string()).default(['summary', 'options', 'services', 'price']),
  }),
});

@Controller('admin')
@UseGuards(AdminAuthGuard)
export class AdminVersionedController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evaluateService: EvaluateService,
  ) {}

  // ── Reguły ───────────────────────────────────────────────────────────────

  @Get('rulesets')
  @RequireRoles('tenant_admin', 'production', 'sales', 'viewer')
  ruleSets(@CurrentTenant() t: TenantContext) {
    return this.prisma.ruleSet.findMany({ where: { tenantId: t.tenantId }, orderBy: { version: 'desc' } });
  }

  @Post('rulesets')
  @RequireRoles('tenant_admin')
  async createRuleSet(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = ruleSetBody.parse(body);
    const last = await this.prisma.ruleSet.findFirst({ where: { tenantId: t.tenantId }, orderBy: { version: 'desc' } });
    const created = await this.prisma.ruleSet.create({
      data: { tenantId: t.tenantId, name: input.name, version: (last?.version ?? 0) + 1, rules: input.rules as object },
    });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'create', entity: 'RuleSet', entityId: created.id });
    return created;
  }

  @Put('rulesets/:id')
  @RequireRoles('tenant_admin')
  async updateRuleSet(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const input = ruleSetBody.partial().parse(body);
    const existing = await this.prisma.ruleSet.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    if (existing.status === 'published') throw new BadRequestException('Opublikowany zestaw reguł jest niezmienny. Utwórz nową wersję.');
    const updated = await this.prisma.ruleSet.update({
      where: { id },
      data: { name: input.name, rules: input.rules === undefined ? undefined : (input.rules as object) },
    });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'update', entity: 'RuleSet', entityId: id });
    return updated;
  }

  @Post('rulesets/:id/publish')
  @HttpCode(200)
  @RequireRoles('tenant_admin')
  async publishRuleSet(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.ruleSet.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    z.array(ruleDefSchema).parse(existing.rules);
    await this.prisma.ruleSet.updateMany({ where: { tenantId: t.tenantId, status: 'published' }, data: { status: 'archived' } });
    const published = await this.prisma.ruleSet.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date(), publishedById: u.id },
    });
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'publish', entity: 'RuleSet', entityId: id, after: { version: published.version },
    });
    return { ok: true, version: published.version };
  }

  /** Rollback: przywrócenie archiwalnej wersji jako opublikowanej. */
  @Post('rulesets/:id/rollback')
  @HttpCode(200)
  @RequireRoles('tenant_admin')
  async rollbackRuleSet(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    const target = await this.prisma.ruleSet.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!target) throw new NotFoundException();
    await this.prisma.ruleSet.updateMany({ where: { tenantId: t.tenantId, status: 'published' }, data: { status: 'archived' } });
    await this.prisma.ruleSet.update({ where: { id }, data: { status: 'published', publishedAt: new Date(), publishedById: u.id } });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'rollback', entity: 'RuleSet', entityId: id });
    return { ok: true };
  }

  /** Test reguł na przykładowej konfiguracji - bez publikowania. */
  @Post('rulesets/:id/test')
  @HttpCode(200)
  @RequireRoles('tenant_admin')
  async testRuleSet(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const existing = await this.prisma.ruleSet.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    const { selections, categoryKey, modelKey } = z
      .object({
        selections: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
        categoryKey: z.string(),
        modelKey: z.string().nullable().optional(),
      })
      .parse(body);
    const result = applyRules(existing.rules as unknown as RuleDef[], selections, {
      categoryKey,
      modelKey: modelKey ?? null,
    });
    return {
      errors: result.errors,
      warnings: result.warnings,
      adjustments: result.adjustments,
      hiddenFields: [...result.hiddenFields],
      excludedOptions: Object.fromEntries(
        [...result.excludedOptions.entries()].map(([k, v]) => [k, Object.fromEntries(v.entries())]),
      ),
      selectionsAfter: result.selections,
    };
  }

  // ── Cenniki ──────────────────────────────────────────────────────────────

  @Get('pricelists')
  @RequireRoles('tenant_admin', 'sales', 'viewer')
  priceLists(@CurrentTenant() t: TenantContext) {
    return this.prisma.priceList.findMany({ where: { tenantId: t.tenantId }, orderBy: { version: 'desc' } });
  }

  @Post('pricelists')
  @RequireRoles('tenant_admin')
  async createPriceList(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = priceListBody.parse(body);
    const last = await this.prisma.priceList.findFirst({ where: { tenantId: t.tenantId }, orderBy: { version: 'desc' } });
    const created = await this.prisma.priceList.create({
      data: {
        tenantId: t.tenantId,
        name: input.name,
        version: (last?.version ?? 0) + 1,
        settings: input.settings as object,
        rules: input.rules as object,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo ? new Date(input.validTo) : null,
      },
    });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'create', entity: 'PriceList', entityId: created.id });
    return created;
  }

  @Put('pricelists/:id')
  @RequireRoles('tenant_admin')
  async updatePriceList(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const input = priceListBody.partial().parse(body);
    const existing = await this.prisma.priceList.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    if (existing.status === 'published') throw new BadRequestException('Opublikowany cennik jest niezmienny. Utwórz nową wersję.');
    const updated = await this.prisma.priceList.update({
      where: { id },
      data: {
        name: input.name,
        settings: input.settings === undefined ? undefined : (input.settings as object),
        rules: input.rules === undefined ? undefined : (input.rules as object),
        validFrom: input.validFrom === undefined ? undefined : input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo === undefined ? undefined : input.validTo ? new Date(input.validTo) : null,
      },
    });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'update', entity: 'PriceList', entityId: id });
    return updated;
  }

  @Post('pricelists/:id/publish')
  @HttpCode(200)
  @RequireRoles('tenant_admin')
  async publishPriceList(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.priceList.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    z.array(priceRuleDefSchema).parse(existing.rules);
    await this.prisma.priceList.updateMany({ where: { tenantId: t.tenantId, status: 'published' }, data: { status: 'archived' } });
    const published = await this.prisma.priceList.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date(), publishedById: u.id },
    });
    await this.audit.log({
      tenantId: t.tenantId, userId: u.id, userEmail: u.email,
      action: 'publish', entity: 'PriceList', entityId: id, after: { version: published.version },
    });
    return { ok: true, version: published.version };
  }

  @Post('pricelists/:id/rollback')
  @HttpCode(200)
  @RequireRoles('tenant_admin')
  async rollbackPriceList(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    const target = await this.prisma.priceList.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!target) throw new NotFoundException();
    await this.prisma.priceList.updateMany({ where: { tenantId: t.tenantId, status: 'published' }, data: { status: 'archived' } });
    await this.prisma.priceList.update({ where: { id }, data: { status: 'published', publishedAt: new Date(), publishedById: u.id } });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'rollback', entity: 'PriceList', entityId: id });
    return { ok: true };
  }

  /** Symulator ceny: pełny wewnętrzny rozkład dla administratora. */
  @Post('pricelists/:id/simulate')
  @HttpCode(200)
  @RequireRoles('tenant_admin', 'sales')
  async simulate(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const existing = await this.prisma.priceList.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    const input = z
      .object({
        modelKey: z.string(),
        widthMm: z.number().int().positive(),
        heightMm: z.number().int().positive(),
        selections: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
      })
      .parse(body);
    return computePrice(
      existing.rules as unknown as PriceRuleDef[],
      priceListSettingsSchema.parse(existing.settings),
      input,
    );
  }

  // ── BOM ──────────────────────────────────────────────────────────────────

  @Get('bom-recipes')
  @RequireRoles('tenant_admin', 'production')
  bomRecipes(@CurrentTenant() t: TenantContext) {
    return this.prisma.bomRecipe.findMany({
      where: { tenantId: t.tenantId },
      include: { model: true },
      orderBy: { version: 'desc' },
    });
  }

  @Post('bom-recipes')
  @RequireRoles('tenant_admin', 'production')
  async createBom(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = bomBody.parse(body);
    const model = await this.prisma.productModel.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key: input.modelKey } },
    });
    if (!model) throw new BadRequestException('Nieznany model.');
    const last = await this.prisma.bomRecipe.findFirst({
      where: { tenantId: t.tenantId, modelId: model.id },
      orderBy: { version: 'desc' },
    });
    const created = await this.prisma.bomRecipe.create({
      data: {
        tenantId: t.tenantId,
        modelId: model.id,
        name: input.name,
        version: (last?.version ?? 0) + 1,
        items: input.items as object,
      },
    });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'create', entity: 'BomRecipe', entityId: created.id });
    return created;
  }

  @Post('bom-recipes/:id/publish')
  @HttpCode(200)
  @RequireRoles('tenant_admin', 'production')
  async publishBom(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.bomRecipe.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    z.array(bomItemDefSchema).parse(existing.items);
    await this.prisma.bomRecipe.updateMany({
      where: { tenantId: t.tenantId, modelId: existing.modelId, status: 'published' },
      data: { status: 'archived' },
    });
    await this.prisma.bomRecipe.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date(), publishedById: u.id },
    });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'publish', entity: 'BomRecipe', entityId: id });
    return { ok: true };
  }

  /** Test BOM na przykładowej konfiguracji. */
  @Post('bom-recipes/:id/test')
  @HttpCode(200)
  @RequireRoles('tenant_admin', 'production')
  async testBom(@CurrentTenant() t: TenantContext, @Param('id') id: string, @Body() body: unknown) {
    const existing = await this.prisma.bomRecipe.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    const input = z
      .object({
        widthMm: z.number().int().positive().default(900),
        heightMm: z.number().int().positive().default(2100),
        selections: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
      })
      .parse(body ?? {});
    return computeBom(existing.items as unknown as BomItemDef[], {
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      hingeCount: computeHingeCount(input.heightMm),
      selections: input.selections,
    });
  }

  // ── Szablony dokumentów ──────────────────────────────────────────────────

  @Get('templates')
  @RequireRoles('tenant_admin', 'sales', 'viewer')
  templates(@CurrentTenant() t: TenantContext) {
    return this.prisma.documentTemplate.findMany({ where: { tenantId: t.tenantId }, orderBy: [{ kind: 'asc' }, { version: 'desc' }] });
  }

  @Post('templates')
  @RequireRoles('tenant_admin')
  async createTemplate(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = templateBody.parse(body);
    const last = await this.prisma.documentTemplate.findFirst({
      where: { tenantId: t.tenantId, kind: input.kind },
      orderBy: { version: 'desc' },
    });
    const created = await this.prisma.documentTemplate.create({
      data: {
        tenantId: t.tenantId,
        kind: input.kind,
        name: input.name,
        version: (last?.version ?? 0) + 1,
        config: input.config as object,
      },
    });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'create', entity: 'DocumentTemplate', entityId: created.id });
    return created;
  }

  @Post('templates/:id/publish')
  @HttpCode(200)
  @RequireRoles('tenant_admin')
  async publishTemplate(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.documentTemplate.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    await this.prisma.documentTemplate.updateMany({
      where: { tenantId: t.tenantId, kind: existing.kind, status: 'published' },
      data: { status: 'archived' },
    });
    await this.prisma.documentTemplate.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date(), publishedById: u.id },
    });
    await this.audit.log({ tenantId: t.tenantId, userId: u.id, userEmail: u.email, action: 'publish', entity: 'DocumentTemplate', entityId: id });
    return { ok: true };
  }

  /** Podgląd evaluate w panelu (test konfiguratora bez wychodzenia z admina). */
  @Post('evaluate-preview')
  @HttpCode(200)
  @RequireRoles('tenant_admin', 'sales', 'production', 'viewer')
  async evaluatePreview(@CurrentTenant() t: TenantContext, @Body() body: unknown) {
    const request = evaluateRequestSchema.parse(body);
    const result = await this.evaluateService.evaluate(t.tenantSlug, request);
    return result.response;
  }
}
