import { describe, expect, it } from 'vitest';
import { assertRenderSpecPublic, findForbiddenRenderSpecKeys, renderSpecSchema } from './render-spec';
import { canonicalJson } from './canonical-json';

describe('renderSpec - guard pól zabronionych', () => {
  const validSpec = {
    renderSpecVersion: '1',
    configurationRevision: 1,
    widthMm: 900,
    heightMm: 2100,
    openingDirection: 'left',
    openingMode: 'swing',
    doorConstruction: 'rebated',
    modules: [],
    visibleParts: ['door_leaf'],
    publicMaterials: { leaf_side_a: 'dab' },
    animation: { type: 'hinge', pivotAnchor: 'hinge_axis', pivotMm: [0, 0, 0], maxAngleDeg: 95, direction: 1, animatedSlots: ['door_leaf'] },
    scene: { mounting: 'wall', showMeasurementOverlay: true, background: 'studio' },
    dinDiagram: { hingeSide: 'left', opensInward: true },
    checksum: 'x',
  };

  it('poprawny renderSpec przechodzi walidację schematu', () => {
    expect(() => renderSpecSchema.parse(validSpec)).not.toThrow();
  });

  it('nie zawiera żadnego pola zabronionego', () => {
    expect(findForbiddenRenderSpecKeys(validSpec)).toEqual([]);
    expect(() => assertRenderSpecPublic(validSpec)).not.toThrow();
  });

  it.each(['price', 'cost', 'margin', 'bom', 'sku', 'internalCost', 'supplierId', 'storagePath', 'discountPercent'])(
    'wykrywa pole zabronione: %s',
    (key) => {
      const bad = { ...validSpec, extra: { [key]: 123 } };
      expect(findForbiddenRenderSpecKeys(bad).length).toBeGreaterThan(0);
      expect(() => assertRenderSpecPublic(bad)).toThrow();
    },
  );

  it('wykrywa pole zabronione zagnieżdżone w tablicy modułów', () => {
    const bad = { ...validSpec, modules: [{ slot: 'door_leaf', priceListId: 'secret' }] };
    expect(findForbiddenRenderSpecKeys(bad)).toContain('modules[0].priceListId');
  });
});

describe('canonicalJson - deterministyczny checksum', () => {
  it('daje ten sam wynik niezależnie od kolejności kluczy', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });
  it('pomija undefined', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
