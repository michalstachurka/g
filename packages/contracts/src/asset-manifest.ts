import { z } from 'zod';
import { anchorKeySchema, materialSlotSchema, semanticRoleSchema } from './semantic-roles';

export const scalePolicySchema = z.enum([
  'fixed',
  'uniform',
  'width_height',
  'approved_axes',
  'variant_only',
]);
export type ScalePolicy = z.infer<typeof scalePolicySchema>;

export const mirrorPolicySchema = z.enum(['allow', 'variant_required']);
export type MirrorPolicy = z.infer<typeof mirrorPolicySchema>;

export const vec3MmSchema = z.tuple([z.number(), z.number(), z.number()]);

/**
 * Mapowanie węzła GLB na rolę semantyczną. `nodePath` to ścieżka indeksów węzłów
 * od korzenia sceny (np. "4" lub "0/2/1"). Działa dla plików bez nazw węzłów
 * i nie wymaga od klienta zmiany nazewnictwa w programie 3D.
 */
export const nodeBindingSchema = z.object({
  role: semanticRoleSchema,
  nodePath: z.string().min(1),
  nodeName: z.string().nullable().optional(),
  mirrorable: z.boolean().default(true),
});
export type NodeBinding = z.infer<typeof nodeBindingSchema>;

export const materialBindingSchema = z.object({
  slotKey: materialSlotSchema,
  /** Role węzłów, których materiał podlega temu slotowi. */
  appliesToRoles: z.array(semanticRoleSchema).min(1),
  side: z.enum(['a', 'b']).nullable().optional(),
});
export type MaterialBinding = z.infer<typeof materialBindingSchema>;

export const anchorBindingSchema = z.object({
  anchor: anchorKeySchema,
  /** Pozycja w mm w układzie lokalnym assetu (przed skalowaniem). */
  positionMm: vec3MmSchema,
  /** Gdy true, positionMm interpretowane jako ułamek 0..1 wymiaru bazowego. */
  normalized: z.boolean().default(false),
});
export type AnchorBinding = z.infer<typeof anchorBindingSchema>;

export const allowedDimensionRangeSchema = z.object({
  minWidthMm: z.number().int().positive(),
  maxWidthMm: z.number().int().positive(),
  minHeightMm: z.number().int().positive(),
  maxHeightMm: z.number().int().positive(),
});
export type AllowedDimensionRange = z.infer<typeof allowedDimensionRangeSchema>;

/**
 * Wersjonowany manifest assetu 3D - kontrakt z sekcji 7.3.1 specyfikacji.
 * Manifest jest publiczny w zakresie potrzebnym viewerowi (bindingi, wymiary bazowe,
 * anchory, polityki). Nie zawiera ścieżek storage ani danych produkcyjnych.
 */
export const assetManifestSchema = z.object({
  manifestVersion: z.literal('1'),
  assetKey: z.string().min(1),
  assetVersion: z.number().int().positive(),
  semanticRole: semanticRoleSchema,
  variantKey: z.string().nullable().optional(),
  baseWidthMm: z.number().positive(),
  baseHeightMm: z.number().positive(),
  baseDepthMm: z.number().positive(),
  units: z.literal('meters'),
  upAxis: z.literal('y'),
  forwardAxis: z.enum(['-z', '+z']),
  mountingPlane: z.enum(['wall', 'floor']),
  pivotPolicy: z.enum(['bottom_left_front', 'bottom_center', 'origin_as_authored']),
  scalePolicy: scalePolicySchema,
  approvedAxes: z.array(z.enum(['x', 'y', 'z'])).optional(),
  allowedDimensionRange: allowedDimensionRangeSchema,
  mirrorPolicy: mirrorPolicySchema,
  /** Bazowa strona zawiasów w geometrii pliku (przed kompozycją DIN). */
  baseHingeSide: z.enum(['left', 'right']).optional(),
  nodeBindings: z.array(nodeBindingSchema),
  materialBindings: z.array(materialBindingSchema),
  anchorBindings: z.array(anchorBindingSchema),
  animationBindings: z
    .array(z.object({ name: z.string(), role: z.string() }))
    .default([]),
  compression: z.enum(['none', 'draco', 'meshopt']).default('none'),
  checksum: z.string().min(8),
});
export type AssetManifest = z.infer<typeof assetManifestSchema>;

/** Pola manifestu wymagane do publikacji assetu. */
export function validateManifestForPublish(manifest: AssetManifest): string[] {
  const problems: string[] = [];
  if (manifest.nodeBindings.length === 0) {
    problems.push('Brak mapowania węzłów na role semantyczne.');
  }
  if (manifest.baseWidthMm <= 0 || manifest.baseHeightMm <= 0 || manifest.baseDepthMm <= 0) {
    problems.push('Wymiary bazowe muszą być dodatnie.');
  }
  if (manifest.scalePolicy === 'approved_axes' && (manifest.approvedAxes?.length ?? 0) === 0) {
    problems.push('Polityka approved_axes wymaga wskazania osi.');
  }
  const range = manifest.allowedDimensionRange;
  if (range.minWidthMm > range.maxWidthMm || range.minHeightMm > range.maxHeightMm) {
    problems.push('Zakres wymiarów jest odwrócony.');
  }
  return problems;
}
