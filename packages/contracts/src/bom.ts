import { z } from 'zod';
import { conditionSchema } from './rules';

/**
 * Deklaratywne formuły ilości BOM. Liczone wyłącznie na serwerze,
 * dostępne tylko dla ról produkcyjnych. Nigdy w publicznym API.
 */
export const qtyFormulaSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fixed'), value: z.number().nonnegative() }),
  z.object({ kind: z.literal('hinge_count'), factor: z.number().default(1) }),
  z.object({ kind: z.literal('leaf_area_m2'), factor: z.number().default(1), wastePercent: z.number().default(0) }),
  z.object({ kind: z.literal('leaf_perimeter_m'), factor: z.number().default(1), wastePercent: z.number().default(0) }),
  z.object({ kind: z.literal('width_m'), factor: z.number().default(1) }),
  z.object({ kind: z.literal('height_m'), factor: z.number().default(1) }),
]);
export type QtyFormula = z.infer<typeof qtyFormulaSchema>;

export const bomItemDefSchema = z.object({
  componentName: z.string(),
  sku: z.string(),
  variant: z.string().nullable().optional(),
  unit: z.enum(['szt', 'm', 'm2', 'kpl']),
  qty: qtyFormulaSchema,
  roundUp: z.boolean().default(false),
  stage: z.enum(['ciecie', 'oklejanie', 'okuwanie', 'pakowanie', 'inne']).default('inne'),
  supplier: z.string().nullable().optional(),
  /** Koszt wewnętrzny w groszach - nigdy nie wychodzi poza role produkcyjne. */
  internalCost: z.number().int().nullable().optional(),
  packaging: z.string().nullable().optional(),
  comment: z.string().nullable().optional(),
  when: conditionSchema.nullable().optional(),
});
export type BomItemDef = z.infer<typeof bomItemDefSchema>;

export const bomLineSchema = z.object({
  componentName: z.string(),
  sku: z.string(),
  variant: z.string().nullable(),
  unit: z.string(),
  qty: z.number(),
  stage: z.string(),
  supplier: z.string().nullable(),
  internalCost: z.number().int().nullable(),
  comment: z.string().nullable(),
});
export type BomLine = z.infer<typeof bomLineSchema>;

export const DOCUMENT_KINDS = [
  'customer_specification',
  'sales_quote',
  'dealer_quote',
  'production_bom',
  'measurement_sheet',
  'installation_sheet',
] as const;
export const documentKindSchema = z.enum(DOCUMENT_KINDS);
export type DocumentKind = z.infer<typeof documentKindSchema>;

/** Dokumenty dozwolone w publicznym API (bez danych produkcyjnych). */
export const PUBLIC_DOCUMENT_KINDS: readonly DocumentKind[] = ['customer_specification'];
