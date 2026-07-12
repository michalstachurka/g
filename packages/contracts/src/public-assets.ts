import { z } from 'zod';
import { assetManifestSchema } from './asset-manifest';

/**
 * Publiczny widok manifestu assetu - dokładnie te dane, których viewer potrzebuje
 * do złożenia sceny. Bez ścieżek storage, licencji, kosztów i danych właściciela.
 */
export const publicAssetManifestSchema = assetManifestSchema.pick({
  manifestVersion: true,
  assetKey: true,
  assetVersion: true,
  semanticRole: true,
  variantKey: true,
  baseWidthMm: true,
  baseHeightMm: true,
  baseDepthMm: true,
  units: true,
  upAxis: true,
  forwardAxis: true,
  mountingPlane: true,
  pivotPolicy: true,
  scalePolicy: true,
  approvedAxes: true,
  allowedDimensionRange: true,
  mirrorPolicy: true,
  baseHingeSide: true,
  nodeBindings: true,
  materialBindings: true,
  anchorBindings: true,
  animationBindings: true,
  compression: true,
  checksum: true,
});
export type PublicAssetManifest = z.infer<typeof publicAssetManifestSchema>;

export const publicAssetInfoSchema = z.object({
  publicAssetId: z.string(),
  manifest: publicAssetManifestSchema,
  /** Względny URL publicznego GLB (serwowany przez API, cache po checksumie). */
  fileUrl: z.string(),
});
export type PublicAssetInfo = z.infer<typeof publicAssetInfoSchema>;
