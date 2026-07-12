import { describe, expect, it } from 'vitest';
import type { RuleDef } from '@door/contracts';
import { applyRules, evalCondition } from './rules-engine';

describe('evalCondition', () => {
  it('obsługuje AND/OR/NOT', () => {
    const ctx = { a: 'x', n: 5 };
    expect(evalCondition({ all: [{ field: 'a', op: 'eq', value: 'x' }, { field: 'n', op: 'gt', value: 3 }] }, ctx)).toBe(true);
    expect(evalCondition({ any: [{ field: 'a', op: 'eq', value: 'z' }, { field: 'n', op: 'gt', value: 3 }] }, ctx)).toBe(true);
    expect(evalCondition({ not: { field: 'a', op: 'eq', value: 'x' } }, ctx)).toBe(false);
  });

  it('obsługuje between, in, truthy', () => {
    expect(evalCondition({ field: 'n', op: 'between', value: [1, 10] }, { n: 5 })).toBe(true);
    expect(evalCondition({ field: 'n', op: 'between', value: [1, 4] }, { n: 5 })).toBe(false);
    expect(evalCondition({ field: 'c', op: 'in', value: ['a', 'b'] }, { c: 'b' })).toBe(true);
    expect(evalCondition({ field: 't', op: 'truthy' }, { t: true })).toBe(true);
  });
});

describe('applyRules', () => {
  const scope = { categoryKey: 'pelne', modelKey: 'm1' };

  it('automatyczna korekta ustawia wartość (set_value)', () => {
    const rules: RuleDef[] = [
      {
        key: 'wc',
        name: 'WC dla łazienki',
        kind: 'compatibility',
        priority: 10,
        when: { all: [{ field: 'room', op: 'eq', value: 'lazienka' }, { field: 'lock', op: 'eq', value: 'brak' }] },
        effects: [{ type: 'set_value', fieldKey: 'lock', value: 'wc' }],
        messagePublic: 'Ustawiono WC.',
      },
    ];
    const result = applyRules(rules, { room: 'lazienka', lock: 'brak' }, scope);
    expect(result.selections.lock).toBe('wc');
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].to).toBe('wc');
  });

  it('wybór wykluczonej opcji daje błąd blokujący', () => {
    const rules: RuleDef[] = [
      {
        key: 'no-grid',
        name: 'Brak kratki dla szkła',
        kind: 'compatibility',
        priority: 10,
        when: { field: 'cat', op: 'eq', value: 'glass' },
        effects: [{ type: 'exclude_option', fieldKey: 'vent', optionValues: ['kratka'] }],
        messagePublic: 'Kratka niedostępna dla szkła.',
      },
    ];
    const excluded = applyRules(rules, { cat: 'glass', vent: 'kratka' }, scope);
    expect(excluded.errors).toHaveLength(1);
    const ok = applyRules(rules, { cat: 'glass', vent: 'podciecie' }, scope);
    expect(ok.errors).toHaveLength(0);
    expect(ok.excludedOptions.get('vent')?.has('kratka')).toBe(true);
  });

  it('reguła spoza zakresu kategorii nie działa', () => {
    const rules: RuleDef[] = [
      {
        key: 'only-glass',
        name: 'Tylko szkło',
        kind: 'validation',
        priority: 10,
        categoryKey: 'szklane',
        when: { field: 'x', op: 'truthy' },
        effects: [{ type: 'error', fieldKey: 'x' }],
        messagePublic: 'Błąd.',
      },
    ];
    expect(applyRules(rules, { x: true }, { categoryKey: 'pelne', modelKey: null }).errors).toHaveLength(0);
    expect(applyRules(rules, { x: true }, { categoryKey: 'szklane', modelKey: null }).errors).toHaveLength(1);
  });

  it('nie zapętla się przy sprzecznych set_value (limit iteracji)', () => {
    const rules: RuleDef[] = [
      { key: 'a', name: 'a', kind: 'compatibility', priority: 1, when: { field: 'v', op: 'eq', value: '1' }, effects: [{ type: 'set_value', fieldKey: 'v', value: '2' }], messagePublic: '' },
      { key: 'b', name: 'b', kind: 'compatibility', priority: 2, when: { field: 'v', op: 'eq', value: '2' }, effects: [{ type: 'set_value', fieldKey: 'v', value: '1' }], messagePublic: '' },
    ];
    expect(() => applyRules(rules, { v: '1' }, scope)).not.toThrow();
  });
});
