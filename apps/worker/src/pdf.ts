import { chromium, type Browser } from 'playwright-core';
import * as QRCode from 'qrcode';

/**
 * Serwerowe generowanie PDF (Playwright + wersjonowany szablon z bazy).
 * Render produktu: zrzut kontrolowanej strony /render zbudowanej na tym samym
 * renderSpec co viewer. Dokument powstaje wyłącznie ze snapshotu - ponowna
 * generacja starej oferty nie sięga po nowy cennik.
 */

export interface DocumentPayload {
  id: string;
  kind: string;
  tenant: { slug: string; name: string; companyName: string };
  branding: { logoUrl: string | null; themeTokens: Record<string, unknown>; footerText: string | null; contact: Record<string, string | null> | null };
  template: { version: number; config: TemplateConfig } | null;
  configuration: {
    shareId: string;
    name: string | null;
    categoryKey: string;
    modelKey: string | null;
    selections: Record<string, unknown>;
    revision: number;
    createdAt: string;
    customerNote: string | null;
  };
  evaluate: {
    priceSummary?: { amount: number; currency: string; taxMode: string; lines?: { label: string; amount: number }[]; individualQuote?: boolean } | null;
    warnings?: { message: string }[];
    renderSpec?: { widthMm: number; heightMm: number; dinDiagram: { hingeSide: string; opensInward: boolean } } | null;
  };
  priceBreakdown: { lines: { label: string; amount: number; public: boolean; kind: string }[]; amount: number } | null;
  bomLines: { componentName: string; sku: string; qty: number; unit: string; stage: string; supplier: string | null; internalCost: number | null; comment: string | null }[] | null;
  versions: Record<string, string>;
  checksum: string;
  shareUrl: string;
  renderUrl: string;
}

interface TemplateConfig {
  accentColor: string;
  showLogo: boolean;
  showPrice: boolean;
  showQr: boolean;
  showRender: boolean;
  showWarnings: boolean;
  footerText: string;
  introText: string;
  sectionsOrder: string[];
}

const DEFAULT_TEMPLATE: TemplateConfig = {
  accentColor: '#20242b',
  showLogo: true,
  showPrice: true,
  showQr: true,
  showRender: true,
  showWarnings: true,
  footerText: '',
  introText: '',
  sectionsOrder: ['summary', 'options', 'services', 'price'],
};

const KIND_TITLES: Record<string, string> = {
  customer_specification: 'Specyfikacja konfiguracji',
  sales_quote: 'Oferta handlowa',
  production_bom: 'BOM produkcyjny (dokument wewnętrzny)',
  measurement_sheet: 'Karta pomiarowa',
};

let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--disable-gpu'],
    });
  }
  return browserPromise;
}

async function captureRender(url: string): Promise<string | null> {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForFunction('window.__RENDER_READY === true', undefined, { timeout: 25_000 });
      await page.waitForTimeout(700);
      const shot = await page.screenshot({ type: 'png' });
      return `data:image/png;base64,${shot.toString('base64')}`;
    } finally {
      await page.close();
    }
  } catch (error) {
    console.warn('Render produktu niedostępny:', (error as Error).message);
    return null;
  }
}

const money = (amount: number, currency = 'PLN') =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(amount / 100);

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export async function generatePdf(payload: DocumentPayload): Promise<{ pdf: Uint8Array; templateVersion: number | null }> {
  const template = payload.template?.config ?? DEFAULT_TEMPLATE;
  const accent = template.accentColor || '#20242b';
  const isInternal = payload.kind === 'production_bom';
  const qrDataUrl = template.showQr ? await QRCode.toDataURL(payload.shareUrl, { width: 240, margin: 1 }) : null;
  const renderImage = template.showRender && !isInternal ? await captureRender(payload.renderUrl) : null;

  const selectionRows = Object.entries(payload.configuration.selections)
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, value]) => `<tr><td>${esc(key.replaceAll('_', ' '))}</td><td>${esc(value)}</td></tr>`)
    .join('');

  const priceSummary = payload.evaluate.priceSummary;
  const publicLines = priceSummary?.lines ?? [];
  const internalLines = payload.priceBreakdown?.lines ?? [];
  const warnings = payload.evaluate.warnings ?? [];
  const dims = payload.evaluate.renderSpec;

  const bomTable = payload.bomLines?.length
    ? `<h2>Lista materiałowa</h2><table class="grid">
        <tr><th>Komponent</th><th>SKU</th><th>Ilość</th><th>Jedn.</th><th>Etap</th><th>Dostawca</th><th>Koszt wewn.</th></tr>
        ${payload.bomLines
          .map(
            (line) =>
              `<tr><td>${esc(line.componentName)}</td><td>${esc(line.sku)}</td><td>${line.qty}</td><td>${esc(line.unit)}</td><td>${esc(line.stage)}</td><td>${esc(line.supplier ?? '-')}</td><td>${line.internalCost != null ? money(line.internalCost) : '-'}</td></tr>`,
          )
          .join('')}
      </table>`
    : '';

  const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font: 11px/1.5 'DejaVu Sans', sans-serif; color: #24262a; margin: 0; padding: 28px 32px; }
    header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${accent}; padding-bottom: 12px; }
    h1 { font-size: 17px; margin: 0 0 2px; color: ${accent}; }
    h2 { font-size: 12px; margin: 18px 0 6px; color: ${accent}; text-transform: uppercase; letter-spacing: 0.04em; }
    .muted { color: #6d7076; }
    table.grid { width: 100%; border-collapse: collapse; }
    table.grid td, table.grid th { border: 1px solid #e2dfd8; padding: 4px 7px; text-align: left; vertical-align: top; }
    table.grid th { background: #f4f2ee; font-weight: 600; }
    .row { display: flex; gap: 18px; }
    .col { flex: 1; }
    .price-final { font-size: 15px; font-weight: 700; color: ${accent}; }
    .warn { background: #fdf4e3; border: 1px solid #ecd9ae; padding: 6px 9px; border-radius: 4px; margin: 3px 0; }
    footer { position: fixed; bottom: 10px; left: 32px; right: 32px; border-top: 1px solid #e2dfd8; padding-top: 6px; font-size: 9px; color: #8a8d92; display: flex; justify-content: space-between; }
    .render { max-width: 300px; max-height: 330px; border: 1px solid #e2dfd8; border-radius: 4px; }
    .qr { width: 108px; height: 108px; }
    .internal-banner { background: #b3261e; color: #fff; padding: 5px 10px; border-radius: 4px; font-weight: 600; display: inline-block; margin-top: 6px; }
  </style></head><body>
    <header>
      <div>
        <h1>${esc(KIND_TITLES[payload.kind] ?? payload.kind)}</h1>
        <div class="muted">${esc(payload.tenant.companyName)}</div>
        <div class="muted">Konfiguracja nr <b>${esc(payload.configuration.shareId)}</b> (wersja ${payload.configuration.revision}) | ${new Date(payload.configuration.createdAt).toLocaleDateString('pl-PL')}</div>
        ${isInternal ? '<div class="internal-banner">DOKUMENT WEWNĘTRZNY - NIE PRZEKAZYWAĆ KLIENTOWI</div>' : ''}
      </div>
      <div style="text-align:right">
        ${template.showLogo ? `<div style="font-size:15px;font-weight:700;color:${accent}">${esc(payload.tenant.name)}</div>` : ''}
        ${qrDataUrl ? `<img class="qr" src="${qrDataUrl}" alt="QR">` : ''}
        ${qrDataUrl ? '<div class="muted" style="font-size:8.5px">Zeskanuj, aby otworzyć konfigurację<br>i uruchomić AR na telefonie</div>' : ''}
      </div>
    </header>

    ${template.introText && !isInternal ? `<p>${esc(template.introText)}</p>` : ''}

    <div class="row" style="margin-top:14px">
      ${renderImage ? `<div><img class="render" src="${renderImage}" alt="Podgląd"></div>` : ''}
      <div class="col">
        <h2>Podsumowanie</h2>
        <table class="grid">
          <tr><td>Rodzaj / model</td><td>${esc(payload.configuration.categoryKey)} / ${esc(payload.configuration.modelKey ?? '-')}</td></tr>
          ${dims ? `<tr><td>Wymiar (szer. x wys.)</td><td><b>${dims.widthMm} x ${dims.heightMm} mm</b></td></tr>` : ''}
          ${dims ? `<tr><td>Kierunek otwierania</td><td>${dims.dinDiagram.hingeSide === 'left' ? 'lewe (DIN L)' : 'prawe (DIN P)'}, ${dims.dinDiagram.opensInward ? 'do wnętrza' : 'na zewnątrz'}</td></tr>` : ''}
          ${payload.configuration.customerNote ? `<tr><td>Uwagi klienta</td><td>${esc(payload.configuration.customerNote)}</td></tr>` : ''}
        </table>
      </div>
    </div>

    <h2>Wybrane opcje</h2>
    <table class="grid">${selectionRows}</table>

    ${
      template.showWarnings && warnings.length > 0
        ? `<h2>Uwagi</h2>${warnings.map((w) => `<div class="warn">${esc(w.message)}</div>`).join('')}`
        : ''
    }

    ${
      template.showPrice && priceSummary && !isInternal
        ? `<h2>Cena</h2><table class="grid">
            ${publicLines.map((line) => `<tr><td>${esc(line.label)}</td><td style="text-align:right">${money(line.amount, priceSummary.currency)}</td></tr>`).join('')}
            <tr><td><b>Razem (${priceSummary.taxMode === 'gross' ? 'brutto' : 'netto'})</b></td>
            <td style="text-align:right" class="price-final">${priceSummary.individualQuote ? 'Wycena indywidualna' : money(priceSummary.amount, priceSummary.currency)}</td></tr>
          </table>
          <p class="muted" style="font-size:9px">Wycena ważna 30 dni od daty wystawienia. Ostateczny wymiar potwierdza pomiar montażowy.</p>`
        : ''
    }

    ${
      isInternal && internalLines.length > 0
        ? `<h2>Pełny rozkład ceny (wewnętrzny)</h2><table class="grid">
            ${internalLines.map((line) => `<tr><td>${esc(line.label)} <span class="muted">(${esc(line.kind)}${line.public ? '' : ', niepubliczna'})</span></td><td style="text-align:right">${money(line.amount)}</td></tr>`).join('')}
          </table>`
        : ''
    }

    ${isInternal ? bomTable : ''}

    ${
      payload.kind === 'measurement_sheet'
        ? `<h2>Pomiar (wypełnia monter)</h2><table class="grid">
            <tr><th></th><th>Lewa / góra</th><th>Środek</th><th>Prawa / dół</th></tr>
            <tr><td>Szerokość otworu [mm]</td><td></td><td></td><td></td></tr>
            <tr><td>Wysokość otworu [mm]</td><td></td><td></td><td></td></tr>
            <tr><td>Przekątne [mm]</td><td></td><td></td><td></td></tr>
            <tr><td>Grubość ściany [mm]</td><td></td><td></td><td></td></tr>
            <tr><td>Poziom posadzki / uwagi</td><td colspan="3"></td></tr>
          </table>`
        : ''
    }

    <footer>
      <span>${esc(template.footerText || payload.branding.footerText || payload.tenant.companyName)}</span>
      <span>szablon v${payload.template?.version ?? 0} | ${esc(payload.versions.ruleSet ?? '')} ${esc(payload.versions.priceList ?? '')} | checksum ${esc(payload.checksum.slice(0, 18))}</span>
    </footer>
  </body></html>`;

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '16mm', left: '0', right: '0' } });
    return { pdf: new Uint8Array(pdf), templateVersion: payload.template?.version ?? null };
  } finally {
    await page.close();
  }
}
