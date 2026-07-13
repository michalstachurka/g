import { Injectable, NotFoundException } from '@nestjs/common';
import {
  layoutSettingsSchema,
  type PublicBranding,
  type PublicCategory,
  type PublicSchema,
  themeTokensSchema,
} from '@door/contracts';
import { PrismaService } from '../prisma.service';
import { labelText } from '../common/utils';
import { EvaluateService } from '../domain/evaluate.service';

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evaluateService: EvaluateService,
  ) {}

  async getTenantOrThrow(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new NotFoundException('Nieznany tenant.');
    return tenant;
  }

  async getBranding(slug: string): Promise<PublicBranding> {
    const tenant = await this.getTenantOrThrow(slug);
    const theme = await this.prisma.tenantTheme.findFirst({
      where: { tenantId: tenant.id, status: 'published' },
      orderBy: { version: 'desc' },
    });
    const draft = theme
      ? null
      : await this.prisma.tenantTheme.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { version: 'desc' },
        });
    const active = theme ?? draft;
    return {
      tenantSlug: tenant.slug,
      companyName: tenant.companyName,
      logoUrl: active?.logoUrl ?? null,
      logoDarkUrl: active?.logoDarkUrl ?? null,
      faviconUrl: active?.faviconUrl ?? null,
      theme: themeTokensSchema.parse(active?.themeTokens ?? {}),
      layout: layoutSettingsSchema.parse(active?.layout ?? {}),
      texts: (active?.texts as Record<string, string>) ?? {},
      footerText: active?.footerText ?? null,
      contact: (active?.contact as PublicBranding['contact']) ?? null,
      legalLinks: (active?.legalLinks as PublicBranding['legalLinks']) ?? [],
      languages: (active?.languages as string[]) ?? ['pl'],
      defaultLanguage: 'pl',
    };
  }

  async getCategories(slug: string): Promise<PublicCategory[]> {
    const tenant = await this.getTenantOrThrow(slug);
    const categories = await this.prisma.productCategory.findMany({
      where: { tenantId: tenant.id, visible: true },
      orderBy: { order: 'asc' },
      include: {
        families: {
          where: { visible: true },
          include: {
            models: {
              where: { visible: true, status: 'published' },
              include: { bundle: true },
            },
          },
        },
      },
    });
    return categories.map((c) => {
      const ready = c.families.some((f) =>
        f.models.some((m) => m.bundle && m.bundle.status === 'published'),
      );
      const hasModels = c.families.some((f) => f.models.length > 0);
      return {
        key: c.key,
        name: c.name,
        description: c.description,
        imageUrl: c.imageUrl,
        order: c.order,
        visualizationReady: ready,
        missingAssetNotice: ready
          ? null
          : hasModels
            ? 'Wizualizacja 3D dla tej kategorii nie jest jeszcze dostępna. Konfiguracja i wycena działają normalnie.'
            : 'Czekamy na model 3D producenta - kategoria będzie dostępna wkrótce.',
      };
    });
  }

  async getSchema(slug: string, categoryKey: string): Promise<PublicSchema> {
    const ctx = await this.evaluateService.loadCategoryContext(slug, categoryKey);
    const categories = await this.getCategories(slug);
    const category = categories.find((c) => c.key === categoryKey);
    if (!category) throw new NotFoundException('Nieznana kategoria.');

    const stepsMap = new Map<
      string,
      { key: string; title: string; description: string | null; order: number; fields: PublicSchema['steps'][number]['fields'] }
    >();
    for (const step of ctx.steps) {
      stepsMap.set(step.key, {
        key: step.key,
        title: labelText(step.title),
        description: labelText(step.description) || null,
        order: step.order,
        fields: [],
      });
    }
    for (const field of ctx.fields) {
      const step = stepsMap.get(field.stepKey);
      if (!step) continue;
      step.fields.push({
        key: field.key,
        label: labelText(field.label),
        type: field.type as PublicSchema['steps'][number]['fields'][number]['type'],
        required: field.required,
        defaultValue: (field.defaultValue ?? null) as string | number | boolean | null,
        tooltip: labelText(field.tooltip) || null,
        section: field.section,
        unit: field.unit,
        min: field.min,
        max: field.max,
        step: field.stepSize,
        order: field.order,
        options:
          field.options.length > 0
            ? field.options.map((o) => ({
                value: o.value,
                label: labelText(o.label),
                description: labelText(o.description) || null,
                imageUrl: o.imageUrl,
                colorHex: o.colorHex,
              }))
            : null,
      });
    }

    return {
      schemaVersion: 'published',
      category,
      models: ctx.models.map((m) => ({
        key: m.key,
        name: m.name,
        familyKey: m.familyKey,
        familyName: m.familyName,
        description: m.description,
        thumbnailUrl: m.thumbnailUrl,
        visualizationReady: Boolean(m.bundleId),
        baseWidthMm: m.baseWidthMm,
        baseHeightMm: m.baseHeightMm,
        minWidthMm: m.minWidthMm,
        maxWidthMm: m.maxWidthMm,
        minHeightMm: m.minHeightMm,
        maxHeightMm: m.maxHeightMm,
      })),
      steps: [...stepsMap.values()]
        .filter((s) => s.fields.length > 0)
        .sort((a, b) => a.order - b.order),
    };
  }

  async getMaterials(slug: string) {
    const tenant = await this.getTenantOrThrow(slug);
    const materials = await this.prisma.publicMaterial.findMany({
      where: { tenantId: tenant.id, visible: true },
      orderBy: { order: 'asc' },
    });
    return materials.map((m) => ({
      key: m.key,
      name: m.name,
      kind: m.kind,
      baseColorHex: m.baseColorHex,
      roughness: m.roughness,
      metalness: m.metalness,
      opacity: m.opacity,
      transmission: m.transmission,
      clearcoat: m.clearcoat,
    }));
  }
}
