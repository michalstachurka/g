import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectGlb } from './glb-inspector';

const MODULES_DIR = join(__dirname, '../../../../assets/seed-modules');

describe('inspectGlb - mapowanie dowolnych nazw meshy', () => {
  it('parsuje moduł seedowy i buduje drzewo węzłów po ścieżkach indeksów', () => {
    const buffer = readFileSync(join(MODULES_DIR, 'porta-lite-pelne.leaf.glb'));
    const report = inspectGlb(buffer);
    expect(report.valid).toBe(true);
    expect(report.meshCount).toBeGreaterThan(0);
    expect(report.tree.length).toBeGreaterThan(0);
    // ścieżki są indeksami, nie nazwami producenta
    expect(report.tree[0].path).toBe('0');
    // sugerowane wymiary bazowe z bboxa (skrzydło ~0.87 x 2.03 m)
    expect(report.suggestedBaseHeightMm).toBeGreaterThan(1900);
  });

  it('odrzuca dane, które nie są GLB', () => {
    const report = inspectGlb(Buffer.from('to nie jest glb'));
    expect(report.valid).toBe(false);
    expect(report.problems.length).toBeGreaterThan(0);
  });

  it('raportuje liczbę trójkątów i materiałów', () => {
    const buffer = readFileSync(join(MODULES_DIR, 'porta-lite-szklane.leaf.glb'));
    const report = inspectGlb(buffer);
    expect(report.totalTriangles).toBeGreaterThan(0);
    expect(typeof report.materialCount).toBe('number');
  });
});
