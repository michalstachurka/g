# API

Kontrakt OpenAPI generowany automatycznie: `GET /docs` (Swagger) na działającym API.
Poniżej mapa endpointów i zasady. Wszystkie DTO walidowane są schematami Zod z
`packages/contracts`.

## Publiczne (`/public/:slug`, rate-limited, bez logowania)

| Metoda | Ścieżka | Opis |
| --- | --- | --- |
| GET | `/branding` | branding tenanta (tokeny, layout, teksty) |
| GET | `/categories` | sześć kategorii + status gotowości wizualizacji |
| GET | `/schema/:categoryKey` | opublikowany schemat kroków, pól i modeli |
| GET | `/materials` | publiczne definicje materiałów (PBR parametryczny) |
| POST | `/evaluate` | walidacja + reguły + cena publiczna + `renderSpec` + wersje + checksum |
| POST | `/configurations` | zapis (ponowny `evaluate` na serwerze) -> `shareId` + snapshot |
| GET | `/configurations/:shareId` | odczyt udostępnionej konfiguracji |
| POST | `/configurations/:shareId/documents` | zlecenie publicznego PDF (tylko `customer_specification`) |
| GET | `/documents/:id` | status dokumentu + podpisany link po ukończeniu |
| POST | `/configurations/:shareId/ar` | zlecenie modeli AR (GLB + USDZ) |
| GET | `/configurations/:shareId/ar` | status modeli AR + publiczne URL-e |
| GET | `/assets/:publicAssetId/manifest` | publiczny manifest assetu dla viewera |
| GET | `/assets/:publicAssetId/file` | publiczny GLB (cache immutable, ETag) |
| GET | `/qr.png?path=` | QR do kanonicznej ścieżki aplikacji |
| POST | `/leads` | formularz leadu (zgoda wymagana) |
| POST | `/configurations/:shareId/email` | wysyłka linku mailem (backend) |

Odpowiedź `evaluate` (skrót): `valid, errors[], warnings[], automaticAdjustments[],
availableOptions{}, hiddenFields[], priceSummary, renderSpec, visualizationStatus,
missingAssetNotice, versions{schema,ruleSet,priceList,assetSet}, configurationRevision, checksum`.

`renderSpec` nie zawiera cen, kosztów, marż, BOM, pełnych reguł, tolerancji ani
prywatnych ścieżek storage - egzekwuje to `assertRenderSpecPublic` i test guard.

## Auth (`/auth`)

`POST /login` (cookie sesji + token CSRF), `POST /logout`, `GET /me`.
Hasła: argon2id. Sesje: cookie `httpOnly/secure/sameSite`.

## Admin (`/admin`, cookie + `x-tenant` + CSRF, RBAC per endpoint)

- `branding` - GET/PUT szkicu, `POST /publish`, `POST /upload`
- `catalog` - CRUD kategorii, rodzin, modeli, opcji, materiałów, kroków, pól
- `assets` - `POST /upload` (raport GLB), `PUT .../manifest` (mapowanie), `POST .../publish`,
  bundle CRUD + publish, `GET /missing-report`
- `rulesets`, `pricelists`, `bom-recipes`, `templates` - wersjonowanie draft/published,
  publish, rollback, test/symulacja na przykładowej konfiguracji
- `configurations` - lista, `GET .../bom` (role produkcyjne), zlecenie dokumentów
- `leads`, `users` (zaproszenia, role), `audit`

## Wewnętrzne (`/internal`, tylko worker, `x-worker-token`)

`GET /jobs/document/:id`, `POST .../complete|fail`, `GET /jobs/model/:id`,
`GET /assets/:publicAssetId/file`, `POST .../complete|fail`.
Worker nie ma własnego dostępu do bazy - pobiera zatwierdzone snapshoty z API.

## Zasady

- zapis konfiguracji zawsze ponownie uruchamia `evaluate` (nie ufamy klientowi)
- `renderSpec`, cena i dostępne opcje pochodzą z jednego przeliczenia i tej samej wersji reguł
- idempotency dla dokumentów i modeli (klucz per snapshot+rodzaj)
- publiczne identyfikatory assetów/modeli są nieprzewidywalne, nie ujawniają ścieżek
- ETag/Cache-Control dla opublikowanych manifestów i publicznych GLB
