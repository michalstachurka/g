import { z } from 'zod';
import { anchorKeySchema, moduleSlotSchema, semanticRoleSchema } from './semantic-roles';
import { vec3MmSchema } from './asset-manifest';

export const RENDER_SPEC_VERSION = '1' as const;

export const transformSchema = z.object({
  positionMm: vec3MmSchema,
  rotationDeg: vec3MmSchema,
  scale: vec3MmSchema,
});
export type RenderTransform = z.infer<typeof transformSchema>;

export const renderPartSchema = z.object({
  role: semanticRoleSchema,
  visible: z.boolean(),
  /** Nadpisanie pozycji części względem modułu (mm), np. klamka po zmianie DIN. */
  positionMm: vec3MmSchema.nullable().optional(),
  mirrored: z.boolean().default(false),
  materialSlot: z.string().nullable().optional(),
});
export type RenderPart = z.infer<typeof renderPartSchema>;

export const renderModuleSchema = z.object({
  slot: moduleSlotSchema,
  publicAssetId: z.string().min(1),
  assetVersion: z.number().int().positive(),
  visible: z.boolean(),
  mirrored: z.boolean().default(false),
  transform: transformSchema,
  parts: z.array(renderPartSchema).default([]),
});
export type RenderModule = z.infer<typeof renderModuleSchema>;

export const renderAnimationSchema = z.object({
  type: z.enum(['hinge', 'slide', 'none']),
  pivotAnchor: anchorKeySchema.nullable(),
  pivotMm: vec3MmSchema.nullable(),
  maxAngleDeg: z.number().min(0).max(180).default(95),
  slideDistanceMm: z.number().nullable().optional(),
  /** 1 = otwieranie w stronę kamery (strona A), -1 = od kamery. */
  direction: z.union([z.literal(1), z.literal(-1)]).default(1),
  animatedSlots: z.array(moduleSlotSchema).default(['door_leaf']),
});
export type RenderAnimation = z.infer<typeof renderAnimationSchema>;

export const renderSceneSchema = z.object({
  mounting: z.enum(['wall', 'floor']),
  showMeasurementOverlay: z.boolean().default(true),
  background: z.enum(['studio', 'wall', 'none']).default('studio'),
});

export const dinDiagramSchema = z.object({
  hingeSide: z.enum(['left', 'right']),
  opensInward: z.boolean(),
});

/**
 * Publiczny, wersjonowany opis sceny. Jedyne źródło decyzji wizualnych dla viewera.
 * Nie może zawierać: cen, kosztów, marż, BOM, pełnych reguł, tolerancji produkcyjnych
 * ani prywatnych ścieżek storage - patrz assertRenderSpecPublic().
 */
export const renderSpecSchema = z.object({
  renderSpecVersion: z.literal(RENDER_SPEC_VERSION),
  configurationRevision: z.number().int().nonnegative(),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  openingDirection: z.enum(['left', 'right']),
  openingMode: z.enum(['swing', 'sliding', 'fixed']),
  doorConstruction: z.enum(['rebated', 'non_rebated', 'reverse', 'hidden']),
  modules: z.array(renderModuleSchema),
  visibleParts: z.array(z.string()),
  publicMaterials: z.record(z.string(), z.string()),
  animation: renderAnimationSchema,
  scene: renderSceneSchema,
  dinDiagram: dinDiagramSchema,
  checksum: z.string(),
});
export type RenderSpec = z.infer<typeof renderSpecSchema>;

/**
 * Wzorce kluczy zabronionych w publicznym renderSpec. Test jednostkowy oraz
 * runtime-owy guard w API odrzucają spec zawierający którykolwiek z nich
 * na dowolnym poziomie zagnieżdżenia.
 */
export const FORBIDDEN_RENDER_SPEC_KEY_PATTERN =
  /(price|cost|margin|marza|discount|rabat|bom|sku|formula|tolerance|tolerancj|storagepath|filepath|s3key|secret|internal|purchase|supplier|dostawca)/i;

export function findForbiddenRenderSpecKeys(value: unknown, path = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => found.push(...findForbiddenRenderSpecKeys(item, `${path}[${i}]`)));
    return found;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_RENDER_SPEC_KEY_PATTERN.test(key)) found.push(keyPath);
    found.push(...findForbiddenRenderSpecKeys(child, keyPath));
  }
  return found;
}

export function assertRenderSpecPublic(spec: unknown): void {
  const offending = findForbiddenRenderSpecKeys(spec);
  if (offending.length > 0) {
    throw new Error(`renderSpec zawiera pola zabronione: ${offending.join(', ')}`);
  }
}
