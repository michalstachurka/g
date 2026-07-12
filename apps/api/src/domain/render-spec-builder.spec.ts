import { describe, expect, it } from 'vitest';
import type { AssetManifest } from '@door/contracts';
import { buildRenderSpec, preserveEdgeDistanceX, type BundleModuleInput } from './render-spec-builder';

function leafManifest(overrides: Partial<AssetManifest> = {}): AssetManifest {
  return {
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
    baseHingeSide: 'right',
    nodeBindings: [
      { role: 'door_leaf', nodePath: '0', nodeName: null, mirrorable: true },
      { role: 'handle_inside', nodePath: '1', nodeName: null, mirrorable: true },
      { role: 'hinges_public', nodePath: '2', nodeName: null, mirrorable: true },
      { role: 'glass', nodePath: '3', nodeName: null, mirrorable: true },
    ],
    materialBindings: [{ slotKey: 'leaf_side_a', appliesToRoles: ['door_leaf'] }],
    anchorBindings: [
      { anchor: 'hinge_axis', positionMm: [868, 1050, 0], normalized: false },
      { anchor: 'handle_center', positionMm: [110, 1020, 0], normalized: false },
    ],
    animationBindings: [],
    compression: 'none',
    checksum: 'sha256:test',
    ...overrides,
  };
}

const module = (manifest: AssetManifest): BundleModuleInput => ({
  slot: 'door_leaf',
  publicAssetId: 'pub_leaf',
  manifest,
  offsetMm: [0, 0, 0],
});

const baseInput = {
  configurationRevision: 1,
  categorySystemKey: 'solid',
  widthMm: 900,
  heightMm: 2100,
  din: 'left' as const,
  opensInward: true,
  construction: 'rebated' as const,
  partToggles: {},
  materialSelections: { leaf_side_a: 'dab' },
  showMeasurementOverlay: true,
};

describe('preserveEdgeDistanceX', () => {
  it('klamka przy krawędzi zamkowej trzyma odległość od tej krawędzi', () => {
    // handle at x=110 (bliżej lewej), baza 900 -> nowa 1000: pozostaje 110
    expect(preserveEdgeDistanceX(110, 900, 1000)).toBe(110);
    // hinge at x=868 (bliżej prawej), dist=32 od prawej -> 1000-32 = 968
    expect(preserveEdgeDistanceX(868, 900, 1000)).toBe(968);
  });
});

describe('buildRenderSpec - skalowanie', () => {
  it('width_height skaluje X i Y skrzydła, nie skaluje Z', () => {
    const { spec } = buildRenderSpec({ ...baseInput, widthMm: 1000, heightMm: 2300, modules: [module(leafManifest())] });
    const scale = spec.modules[0].transform.scale;
    expect(scale[0]).toBeCloseTo(1000 / 900);
    expect(scale[1]).toBeCloseTo(2300 / 2100);
    expect(scale[2]).toBe(1);
  });

  it('polityka fixed nie skaluje wcale', () => {
    const { spec } = buildRenderSpec({ ...baseInput, widthMm: 1000, modules: [module(leafManifest({ scalePolicy: 'fixed' }))] });
    expect(spec.modules[0].transform.scale).toEqual([1, 1, 1]);
  });

  it('części sztywne (klamka, zawiasy) dostają kompensujący offset, nie są rozciągane', () => {
    const { spec } = buildRenderSpec({ ...baseInput, widthMm: 1000, modules: [module(leafManifest())] });
    const handle = spec.modules[0].parts.find((p) => p.role === 'handle_inside');
    expect(handle?.positionMm).not.toBeNull();
    // klamka bliżej lewej krawędzi (110): pozostaje na miejscu -> offset 0
    expect(handle?.positionMm?.[0]).toBe(0);
    const hinge = spec.modules[0].parts.find((p) => p.role === 'hinges_public');
    // zawias przy prawej krawędzi: przesuwany o (1000-900) w prawo
    expect(hinge?.positionMm?.[0]).toBe(100);
  });
});

describe('buildRenderSpec - DIN lewy/prawy', () => {
  it('DIN zgodny z bazą assetu nie odbija modułu', () => {
    // baseHingeSide=right, din=right -> brak mirror
    const { spec } = buildRenderSpec({ ...baseInput, din: 'right', modules: [module(leafManifest())] });
    expect(spec.modules[0].mirrored).toBe(false);
    expect(spec.dinDiagram.hingeSide).toBe('right');
  });

  it('DIN przeciwny do bazy odbija moduł gdy mirrorPolicy=allow', () => {
    const { spec, problems } = buildRenderSpec({ ...baseInput, din: 'left', modules: [module(leafManifest())] });
    expect(spec.modules[0].mirrored).toBe(true);
    expect(problems).toHaveLength(0);
  });

  it('DIN przeciwny przy mirrorPolicy=variant_required daje problem (wymagany wariant)', () => {
    const { problems } = buildRenderSpec({
      ...baseInput,
      din: 'left',
      modules: [module(leafManifest({ mirrorPolicy: 'variant_required' }))],
    });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain('wariant');
  });

  it('kierunek animacji zależy od DIN i strony otwierania', () => {
    const left = buildRenderSpec({ ...baseInput, din: 'left', opensInward: true, modules: [module(leafManifest())] });
    const right = buildRenderSpec({ ...baseInput, din: 'right', opensInward: true, modules: [module(leafManifest())] });
    expect(left.spec.animation.direction).not.toBe(right.spec.animation.direction);
  });
});

describe('buildRenderSpec - widoczność części', () => {
  it('partToggles=false ukrywa część i usuwa z visibleParts', () => {
    const { spec } = buildRenderSpec({ ...baseInput, partToggles: { glass: false }, modules: [module(leafManifest())] });
    expect(spec.visibleParts).not.toContain('glass');
    const glass = spec.modules[0].parts.find((p) => p.role === 'glass');
    expect(glass?.visible).toBe(false);
  });

  it('domyślnie części są widoczne', () => {
    const { spec } = buildRenderSpec({ ...baseInput, modules: [module(leafManifest())] });
    expect(spec.visibleParts).toContain('door_leaf');
    expect(spec.visibleParts).toContain('glass');
  });
});

describe('buildRenderSpec - materiały i determinizm', () => {
  it('materiały A/B trafiają do publicMaterials', () => {
    const { spec } = buildRenderSpec({
      ...baseInput,
      materialSelections: { leaf_side_a: 'dab', leaf_side_b: 'bialy' },
      modules: [module(leafManifest())],
    });
    expect(spec.publicMaterials.leaf_side_a).toBe('dab');
    expect(spec.publicMaterials.leaf_side_b).toBe('bialy');
  });

  it('dwukrotne złożenie tego samego wejścia daje identyczny spec (determinizm)', () => {
    const a = buildRenderSpec({ ...baseInput, modules: [module(leafManifest())] });
    const b = buildRenderSpec({ ...baseInput, modules: [module(leafManifest())] });
    expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
  });
});
