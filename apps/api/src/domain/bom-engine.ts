import type { BomItemDef, BomLine } from '@door/contracts';
import { evalCondition, type SelectionMap } from './rules-engine';

export interface BomContext {
  widthMm: number;
  heightMm: number;
  hingeCount: number;
  selections: SelectionMap;
}

/** Liczba zawiasów wynika z reguły serwerowej, nie z wyboru klienta. */
export function computeHingeCount(heightMm: number, leafCount = 1): number {
  const perLeaf = heightMm > 2200 ? 4 : 3;
  return perLeaf * leafCount;
}

function computeQty(def: BomItemDef, ctx: BomContext): number {
  const widthM = ctx.widthMm / 1000;
  const heightM = ctx.heightMm / 1000;
  let qty: number;
  switch (def.qty.kind) {
    case 'fixed':
      qty = def.qty.value;
      break;
    case 'hinge_count':
      qty = ctx.hingeCount * def.qty.factor;
      break;
    case 'leaf_area_m2':
      qty = widthM * heightM * def.qty.factor * (1 + def.qty.wastePercent / 100);
      break;
    case 'leaf_perimeter_m':
      qty = 2 * (widthM + heightM) * def.qty.factor * (1 + def.qty.wastePercent / 100);
      break;
    case 'width_m':
      qty = widthM * def.qty.factor;
      break;
    case 'height_m':
      qty = heightM * def.qty.factor;
      break;
  }
  if (def.roundUp) qty = Math.ceil(qty);
  return Math.round(qty * 1000) / 1000;
}

/**
 * BOM liczony wyłącznie na serwerze po poprawnej walidacji konfiguracji.
 * Wynik dostępny tylko dla ról produkcyjnych (guard w kontrolerze).
 */
export function computeBom(items: BomItemDef[], ctx: BomContext): BomLine[] {
  const lines: BomLine[] = [];
  for (const def of items) {
    if (def.when && !evalCondition(def.when, ctx.selections)) continue;
    const qty = computeQty(def, ctx);
    if (qty <= 0) continue;
    lines.push({
      componentName: def.componentName,
      sku: def.sku,
      variant: def.variant ?? null,
      unit: def.unit,
      qty,
      stage: def.stage,
      supplier: def.supplier ?? null,
      internalCost: def.internalCost ?? null,
      comment: def.comment ?? null,
    });
  }
  return lines;
}
