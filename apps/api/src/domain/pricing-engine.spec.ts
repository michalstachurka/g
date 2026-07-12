import { describe, expect, it } from 'vitest';
import type { PriceListSettings, PriceRuleDef } from '@door/contracts';
import { computePrice, toPublicSummary } from './pricing-engine';

const settings: PriceListSettings = {
  currency: 'PLN',
  taxRatePercent: 23,
  taxMode: 'gross',
  rounding: 'to_grosz',
  currencyRate: 1,
};

describe('computePrice', () => {
  it('sumuje cenę bazową, dopłaty i usługi', () => {
    const rules: PriceRuleDef[] = [
      { kind: 'base', modelKey: 'm1', amount: 100000 },
      { kind: 'option_surcharge', fieldKey: 'lock', optionValue: 'wc', amount: 5000, label: 'WC', publicLine: true },
      { kind: 'service', fieldKey: 'measure', amount: 15000, label: 'Pomiar' },
    ];
    const result = computePrice(rules, settings, { modelKey: 'm1', widthMm: 900, heightMm: 2100, selections: { lock: 'wc', measure: true } });
    expect(result.amount).toBe(120000);
    expect(result.lines).toHaveLength(3);
  });

  it('macierz wymiarowa wybiera właściwy przedział', () => {
    const rules: PriceRuleDef[] = [
      { kind: 'base', modelKey: 'm1', amount: 100000 },
      { kind: 'dimension_matrix', matrix: { widthUpToMm: [900, 1100], heightUpToMm: [2100, 2400], amounts: [[0, 6000], [8000, 15000]] }, label: 'Wymiar' },
    ];
    // width 1000 (>900 => idx1), height 2100 (<=2100 => idx0) => amounts[0][1] = 6000
    const r = computePrice(rules, settings, { modelKey: 'm1', widthMm: 1000, heightMm: 2100, selections: {} });
    expect(r.amount).toBe(106000);
    // height 2300 => idx1, width 1000 => idx1 => amounts[1][1] = 15000
    const r2 = computePrice(rules, settings, { modelKey: 'm1', widthMm: 1000, heightMm: 2300, selections: {} });
    expect(r2.amount).toBe(115000);
  });

  it('cena minimalna podnosi wynik', () => {
    const rules: PriceRuleDef[] = [
      { kind: 'base', modelKey: 'm1', amount: 50000 },
      { kind: 'min_price', amount: 99900 },
    ];
    expect(computePrice(rules, settings, { modelKey: 'm1', widthMm: 900, heightMm: 2100, selections: {} }).amount).toBe(99900);
  });

  it('rabat techniczny (publicLine=false) nie trafia do publicznego podsumowania', () => {
    const rules: PriceRuleDef[] = [
      { kind: 'base', modelKey: 'm1', amount: 100000 },
      { kind: 'discount_percent', percent: 10, label: 'Rabat techniczny', publicLine: false },
    ];
    const result = computePrice(rules, settings, { modelKey: 'm1', widthMm: 900, heightMm: 2100, selections: {} });
    expect(result.amount).toBe(90000);
    const publicSummary = toPublicSummary(result, true);
    expect(publicSummary.lines?.find((l) => l.label.includes('Rabat'))).toBeUndefined();
    // Publiczna kwota końcowa jest poprawna, ale bez ujawniania rabatu jako pozycji.
    expect(publicSummary.amount).toBe(90000);
  });

  it('wycena indywidualna zeruje kwotę publiczną', () => {
    const rules: PriceRuleDef[] = [
      { kind: 'base', modelKey: 'm1', amount: 100000 },
      { kind: 'individual_quote', when: { field: 'special', op: 'truthy' }, label: 'Indywidualna' },
    ];
    const result = computePrice(rules, settings, { modelKey: 'm1', widthMm: 900, heightMm: 2100, selections: { special: true } });
    const summary = toPublicSummary(result, true);
    expect(summary.individualQuote).toBe(true);
    expect(summary.amount).toBe(0);
  });

  it('publiczne podsumowanie nie zawiera pól wewnętrznych (kind, public)', () => {
    const rules: PriceRuleDef[] = [{ kind: 'base', modelKey: 'm1', amount: 100000 }];
    const summary = toPublicSummary(computePrice(rules, settings, { modelKey: 'm1', widthMm: 900, heightMm: 2100, selections: {} }), true);
    const line = summary.lines?.[0] as Record<string, unknown>;
    expect(Object.keys(line ?? {}).sort()).toEqual(['amount', 'label']);
  });
});
