import { z } from 'zod';

/**
 * Kontrakt deklaratywnych operacji wizualnych (CSG) - FUNKCJA WYŁĄCZONA W MVP
 * (ADR-0005). Zdefiniowany zawczasu, aby klient i worker eksportujący używały
 * dokładnie tego samego opisu, gdy tenant włączy flagę `csg`.
 *
 * Whitelist: wyłącznie podziały przeszklenia. CSG nie zastępuje brakującego GLB,
 * nie generuje geometrii produkcyjnej i nie jest źródłem ceny ani BOM.
 */
export const CSG_LIMITS = {
  maxColumns: 6,
  maxRows: 8,
  maxOperationsPerSpec: 4,
} as const;

export const csgOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('glass_division'),
    targetRole: z.literal('glass'),
    columns: z.number().int().min(1).max(CSG_LIMITS.maxColumns),
    rows: z.number().int().min(1).max(CSG_LIMITS.maxRows),
    barWidthMm: z.number().int().min(8).max(80),
    barMaterialSlot: z.literal('glass_frame'),
  }),
]);
export type CsgOperation = z.infer<typeof csgOperationSchema>;

export const csgSpecSchema = z
  .array(csgOperationSchema)
  .max(CSG_LIMITS.maxOperationsPerSpec);
export type CsgSpec = z.infer<typeof csgSpecSchema>;
