import { describe, expect, it } from 'vitest';
import type { PublicAssetManifest, RenderModule, RenderSpec } from '@door/contracts';
import { compositionFingerprint, materialSlotForRole, placeAll, placeModule } from './composition';

const manifest: PublicAssetManifest = {
  manifestVersion: '1',
  assetKey: 'leaf',
  assetVersion: 1,
  semanticRole: 'door_leaf',
  baseWidthMm: 900,
  baseHeightMm: 2100,
  baseDepthMm: 115,
  units: 'meters',
  upAxis: 'y',
  forwardAxis: '-z',
  mountingPlane: 'wall',
  pivotPolicy: 'bottom_left_front',
  scalePolicy: 'width_height',
  allowedDimensionRange: { minWidthMm: 700, maxWidthMm: 1000, minHeightMm: 1900, maxHeightMm: 2300 },
  mirrorPolicy: 'allow',
  nodeBindings: [
    { role: 'door_leaf', nodePath: '0', nodeName: null, mirrorable: true },
    { role: 'handle_inside', nodePath: '1', nodeName: null, mirrorable: true },
  ],
  materialBindings: [
    { slotKey: 'leaf_side_a', appliesToRoles: ['door_leaf'] },
    { slotKey: 'handle', appliesToRoles: ['handle_inside'] },
  ],
  anchorBindings: [],
  animationBindings: [],
  compression: 'none',
  checksum: 'sha256:test',
};

const module: RenderModule = {
  slot: 'door_leaf',
  publicAssetId: 'pub_leaf',
  assetVersion: 1,
  visible: true,
  mirrored: false,
  transform: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0], scale: [1.1, 1, 1] },
  parts: [
    { role: 'door_leaf', visible: true, positionMm: null, mirrored: false, materialSlot: null },
    { role: 'handle_inside', visible: true, positionMm: [100, 0, 0], mirrored: false, materialSlot: null },
  ],
};

describe('materialSlotForRole', () => {
  it('mapuje rolę na slot materiałowy z manifestu', () => {
    expect(materialSlotForRole(manifest, 'door_leaf')).toBe('leaf_side_a');
    expect(materialSlotForRole(manifest, 'handle_inside')).toBe('handle');
    expect(materialSlotForRole(manifest, 'threshold')).toBeNull();
  });
});

describe('placeModule', () => {
  it('część z positionMm != null jest oznaczona jako fixedSize (nieskalowana)', () => {
    const placement = placeModule(module, manifest, ['door_leaf']);
    const leaf = placement.parts.find((p) => p.role === 'door_leaf');
    const handle = placement.parts.find((p) => p.role === 'handle_inside');
    expect(leaf?.fixedSize).toBe(false);
    expect(handle?.fixedSize).toBe(true);
    expect(handle?.offsetM).toEqual([0.1, 0, 0]);
  });

  it('mapuje węzły po ścieżce niezależnie od nazw meshy', () => {
    const placement = placeModule(module, manifest, ['door_leaf']);
    expect(placement.parts.map((p) => p.nodePath).sort()).toEqual(['0', '1']);
  });

  it('płaszczyzna odbicia = połowa przeskalowanej szerokości w metrach', () => {
    const placement = placeModule(module, manifest, ['door_leaf']);
    // baseWidth 900mm * scale 1.1 * 0.001 / 2 = 0.495
    expect(placement.mirrorPlaneX).toBeCloseTo(0.495);
  });

  it('animatedSlots decyduje o fladze animacji', () => {
    expect(placeModule(module, manifest, ['door_leaf']).animated).toBe(true);
    expect(placeModule(module, manifest, ['frame']).animated).toBe(false);
  });
});

describe('placeAll + compositionFingerprint', () => {
  const spec = {
    modules: [module],
    animation: { animatedSlots: ['door_leaf'] },
  } as unknown as RenderSpec;

  it('fingerprint jest deterministyczny (zgodność viewer/worker)', () => {
    const a = compositionFingerprint(placeAll(spec, { pub_leaf: manifest }));
    const b = compositionFingerprint(placeAll(spec, { pub_leaf: manifest }));
    expect(a).toBe(b);
  });

  it('brak manifestu dla assetu rzuca czytelny błąd', () => {
    expect(() => placeAll(spec, {})).toThrow(/manifest/i);
  });
});
