import type { PriceListSettings, PriceRuleDef, PriceSummary, SelectionValue } from '@door/contracts';
import { evalCondition, type SelectionMap } from './rules-engine';

export interface PricingContext {
  modelKey: string | null;
  widthMm: number;
  heightMm: number;
  selections: SelectionMap;
}

export interface InternalPriceLine {
  label: string;
  amount: number;
  kind: string;
  public: boolean;
}

export interface PricingResult {
  amount: number;
  currency: string;
  taxMode: 'gross' | 'net';
  taxRatePercent: number;
  lines: InternalPriceLine[];
  individualQuote: boolean;
}

function selectionMatches(selections: SelectionMap, fieldKey: string, optionValue?: string | null): boolean {
  const value: SelectionValue = selections[fieldKey] ?? null;
  if (optionValue == null) {
    return value === true || value === 'true' || (typeof value === 'string' && value !== '' && value !== 'false');
  }
  if (Array.isArray(value)) return value.includes(optionValue);
  if (typeof value === 'boolean') return String(value) === optionValue;
  return value === optionValue;
}

function matrixLookup(
  matrix: { widthUpToMm: number[]; heightUpToMm: number[]; amounts: number[][] },
  widthMm: number,
  heightMm: number,
): number | null {
  const wIdx = matrix.widthUpToMm.findIndex((w) => widthMm <= w);
  const hIdx = matrix.heightUpToMm.findIndex((h) => heightMm <= h);
  if (wIdx < 0 || hIdx < 0) return null;
  return matrix.amounts[hIdx]?.[wIdx] ?? null;
}

function round(amount: number, mode: PriceListSettings['rounding']): number {
  if (mode === 'to_zloty') return Math.round(amount / 100) * 100;
  return Math.round(amount);
}

/**
 * Silnik cenowy - wykonywany WYŁĄCZNIE na backendzie. Zwraca pełny wewnętrzny
 * rozkład (lines) do snapshotu; do klienta trafia tylko publiczne podsumowanie
 * przez toPublicSummary().
 */
export function computePrice(
  rules: PriceRuleDef[],
  settings: PriceListSettings,
  ctx: PricingContext,
): PricingResult {
  const lines: InternalPriceLine[] = [];
  let individualQuote = false;
  let base = 0;

  for (const rule of rules) {
    switch (rule.kind) {
      case 'base':
        if (ctx.modelKey && rule.modelKey === ctx.modelKey) {
          base = rule.amount;
          lines.push({ label: 'Cena bazowa', amount: rule.amount, kind: 'base', public: true });
        }
        break;
      case 'option_surcharge':
        if (selectionMatches(ctx.selections, rule.fieldKey, rule.optionValue)) {
          lines.push({ label: rule.label, amount: rule.amount, kind: 'surcharge', public: rule.publicLine });
        }
        break;
      case 'option_surcharge_percent':
        if (selectionMatches(ctx.selections, rule.fieldKey, rule.optionValue)) {
          lines.push({
            label: rule.label,
            amount: Math.round((base * rule.percent) / 100),
            kind: 'surcharge_percent',
            public: rule.publicLine,
          });
        }
        break;
      case 'dimension_matrix': {
        if (rule.modelKey && rule.modelKey !== ctx.modelKey) break;
        const amount = matrixLookup(rule.matrix, ctx.widthMm, ctx.heightMm);
        if (amount != null && amount !== 0) {
          lines.push({ label: rule.label, amount, kind: 'dimension_matrix', public: true });
        }
        break;
      }
      case 'oversize_percent': {
        const overW = rule.aboveWidthMm != null && ctx.widthMm > rule.aboveWidthMm;
        const overH = rule.aboveHeightMm != null && ctx.heightMm > rule.aboveHeightMm;
        if (overW || overH) {
          lines.push({
            label: rule.label,
            amount: Math.round((base * rule.percent) / 100),
            kind: 'oversize',
            public: true,
          });
        }
        break;
      }
      case 'service':
        if (selectionMatches(ctx.selections, rule.fieldKey, rule.optionValue ?? undefined)) {
          lines.push({ label: rule.label, amount: rule.amount, kind: 'service', public: true });
        }
        break;
      case 'discount_percent': {
        const applies = rule.when ? evalCondition(rule.when, ctx.selections) : true;
        if (applies) {
          const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
          lines.push({
            label: rule.label,
            amount: -Math.round((subtotal * rule.percent) / 100),
            kind: 'discount',
            public: rule.publicLine,
          });
        }
        break;
      }
      case 'individual_quote':
        if (evalCondition(rule.when, ctx.selections)) individualQuote = true;
        break;
      case 'min_price':
        break; // po pętli
    }
  }

  let amount = lines.reduce((sum, l) => sum + l.amount, 0);
  const minRule = rules.find((r) => r.kind === 'min_price');
  if (minRule && minRule.kind === 'min_price' && amount < minRule.amount) {
    lines.push({ label: 'Cena minimalna', amount: minRule.amount - amount, kind: 'min_price', public: false });
    amount = minRule.amount;
  }
  amount = round(amount, settings.rounding);

  return {
    amount,
    currency: settings.currency,
    taxMode: settings.taxMode,
    taxRatePercent: settings.taxRatePercent,
    lines,
    individualQuote,
  };
}

/** Publiczna projekcja wyniku - bez pozycji wewnętrznych. */
export function toPublicSummary(result: PricingResult, showLines: boolean): PriceSummary {
  return {
    amount: result.individualQuote ? 0 : result.amount,
    currency: result.currency,
    taxMode: result.taxMode,
    taxRatePercent: result.taxRatePercent,
    individualQuote: result.individualQuote,
    ...(showLines && !result.individualQuote
      ? { lines: result.lines.filter((l) => l.public).map((l) => ({ label: l.label, amount: l.amount })) }
      : {}),
  };
}
