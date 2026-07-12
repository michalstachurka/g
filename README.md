# Konfigurator drzwi wewnętrznych 3D (white-label)

Produkcyjny MVP białoetykietowego (white-label) konfiguratora drzwi wewnętrznych
z panelem administracyjnym, wyceną i regułami na backendzie, modułowym 3D,
serwerowym PDF/BOM oraz AR (Android + iOS). Jeden mechanizm dla wielu producentów:
tenant podkłada własne GLB, katalog, ceny, reguły, branding i układ interfejsu
bez zmian w kodzie.

Pełna specyfikacja: [`CLAUDE.md`](./CLAUDE.md). Plan i decyzje: [`docs/`](./docs).

## Architektura

Monorepo pnpm + Turborepo, TypeScript strict.

```
apps/
  configurator/   Next.js - publiczny konfigurator, viewer 3D, AR, link+QR
  admin/          Next.js - panel: branding, katalog, asset manager, reguły, ceny, BOM
  api/            NestJS + Prisma - domena, evaluate, renderSpec, RBAC, tenancy
  worker/         BullMQ - PDF (Playwright), wynikowy GLB, USDZ
packages/
  contracts/      kontrakty Zod: renderSpec, evaluate, manifest, reguły, ceny, BOM
  three-viewer/   warstwa 3D (React Three Fiber) - kompozycja, DIN, materiały A/B
  config-engine/  publiczny stan konfiguratora (Zustand), bez reguł tajnych
  ui/             współdzielone komponenty bez logiki domenowej
docs/             plan, model domenowy, audyty licencji i assetów, ADR
scripts/          podział seedowych GLB na moduły, kontrola licencji
```

Przepływ (jedno źródło prawdy = backend):

```
formularz -> POST /evaluate (walidacja, reguły, dostępność, cena)
          -> wersjonowany renderSpec + checksum + wersje reguł/cennika/assetów
          -> three-viewer składa moduły GLB wg renderSpec i manifestów
zapis -> snapshot -> worker: PDF/oferta/BOM oraz wynikowy GLB + USDZ dla AR
```

Zasada bezwzględna: ceny, pełne reguły, marże, BOM i kody produkcyjne istnieją
wyłącznie na backendzie. `renderSpec` i publiczne API nie zawierają tych danych
(pilnuje tego test `render-spec.spec.ts` i runtime-owy guard `assertRenderSpecPublic`).

## Wymagania

- Node 22+, pnpm 10+
- PostgreSQL 16, Redis 7
- Chromium dla workera PDF (w tym środowisku: `/opt/pw-browsers/chromium`)

## Uruchomienie lokalne

```bash
# 1. Zależności
pnpm install

# 2. Usługi (albo docker compose -f infra/docker/docker-compose.yml up -d)
#    Baza i Redis muszą działać na 127.0.0.1:5432 i :6379.

# 3. Konfiguracja
cp .env.example apps/api/.env        # ustaw DATABASE_URL, REDIS_URL, sekrety, konta seed

# 4. Migracje bazy
pnpm --filter @door/api exec prisma migrate deploy

# 5. Przygotowanie modułów GLB z dostarczonych plików źródłowych
pnpm run seed:assets

# 6. Build kontraktów i API, seed tenanta demo
pnpm --filter @door/contracts build
pnpm --filter @door/api build
pnpm seed

# 7. Uruchomienie (w osobnych terminalach)
pnpm --filter @door/api start                    # http://localhost:4000  (/docs = OpenAPI)
pnpm --filter @door/worker start                 # konsument kolejki door-jobs
pnpm --filter @door/configurator dev             # http://localhost:3000
pnpm --filter @door/admin dev                    # http://localhost:3001
```

Konta demo tworzy skrypt seed na podstawie zmiennych środowiskowych
(`SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, `SEED_PLATFORM_OWNER_*`).
Domyślne wartości z `.env.example`: `admin@demo.local` / `Demo1234!`
(oraz `sprzedaz@demo.local`, `produkcja@demo.local` z tym samym hasłem).

## Skróty

| Komenda | Działanie |
| --- | --- |
| `pnpm test` | testy jednostkowe i integracyjne (Vitest) |
| `pnpm typecheck` | kontrola typów całego monorepo |
| `pnpm run seed:assets` | podział źródłowych GLB na moduły + manifesty |
| `pnpm seed` | seed tenanta demonstracyjnego |
| `pnpm run licenses:check` | kontrola licencji zależności |

## Zmienne środowiskowe

Pełna lista w `.env.example`. Najważniejsze:

- `DATABASE_URL`, `REDIS_URL` - baza i kolejki
- `SESSION_SECRET`, `SIGNED_URL_SECRET`, `WORKER_TOKEN` - sekrety (produkcyjnie z secret managera)
- `STORAGE_DRIVER` (`fs`|`s3`) i `STORAGE_FS_ROOT` / `S3_*` - storage assetów i dokumentów
- `CORS_ORIGINS`, `CONFIGURATOR_URL`, `ADMIN_URL`, `NEXT_PUBLIC_API_URL`
- `SEED_ADMIN_*`, `SEED_PLATFORM_OWNER_*` - konta tworzone przez seed
- `CHROMIUM_PATH` - przeglądarka dla workera PDF

## Demo end-to-end

Po seedzie: `http://localhost:3000/demo` startuje od sześciu kategorii drzwi.
Ścieżka "Drzwi pełne" -> model "Lite Pełne" używa prawdziwych, dostarczonych
GLB złożonych z modułów (skrzydło + ościeżnica). Zmiana DIN lewy/prawy,
strony A/B, wymiarów i okuć aktualizuje 3D i cenę z backendu; zapis daje link
i QR; PDF i modele AR (GLB + USDZ) generuje worker.

Wdrożenie i checklista AR na urządzeniach: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

## Braki assetów

Kategorie "Drzwi przesuwne" i "Drzwi lustrzane" oraz wymienne okucia wymagają
dodatkowych GLB - zbiorcza lista w [`docs/ASSET_REQUIREMENTS.md`](./docs/ASSET_REQUIREMENTS.md) §3.
Do czasu ich dostarczenia kategorie te są uczciwie oznaczone jako niegotowe
(status `MISSING_ASSET`); konfiguracja i wycena działają, wizualizacja nie udaje
działającej.

## Licencje

Kod: napisany od zera (ADR-0001). Zależności: `THIRD_PARTY_NOTICES.md` i
`docs/LICENSE_AUDIT.md`. Kontrola licencji w CI: `pnpm run licenses:check`.
