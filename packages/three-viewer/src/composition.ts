import type { PublicAssetManifest, RenderModule, RenderSpec } from '@door/contracts';
import { MM_TO_M } from '@door/contracts';

/**
 * Czysta logika kompozycji sceny (bez Three.js) - współdzielona koncepcyjnie
 * z workerem eksportu i testowalna jednostkowo.
 *
 * Semantyka (DOMAIN_MODEL §6):
 * - grupa skalowana: transform.scale modułu,
 * - część z positionMm != null: geometria bez skalowania + translacja o offset,
 * - mirrored: odbicie względem płaszczyzny x = pozycja + (baseWidth * scaleX) / 2.
 */

export interface PartPlacement {
  role: string;
  nodePath: string;
  visible: boolean;
  /** true = węzeł przenosimy do grupy nieskalowanej. */
  fixedSize: boolean;
  /** Translacja w metrach (offset od pozycji autorskiej). */
  offsetM: [number, number, number];
  materialSlot: string | null;
}

export interface ModulePlacement {
  slot: string;
  publicAssetId: string;
  positionM: [number, number, number];
  rotationDeg: [number, number, number];
  scale: [number, number, number];
  mirrored: boolean;
  /** Płaszczyzna odbicia w metrach (lokalnie względem pozycji modułu). */
  mirrorPlaneX: number;
  animated: boolean;
  parts: PartPlacement[];
}

export function materialSlotForRole(manifest: PublicAssetManifest, role: string): string | null {
  const binding = manifest.materialBindings.find((b) => b.appliesToRoles.includes(role as never));
  return binding?.slotKey ?? null;
}

export function placeModule(
  module: RenderModule,
  manifest: PublicAssetManifest,
  animatedSlots: readonly string[],
): ModulePlacement {
  const scale = module.transform.scale;
  const parts: PartPlacement[] = [];
  for (const binding of manifest.nodeBindings) {
    const part = module.parts.find((p) => p.role === binding.role);
    const offset = part?.positionMm ?? null;
    parts.push({
      role: binding.role,
      nodePath: binding.nodePath,
      visible: part ? part.visible : true,
      fixedSize: offset != null,
      offsetM: offset ? [offset[0] * MM_TO_M, offset[1] * MM_TO_M, offset[2] * MM_TO_M] : [0, 0, 0],
      materialSlot: materialSlotForRole(manifest, binding.role),
    });
  }
  return {
    slot: module.slot,
    publicAssetId: module.publicAssetId,
    positionM: [
      module.transform.positionMm[0] * MM_TO_M,
      module.transform.positionMm[1] * MM_TO_M,
      module.transform.positionMm[2] * MM_TO_M,
    ],
    rotationDeg: module.transform.rotationDeg,
    scale: [scale[0], scale[1], scale[2]],
    mirrored: module.mirrored,
    mirrorPlaneX: (manifest.baseWidthMm * scale[0] * MM_TO_M) / 2,
    animated: animatedSlots.includes(module.slot),
    parts,
  };
}

export function placeAll(
  spec: RenderSpec,
  manifests: Record<string, PublicAssetManifest>,
): ModulePlacement[] {
  return spec.modules
    .filter((m) => m.visible)
    .map((m) => {
      const manifest = manifests[m.publicAssetId];
      if (!manifest) throw new Error(`Brak manifestu dla assetu ${m.publicAssetId}`);
      return placeModule(m, manifest, spec.animation.animatedSlots);
    });
}

/** Deterministyczny opis kompozycji do testów zgodności viewer/worker. */
export function compositionFingerprint(placements: ModulePlacement[]): string {
  return JSON.stringify(
    placements.map((p) => ({
      s: p.slot,
      a: p.publicAssetId,
      pos: p.positionM.map((v) => Math.round(v * 10000)),
      sc: p.scale.map((v) => Math.round(v * 10000)),
      m: p.mirrored ? Math.round(p.mirrorPlaneX * 10000) : 0,
      parts: p.parts.map((x) => [x.nodePath, x.visible ? 1 : 0, x.fixedSize ? 1 : 0, x.offsetM.map((v) => Math.round(v * 10000))]),
    })),
  );
}
