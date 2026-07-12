import { z } from 'zod';

export const themeTokensSchema = z.object({
  colorPrimary: z.string().default('#1a1a1a'),
  colorAccent: z.string().default('#b8860b'),
  colorBackground: z.string().default('#f7f6f3'),
  colorSurface: z.string().default('#ffffff'),
  colorText: z.string().default('#1c1c1c'),
  colorTextMuted: z.string().default('#6b6b6b'),
  colorBorder: z.string().default('#e3e0da'),
  colorSuccess: z.string().default('#1f7a4d'),
  colorWarning: z.string().default('#a86a00'),
  colorError: z.string().default('#b3261e'),
  fontHeading: z.string().default('system-ui'),
  fontBody: z.string().default('system-ui'),
  radiusPx: z.number().int().min(0).max(32).default(6),
  density: z.enum(['compact', 'regular', 'comfortable']).default('regular'),
  shadowLevel: z.enum(['none', 'soft', 'strong']).default('soft'),
});
export type ThemeTokens = z.infer<typeof themeTokensSchema>;

export const layoutSettingsSchema = z.object({
  preset: z.enum(['panel_left', 'panel_right', 'compact_top']).default('panel_right'),
  panelWidthPx: z.number().int().min(320).max(640).default(420),
  viewerHeightMobileVh: z.number().int().min(30).max(70).default(44),
  optionCardStyle: z.enum(['tiles', 'list']).default('tiles'),
  buttonStyle: z.enum(['solid', 'outline']).default('solid'),
  headerLayout: z.enum(['logo_left', 'logo_center']).default('logo_left'),
  showPrice: z.boolean().default(true),
  showPriceLines: z.boolean().default(false),
});
export type LayoutSettings = z.infer<typeof layoutSettingsSchema>;

export const publicBrandingSchema = z.object({
  tenantSlug: z.string(),
  companyName: z.string(),
  logoUrl: z.string().nullable(),
  logoDarkUrl: z.string().nullable(),
  faviconUrl: z.string().nullable(),
  theme: themeTokensSchema,
  layout: layoutSettingsSchema,
  /** Edytowalne teksty interfejsu (CTA, nagłówki, komunikaty). */
  texts: z.record(z.string(), z.string()),
  footerText: z.string().nullable(),
  contact: z
    .object({ phone: z.string().nullable(), email: z.string().nullable(), address: z.string().nullable() })
    .nullable(),
  legalLinks: z.array(z.object({ label: z.string(), url: z.string() })),
  languages: z.array(z.string()).default(['pl']),
  defaultLanguage: z.string().default('pl'),
});
export type PublicBranding = z.infer<typeof publicBrandingSchema>;

export const publicCategorySchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  order: z.number().int(),
  /** false = brak opublikowanego assetu; UI pokazuje uczciwy komunikat. */
  visualizationReady: z.boolean(),
  missingAssetNotice: z.string().nullable(),
});
export type PublicCategory = z.infer<typeof publicCategorySchema>;

export const publicModelSchema = z.object({
  key: z.string(),
  name: z.string(),
  familyKey: z.string(),
  familyName: z.string(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  visualizationReady: z.boolean(),
  baseWidthMm: z.number().int(),
  baseHeightMm: z.number().int(),
  minWidthMm: z.number().int(),
  maxWidthMm: z.number().int(),
  minHeightMm: z.number().int(),
  maxHeightMm: z.number().int(),
});
export type PublicModel = z.infer<typeof publicModelSchema>;

export const fieldTypeSchema = z.enum([
  'select',
  'radio_cards',
  'color_select',
  'toggle',
  'number',
  'dimensions',
  'text',
  'textarea',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const publicFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: fieldTypeSchema,
  required: z.boolean(),
  defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  tooltip: z.string().nullable(),
  section: z.string().nullable(),
  unit: z.string().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  step: z.number().nullable(),
  order: z.number().int(),
  options: z
    .array(
      z.object({
        value: z.string(),
        label: z.string(),
        description: z.string().nullable(),
        imageUrl: z.string().nullable(),
        colorHex: z.string().nullable(),
      }),
    )
    .nullable(),
});
export type PublicField = z.infer<typeof publicFieldSchema>;

export const publicStepSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  fields: z.array(publicFieldSchema),
});
export type PublicStep = z.infer<typeof publicStepSchema>;

export const publicSchemaSchema = z.object({
  schemaVersion: z.string(),
  category: publicCategorySchema,
  models: z.array(publicModelSchema),
  steps: z.array(publicStepSchema),
});
export type PublicSchema = z.infer<typeof publicSchemaSchema>;

/** Publiczna definicja materiału (parametryczny PBR, bez tekstur produkcyjnych). */
export const publicMaterialDefSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: z.enum(['color', 'wood', 'glass', 'metal', 'mirror']),
  baseColorHex: z.string(),
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  opacity: z.number().min(0).max(1).default(1),
  transmission: z.number().min(0).max(1).default(0),
  clearcoat: z.number().min(0).max(1).default(0),
});
export type PublicMaterialDef = z.infer<typeof publicMaterialDefSchema>;
