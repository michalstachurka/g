import type {
  AssetManifest,
  ModuleSlot,
  RenderModule,
  RenderPart,
  RenderSpec,
  SemanticRole,
  Vec3Mm,
} from '@door/contracts';
import { RENDER_SPEC_VERSION } from '@door/contracts';

/**
 * Budowa publicznego renderSpec - wyłącznie na backendzie, po walidacji.
 * Czysta funkcja: testowalna bez bazy i bez Three.js.
 *
 * Semantyka kontraktu (identyczna dla viewera i workera eksportu):
 * - module.transform.scale skaluje geometrię modułu (grupa skalowana),
 * - part.positionMm != null oznacza część "sztywną": geometria bez skalowania,
 *   przesunięta o podany offset względem współrzędnych autorskich,
 * - module.mirrored = odbicie całego modułu względem pionowej płaszczyzny
 *   x = transform.positionMm[0] + (manifest.baseWidthMm * scale.x) / 2,
 *   dozwolone tylko przy mirrorPolicy=allow.
 */

/** Role sztywne - nigdy nie rozciągane wraz z wymiarami drzwi. */
const FIXED_ROLES: ReadonlySet<string> = new Set([
  'handle_inside',
  'handle_outside',
  'lock_escutcheon',
  'hinges_public',
]);

export interface BundleModuleInput {
  slot: ModuleSlot;
  publicAssetId: string;
  manifest: AssetManifest;
  offsetMm: Vec3Mm;
}

export interface BuildRenderSpecInput {
  configurationRevision: number;
  categorySystemKey: string;
  widthMm: number;
  heightMm: number;
  din: 'left' | 'right';
  opensInward: boolean;
  construction: 'rebated' | 'non_rebated' | 'reverse' | 'hidden';
  modules: BundleModuleInput[];
  /** rola -> widoczność z pól typu toggle (brak wpisu = widoczna). */
  partToggles: Record<string, boolean>;
  /** slot materiałowy -> klucz materiału publicznego. */
  materialSelections: Record<string, string>;
  showMeasurementOverlay: boolean;
}

export interface BuildRenderSpecOutput {
  spec: Omit<RenderSpec, 'checksum'>;
  problems: string[];
}

function anchorPosition(manifest: AssetManifest, anchor: string): Vec3Mm | null {
  const binding = manifest.anchorBindings.find((a) => a.anchor === anchor);
  if (!binding) return null;
  if (binding.normalized) {
    return [
      binding.positionMm[0] * manifest.baseWidthMm,
      binding.positionMm[1] * manifest.baseHeightMm,
      binding.positionMm[2] * manifest.baseDepthMm,
    ];
  }
  return binding.positionMm;
}

function moduleScale(manifest: AssetManifest, widthMm: number, heightMm: number): Vec3Mm {
  const sx = widthMm / manifest.baseWidthMm;
  const sy = heightMm / manifest.baseHeightMm;
  switch (manifest.scalePolicy) {
    case 'fixed':
    case 'variant_only':
      return [1, 1, 1];
    case 'uniform':
      return [sx, sx, sx];
    case 'width_height':
      return [sx, sy, 1];
    case 'approved_axes': {
      const axes = manifest.approvedAxes ?? [];
      return [axes.includes('x') ? sx : 1, axes.includes('y') ? sy : 1, 1];
    }
  }
}

/**
 * Zachowanie odległości od bliższej krawędzi pionowej przy zmianie szerokości.
 * Klamka trzyma się krawędzi zamkowej, zawiasy krawędzi zawiasowej.
 */
export function preserveEdgeDistanceX(
  authoredX: number,
  baseWidthMm: number,
  newWidthMm: number,
): number {
  const distLeft = authoredX;
  const distRight = baseWidthMm - authoredX;
  return distLeft <= distRight ? authoredX : newWidthMm - distRight;
}

export function buildRenderSpec(input: BuildRenderSpecInput): BuildRenderSpecOutput {
  const problems: string[] = [];
  const modules: RenderModule[] = [];
  const visibleParts = new Set<string>();

  const isDouble = input.categorySystemKey === 'double';
  const openingMode: RenderSpec['openingMode'] =
    input.categorySystemKey === 'sliding' ? 'sliding' : 'swing';

  let animationPivot: Vec3Mm | null = null;

  for (const mod of input.modules) {
    const manifest = mod.manifest;
    const scale = moduleScale(manifest, input.widthMm, input.heightMm);

    // DIN: odbicie modułu, gdy autorska strona zawiasów nie zgadza się z wyborem.
    let mirrored = false;
    if (manifest.baseHingeSide && manifest.baseHingeSide !== input.din) {
      if (manifest.mirrorPolicy === 'allow') {
        mirrored = true;
      } else {
        problems.push(
          `Asset ${manifest.assetKey} wymaga osobnego wariantu dla DIN ${input.din === 'left' ? 'lewy' : 'prawy'} (mirrorPolicy=variant_required).`,
        );
      }
    }

    const parts: RenderPart[] = [];
    const seenRoles = new Set<string>();
    for (const binding of manifest.nodeBindings) {
      if (seenRoles.has(binding.role)) continue;
      seenRoles.add(binding.role);
      const toggled = input.partToggles[binding.role];
      const visible = toggled !== false;

      let positionMm: Vec3Mm | null = null;
      if (FIXED_ROLES.has(binding.role)) {
        // Część sztywna: offset tak, aby po skalowaniu trzymała się swojej krawędzi.
        const anchorKey =
          binding.role === 'hinges_public' ? 'hinge_axis' : 'handle_center';
        const anchor = anchorPosition(manifest, anchorKey);
        if (anchor) {
          const newX = preserveEdgeDistanceX(anchor[0], manifest.baseWidthMm, input.widthMm);
          positionMm = [Math.round(newX - anchor[0]), 0, 0];
        } else {
          positionMm = [0, 0, 0];
        }
      }

      if (visible) visibleParts.add(binding.role);
      parts.push({
        role: binding.role as SemanticRole,
        visible,
        positionMm,
        mirrored: false,
        materialSlot: null,
      });
    }

    modules.push({
      slot: mod.slot,
      publicAssetId: mod.publicAssetId,
      assetVersion: manifest.assetVersion,
      visible: true,
      mirrored,
      transform: {
        positionMm: mod.offsetMm,
        rotationDeg: [0, 0, 0],
        scale,
      },
      parts,
    });

    // Oś animacji z modułu skrzydła (aktywnego przy dwuskrzydłowych).
    const isAnimatedSlot = isDouble ? mod.slot === 'active_leaf' : mod.slot === 'door_leaf';
    if (isAnimatedSlot && openingMode === 'swing') {
      const hinge = anchorPosition(manifest, 'hinge_axis');
      if (hinge) {
        const scaledX = preserveEdgeDistanceX(hinge[0], manifest.baseWidthMm, input.widthMm);
        const finalX = mirrored ? input.widthMm - scaledX : scaledX;
        animationPivot = [Math.round(finalX + mod.offsetMm[0]), 0, 0];
      }
    }
  }

  const direction: 1 | -1 =
    (input.din === 'left' ? 1 : -1) * (input.opensInward ? 1 : -1) > 0 ? 1 : -1;

  const spec: Omit<RenderSpec, 'checksum'> = {
    renderSpecVersion: RENDER_SPEC_VERSION,
    configurationRevision: input.configurationRevision,
    widthMm: Math.round(input.widthMm),
    heightMm: Math.round(input.heightMm),
    openingDirection: input.din,
    openingMode,
    doorConstruction: input.construction,
    modules,
    visibleParts: [...visibleParts].sort(),
    publicMaterials: { ...input.materialSelections },
    animation:
      openingMode === 'swing'
        ? {
            type: 'hinge',
            pivotAnchor: 'hinge_axis',
            pivotMm: animationPivot,
            maxAngleDeg: 95,
            slideDistanceMm: null,
            direction,
            animatedSlots: isDouble ? ['active_leaf'] : ['door_leaf'],
          }
        : {
            type: 'slide',
            pivotAnchor: null,
            pivotMm: null,
            maxAngleDeg: 0,
            slideDistanceMm: Math.round(input.widthMm * 0.9),
            direction,
            animatedSlots: ['door_leaf'],
          },
    scene: {
      mounting: 'wall',
      showMeasurementOverlay: input.showMeasurementOverlay,
      background: 'studio',
    },
    dinDiagram: { hingeSide: input.din, opensInward: input.opensInward },
  };

  return { spec, problems };
}
