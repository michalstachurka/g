import { Injectable, NotFoundException } from '@nestjs/common';
import {
  assertRenderSpecPublic,
  type AssetManifest,
  assetManifestSchema,
  type AvailableOption,
  type EvaluateRequest,
  type EvaluateResponse,
  type Issue,
  type ModuleSlot,
  type PriceListSettings,
  priceListSettingsSchema,
  type PriceRuleDef,
  type RenderSpec,
  type RuleDef,
  type SelectionValue,
  type Vec3Mm,
} from '@door/contracts';
import { PrismaService } from '../prisma.service';
import { checksumOf, labelText } from '../common/utils';
import { applyRules, type SelectionMap } from './rules-engine';
import { computePrice, type PricingResult, toPublicSummary } from './pricing-engine';
import { buildRenderSpec, type BundleModuleInput } from './render-spec-builder';

interface FieldRow {
  id: string;
  key: string;
  label: unknown;
  type: string;
  required: boolean;
  defaultValue: unknown;
  tooltip: unknown;
  section: string | null;
  unit: string | null;
  min: number | null;
  max: number | null;
  stepSize: number | null;
  order: number;
  visible: boolean;
  mapsTo3d: string | null;
  optionGroupId: string | null;
  stepKey: string;
  stepOrder: number;
  options: { value: string; label: unknown; description: unknown; imageUrl: string | null; colorHex: string | null; materialKey: string | null; visible: boolean; order: number }[];
}

export interface CategoryContext {
  tenant: { id: string; slug: string; featureFlags: unknown };
  category: { id: string; key: string; systemKey: string; name: string; description: string | null; imageUrl: string | null; order: number; visible: boolean };
  fields: FieldRow[];
  steps: { id: string; key: string; title: unknown; description: unknown; order: number }[];
  models: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    thumbnailUrl: string | null;
    familyKey: string;
    familyName: string;
    baseWidthMm: number;
    baseHeightMm: number;
    minWidthMm: number;
    maxWidthMm: number;
    minHeightMm: number;
    maxHeightMm: number;
    bundleId: string | null;
  }[];
}

export interface EvaluationInternal {
  response: EvaluateResponse;
  pricing: PricingResult | null;
  normalizedSelections: SelectionMap;
  modelId: string | null;
}

@Injectable()
export class EvaluateService {
  constructor(private readonly prisma: PrismaService) {}

  async loadCategoryContext(tenantSlug: string, categoryKey: string): Promise<CategoryContext> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) throw new NotFoundException('Nieznany tenant.');

    const category = await this.prisma.productCategory.findFirst({
      where: { tenantId: tenant.id, key: categoryKey, visible: true },
    });
    if (!category) throw new NotFoundException('Nieznana kategoria drzwi.');

    const steps = await this.prisma.configuratorStep.findMany({
      where: {
        tenantId: tenant.id,
        visible: true,
        OR: [{ categoryId: category.id }, { categoryId: null }],
      },
      orderBy: { order: 'asc' },
      include: {
        fields: {
          where: { visible: true },
          orderBy: { order: 'asc' },
          include: { optionGroup: { include: { options: { orderBy: { order: 'asc' } } } } },
        },
      },
    });

    const families = await this.prisma.productFamily.findMany({
      where: { tenantId: tenant.id, categoryId: category.id, visible: true },
      include: {
        models: {
          where: { visible: true, status: 'published' },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });

    const fields: FieldRow[] = steps.flatMap((step) =>
      step.fields.map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        type: f.type,
        required: f.required,
        defaultValue: f.defaultValue,
        tooltip: f.tooltip,
        section: f.section,
        unit: f.unit,
        min: f.min,
        max: f.max,
        stepSize: f.stepSize,
        order: f.order,
        visible: f.visible,
        mapsTo3d: f.mapsTo3d,
        optionGroupId: f.optionGroupId,
        stepKey: step.key,
        stepOrder: step.order,
        options: (f.optionGroup?.options ?? [])
          .filter((o) => o.visible)
          .map((o) => ({
            value: o.value,
            label: o.label,
            description: o.description,
            imageUrl: o.imageUrl,
            colorHex: o.colorHex,
            materialKey: o.materialKey,
            visible: o.visible,
            order: o.order,
          })),
      })),
    );

    return {
      tenant: { id: tenant.id, slug: tenant.slug, featureFlags: tenant.featureFlags },
      category: {
        id: category.id,
        key: category.key,
        systemKey: category.systemKey,
        name: category.name,
        description: category.description,
        imageUrl: category.imageUrl,
        order: category.order,
        visible: category.visible,
      },
      steps: steps.map((s) => ({ id: s.id, key: s.key, title: s.title, description: s.description, order: s.order })),
      fields,
      models: families.flatMap((fam) =>
        fam.models.map((m) => ({
          id: m.id,
          key: m.key,
          name: m.name,
          description: m.description,
          thumbnailUrl: m.thumbnailUrl,
          familyKey: fam.key,
          familyName: fam.name,
          baseWidthMm: m.baseWidthMm,
          baseHeightMm: m.baseHeightMm,
          minWidthMm: m.minWidthMm,
          maxWidthMm: m.maxWidthMm,
          minHeightMm: m.minHeightMm,
          maxHeightMm: m.maxHeightMm,
          bundleId: m.bundleId,
        })),
      ),
    };
  }

  /**
   * Pełne przeliczenie konfiguracji: normalizacja, reguły, wymiary, cena,
   * renderSpec, wersje i checksum - w jednej spójnej odpowiedzi.
   */
  async evaluate(tenantSlug: string, request: EvaluateRequest): Promise<EvaluationInternal> {
    const ctx = await this.loadCategoryContext(tenantSlug, request.categoryKey);
    const errors: Issue[] = [];
    const warnings: Issue[] = [];

    // Model: jawny wybór albo pierwszy opublikowany w kategorii.
    const model =
      (request.modelKey ? ctx.models.find((m) => m.key === request.modelKey) : ctx.models[0]) ?? null;
    if (request.modelKey && !model) {
      errors.push({ code: 'model:unknown', fieldKey: 'model', message: 'Wybrany model jest niedostępny.' });
    }

    // Normalizacja wartości pól (typy + wartości domyślne).
    const normalized: SelectionMap = {};
    for (const field of ctx.fields) {
      const raw = request.selections[field.key];
      normalized[field.key] = this.normalizeFieldValue(field, raw, errors);
    }
    if (model) normalized['model'] = model.key;
    normalized['_category'] = ctx.category.systemKey;

    // Reguły (opublikowany RuleSet).
    const ruleSet = await this.prisma.ruleSet.findFirst({
      where: { tenantId: ctx.tenant.id, status: 'published' },
      orderBy: { version: 'desc' },
    });
    const ruleDefs = (ruleSet?.rules as unknown as RuleDef[]) ?? [];
    const rulesResult = applyRules(ruleDefs, normalized, {
      categoryKey: ctx.category.key,
      modelKey: model?.key ?? null,
    });
    errors.push(...rulesResult.errors);
    warnings.push(...rulesResult.warnings);

    // Wymiary: pole zmapowane na dimension:width/height albo baza modelu.
    const widthField = ctx.fields.find((f) => f.mapsTo3d === 'dimension:width');
    const heightField = ctx.fields.find((f) => f.mapsTo3d === 'dimension:height');
    const widthMm = this.numberOr(rulesResult.selections[widthField?.key ?? ''], model?.baseWidthMm ?? 900);
    const heightMm = this.numberOr(rulesResult.selections[heightField?.key ?? ''], model?.baseHeightMm ?? 2100);

    if (model) {
      if (widthMm < model.minWidthMm || widthMm > model.maxWidthMm) {
        errors.push({
          code: 'dimension:width',
          fieldKey: widthField?.key ?? null,
          message: `Szerokość musi mieścić się w zakresie ${model.minWidthMm}-${model.maxWidthMm} mm dla tego modelu.`,
        });
      }
      if (heightMm < model.minHeightMm || heightMm > model.maxHeightMm) {
        errors.push({
          code: 'dimension:height',
          fieldKey: heightField?.key ?? null,
          message: `Wysokość musi mieścić się w zakresie ${model.minHeightMm}-${model.maxHeightMm} mm dla tego modelu.`,
        });
      }
    }
    for (const limit of rulesResult.dimensionLimits) {
      const value = limit.dimension === 'width_mm' ? widthMm : heightMm;
      if ((limit.minMm != null && value < limit.minMm) || (limit.maxMm != null && value > limit.maxMm)) {
        errors.push({
          code: `dimension:${limit.dimension}`,
          fieldKey: (limit.dimension === 'width_mm' ? widthField?.key : heightField?.key) ?? null,
          message: limit.message,
        });
      }
    }

    // Dostępność opcji (wynik reguł, nie logika frontendu).
    const availableOptions: Record<string, AvailableOption[]> = {};
    for (const field of ctx.fields) {
      if (field.options.length === 0) continue;
      const excluded = rulesResult.excludedOptions.get(field.key);
      availableOptions[field.key] = field.options.map((o) => ({
        value: o.value,
        label: labelText(o.label),
        available: !excluded?.has(o.value),
        reasonUnavailable: excluded?.get(o.value) ?? null,
        imageUrl: o.imageUrl,
        description: labelText(o.description) || null,
      }));
    }
    if (ctx.models.length > 0) {
      availableOptions['model'] = ctx.models.map((m) => ({
        value: m.key,
        label: m.name,
        available: true,
        reasonUnavailable: null,
        imageUrl: m.thumbnailUrl,
        description: m.description,
      }));
    }

    // Cennik (opublikowany, obowiązujący).
    const now = new Date();
    const priceList = await this.prisma.priceList.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        status: 'published',
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
      },
      orderBy: { version: 'desc' },
    });
    let pricing: PricingResult | null = null;
    if (priceList && model) {
      const settings: PriceListSettings = priceListSettingsSchema.parse(priceList.settings);
      pricing = computePrice(priceList.rules as unknown as PriceRuleDef[], settings, {
        modelKey: model.key,
        widthMm,
        heightMm,
        selections: rulesResult.selections,
      });
    }

    // renderSpec z opublikowanego AssetBundle (albo uczciwy MISSING_ASSET).
    let renderSpec: RenderSpec | null = null;
    let visualizationStatus: 'ready' | 'missing_asset' = 'missing_asset';
    let missingAssetNotice: string | null =
      'Wizualizacja tego rodzaju drzwi nie jest jeszcze dostępna. Konfiguracja i wycena działają normalnie.';
    let assetSetVersion = 'assets-none';

    if (model?.bundleId) {
      const bundle = await this.prisma.assetBundle.findFirst({
        where: { id: model.bundleId, tenantId: ctx.tenant.id, status: 'published' },
        include: { items: { include: { assetVersion: true }, orderBy: { order: 'asc' } } },
      });
      const publishedItems = bundle?.items.filter(
        (i) => i.assetVersion.status === 'published' && i.assetVersion.manifest && i.assetVersion.publicAssetId,
      );
      const missingRequired = bundle?.items.some(
        (i) => i.required && !publishedItems?.some((p) => p.id === i.id),
      );
      if (bundle && publishedItems && publishedItems.length > 0 && !missingRequired) {
        const modules: BundleModuleInput[] = publishedItems.map((item) => ({
          slot: item.slot as ModuleSlot,
          publicAssetId: item.assetVersion.publicAssetId as string,
          manifest: assetManifestSchema.parse(item.assetVersion.manifest) as AssetManifest,
          offsetMm: (item.offsetMm as Vec3Mm | null) ?? [0, 0, 0],
        }));
        assetSetVersion =
          'assets-' +
          checksumOf(modules.map((m) => `${m.publicAssetId}@${m.manifest.assetVersion}`)).slice(7, 19);

        const built = buildRenderSpec({
          configurationRevision: request.revision,
          categorySystemKey: ctx.category.systemKey,
          widthMm,
          heightMm,
          din: this.dinFrom(rulesResult.selections, ctx.fields),
          opensInward: this.opensInwardFrom(rulesResult.selections, ctx.fields),
          construction: this.constructionFrom(rulesResult.selections, ctx.fields, ctx.category.systemKey),
          modules,
          partToggles: this.partTogglesFrom(rulesResult.selections, ctx.fields),
          materialSelections: this.materialsFrom(rulesResult.selections, ctx.fields),
          showMeasurementOverlay: true,
        });
        for (const problem of built.problems) {
          warnings.push({ code: 'asset:variant', fieldKey: null, message: problem });
        }
        const specWithChecksum: RenderSpec = {
          ...built.spec,
          checksum: checksumOf(built.spec),
        };
        assertRenderSpecPublic(specWithChecksum);
        renderSpec = specWithChecksum;
        visualizationStatus = 'ready';
        missingAssetNotice = null;
      }
    }

    const versions = {
      schema: 'schema-' + checksumOf(ctx.fields.map((f) => `${f.stepKey}.${f.key}.${f.type}`)).slice(7, 19),
      ruleSet: ruleSet ? `rules-v${ruleSet.version}` : 'rules-none',
      priceList: priceList ? `prices-v${priceList.version}` : 'prices-none',
      assetSet: assetSetVersion,
    };

    const responseBase = {
      valid: errors.length === 0,
      errors,
      warnings,
      automaticAdjustments: rulesResult.adjustments,
      availableOptions,
      hiddenFields: [...rulesResult.hiddenFields],
      priceSummary: pricing
        ? toPublicSummary(pricing, this.showPriceLines(ctx.tenant.featureFlags))
        : null,
      renderSpec,
      visualizationStatus,
      missingAssetNotice,
      versions,
      configurationRevision: request.revision,
    };

    const response: EvaluateResponse = {
      ...responseBase,
      checksum: checksumOf(responseBase),
    };
    return {
      response,
      pricing,
      normalizedSelections: rulesResult.selections,
      modelId: model?.id ?? null,
    };
  }

  private showPriceLines(featureFlags: unknown): boolean {
    return Boolean((featureFlags as Record<string, unknown> | null)?.showPriceLines);
  }

  private normalizeFieldValue(field: FieldRow, raw: SelectionValue | undefined, errors: Issue[]): SelectionValue {
    const fallback = (field.defaultValue ?? null) as SelectionValue;
    if (raw == null) return fallback;
    switch (field.type) {
      case 'number':
      case 'dimensions': {
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(num)) return fallback;
        if (field.min != null && num < field.min) {
          errors.push({
            code: 'field:min',
            fieldKey: field.key,
            message: `${labelText(field.label)}: wartość minimalna to ${field.min}${field.unit ?? ''}.`,
          });
        }
        if (field.max != null && num > field.max) {
          errors.push({
            code: 'field:max',
            fieldKey: field.key,
            message: `${labelText(field.label)}: wartość maksymalna to ${field.max}${field.unit ?? ''}.`,
          });
        }
        return Math.round(num);
      }
      case 'toggle':
        return raw === true || raw === 'true';
      case 'select':
      case 'radio_cards':
      case 'color_select': {
        const value = String(raw);
        if (field.options.length > 0 && !field.options.some((o) => o.value === value)) {
          errors.push({
            code: 'field:option',
            fieldKey: field.key,
            message: `${labelText(field.label)}: wybrana opcja jest niedostępna.`,
          });
          return fallback;
        }
        return value;
      }
      default:
        return typeof raw === 'string' ? raw.slice(0, 2000) : String(raw);
    }
  }

  private numberOr(value: SelectionValue | undefined, fallback: number): number {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) && num > 0 ? Math.round(num) : fallback;
  }

  private dinFrom(selections: SelectionMap, fields: FieldRow[]): 'left' | 'right' {
    const field = fields.find((f) => f.mapsTo3d === 'din');
    const value = field ? selections[field.key] : null;
    return value === 'right' ? 'right' : 'left';
  }

  private opensInwardFrom(selections: SelectionMap, fields: FieldRow[]): boolean {
    const field = fields.find((f) => f.mapsTo3d === 'opening_side');
    const value = field ? selections[field.key] : null;
    return value !== 'outward';
  }

  private constructionFrom(
    selections: SelectionMap,
    fields: FieldRow[],
    systemKey: string,
  ): 'rebated' | 'non_rebated' | 'reverse' | 'hidden' {
    if (systemKey === 'hidden') return 'hidden';
    const field = fields.find((f) => f.mapsTo3d === 'construction');
    const value = field ? String(selections[field.key] ?? '') : '';
    if (value === 'non_rebated' || value === 'reverse' || value === 'hidden') return value;
    return 'rebated';
  }

  private partTogglesFrom(selections: SelectionMap, fields: FieldRow[]): Record<string, boolean> {
    const toggles: Record<string, boolean> = {};
    for (const field of fields) {
      if (!field.mapsTo3d?.startsWith('toggle_part:')) continue;
      const role = field.mapsTo3d.slice('toggle_part:'.length);
      const value = selections[field.key];
      toggles[role] = value === true || value === 'true' || (typeof value === 'string' && value !== 'none' && value !== 'false' && value !== '');
    }
    return toggles;
  }

  private materialsFrom(selections: SelectionMap, fields: FieldRow[]): Record<string, string> {
    const materials: Record<string, string> = {};
    for (const field of fields) {
      if (!field.mapsTo3d?.startsWith('material:')) continue;
      const slot = field.mapsTo3d.slice('material:'.length);
      const value = selections[field.key];
      if (typeof value !== 'string' || value === '') continue;
      const option = field.options.find((o) => o.value === value);
      materials[slot] = option?.materialKey ?? value;
    }
    return materials;
  }
}
