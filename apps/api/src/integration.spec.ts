/**
 * Testy integracyjne uruchamiane przeciw działającemu API (localhost:4000)
 * z zaseedowaną bazą demo. Pomijane automatycznie, gdy API nie odpowiada,
 * aby nie blokować testów jednostkowych w środowisku bez usług.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { findForbiddenRenderSpecKeys } from '@door/contracts';

const API = process.env.API_URL ?? 'http://localhost:4000';
let apiUp = false;

async function evaluate(tenant: string, body: unknown) {
  const response = await fetch(`${API}/public/${tenant}/evaluate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
}

beforeAll(async () => {
  try {
    const response = await fetch(`${API}/public/demo/categories`);
    apiUp = response.ok;
  } catch {
    apiUp = false;
  }
  if (!apiUp) console.warn('API niedostępne - testy integracyjne pominięte.');
});

describe('integracja: konfigurator -> walidacja -> cena -> renderSpec', () => {
  it('sześć kategorii startowych jest dostępnych', async () => {
    if (!apiUp) return;
    const response = await fetch(`${API}/public/demo/categories`);
    const categories = (await response.json()) as { systemKey?: string; key: string }[];
    expect(categories.length).toBeGreaterThanOrEqual(6);
  });

  it('evaluate zwraca cenę, renderSpec i wersje z jednego przeliczenia', async () => {
    if (!apiUp) return;
    const { json } = await evaluate('demo', {
      categoryKey: 'pelne',
      modelKey: 'porta-lite-pelne',
      selections: { width_mm: 900, height_mm: 2100, din: 'left' },
      revision: 1,
    });
    expect(json.valid).toBe(true);
    expect(json.priceSummary.amount).toBeGreaterThan(0);
    expect(json.renderSpec).not.toBeNull();
    expect(json.versions.ruleSet).toMatch(/rules/);
    expect(json.versions.priceList).toMatch(/prices/);
    expect(json.checksum).toBeTruthy();
  });

  it('renderSpec publiczny nie zawiera pól zabronionych', async () => {
    if (!apiUp) return;
    const { json } = await evaluate('demo', {
      categoryKey: 'pelne',
      modelKey: 'porta-lite-pelne',
      selections: { width_mm: 900, height_mm: 2100 },
      revision: 1,
    });
    expect(findForbiddenRenderSpecKeys(json.renderSpec)).toEqual([]);
  });

  it('cała odpowiedź evaluate nie zawiera kosztu wewnętrznego ani BOM', async () => {
    if (!apiUp) return;
    const { json } = await evaluate('demo', {
      categoryKey: 'pelne',
      modelKey: 'porta-lite-pelne',
      selections: { lock_type: 'wc' },
      revision: 1,
    });
    const serialized = JSON.stringify(json);
    expect(serialized).not.toMatch(/internalCost/);
    expect(serialized).not.toMatch(/HDF-3|RAM-S/); // SKU z receptury BOM
  });

  it('zmiana DIN zmienia stronę zawiasów w renderSpec i diagramie', async () => {
    if (!apiUp) return;
    const left = await evaluate('demo', { categoryKey: 'pelne', modelKey: 'porta-lite-pelne', selections: { din: 'left' }, revision: 1 });
    const right = await evaluate('demo', { categoryKey: 'pelne', modelKey: 'porta-lite-pelne', selections: { din: 'right' }, revision: 1 });
    expect(left.json.renderSpec.openingDirection).toBe('left');
    expect(right.json.renderSpec.openingDirection).toBe('right');
    expect(left.json.renderSpec.dinDiagram.hingeSide).not.toBe(right.json.renderSpec.dinDiagram.hingeSide);
    // odbicie modułu różni się między DIN
    const leftMirror = left.json.renderSpec.modules[0].mirrored;
    const rightMirror = right.json.renderSpec.modules[0].mirrored;
    expect(leftMirror).not.toBe(rightMirror);
  });

  it('reguła łazienki wymusza blokadę WC (automatyczna korekta)', async () => {
    if (!apiUp) return;
    const { json } = await evaluate('demo', {
      categoryKey: 'pelne',
      modelKey: 'porta-lite-pelne',
      selections: { room: 'lazienka', lock_type: 'brak' },
      revision: 1,
    });
    const adjustment = json.automaticAdjustments.find((a: { fieldKey: string }) => a.fieldKey === 'lock_type');
    expect(adjustment?.to).toBe('wc');
  });
});

describe('integracja: izolacja tenantów', () => {
  it('kategorie tenanta demo różnią się od tenant-b-test', async () => {
    if (!apiUp) return;
    const demo = await (await fetch(`${API}/public/demo/categories`)).json();
    const other = await (await fetch(`${API}/public/tenant-b-test/categories`)).json();
    expect(demo.length).toBeGreaterThanOrEqual(6);
    expect(other.length).toBeLessThan(demo.length);
  });

  it('konfiguracja zapisana w demo nie jest dostępna pod innym tenantem', async () => {
    if (!apiUp) return;
    const save = await fetch(`${API}/public/demo/configurations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: { categoryKey: 'pelne', modelKey: 'porta-lite-pelne', selections: { din: 'left' }, revision: 1 } }),
    });
    const { shareId } = (await save.json()) as { shareId: string };
    const crossTenant = await fetch(`${API}/public/tenant-b-test/configurations/${shareId}`);
    expect(crossTenant.status).toBe(404);
  });
});

describe('integracja: brak GLB daje kontrolowany status, nie atrapę', () => {
  it('kategoria bez opublikowanego bundla ma visualizationReady=false', async () => {
    if (!apiUp) return;
    const categories = (await (await fetch(`${API}/public/demo/categories`)).json()) as { key: string; visualizationReady: boolean; missingAssetNotice: string | null }[];
    const sliding = categories.find((c) => c.key === 'przesuwne');
    expect(sliding?.visualizationReady).toBe(false);
    expect(sliding?.missingAssetNotice).toBeTruthy();
  });
});
