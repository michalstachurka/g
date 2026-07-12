import { z } from 'zod';
import { renderSpecSchema } from './render-spec';

export const selectionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);
export type SelectionValue = z.infer<typeof selectionValueSchema>;

export const evaluateRequestSchema = z.object({
  categoryKey: z.string().min(1),
  modelKey: z.string().min(1).nullable().optional(),
  variantKey: z.string().nullable().optional(),
  selections: z.record(z.string(), selectionValueSchema).default({}),
  revision: z.number().int().nonnegative().default(0),
});
export type EvaluateRequest = z.infer<typeof evaluateRequestSchema>;

export const issueSchema = z.object({
  code: z.string(),
  fieldKey: z.string().nullable().optional(),
  message: z.string(),
});
export type Issue = z.infer<typeof issueSchema>;

export const adjustmentSchema = z.object({
  fieldKey: z.string(),
  from: selectionValueSchema,
  to: selectionValueSchema,
  reason: z.string(),
});
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const availableOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  available: z.boolean(),
  reasonUnavailable: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  /** Publiczna informacja o dopłacie (tylko gdy tenant włączył pokazywanie dopłat). */
  priceHint: z.string().nullable().optional(),
});
export type AvailableOption = z.infer<typeof availableOptionSchema>;

export const priceLineSchema = z.object({
  label: z.string(),
  amount: z.number().int(),
});

export const priceSummarySchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3),
  taxMode: z.enum(['gross', 'net']),
  taxRatePercent: z.number().nonnegative(),
  /** Publiczne pozycje dopłat - tylko jeżeli tenant włączył ich pokazywanie. */
  lines: z.array(priceLineSchema).optional(),
  individualQuote: z.boolean().default(false),
});
export type PriceSummary = z.infer<typeof priceSummarySchema>;

export const evaluateVersionsSchema = z.object({
  schema: z.string(),
  ruleSet: z.string(),
  priceList: z.string(),
  assetSet: z.string(),
});

export const evaluateResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(issueSchema),
  warnings: z.array(issueSchema),
  automaticAdjustments: z.array(adjustmentSchema),
  availableOptions: z.record(z.string(), z.array(availableOptionSchema)),
  hiddenFields: z.array(z.string()),
  priceSummary: priceSummarySchema.nullable(),
  renderSpec: renderSpecSchema.nullable(),
  /** Uczciwa informacja o braku wizualizacji (MISSING_ASSET) - bez atrap. */
  visualizationStatus: z.enum(['ready', 'missing_asset']),
  missingAssetNotice: z.string().nullable().optional(),
  versions: evaluateVersionsSchema,
  configurationRevision: z.number().int().nonnegative(),
  checksum: z.string(),
});
export type EvaluateResponse = z.infer<typeof evaluateResponseSchema>;
