import { z } from 'zod';
import { conditionSchema } from './rules';

/**
 * Deklaratywne pozycje cennika. Kwoty w najmniejszej jednostce waluty (grosze).
 * Wykonanie wyłącznie na backendzie. Te definicje są danymi tenanta w bazie,
 * nigdy nie są wysyłane do przeglądarki klienta końcowego.
 */
export const dimensionMatrixSchema = z.object({
  /** Górne granice przedziałów szerokości (mm), rosnąco. */
  widthUpToMm: z.array(z.number().int().positive()).min(1),
  heightUpToMm: z.array(z.number().int().positive()).min(1),
  /** amounts[heightIdx][widthIdx] w groszach. */
  amounts: z.array(z.array(z.number().int())),
});
export type DimensionMatrix = z.infer<typeof dimensionMatrixSchema>;

export const priceRuleDefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('base'),
    modelKey: z.string(),
    amount: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('option_surcharge'),
    fieldKey: z.string(),
    optionValue: z.string(),
    amount: z.number().int(),
    label: z.string(),
    publicLine: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('option_surcharge_percent'),
    fieldKey: z.string(),
    optionValue: z.string(),
    percent: z.number(),
    label: z.string(),
    publicLine: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('dimension_matrix'),
    modelKey: z.string().nullable().optional(),
    matrix: dimensionMatrixSchema,
    label: z.string().default('Dopłata wymiarowa'),
  }),
  z.object({
    kind: z.literal('oversize_percent'),
    aboveWidthMm: z.number().int().nullable().optional(),
    aboveHeightMm: z.number().int().nullable().optional(),
    percent: z.number(),
    label: z.string().default('Wymiar niestandardowy'),
  }),
  z.object({
    kind: z.literal('service'),
    fieldKey: z.string(),
    optionValue: z.string().nullable().optional(),
    amount: z.number().int().nonnegative(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('min_price'),
    amount: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('discount_percent'),
    percent: z.number().positive(),
    label: z.string(),
    when: conditionSchema.nullable().optional(),
    /** Rabaty techniczne nie są pokazywane publicznie jako osobna pozycja. */
    publicLine: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal('individual_quote'),
    when: conditionSchema,
    label: z.string().default('Wycena indywidualna'),
  }),
]);
export type PriceRuleDef = z.infer<typeof priceRuleDefSchema>;

export const priceListSettingsSchema = z.object({
  currency: z.string().length(3).default('PLN'),
  taxRatePercent: z.number().nonnegative().default(23),
  taxMode: z.enum(['gross', 'net']).default('gross'),
  rounding: z.enum(['none', 'to_grosz', 'to_zloty']).default('to_grosz'),
  /** Wersjonowany kurs waluty względem waluty bazowej tenanta. */
  currencyRate: z.number().positive().default(1),
});
export type PriceListSettings = z.infer<typeof priceListSettingsSchema>;
