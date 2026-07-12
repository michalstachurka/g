import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

/** Prisma wymaga JsonNull zamiast null dla pól Json?. */
function jsonValue(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}
import {
  AdminAuthGuard,
  CurrentTenant,
  CurrentUser,
  RequireRoles,
  type AuthUser,
  type TenantContext,
} from '../common/auth';
import { AuditService } from '../services/audit.service';

const keySchema = z.string().min(1).max(80).regex(/^[a-z0-9_.-]+$/);
const labelJson = z.union([z.string(), z.record(z.string(), z.string())]);

const categorySchema = z.object({
  key: keySchema,
  systemKey: z.enum(['hidden', 'solid', 'glass', 'sliding', 'mirrored', 'double']),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  order: z.number().int().optional(),
  visible: z.boolean().optional(),
});

const familySchema = z.object({
  key: keySchema,
  categoryKey: keySchema,
  name: z.string().min(1).max(200),
  order: z.number().int().optional(),
  visible: z.boolean().optional(),
});

const modelSchema = z.object({
  key: keySchema,
  familyKey: keySchema,
  name: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  baseWidthMm: z.number().int().positive().optional(),
  baseHeightMm: z.number().int().positive().optional(),
  minWidthMm: z.number().int().positive().optional(),
  maxWidthMm: z.number().int().positive().optional(),
  minHeightMm: z.number().int().positive().optional(),
  maxHeightMm: z.number().int().positive().optional(),
  order: z.number().int().optional(),
  visible: z.boolean().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  bundleKey: keySchema.nullable().optional(),
});

const optionGroupSchema = z.object({ key: keySchema, name: z.string().min(1).max(200) });

const optionSchema = z.object({
  groupKey: keySchema,
  value: z.string().min(1).max(120),
  label: labelJson,
  description: labelJson.nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  colorHex: z.string().max(9).nullable().optional(),
  materialKey: z.string().max(120).nullable().optional(),
  order: z.number().int().optional(),
  visible: z.boolean().optional(),
});

const materialSchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(200),
  kind: z.enum(['color', 'wood', 'glass', 'metal', 'mirror']),
  baseColorHex: z.string().max(9),
  roughness: z.number().min(0).max(1).optional(),
  metalness: z.number().min(0).max(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  transmission: z.number().min(0).max(1).optional(),
  clearcoat: z.number().min(0).max(1).optional(),
  order: z.number().int().optional(),
  visible: z.boolean().optional(),
});

const stepSchema = z.object({
  key: keySchema,
  categoryKey: keySchema.nullable().optional(),
  title: labelJson,
  description: labelJson.nullable().optional(),
  order: z.number().int().optional(),
  visible: z.boolean().optional(),
});

const fieldSchema = z.object({
  key: keySchema,
  stepKey: keySchema,
  label: labelJson,
  type: z.enum(['select', 'radio_cards', 'color_select', 'toggle', 'number', 'dimensions', 'text', 'textarea']),
  required: z.boolean().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  tooltip: labelJson.nullable().optional(),
  section: z.string().max(120).nullable().optional(),
  unit: z.string().max(20).nullable().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  stepSize: z.number().nullable().optional(),
  order: z.number().int().optional(),
  visible: z.boolean().optional(),
  optionGroupKey: keySchema.nullable().optional(),
  mapsTo3d: z
    .string()
    .max(120)
    .regex(/^(dimension:(width|height)|din|opening_side|construction|material:[a-z_]+|toggle_part:[a-z_]+)$/)
    .nullable()
    .optional(),
});

@Controller('admin/catalog')
@UseGuards(AdminAuthGuard)
@RequireRoles('tenant_admin')
export class AdminCatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async logChange(tenant: TenantContext, user: AuthUser, action: string, entity: string, entityId: string, after?: unknown) {
    await this.audit.log({
      tenantId: tenant.tenantId,
      userId: user.id,
      userEmail: user.email,
      action,
      entity,
      entityId,
      after,
    });
  }

  // ── Przegląd ─────────────────────────────────────────────────────────────

  @Get('overview')
  async overview(@CurrentTenant() tenant: TenantContext) {
    const tenantId = tenant.tenantId;
    const [categories, families, models, groups, options, materials, steps, fields, bundles] =
      await Promise.all([
        this.prisma.productCategory.findMany({ where: { tenantId }, orderBy: { order: 'asc' } }),
        this.prisma.productFamily.findMany({ where: { tenantId }, orderBy: { order: 'asc' }, include: { category: true } }),
        this.prisma.productModel.findMany({ where: { tenantId }, orderBy: { order: 'asc' }, include: { family: true, bundle: true } }),
        this.prisma.optionGroup.findMany({ where: { tenantId }, orderBy: { key: 'asc' } }),
        this.prisma.option.findMany({ where: { tenantId }, orderBy: [{ groupId: 'asc' }, { order: 'asc' }], include: { group: true } }),
        this.prisma.publicMaterial.findMany({ where: { tenantId }, orderBy: { order: 'asc' } }),
        this.prisma.configuratorStep.findMany({ where: { tenantId }, orderBy: { order: 'asc' }, include: { category: true } }),
        this.prisma.fieldDefinition.findMany({ where: { tenantId }, orderBy: { order: 'asc' }, include: { step: true, optionGroup: true } }),
        this.prisma.assetBundle.findMany({ where: { tenantId }, orderBy: { key: 'asc' } }),
      ]);
    return { categories, families, models, groups, options, materials, steps, fields, bundles };
  }

  // ── Kategorie ────────────────────────────────────────────────────────────

  @Post('categories')
  async createCategory(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = categorySchema.parse(body);
    const created = await this.prisma.productCategory.create({
      data: { tenantId: t.tenantId, ...input },
    });
    await this.logChange(t, u, 'create', 'ProductCategory', created.id, input);
    return created;
  }

  @Put('categories/:key')
  async updateCategory(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string, @Body() body: unknown) {
    const input = categorySchema.partial().parse(body);
    const existing = await this.prisma.productCategory.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    const updated = await this.prisma.productCategory.update({ where: { id: existing.id }, data: input });
    await this.logChange(t, u, 'update', 'ProductCategory', existing.id, input);
    return updated;
  }

  @Delete('categories/:key')
  async deleteCategory(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const existing = await this.prisma.productCategory.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.productCategory.delete({ where: { id: existing.id } });
    await this.logChange(t, u, 'delete', 'ProductCategory', existing.id);
    return { ok: true };
  }

  // ── Rodziny ──────────────────────────────────────────────────────────────

  @Post('families')
  async createFamily(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = familySchema.parse(body);
    const category = await this.prisma.productCategory.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key: input.categoryKey } },
    });
    if (!category) throw new BadRequestException('Nieznana kategoria.');
    const created = await this.prisma.productFamily.create({
      data: {
        tenantId: t.tenantId,
        categoryId: category.id,
        key: input.key,
        name: input.name,
        order: input.order ?? 0,
        visible: input.visible ?? true,
      },
    });
    await this.logChange(t, u, 'create', 'ProductFamily', created.id, input);
    return created;
  }

  @Put('families/:key')
  async updateFamily(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string, @Body() body: unknown) {
    const input = familySchema.partial().parse(body);
    const existing = await this.prisma.productFamily.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    let categoryId: string | undefined;
    if (input.categoryKey) {
      const category = await this.prisma.productCategory.findUnique({
        where: { tenantId_key: { tenantId: t.tenantId, key: input.categoryKey } },
      });
      if (!category) throw new BadRequestException('Nieznana kategoria.');
      categoryId = category.id;
    }
    const updated = await this.prisma.productFamily.update({
      where: { id: existing.id },
      data: { name: input.name, order: input.order, visible: input.visible, categoryId },
    });
    await this.logChange(t, u, 'update', 'ProductFamily', existing.id, input);
    return updated;
  }

  @Delete('families/:key')
  async deleteFamily(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const existing = await this.prisma.productFamily.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.productFamily.delete({ where: { id: existing.id } });
    await this.logChange(t, u, 'delete', 'ProductFamily', existing.id);
    return { ok: true };
  }

  // ── Modele ───────────────────────────────────────────────────────────────

  @Post('models')
  async createModel(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = modelSchema.parse(body);
    const family = await this.prisma.productFamily.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key: input.familyKey } },
    });
    if (!family) throw new BadRequestException('Nieznana rodzina produktów.');
    const bundleId = await this.resolveBundleId(t.tenantId, input.bundleKey);
    const { familyKey: _familyKey, bundleKey: _bundleKey, ...rest } = input;
    const created = await this.prisma.productModel.create({
      data: { tenantId: t.tenantId, familyId: family.id, bundleId, ...rest },
    });
    await this.logChange(t, u, 'create', 'ProductModel', created.id, input);
    return created;
  }

  private async resolveBundleId(tenantId: string, bundleKey: string | null | undefined) {
    if (bundleKey === undefined) return undefined;
    if (bundleKey === null) return null;
    const bundle = await this.prisma.assetBundle.findUnique({
      where: { tenantId_key: { tenantId, key: bundleKey } },
    });
    if (!bundle) throw new BadRequestException('Nieznany AssetBundle.');
    return bundle.id;
  }

  @Put('models/:key')
  async updateModel(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string, @Body() body: unknown) {
    const input = modelSchema.partial().parse(body);
    const existing = await this.prisma.productModel.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    let familyId: string | undefined;
    if (input.familyKey) {
      const family = await this.prisma.productFamily.findUnique({
        where: { tenantId_key: { tenantId: t.tenantId, key: input.familyKey } },
      });
      if (!family) throw new BadRequestException('Nieznana rodzina produktów.');
      familyId = family.id;
    }
    const bundleId = await this.resolveBundleId(t.tenantId, input.bundleKey);
    const { familyKey: _familyKey, bundleKey: _bundleKey, ...rest } = input;
    const updated = await this.prisma.productModel.update({
      where: { id: existing.id },
      data: { ...rest, familyId, bundleId },
    });
    await this.logChange(t, u, 'update', 'ProductModel', existing.id, input);
    return updated;
  }

  @Delete('models/:key')
  async deleteModel(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const existing = await this.prisma.productModel.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.productModel.delete({ where: { id: existing.id } });
    await this.logChange(t, u, 'delete', 'ProductModel', existing.id);
    return { ok: true };
  }

  // ── Grupy opcji i opcje ──────────────────────────────────────────────────

  @Post('option-groups')
  async createGroup(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = optionGroupSchema.parse(body);
    const created = await this.prisma.optionGroup.create({ data: { tenantId: t.tenantId, ...input } });
    await this.logChange(t, u, 'create', 'OptionGroup', created.id, input);
    return created;
  }

  @Delete('option-groups/:key')
  async deleteGroup(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const existing = await this.prisma.optionGroup.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.optionGroup.delete({ where: { id: existing.id } });
    await this.logChange(t, u, 'delete', 'OptionGroup', existing.id);
    return { ok: true };
  }

  @Post('options')
  async createOption(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = optionSchema.parse(body);
    const group = await this.prisma.optionGroup.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key: input.groupKey } },
    });
    if (!group) throw new BadRequestException('Nieznana grupa opcji.');
    const { groupKey: _groupKey, ...rest } = input;
    const created = await this.prisma.option.create({
      data: {
        tenantId: t.tenantId,
        groupId: group.id,
        ...rest,
        label: rest.label as object,
        description: (rest.description ?? undefined) as object | undefined,
      },
    });
    await this.logChange(t, u, 'create', 'Option', created.id, input);
    return created;
  }

  @Put('options/:id')
  async updateOption(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const input = optionSchema.partial().parse(body);
    const existing = await this.prisma.option.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    const { groupKey: _groupKey, ...rest } = input;
    const updated = await this.prisma.option.update({
      where: { id },
      data: {
        ...rest,
        label: rest.label as object | undefined,
        description: rest.description === undefined ? undefined : (rest.description as object),
      },
    });
    await this.logChange(t, u, 'update', 'Option', id, input);
    return updated;
  }

  @Delete('options/:id')
  async deleteOption(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('id') id: string) {
    const existing = await this.prisma.option.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!existing) throw new NotFoundException();
    await this.prisma.option.delete({ where: { id } });
    await this.logChange(t, u, 'delete', 'Option', id);
    return { ok: true };
  }

  // ── Materiały publiczne ──────────────────────────────────────────────────

  @Post('materials')
  async createMaterial(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = materialSchema.parse(body);
    const created = await this.prisma.publicMaterial.create({ data: { tenantId: t.tenantId, ...input } });
    await this.logChange(t, u, 'create', 'PublicMaterial', created.id, input);
    return created;
  }

  @Put('materials/:key')
  async updateMaterial(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string, @Body() body: unknown) {
    const input = materialSchema.partial().parse(body);
    const existing = await this.prisma.publicMaterial.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    const updated = await this.prisma.publicMaterial.update({ where: { id: existing.id }, data: input });
    await this.logChange(t, u, 'update', 'PublicMaterial', existing.id, input);
    return updated;
  }

  @Delete('materials/:key')
  async deleteMaterial(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const existing = await this.prisma.publicMaterial.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.publicMaterial.delete({ where: { id: existing.id } });
    await this.logChange(t, u, 'delete', 'PublicMaterial', existing.id);
    return { ok: true };
  }

  // ── Kroki i pola ─────────────────────────────────────────────────────────

  @Post('steps')
  async createStep(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = stepSchema.parse(body);
    let categoryId: string | null = null;
    if (input.categoryKey) {
      const category = await this.prisma.productCategory.findUnique({
        where: { tenantId_key: { tenantId: t.tenantId, key: input.categoryKey } },
      });
      if (!category) throw new BadRequestException('Nieznana kategoria.');
      categoryId = category.id;
    }
    const created = await this.prisma.configuratorStep.create({
      data: {
        tenantId: t.tenantId,
        categoryId,
        key: input.key,
        title: input.title as object,
        description: (input.description ?? undefined) as object | undefined,
        order: input.order ?? 0,
        visible: input.visible ?? true,
      },
    });
    await this.logChange(t, u, 'create', 'ConfiguratorStep', created.id, input);
    return created;
  }

  @Put('steps/:key')
  async updateStep(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string, @Body() body: unknown) {
    const input = stepSchema.partial().parse(body);
    const existing = await this.prisma.configuratorStep.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    const updated = await this.prisma.configuratorStep.update({
      where: { id: existing.id },
      data: {
        title: input.title === undefined ? undefined : (input.title as object),
        description: jsonValue(input.description),
        order: input.order,
        visible: input.visible,
      },
    });
    await this.logChange(t, u, 'update', 'ConfiguratorStep', existing.id, input);
    return updated;
  }

  @Delete('steps/:key')
  async deleteStep(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const existing = await this.prisma.configuratorStep.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.configuratorStep.delete({ where: { id: existing.id } });
    await this.logChange(t, u, 'delete', 'ConfiguratorStep', existing.id);
    return { ok: true };
  }

  @Post('fields')
  async createField(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Body() body: unknown) {
    const input = fieldSchema.parse(body);
    const step = await this.prisma.configuratorStep.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key: input.stepKey } },
    });
    if (!step) throw new BadRequestException('Nieznany krok.');
    let optionGroupId: string | null = null;
    if (input.optionGroupKey) {
      const group = await this.prisma.optionGroup.findUnique({
        where: { tenantId_key: { tenantId: t.tenantId, key: input.optionGroupKey } },
      });
      if (!group) throw new BadRequestException('Nieznana grupa opcji.');
      optionGroupId = group.id;
    }
    const created = await this.prisma.fieldDefinition.create({
      data: {
        tenantId: t.tenantId,
        stepId: step.id,
        optionGroupId,
        key: input.key,
        label: input.label as object,
        type: input.type,
        required: input.required ?? false,
        defaultValue: jsonValue(input.defaultValue),
        tooltip: (input.tooltip ?? undefined) as object | undefined,
        section: input.section ?? null,
        unit: input.unit ?? null,
        min: input.min ?? null,
        max: input.max ?? null,
        stepSize: input.stepSize ?? null,
        order: input.order ?? 0,
        visible: input.visible ?? true,
        mapsTo3d: input.mapsTo3d ?? null,
      },
    });
    await this.logChange(t, u, 'create', 'FieldDefinition', created.id, input);
    return created;
  }

  @Put('fields/:key')
  async updateField(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string, @Body() body: unknown) {
    const input = fieldSchema.partial().parse(body);
    const existing = await this.prisma.fieldDefinition.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    const before = { label: existing.label, order: existing.order, visible: existing.visible };
    let optionGroupId: string | null | undefined;
    if (input.optionGroupKey !== undefined) {
      if (input.optionGroupKey === null) optionGroupId = null;
      else {
        const group = await this.prisma.optionGroup.findUnique({
          where: { tenantId_key: { tenantId: t.tenantId, key: input.optionGroupKey } },
        });
        if (!group) throw new BadRequestException('Nieznana grupa opcji.');
        optionGroupId = group.id;
      }
    }
    const updated = await this.prisma.fieldDefinition.update({
      where: { id: existing.id },
      data: {
        label: input.label === undefined ? undefined : (input.label as object),
        type: input.type,
        required: input.required,
        defaultValue: jsonValue(input.defaultValue),
        tooltip: jsonValue(input.tooltip),
        section: input.section,
        unit: input.unit,
        min: input.min,
        max: input.max,
        stepSize: input.stepSize,
        order: input.order,
        visible: input.visible,
        mapsTo3d: input.mapsTo3d,
        optionGroupId,
      },
    });
    await this.audit.log({
      tenantId: t.tenantId,
      userId: u.id,
      userEmail: u.email,
      action: 'update',
      entity: 'FieldDefinition',
      entityId: existing.id,
      before,
      after: input,
    });
    return updated;
  }

  @Delete('fields/:key')
  async deleteField(@CurrentTenant() t: TenantContext, @CurrentUser() u: AuthUser, @Param('key') key: string) {
    const existing = await this.prisma.fieldDefinition.findUnique({
      where: { tenantId_key: { tenantId: t.tenantId, key } },
    });
    if (!existing) throw new NotFoundException();
    await this.prisma.fieldDefinition.delete({ where: { id: existing.id } });
    await this.logChange(t, u, 'delete', 'FieldDefinition', existing.id);
    return { ok: true };
  }
}
