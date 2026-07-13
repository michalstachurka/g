import { describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { convertObjToGlb } from './obj-converter';

/** Prostopadłościan 900x2100x40 (mm) jako dwa obiekty OBJ. */
function doorObj(unitsScale = 1, useGroups = true): string {
  const w = 900 * unitsScale;
  const h = 2100 * unitsScale;
  const d = 40 * unitsScale;
  const box = (x0: number, x1: number, tag: string) => `
${useGroups ? `o ${tag}` : `usemtl ${tag}`}
v ${x0} 0 0
v ${x1} 0 0
v ${x1} ${h} 0
v ${x0} ${h} 0
v ${x0} 0 ${d}
v ${x1} 0 ${d}
v ${x1} ${h} ${d}
v ${x0} ${h} ${d}
f -8 -7 -6 -5
f -4 -3 -2 -1
f -8 -5 -1 -4
f -7 -6 -2 -3
`;
  return box(0, w * 0.8, 'skrzydlo') + box(w * 0.8, w, 'oscieznica');
}

describe('convertObjToGlb', () => {
  it('konwertuje mm do metrów i dzieli po grupach o/g', async () => {
    const { glb, info } = await convertObjToGlb(doorObj(1, true));
    expect(info.scaleApplied).toBe(0.001);
    expect(info.nodeCount).toBe(2);
    expect(info.triangleCount).toBe(16);
    const doc = await new NodeIO().readBinary(new Uint8Array(glb));
    const nodes = doc.getRoot().getDefaultScene()!.listChildren();
    expect(nodes.map((n) => n.getName())).toEqual(['skrzydlo', 'oscieznica']);
    // bbox pierwszego węzła: 0..0.72 m szerokości, 2.1 m wysokości
    const pos = nodes[0].getMesh()!.listPrimitives()[0].getAttribute('POSITION')!;
    const max = pos.getMax([]);
    expect(max[1]).toBeCloseTo(2.1, 2);
  });

  it('plik bez o/g dzieli po usemtl', async () => {
    const { info } = await convertObjToGlb(doorObj(1, false));
    expect(info.nodeCount).toBe(2);
  });

  it('metry zostawia bez skalowania', async () => {
    const { info } = await convertObjToGlb(doorObj(0.001, true));
    expect(info.scaleApplied).toBe(1);
  });

  it('odrzuca plik bez geometrii', async () => {
    await expect(convertObjToGlb('# pusto\nv 1 2 3\n')).rejects.toThrow('geometrii');
  });
});
