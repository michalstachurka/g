import type { Adjustment, Condition, Issue, RuleDef, SelectionValue } from '@door/contracts';

export type SelectionMap = Record<string, SelectionValue>;

export function evalCondition(cond: Condition, ctx: SelectionMap): boolean {
  if ('all' in cond) return cond.all.every((c) => evalCondition(c, ctx));
  if ('any' in cond) return cond.any.some((c) => evalCondition(c, ctx));
  if ('not' in cond) return !evalCondition(cond.not, ctx);

  const value = ctx[cond.field] ?? null;
  const expected = cond.value;
  switch (cond.op) {
    case 'eq':
      return value === expected;
    case 'ne':
      return value !== expected;
    case 'in':
      return Array.isArray(expected) && (expected as (string | number)[]).includes(value as never);
    case 'nin':
      return Array.isArray(expected) && !(expected as (string | number)[]).includes(value as never);
    case 'lt':
      return typeof value === 'number' && typeof expected === 'number' && value < expected;
    case 'lte':
      return typeof value === 'number' && typeof expected === 'number' && value <= expected;
    case 'gt':
      return typeof value === 'number' && typeof expected === 'number' && value > expected;
    case 'gte':
      return typeof value === 'number' && typeof expected === 'number' && value >= expected;
    case 'between': {
      if (typeof value !== 'number' || !Array.isArray(expected)) return false;
      const [min, max] = expected as number[];
      return value >= (min ?? -Infinity) && value <= (max ?? Infinity);
    }
    case 'truthy':
      return value === true || value === 'true' || (typeof value === 'number' && value !== 0);
    case 'falsy':
      return value === false || value === 'false' || value === null || value === 0;
    default:
      return false;
  }
}

export interface DimensionLimit {
  dimension: 'width_mm' | 'height_mm';
  minMm: number | null;
  maxMm: number | null;
  message: string;
}

export interface RulesResult {
  errors: Issue[];
  warnings: Issue[];
  adjustments: Adjustment[];
  selections: SelectionMap;
  excludedOptions: Map<string, Map<string, string>>; // fieldKey -> (optionValue -> powód)
  hiddenFields: Set<string>;
  requiredFields: Set<string>;
  dimensionLimits: DimensionLimit[];
}

function ruleActive(rule: RuleDef, now: Date): boolean {
  if (rule.activeFrom && new Date(rule.activeFrom) > now) return false;
  if (rule.activeTo && new Date(rule.activeTo) < now) return false;
  return true;
}

/**
 * Deterministyczne wykonanie reguł: sortowanie po priorytecie, iteracyjne
 * stosowanie set_value do punktu stałego (limit iteracji chroni przed cyklami).
 */
export function applyRules(
  rules: RuleDef[],
  input: SelectionMap,
  scope: { categoryKey: string; modelKey: string | null },
  now = new Date(),
): RulesResult {
  const result: RulesResult = {
    errors: [],
    warnings: [],
    adjustments: [],
    selections: { ...input },
    excludedOptions: new Map(),
    hiddenFields: new Set(),
    requiredFields: new Set(),
    dimensionLimits: [],
  };

  const applicable = rules
    .filter((r) => ruleActive(r, now))
    .filter((r) => !r.categoryKey || r.categoryKey === scope.categoryKey)
    .filter((r) => !r.modelKey || r.modelKey === scope.modelKey)
    .sort((a, b) => a.priority - b.priority || a.key.localeCompare(b.key));

  // Faza 1: automatyczne korekty (set_value) do punktu stałego.
  for (let iteration = 0; iteration < 5; iteration++) {
    let changed = false;
    for (const rule of applicable) {
      if (!evalCondition(rule.when, result.selections)) continue;
      for (const effect of rule.effects) {
        if (effect.type !== 'set_value') continue;
        const current = result.selections[effect.fieldKey] ?? null;
        if (current !== effect.value) {
          result.adjustments.push({
            fieldKey: effect.fieldKey,
            from: current,
            to: effect.value,
            reason: rule.messagePublic,
          });
          result.selections[effect.fieldKey] = effect.value;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Faza 2: pozostałe efekty na ustabilizowanych wartościach.
  for (const rule of applicable) {
    if (!evalCondition(rule.when, result.selections)) continue;
    for (const effect of rule.effects) {
      switch (effect.type) {
        case 'error':
          result.errors.push({
            code: `rule:${rule.key}`,
            fieldKey: effect.fieldKey ?? null,
            message: rule.messagePublic,
          });
          break;
        case 'warn':
          result.warnings.push({
            code: `rule:${rule.key}`,
            fieldKey: effect.fieldKey ?? null,
            message: rule.messagePublic,
          });
          break;
        case 'require_field':
          result.requiredFields.add(effect.fieldKey);
          break;
        case 'hide_field':
          result.hiddenFields.add(effect.fieldKey);
          break;
        case 'exclude_option': {
          const perField = result.excludedOptions.get(effect.fieldKey) ?? new Map<string, string>();
          for (const v of effect.optionValues) perField.set(v, rule.messagePublic);
          result.excludedOptions.set(effect.fieldKey, perField);
          // Wybrana opcja wykluczona = błąd blokujący z czytelnym komunikatem.
          const selected = result.selections[effect.fieldKey];
          if (typeof selected === 'string' && effect.optionValues.includes(selected)) {
            result.errors.push({
              code: `rule:${rule.key}`,
              fieldKey: effect.fieldKey,
              message: rule.messagePublic,
            });
          }
          break;
        }
        case 'limit_dimension':
          result.dimensionLimits.push({
            dimension: effect.dimension,
            minMm: effect.minMm ?? null,
            maxMm: effect.maxMm ?? null,
            message: rule.messagePublic,
          });
          break;
        case 'set_value':
          break; // obsłużone w fazie 1
      }
    }
  }

  return result;
}
