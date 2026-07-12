import { describe, expect, it } from 'vitest';
import type { BomItemDef } from '@door/contracts';
import { computeBom, computeHingeCount } from './bom-engine';

describe('computeHingeCount', () => {
  it('3 zawiasy do 2200 mm, 4 powyżej', () => {
    expect(computeHingeCount(2100)).toBe(3);
    expect(computeHingeCount(2300)).toBe(4);
    expect(computeHingeCount(2100, 2)).toBe(6);
  });
});

describe('computeBom', () => {
  const ctx = { widthMm: 900, heightMm: 2100, hingeCount: 3, selections: { lock: 'wc' } };

  it('liczy powierzchnię z odpadem', () => {
    const items: BomItemDef[] = [
      { componentName: 'Okleina', sku: 'OK', unit: 'm2', qty: { kind: 'leaf_area_m2', factor: 2, wastePercent: 10 }, stage: 'oklejanie', roundUp: false },
    ];
    const lines = computeBom(items, ctx);
    // 0.9*2.1*2*1.1 = 4.158
    expect(lines[0].qty).toBeCloseTo(4.158, 2);
  });

  it('liczba zawiasów z reguły serwerowej', () => {
    const items: BomItemDef[] = [
      { componentName: 'Zawias', sku: 'Z', unit: 'szt', qty: { kind: 'hinge_count', factor: 1 }, roundUp: true, stage: 'okuwanie' },
    ];
    expect(computeBom(items, ctx)[0].qty).toBe(3);
  });

  it('pozycja warunkowa (when) pomijana gdy warunek fałszywy', () => {
    const items: BomItemDef[] = [
      { componentName: 'Zamek magnetyczny', sku: 'ZM', unit: 'szt', qty: { kind: 'fixed', value: 1 }, stage: 'okuwanie', when: { field: 'lock', op: 'eq', value: 'magnetyczny' } },
      { componentName: 'Zamek WC', sku: 'ZWC', unit: 'szt', qty: { kind: 'fixed', value: 1 }, stage: 'okuwanie', when: { field: 'lock', op: 'eq', value: 'wc' } },
    ];
    const lines = computeBom(items, ctx);
    expect(lines).toHaveLength(1);
    expect(lines[0].sku).toBe('ZWC');
  });

  it('koszt wewnętrzny jest zachowany w linii BOM (dostęp tylko dla ról produkcyjnych na warstwie API)', () => {
    const items: BomItemDef[] = [
      { componentName: 'Płyta', sku: 'P', unit: 'm2', qty: { kind: 'fixed', value: 1 }, stage: 'ciecie', internalCost: 3200 },
    ];
    expect(computeBom(items, ctx)[0].internalCost).toBe(3200);
  });
});
