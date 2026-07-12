/**
 * Seed demonstracyjny: tenant "demo" wyglądający jak gotowy produkt.
 * Uruchomienie: pnpm seed (po `pnpm seed:assets` i migracjach).
 *
 * Konto administratora pochodzi WYŁĄCZNIE ze zmiennych środowiskowych
 * (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) - bez haseł w kodzie.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetManifestSchema } from '@door/contracts';
import { inspectGlb } from '../assets/glb-inspector';
import { publicId, randomToken, sha256Hex } from '../common/utils';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma.service';
import { EvaluateService } from '../domain/evaluate.service';

const prisma = new PrismaClient();
const storage = new StorageService();

const REPO_ROOT = join(__dirname, '../../../..');
const MODULES_DIR = join(REPO_ROOT, 'assets/seed-modules');
const SOURCES_DIR = join(REPO_ROOT, 'assets/source-models');

const PL = (pl: string) => ({ pl });

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const ownerEmail = process.env.SEED_PLATFORM_OWNER_EMAIL;
  const ownerPassword = process.env.SEED_PLATFORM_OWNER_PASSWORD;
  if (!adminEmail || !adminPassword || !ownerEmail || !ownerPassword) {
    throw new Error(
      'Ustaw SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_PLATFORM_OWNER_EMAIL i SEED_PLATFORM_OWNER_PASSWORD w środowisku.',
    );
  }

  console.log('Seed: czyszczenie tenanta demo (idempotentny restart)...');
  await prisma.tenant.deleteMany({ where: { slug: { in: ['demo', 'tenant-b-test'] } } });

  // ── Użytkownicy ────────────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail.toLowerCase() },
    create: {
      email: ownerEmail.toLowerCase(),
      name: 'Właściciel platformy',
      passwordHash: await argon2.hash(ownerPassword, { type: argon2.argon2id }),
      isPlatformOwner: true,
    },
    update: { isPlatformOwner: true },
  });

  const tenant = await prisma.tenant.create({
    data: {
      slug: 'demo',
      name: 'Studio Drzwi',
      companyName: 'Studio Drzwi Sp. z o.o. (DEMO)',
      featureFlags: { csg: false, showPriceLines: true },
    },
  });

  // Drugi tenant wyłącznie do testów izolacji.
  const tenantB = await prisma.tenant.create({
    data: { slug: 'tenant-b-test', name: 'Tenant B', companyName: 'Tenant B (testy izolacji)' },
  });
  await prisma.productCategory.create({
    data: { tenantId: tenantB.id, key: 'pelne', systemKey: 'solid', name: 'Drzwi pełne B', order: 1 },
  });

  const roleUsers: [string, string][] = [
    [adminEmail, 'tenant_admin'],
    ['sprzedaz@demo.local', 'sales'],
    ['produkcja@demo.local', 'production'],
  ];
  for (const [email, role] of roleUsers) {
    const user = await prisma.user.upsert({
      where: { email: email.toLowerCase() },
      create: {
        email: email.toLowerCase(),
        name: role === 'tenant_admin' ? 'Administrator Demo' : role === 'sales' ? 'Handlowiec Demo' : 'Produkcja Demo',
        passwordHash: await argon2.hash(adminPassword, { type: argon2.argon2id }),
      },
      update: {},
    });
    await prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      create: { userId: user.id, tenantId: tenant.id, role },
      update: { role },
    });
  }

  // ── Branding ───────────────────────────────────────────────────────────────
  await prisma.tenantTheme.create({
    data: {
      tenantId: tenant.id,
      status: 'published',
      version: 1,
      publishedAt: new Date(),
      publishedById: owner.id,
      themeTokens: {
        colorPrimary: '#20242b',
        colorAccent: '#a07d3b',
        colorBackground: '#f6f5f2',
        colorSurface: '#ffffff',
        colorText: '#22252a',
        colorTextMuted: '#6d7076',
        colorBorder: '#e4e1da',
        colorSuccess: '#1f7a4d',
        colorWarning: '#a86a00',
        colorError: '#b3261e',
        fontHeading: 'system-ui',
        fontBody: 'system-ui',
        radiusPx: 8,
        density: 'regular',
        shadowLevel: 'soft',
      },
      layout: {
        preset: 'panel_right',
        panelWidthPx: 440,
        viewerHeightMobileVh: 44,
        optionCardStyle: 'tiles',
        buttonStyle: 'solid',
        headerLayout: 'logo_left',
        showPrice: true,
        showPriceLines: true,
      },
      texts: {
        start_title: 'Wybierz rodzaj drzwi',
        start_subtitle: 'Skonfiguruj drzwi dopasowane do Twojego wnętrza i zobacz je w AR.',
        price_label: 'Cena brutto',
        cta_save: 'Zapisz projekt',
        cta_share: 'Udostępnij',
        cta_pdf: 'Pobierz specyfikację PDF',
        cta_ar: 'Zobacz na swojej ścianie (AR)',
        cta_lead: 'Wyślij zapytanie o wycenę',
        summary_title: 'Podsumowanie konfiguracji',
        field_width: 'Szerokość otworu',
      },
      footerText: 'Studio Drzwi - konfigurator demonstracyjny platformy white-label.',
      contact: { phone: '+48 600 000 000', email: 'kontakt@studio-drzwi.demo', address: 'ul. Przykładowa 12, Warszawa' },
      legalLinks: [{ label: 'Polityka prywatności', url: 'https://example.com/polityka' }],
      languages: ['pl'],
    },
  });

  // ── Materiały publiczne ────────────────────────────────────────────────────
  const materials: [string, string, string, string, number, number, number, number][] = [
    // key, name, kind, hex, roughness, metalness, transmission, clearcoat
    ['dab-naturalny', 'Dąb naturalny', 'wood', '#b08a5a', 0.62, 0, 0, 0.05],
    ['orzech-ciemny', 'Orzech ciemny', 'wood', '#6d4a2f', 0.6, 0, 0, 0.05],
    ['bialy-mat', 'Biały mat', 'color', '#f2f1ec', 0.85, 0, 0, 0],
    ['czarny-mat', 'Czarny mat', 'color', '#23252a', 0.9, 0, 0, 0],
    ['antracyt', 'Antracyt', 'color', '#3b4045', 0.8, 0, 0, 0],
    ['zielen-butelkowa', 'Zieleń butelkowa', 'color', '#2f4538', 0.75, 0, 0, 0],
    ['szklo-przezroczyste', 'Szkło przezroczyste', 'glass', '#eef2f4', 0.05, 0, 0.92, 0],
    ['szklo-satyna', 'Szkło satynowane', 'glass', '#eff0ee', 0.4, 0, 0.6, 0],
    ['szklo-dymione', 'Szkło dymione', 'glass', '#5d6166', 0.08, 0, 0.75, 0],
    ['metal-czarny', 'Metal czarny', 'metal', '#26272b', 0.35, 0.9, 0, 0],
    ['metal-inox', 'Stal szczotkowana', 'metal', '#b9bdc1', 0.4, 1, 0, 0],
    ['metal-mosiadz', 'Mosiądz', 'metal', '#b28b45', 0.3, 1, 0, 0],
    ['lustro-srebrne', 'Lustro srebrne', 'mirror', '#dfe4e8', 0.03, 1, 0, 0],
  ];
  for (const [key, name, kind, hex, roughness, metalness, transmission, clearcoat] of materials) {
    await prisma.publicMaterial.create({
      data: {
        tenantId: tenant.id,
        key,
        name,
        kind,
        baseColorHex: hex,
        roughness,
        metalness,
        transmission,
        clearcoat,
        opacity: 1,
        order: materials.findIndex((m) => m[0] === key),
      },
    });
  }

  // ── Kategorie (sześć, zawsze) ─────────────────────────────────────────────
  const categoryDefs: [string, string, string, string][] = [
    ['ukryte', 'hidden', 'Drzwi ukryte', 'Skrzydło zlicowane ze ścianą, bez widocznej ościeżnicy.'],
    ['pelne', 'solid', 'Drzwi pełne', 'Klasyczne i loftowe skrzydła pełne.'],
    ['szklane', 'glass', 'Drzwi szklane', 'Przeszklenia od subtelnych pasów po pełne tafle.'],
    ['przesuwne', 'sliding', 'Drzwi przesuwne', 'Systemy naścienne i chowane w ścianie.'],
    ['lustrzane', 'mirrored', 'Drzwi lustrzane', 'Tafle lustrzane po stronie A lub B.'],
    ['dwuskrzydlowe', 'double', 'Drzwi dwuskrzydłowe', 'Reprezentacyjne wejścia dwuskrzydłowe.'],
  ];
  const categories: Record<string, string> = {};
  for (let i = 0; i < categoryDefs.length; i++) {
    const [key, systemKey, name, description] = categoryDefs[i];
    const category = await prisma.productCategory.create({
      data: { tenantId: tenant.id, key, systemKey, name, description, order: i + 1 },
    });
    categories[key] = category.id;
  }

  // ── Assety: import modułów seedowych ──────────────────────────────────────
  const sources = JSON.parse(readFileSync(join(SOURCES_DIR, 'door-model-sources.json'), 'utf8')) as {
    catalogModel: string;
    sourceTitle: string;
    source: string;
    license: string;
    termsUrl: string;
    sourceUrl: string;
  }[];
  const sourceByModel: Record<string, (typeof sources)[number]> = {
    'porta-lite-pelne': sources.find((s) => s.catalogModel === 'basic-flat')!,
    'porta-lite-szklane': sources.find((s) => s.catalogModel === 'basic-glass')!,
    'porta-loft-pelne': sources.find((s) => s.catalogModel === 'basic-apartment-solid')!,
    'porta-duo-dwuskrzydlowe': sources.find((s) => s.catalogModel === 'basic-double')!,
    'porta-invisible-ukryte': sources.find((s) => s.catalogModel === 'basic-hidden')!,
    'porta-vista-naswietle': sources.find((s) => s.catalogModel === 'basic-frame')!,
  };

  const moduleFiles = readdirSync(MODULES_DIR).filter((f) => f.endsWith('.glb'));
  const assetVersionByKey: Record<string, { id: string; publicAssetId: string }> = {};
  for (const file of moduleFiles) {
    const buffer = readFileSync(join(MODULES_DIR, file));
    const manifest = assetManifestSchema.parse(
      JSON.parse(readFileSync(join(MODULES_DIR, `${file}.manifest.json`), 'utf8')),
    );
    const modelKey = manifest.assetKey.split('.')[0];
    const source = sourceByModel[modelKey];
    const report = inspectGlb(buffer);
    const asset = await prisma.asset.create({
      data: {
        tenantId: tenant.id,
        key: manifest.assetKey,
        name: `${modelKey} - moduł ${manifest.semanticRole}`,
        licenseInfo: source
          ? {
              source: source.source,
              sourceTitle: source.sourceTitle,
              license: source.license,
              termsUrl: source.termsUrl,
              sourceUrl: source.sourceUrl,
              note: 'Model seedowy podzielony na moduły (ADR-0004).',
            }
          : undefined,
      },
    });
    const token = publicId('pub');
    const storagePath = `private/assets/${tenant.id}/${asset.id}/v1.glb`;
    const publicStoragePath = `public/assets/${tenant.id}/${token}.glb`;
    await storage.put(storagePath, buffer);
    await storage.put(publicStoragePath, buffer);
    const version = await prisma.assetVersion.create({
      data: {
        assetId: asset.id,
        version: 1,
        status: 'published',
        fileName: file,
        byteSize: buffer.length,
        checksum: sha256Hex(buffer),
        storagePath,
        publicStoragePath,
        publicAssetId: token,
        report: report as unknown as object,
        manifest: manifest as unknown as object,
        publishedAt: new Date(),
        publishedById: owner.id,
      },
    });
    assetVersionByKey[manifest.assetKey] = { id: version.id, publicAssetId: token };
  }

  // Pakiet trim ze Sketchfab: zarejestrowany, ale ZABLOKOWANY (licencja niepotwierdzona).
  // Plik jest opcjonalny w repozytorium (duży, licencja niepotwierdzona) - pomijamy, gdy brak.
  const trimPath0 = join(SOURCES_DIR, 'interior_trim_assets low.glb');
  if (existsSync(trimPath0)) {
  const trimBuffer = readFileSync(trimPath0);
  const trimAsset = await prisma.asset.create({
    data: {
      tenantId: tenant.id,
      key: 'interior-trim-pack',
      name: 'Pakiet okuć i listew (źródło Sketchfab)',
      licenseInfo: {
        status: 'license_unconfirmed',
        note: 'Brak potwierdzonego autora i licencji - publikacja zablokowana do czasu potwierdzenia (LICENSE_AUDIT §3.2).',
      },
    },
  });
  const trimPath = `private/assets/${tenant.id}/${trimAsset.id}/v1.glb`;
  await storage.put(trimPath, trimBuffer);
  await prisma.assetVersion.create({
    data: {
      assetId: trimAsset.id,
      version: 1,
      status: 'draft',
      fileName: 'interior_trim_assets low.glb',
      byteSize: trimBuffer.length,
      checksum: sha256Hex(trimBuffer),
      storagePath: trimPath,
      report: inspectGlb(trimBuffer) as unknown as object,
    },
  });
  }

  // ── Bundles ────────────────────────────────────────────────────────────────
  const bundleDefs: [string, { slot: string; assetKey: string }[]][] = [
    ['bundle-porta-lite-pelne', [
      { slot: 'door_leaf', assetKey: 'porta-lite-pelne.leaf' },
      { slot: 'frame', assetKey: 'porta-lite-pelne.frame' },
    ]],
    ['bundle-porta-lite-szklane', [
      { slot: 'door_leaf', assetKey: 'porta-lite-szklane.leaf' },
      { slot: 'frame', assetKey: 'porta-lite-szklane.frame' },
    ]],
    ['bundle-porta-loft-pelne', [
      { slot: 'door_leaf', assetKey: 'porta-loft-pelne.leaf' },
      { slot: 'frame', assetKey: 'porta-loft-pelne.frame' },
    ]],
    ['bundle-porta-duo', [
      { slot: 'active_leaf', assetKey: 'porta-duo-dwuskrzydlowe.leaf-active' },
      { slot: 'passive_leaf', assetKey: 'porta-duo-dwuskrzydlowe.leaf-passive' },
      { slot: 'frame', assetKey: 'porta-duo-dwuskrzydlowe.frame' },
    ]],
    ['bundle-porta-invisible', [
      { slot: 'door_leaf', assetKey: 'porta-invisible-ukryte.leaf' },
      { slot: 'frame', assetKey: 'porta-invisible-ukryte.wall' },
    ]],
    ['bundle-porta-vista', [
      { slot: 'door_leaf', assetKey: 'porta-vista-naswietle.leaf' },
      { slot: 'frame', assetKey: 'porta-vista-naswietle.wall' },
    ]],
  ];
  const bundles: Record<string, string> = {};
  for (const [key, items] of bundleDefs) {
    const bundle = await prisma.assetBundle.create({
      data: {
        tenantId: tenant.id,
        key,
        name: key,
        status: 'published',
        publishedAt: new Date(),
        items: {
          create: items.map((item, order) => ({
            slot: item.slot,
            assetVersionId: assetVersionByKey[item.assetKey].id,
            required: true,
            order,
            offsetMm: [0, 0, 0],
          })),
        },
      },
    });
    bundles[key] = bundle.id;
  }

  // ── Rodziny i modele ───────────────────────────────────────────────────────
  const familyDefs: [string, string, string][] = [
    ['porta-lite', 'pelne', 'Porta Lite'],
    ['porta-lite-glass', 'szklane', 'Porta Lite Glass'],
    ['porta-loft', 'pelne', 'Porta Loft'],
    ['porta-duo', 'dwuskrzydlowe', 'Porta Duo'],
    ['porta-invisible', 'ukryte', 'Porta Invisible'],
    ['porta-vista', 'pelne', 'Porta Vista'],
  ];
  const families: Record<string, string> = {};
  for (let i = 0; i < familyDefs.length; i++) {
    const [key, categoryKey, name] = familyDefs[i];
    const family = await prisma.productFamily.create({
      data: { tenantId: tenant.id, categoryId: categories[categoryKey], key, name, order: i },
    });
    families[key] = family.id;
  }

  const modelDefs: {
    key: string; family: string; name: string; description: string; bundle: string;
    base: [number, number]; min: [number, number]; max: [number, number];
  }[] = [
    { key: 'porta-lite-pelne', family: 'porta-lite', name: 'Lite Pełne', description: 'Gładkie skrzydło pełne z ościeżnicą stałą.', bundle: 'bundle-porta-lite-pelne', base: [900, 2100], min: [700, 1900], max: [1000, 2300] },
    { key: 'porta-lite-szklane', family: 'porta-lite-glass', name: 'Lite Vetro', description: 'Skrzydło z dwoma pionowymi taflami szkła.', bundle: 'bundle-porta-lite-szklane', base: [900, 2100], min: [700, 1900], max: [1000, 2300] },
    { key: 'porta-loft-pelne', family: 'porta-loft', name: 'Loft Premium', description: 'Skrzydło z pochwytem i listwą ozdobną.', bundle: 'bundle-porta-loft-pelne', base: [900, 2100], min: [700, 1900], max: [1000, 2300] },
    { key: 'porta-duo-dwuskrzydlowe', family: 'porta-duo', name: 'Duo Classic', description: 'Drzwi dwuskrzydłowe ze skrzydłem aktywnym i biernym.', bundle: 'bundle-porta-duo', base: [1800, 2100], min: [1500, 1900], max: [2000, 2300] },
    { key: 'porta-invisible-ukryte', family: 'porta-invisible', name: 'Invisible 2100', description: 'Drzwi ukryte zlicowane ze ścianą, osobne wykończenie strony A i B.', bundle: 'bundle-porta-invisible', base: [1800, 2100], min: [1800, 2100], max: [1800, 2100] },
    { key: 'porta-vista-naswietle', family: 'porta-vista', name: 'Vista z naświetlem', description: 'Skrzydło z przeszkleniem górnym w zabudowie.', bundle: 'bundle-porta-vista', base: [1800, 2100], min: [1800, 2100], max: [1800, 2100] },
  ];
  const modelIds: Record<string, string> = {};
  for (let i = 0; i < modelDefs.length; i++) {
    const def = modelDefs[i];
    const model = await prisma.productModel.create({
      data: {
        tenantId: tenant.id,
        familyId: families[def.family],
        key: def.key,
        name: def.name,
        description: def.description,
        bundleId: bundles[def.bundle],
        baseWidthMm: def.base[0],
        baseHeightMm: def.base[1],
        minWidthMm: def.min[0],
        minHeightMm: def.min[1],
        maxWidthMm: def.max[0],
        maxHeightMm: def.max[1],
        order: i,
        status: 'published',
      },
    });
    modelIds[def.key] = model.id;
  }

  // ── Grupy opcji ────────────────────────────────────────────────────────────
  async function group(key: string, name: string, options: [string, string, string | null][]) {
    const created = await prisma.optionGroup.create({ data: { tenantId: tenant.id, key, name } });
    for (let i = 0; i < options.length; i++) {
      const [value, label, materialKey] = options[i];
      const material = materialKey
        ? await prisma.publicMaterial.findUnique({ where: { tenantId_key: { tenantId: tenant.id, key: materialKey } } })
        : null;
      await prisma.option.create({
        data: {
          tenantId: tenant.id,
          groupId: created.id,
          value,
          label: PL(label),
          materialKey,
          colorHex: material?.baseColorHex ?? null,
          order: i,
        },
      });
    }
    return created.id;
  }

  const groups = {
    decors: await group('decors', 'Dekory skrzydła', [
      ['dab-naturalny', 'Dąb naturalny', 'dab-naturalny'],
      ['orzech-ciemny', 'Orzech ciemny', 'orzech-ciemny'],
      ['bialy-mat', 'Biały mat', 'bialy-mat'],
      ['czarny-mat', 'Czarny mat', 'czarny-mat'],
      ['antracyt', 'Antracyt', 'antracyt'],
      ['zielen-butelkowa', 'Zieleń butelkowa', 'zielen-butelkowa'],
    ]),
    frameColors: await group('frame-colors', 'Kolory ościeżnicy', [
      ['bialy-mat', 'Biały mat', 'bialy-mat'],
      ['czarny-mat', 'Czarny mat', 'czarny-mat'],
      ['antracyt', 'Antracyt', 'antracyt'],
      ['dab-naturalny', 'Dąb naturalny', 'dab-naturalny'],
    ]),
    handleColors: await group('handle-colors', 'Wykończenie okuć', [
      ['metal-czarny', 'Czarny mat', 'metal-czarny'],
      ['metal-inox', 'Stal szczotkowana', 'metal-inox'],
      ['metal-mosiadz', 'Mosiądz', 'metal-mosiadz'],
    ]),
    glassTypes: await group('glass-types', 'Rodzaje szkła', [
      ['szklo-satyna', 'Satynowane', 'szklo-satyna'],
      ['szklo-przezroczyste', 'Przezroczyste', 'szklo-przezroczyste'],
      ['szklo-dymione', 'Dymione', 'szklo-dymione'],
    ]),
    din: await group('din', 'Strona otwierania (DIN)', [
      ['left', 'Lewe', null],
      ['right', 'Prawe', null],
    ]),
    openingSide: await group('opening-side', 'Kierunek otwierania', [
      ['inward', 'Do wnętrza pomieszczenia', null],
      ['outward', 'Na zewnątrz pomieszczenia', null],
    ]),
    construction: await group('construction', 'Konstrukcja', [
      ['rebated', 'Przylgowa', null],
      ['non_rebated', 'Bezprzylgowa', null],
      ['reverse', 'Odwrotna przylga (reverse)', null],
    ]),
    frameTypes: await group('frame-types', 'Typ ościeżnicy', [
      ['stala', 'Stała', null],
      ['regulowana', 'Regulowana', null],
      ['ukryta', 'Ukryta', null],
    ]),
    locks: await group('locks', 'Zamek', [
      ['brak', 'Bez zamka', null],
      ['klucz', 'Na klucz', null],
      ['wc', 'Blokada łazienkowa WC', null],
      ['wkladka', 'Na wkładkę patentową', null],
      ['magnetyczny', 'Magnetyczny', null],
    ]),
    ventilation: await group('ventilation', 'Wentylacja', [
      ['brak', 'Brak', null],
      ['podciecie', 'Podcięcie wentylacyjne', null],
      ['tuleje', 'Tuleje wentylacyjne', null],
      ['kratka', 'Kratka wentylacyjna', null],
    ]),
    rooms: await group('rooms', 'Przeznaczenie', [
      ['pokoj', 'Pokój dzienny', null],
      ['sypialnia', 'Sypialnia', null],
      ['lazienka', 'Łazienka', null],
      ['kuchnia', 'Kuchnia', null],
      ['garderoba', 'Garderoba', null],
    ]),
  };

  // ── Kroki i pola ───────────────────────────────────────────────────────────
  async function step(key: string, title: string, order: number, categoryKey?: string, description?: string) {
    return prisma.configuratorStep.create({
      data: {
        tenantId: tenant.id,
        key,
        title: PL(title),
        description: description ? PL(description) : undefined,
        order,
        categoryId: categoryKey ? categories[categoryKey] : null,
      },
    });
  }
  const steps = {
    dimensions: await step('wymiary', 'Wymiary i pomieszczenie', 10, undefined, 'Podaj wymiary otworu w murze. Pomiar potwierdzi nasz monter.'),
    direction: await step('kierunek', 'Kierunek otwierania', 20),
    construction: await step('konstrukcja', 'Konstrukcja i ościeżnica', 30),
    finish: await step('wykonczenie', 'Wykończenie', 40),
    glazing: await step('szklenie', 'Szklenie', 45, 'szklane'),
    hardware: await step('okucia', 'Okucia i zamek', 50),
    ventilation: await step('wentylacja', 'Wentylacja i funkcje', 60),
    services: await step('uslugi', 'Usługi i montaż', 70),
  };

  interface FieldSeed {
    key: string; step: { id: string }; label: string; type: string; order: number;
    required?: boolean; defaultValue?: string | number | boolean | null; tooltip?: string;
    unit?: string; min?: number; max?: number; stepSize?: number;
    groupId?: string; mapsTo3d?: string; section?: string;
  }
  async function field(def: FieldSeed) {
    await prisma.fieldDefinition.create({
      data: {
        tenantId: tenant.id,
        stepId: def.step.id,
        key: def.key,
        label: PL(def.label),
        type: def.type,
        required: def.required ?? false,
        defaultValue: def.defaultValue === undefined ? undefined : (def.defaultValue as object | null as never),
        tooltip: def.tooltip ? PL(def.tooltip) : undefined,
        unit: def.unit,
        min: def.min,
        max: def.max,
        stepSize: def.stepSize,
        order: def.order,
        optionGroupId: def.groupId,
        mapsTo3d: def.mapsTo3d,
        section: def.section,
      },
    });
  }

  await field({ key: 'width_mm', step: steps.dimensions, label: 'Szerokość otworu', type: 'dimensions', order: 1, required: true, defaultValue: 900, unit: 'mm', min: 600, max: 2100, stepSize: 10, mapsTo3d: 'dimension:width', tooltip: 'Szerokość otworu w murze mierzona w trzech punktach. Wpisz najmniejszą wartość.' });
  await field({ key: 'height_mm', step: steps.dimensions, label: 'Wysokość otworu', type: 'dimensions', order: 2, required: true, defaultValue: 2100, unit: 'mm', min: 1900, max: 2400, stepSize: 10, mapsTo3d: 'dimension:height' });
  await field({ key: 'wall_thickness_mm', step: steps.dimensions, label: 'Grubość gotowej ściany', type: 'number', order: 3, defaultValue: 120, unit: 'mm', min: 60, max: 400, stepSize: 5, tooltip: 'Grubość ściany z tynkiem. Od niej zależy zakres regulacji ościeżnicy.' });
  await field({ key: 'room', step: steps.dimensions, label: 'Przeznaczenie pomieszczenia', type: 'select', order: 4, defaultValue: 'pokoj', groupId: groups.rooms });

  await field({ key: 'din', step: steps.direction, label: 'Strona otwierania (DIN)', type: 'radio_cards', order: 1, required: true, defaultValue: 'left', groupId: groups.din, mapsTo3d: 'din', tooltip: 'Stronę określa się patrząc na drzwi od strony zawiasów.' });
  await field({ key: 'opening_side', step: steps.direction, label: 'Kierunek otwierania', type: 'radio_cards', order: 2, defaultValue: 'inward', groupId: groups.openingSide, mapsTo3d: 'opening_side' });

  await field({ key: 'construction', step: steps.construction, label: 'Konstrukcja skrzydła', type: 'select', order: 1, defaultValue: 'rebated', groupId: groups.construction, mapsTo3d: 'construction' });
  await field({ key: 'frame_type', step: steps.construction, label: 'Typ ościeżnicy', type: 'select', order: 2, defaultValue: 'stala', groupId: groups.frameTypes });
  await field({ key: 'frame_color', step: steps.construction, label: 'Kolor ościeżnicy', type: 'color_select', order: 3, defaultValue: 'bialy-mat', groupId: groups.frameColors, mapsTo3d: 'material:frame_inside' });

  await field({ key: 'leaf_color_a', step: steps.finish, label: 'Dekor strony A', type: 'color_select', order: 1, required: true, defaultValue: 'dab-naturalny', groupId: groups.decors, mapsTo3d: 'material:leaf_side_a', tooltip: 'Strona A to widok domyślny w podglądzie 3D.' });
  await field({ key: 'leaf_color_b', step: steps.finish, label: 'Dekor strony B', type: 'color_select', order: 2, defaultValue: 'dab-naturalny', groupId: groups.decors, mapsTo3d: 'material:leaf_side_b' });

  await field({ key: 'glass_type', step: steps.glazing, label: 'Rodzaj szkła', type: 'color_select', order: 1, defaultValue: 'szklo-satyna', groupId: groups.glassTypes, mapsTo3d: 'material:glass' });

  await field({ key: 'handle_color', step: steps.hardware, label: 'Wykończenie klamki i okuć', type: 'color_select', order: 1, defaultValue: 'metal-czarny', groupId: groups.handleColors, mapsTo3d: 'material:handle' });
  await field({ key: 'lock_type', step: steps.hardware, label: 'Zamek', type: 'select', order: 2, defaultValue: 'brak', groupId: groups.locks });

  await field({ key: 'ventilation', step: steps.ventilation, label: 'Wentylacja', type: 'select', order: 1, defaultValue: 'brak', groupId: groups.ventilation });

  await field({ key: 'measurement_service', step: steps.services, label: 'Pomiar u klienta', type: 'toggle', order: 1, defaultValue: true });
  await field({ key: 'installation_service', step: steps.services, label: 'Montaż', type: 'toggle', order: 2, defaultValue: false });
  await field({ key: 'old_door_removal', step: steps.services, label: 'Demontaż starych drzwi', type: 'toggle', order: 3, defaultValue: false });
  await field({ key: 'postal_code', step: steps.services, label: 'Kod pocztowy montażu', type: 'text', order: 4, tooltip: 'Na tej podstawie wyliczamy strefę dostawy.' });

  // ── Reguły ─────────────────────────────────────────────────────────────────
  await prisma.ruleSet.create({
    data: {
      tenantId: tenant.id,
      name: 'Reguły demo v1',
      version: 1,
      status: 'published',
      publishedAt: new Date(),
      publishedById: owner.id,
      rules: [
        {
          key: 'lazienka-wentylacja',
          name: 'Łazienka wymaga wentylacji',
          kind: 'validation',
          priority: 10,
          when: { all: [{ field: 'room', op: 'eq', value: 'lazienka' }, { field: 'ventilation', op: 'eq', value: 'brak' }] },
          effects: [{ type: 'warn', fieldKey: 'ventilation' }],
          messagePublic: 'Do łazienki zalecamy podcięcie lub tuleje wentylacyjne.',
          messageAdmin: 'PN-B-03430: wymiana powietrza w pomieszczeniach mokrych.',
        },
        {
          key: 'lazienka-zamek-wc',
          name: 'Łazienka: automatyczna blokada WC',
          kind: 'compatibility',
          priority: 20,
          when: { all: [{ field: 'room', op: 'eq', value: 'lazienka' }, { field: 'lock_type', op: 'eq', value: 'brak' }] },
          effects: [{ type: 'set_value', fieldKey: 'lock_type', value: 'wc' }],
          messagePublic: 'Dla łazienki ustawiliśmy blokadę WC. Możesz to zmienić.',
        },
        {
          key: 'szklane-bez-kratki',
          name: 'Drzwi szklane bez kratki',
          kind: 'compatibility',
          priority: 30,
          categoryKey: 'szklane',
          when: { field: '_category', op: 'eq', value: 'glass' },
          effects: [{ type: 'exclude_option', fieldKey: 'ventilation', optionValues: ['kratka'] }],
          messagePublic: 'W skrzydle szklanym nie montujemy kratki wentylacyjnej. Wybierz podcięcie lub tuleje.',
        },
        {
          key: 'szerokie-skrzydlo',
          name: 'Szerokie skrzydło - wzmocnione zawiasy',
          kind: 'validation',
          priority: 40,
          when: { field: 'width_mm', op: 'gt', value: 950 },
          effects: [{ type: 'warn', fieldKey: 'width_mm' }],
          messagePublic: 'Skrzydło szersze niż 950 mm otrzyma wzmocnione zawiasy (dopłata w cenniku).',
        },
        {
          key: 'reverse-ukryta',
          name: 'Reverse wymaga ościeżnicy ukrytej',
          kind: 'compatibility',
          priority: 50,
          when: { field: 'construction', op: 'eq', value: 'reverse' },
          effects: [{ type: 'set_value', fieldKey: 'frame_type', value: 'ukryta' }],
          messagePublic: 'Konstrukcja reverse współpracuje z ościeżnicą ukrytą - ustawiliśmy ją automatycznie.',
        },
        {
          key: 'waska-sciana-regulowana',
          name: 'Cienka ściana wyklucza ościeżnicę ukrytą',
          kind: 'validation',
          priority: 60,
          when: { all: [{ field: 'wall_thickness_mm', op: 'lt', value: 100 }, { field: 'frame_type', op: 'eq', value: 'ukryta' }] },
          effects: [{ type: 'error', fieldKey: 'frame_type' }],
          messagePublic: 'Ościeżnica ukryta wymaga ściany o grubości co najmniej 100 mm.',
        },
      ] as object,
    },
  });

  // ── Cennik ─────────────────────────────────────────────────────────────────
  await prisma.priceList.create({
    data: {
      tenantId: tenant.id,
      name: 'Cennik demo 2026',
      version: 1,
      status: 'published',
      publishedAt: new Date(),
      publishedById: owner.id,
      settings: { currency: 'PLN', taxRatePercent: 23, taxMode: 'gross', rounding: 'to_zloty', currencyRate: 1 },
      rules: [
        { kind: 'base', modelKey: 'porta-lite-pelne', amount: 129900 },
        { kind: 'base', modelKey: 'porta-lite-szklane', amount: 169900 },
        { kind: 'base', modelKey: 'porta-loft-pelne', amount: 209900 },
        { kind: 'base', modelKey: 'porta-duo-dwuskrzydlowe', amount: 329900 },
        { kind: 'base', modelKey: 'porta-invisible-ukryte', amount: 379900 },
        { kind: 'base', modelKey: 'porta-vista-naswietle', amount: 359900 },
        { kind: 'option_surcharge', fieldKey: 'leaf_color_a', optionValue: 'orzech-ciemny', amount: 22000, label: 'Dekor orzech (strona A)', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'leaf_color_a', optionValue: 'zielen-butelkowa', amount: 18000, label: 'Kolor specjalny (strona A)', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'leaf_color_b', optionValue: 'orzech-ciemny', amount: 22000, label: 'Dekor orzech (strona B)', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'frame_type', optionValue: 'regulowana', amount: 12000, label: 'Ościeżnica regulowana', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'frame_type', optionValue: 'ukryta', amount: 45000, label: 'Ościeżnica ukryta', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'glass_type', optionValue: 'szklo-dymione', amount: 14000, label: 'Szkło dymione', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'handle_color', optionValue: 'metal-mosiadz', amount: 9000, label: 'Okucia mosiężne', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'lock_type', optionValue: 'klucz', amount: 4000, label: 'Zamek na klucz', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'lock_type', optionValue: 'wc', amount: 5000, label: 'Blokada WC', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'lock_type', optionValue: 'wkladka', amount: 6000, label: 'Zamek na wkładkę', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'lock_type', optionValue: 'magnetyczny', amount: 15000, label: 'Zamek magnetyczny', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'ventilation', optionValue: 'podciecie', amount: 4000, label: 'Podcięcie wentylacyjne', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'ventilation', optionValue: 'tuleje', amount: 6000, label: 'Tuleje wentylacyjne', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'ventilation', optionValue: 'kratka', amount: 9000, label: 'Kratka wentylacyjna', publicLine: true },
        { kind: 'option_surcharge', fieldKey: 'width_mm', optionValue: '951', amount: 0, label: 'placeholder', publicLine: false },
        {
          kind: 'dimension_matrix',
          matrix: { widthUpToMm: [800, 900, 1000, 2000], heightUpToMm: [2000, 2100, 2400], amounts: [[0, 0, 6000, 12000], [0, 0, 8000, 15000], [9000, 10000, 16000, 24000]] },
          label: 'Dopłata wymiarowa',
        },
        { kind: 'oversize_percent', aboveHeightMm: 2200, percent: 8, label: 'Wysokość niestandardowa (+8%)' },
        { kind: 'service', fieldKey: 'measurement_service', amount: 15000, label: 'Pomiar u klienta' },
        { kind: 'service', fieldKey: 'installation_service', amount: 49000, label: 'Montaż' },
        { kind: 'service', fieldKey: 'old_door_removal', amount: 15000, label: 'Demontaż i utylizacja' },
        {
          kind: 'discount_percent',
          percent: 5,
          label: 'Rabat: montaż z pomiarem',
          when: { all: [{ field: 'measurement_service', op: 'truthy' }, { field: 'installation_service', op: 'truthy' }] },
          publicLine: true,
        },
        { kind: 'min_price', amount: 99900 },
      ] as object,
    },
  });

  // ── BOM ────────────────────────────────────────────────────────────────────
  await prisma.bomRecipe.create({
    data: {
      tenantId: tenant.id,
      modelId: modelIds['porta-lite-pelne'],
      name: 'Receptura Lite Pełne v1',
      version: 1,
      status: 'published',
      publishedAt: new Date(),
      publishedById: owner.id,
      items: [
        { componentName: 'Płyta HDF 3 mm', sku: 'HDF-3-STD', unit: 'm2', qty: { kind: 'leaf_area_m2', factor: 2, wastePercent: 10 }, stage: 'ciecie', supplier: 'Ply-Pol', internalCost: 3200, comment: 'Dwie okładziny skrzydła.' },
        { componentName: 'Rama sosnowa 32x40', sku: 'RAM-S-3240', unit: 'm', qty: { kind: 'leaf_perimeter_m', factor: 1, wastePercent: 8 }, stage: 'ciecie', supplier: 'DrewTech', internalCost: 850 },
        { componentName: 'Wypełnienie plaster miodu', sku: 'WYP-PM', unit: 'm2', qty: { kind: 'leaf_area_m2', factor: 1 }, stage: 'ciecie', internalCost: 1400 },
        { componentName: 'Okleina CPL', sku: 'CPL-06', unit: 'm2', qty: { kind: 'leaf_area_m2', factor: 2.2, wastePercent: 15 }, stage: 'oklejanie', supplier: 'LamiPol', internalCost: 2100 },
        { componentName: 'Zawias 3D', sku: 'ZAW-3D-STD', unit: 'szt', qty: { kind: 'hinge_count', factor: 1 }, roundUp: true, stage: 'okuwanie', supplier: 'OkuciaMax', internalCost: 1900 },
        { componentName: 'Zamek magnetyczny', sku: 'ZAM-MAG', unit: 'szt', qty: { kind: 'fixed', value: 1 }, stage: 'okuwanie', internalCost: 4300, when: { field: 'lock_type', op: 'eq', value: 'magnetyczny' } },
        { componentName: 'Zamek WC', sku: 'ZAM-WC', unit: 'szt', qty: { kind: 'fixed', value: 1 }, stage: 'okuwanie', internalCost: 2100, when: { field: 'lock_type', op: 'eq', value: 'wc' } },
        { componentName: 'Zamek na klucz', sku: 'ZAM-KL', unit: 'szt', qty: { kind: 'fixed', value: 1 }, stage: 'okuwanie', internalCost: 1700, when: { field: 'lock_type', op: 'eq', value: 'klucz' } },
        { componentName: 'Tuleje wentylacyjne (kpl 5 szt.)', sku: 'WEN-TUL-5', unit: 'kpl', qty: { kind: 'fixed', value: 1 }, stage: 'okuwanie', internalCost: 1600, when: { field: 'ventilation', op: 'eq', value: 'tuleje' } },
        { componentName: 'Karton + narożniki', sku: 'PAK-STD', unit: 'kpl', qty: { kind: 'fixed', value: 1 }, stage: 'pakowanie', internalCost: 900 },
      ] as object,
    },
  });

  // ── Szablony dokumentów ────────────────────────────────────────────────────
  for (const [kind, name] of [
    ['customer_specification', 'Specyfikacja klienta'],
    ['sales_quote', 'Oferta handlowa'],
    ['production_bom', 'BOM produkcyjny'],
    ['measurement_sheet', 'Karta pomiarowa'],
  ] as const) {
    await prisma.documentTemplate.create({
      data: {
        tenantId: tenant.id,
        kind,
        name,
        version: 1,
        status: 'published',
        publishedAt: new Date(),
        publishedById: owner.id,
        config: {
          accentColor: '#a07d3b',
          showLogo: true,
          showPrice: kind !== 'production_bom' && kind !== 'measurement_sheet',
          showQr: true,
          showRender: kind !== 'production_bom',
          showWarnings: true,
          footerText: 'Studio Drzwi Sp. z o.o. (DEMO) | kontakt@studio-drzwi.demo | +48 600 000 000',
          introText: kind === 'customer_specification' ? 'Dziękujemy za skonfigurowanie drzwi. Poniżej pełna specyfikacja Twojego projektu.' : '',
          sectionsOrder: ['summary', 'options', 'services', 'price'],
        },
      },
    });
  }

  // ── Przykładowa zapisana konfiguracja ─────────────────────────────────────
  const prismaService = new PrismaService();
  const evaluateService = new EvaluateService(prismaService);
  const demoRequest = {
    categoryKey: 'pelne',
    modelKey: 'porta-lite-pelne',
    selections: {
      width_mm: 900,
      height_mm: 2100,
      wall_thickness_mm: 120,
      room: 'pokoj',
      din: 'left',
      opening_side: 'inward',
      construction: 'rebated',
      frame_type: 'stala',
      frame_color: 'bialy-mat',
      leaf_color_a: 'dab-naturalny',
      leaf_color_b: 'bialy-mat',
      handle_color: 'metal-czarny',
      lock_type: 'magnetyczny',
      ventilation: 'brak',
      measurement_service: true,
      installation_service: true,
      old_door_removal: false,
    },
    revision: 1,
  };
  const evaluation = await evaluateService.evaluate('demo', demoRequest as never);
  if (!evaluation.response.valid || !evaluation.response.renderSpec) {
    console.error(JSON.stringify(evaluation.response.errors, null, 2));
    throw new Error('Seed: demonstracyjna konfiguracja nie przechodzi walidacji evaluate.');
  }
  const demoConfig = await prisma.configuration.create({
    data: {
      tenantId: tenant.id,
      shareId: 'demo-' + randomToken(4),
      categoryKey: 'pelne',
      modelKey: 'porta-lite-pelne',
      selections: evaluation.normalizedSelections as object,
      revision: 1,
      status: 'saved',
      name: 'Konfiguracja pokazowa',
    },
  });
  await prisma.configurationSnapshot.create({
    data: {
      configurationId: demoConfig.id,
      revision: 1,
      selections: evaluation.normalizedSelections as object,
      evaluateResult: evaluation.response as unknown as object,
      renderSpec: evaluation.response.renderSpec as unknown as object,
      priceBreakdown: evaluation.pricing as unknown as object,
      versions: evaluation.response.versions as object,
      checksum: evaluation.response.checksum,
    },
  });
  await prismaService.$disconnect();

  console.log('──────────────────────────────────────────────');
  console.log('Seed zakończony.');
  console.log(`Tenant: demo | Konfiguracja pokazowa: /demo/c/${demoConfig.shareId}`);
  console.log(`Panel: ${adminEmail} (hasło z SEED_ADMIN_PASSWORD)`);
  console.log(`Role demo: sprzedaz@demo.local, produkcja@demo.local (to samo hasło)`);
  console.log(`Cena demo: ${(evaluation.pricing!.amount / 100).toFixed(2)} PLN`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
