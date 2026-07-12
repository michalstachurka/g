# Wdrożenie i checklista

## Środowiska i usługi

| Komponent | Produkcyjnie |
| --- | --- |
| api (NestJS) | kontener Node 22, za reverse proxy z HTTPS |
| worker (BullMQ) | osobny kontener Node 22, dostęp do Redis i API (token) |
| configurator, admin (Next.js) | tryb standalone albo hosting Node; HTTPS obowiązkowe (AR) |
| PostgreSQL 16 | managed albo kontener z backupem i migracjami |
| Redis 7 | managed albo kontener |
| storage | S3 (`STORAGE_DRIVER=s3`) - modele publiczne, dokumenty prywatne, branding |

`docker compose -f infra/docker/docker-compose.yml up -d` uruchamia Postgres,
Redis i MinIO do pracy lokalnej.

## Kolejność wdrożenia

1. Migracje: `prisma migrate deploy` (nigdy `db push` na produkcji).
2. Backup bazy przed migracją.
3. Build: `pnpm build` (turbo zbuduje kontrakty, API, frontendy).
4. Seed tylko przy pierwszym wdrożeniu środowiska demo; produkcyjne tenanty
   zakłada `platform_owner` przez panel.
5. Start api, worker, configurator, admin.
6. Health-check: `GET /public/<tenant>/categories` i `GET /docs`.

## Bezpieczeństwo (checklista)

- [ ] sekrety wyłącznie z secret managera (`SESSION_SECRET`, `SIGNED_URL_SECRET`, `WORKER_TOKEN`, `S3_*`)
- [ ] cookie sesji `httpOnly`, `secure`, `sameSite=lax` (secure włącza się przy `NODE_ENV=production`)
- [ ] CSRF: nagłówek `x-csrf-token` dla mutacji panelu (double-submit) - aktywne
- [ ] rate limiting endpointów publicznych (`@nestjs/throttler`) - aktywne
- [ ] CORS ograniczony do domen tenantów i embedów (`CORS_ORIGINS`)
- [ ] walidacja MIME i rozmiaru uploadów GLB (50 MB) i brandingu (2 MB)
- [ ] worker konwersji w izolacji, limit czasu zadania (`lockDuration`)
- [ ] podpisane, krótkotrwałe URL-e do dokumentów prywatnych (HMAC, TTL 1h)
- [ ] pełny BOM tylko dla ról `production`/`tenant_admin`/`platform_owner` (403 dla reszty)
- [ ] brak wykonywania kodu z danych panelu (reguły/ceny/BOM to dane deklaratywne, nie kod)
- [ ] TLS proxy nie wyłączony; nagłówki `X-Content-Type-Options`, `X-Frame-Options`

## Wydajność

- publiczne GLB cache'owane po checksumie (`Cache-Control: immutable`, ETag)
- opublikowany schemat i manifesty z krótkim cache + ETag
- evaluate debounce'owane i anulowane po stronie klienta
- worker nie blokuje żądań HTTP (PDF/USDZ w kolejce)
- budżety rozmiaru modeli i tekstur egzekwowane przy uploadzie (ostrzeżenia w raporcie GLB)

## Checklista AR na prawdziwych urządzeniach (manualna)

Automatyczne testy nie pokrywają natywnego AR - wymagana weryfikacja ręczna:

| Test | Android Chrome | iPhone Safari |
| --- | --- | --- |
| Strona AR ładuje model (GLB/USDZ) | [ ] | [ ] |
| Przycisk AR uruchamia sesję (WebXR/Scene Viewer / Quick Look) | [ ] | [ ] |
| Model kotwiczy się na ścianie (`ar-placement="wall"`) | [ ] | [ ] |
| Skala zablokowana i zgodna z wymiarami konfiguracji | [ ] | [ ] |
| Orientacja przód/tył poprawna | [ ] | [ ] |
| Czas ładowania akceptowalny na sieci mobilnej | [ ] | [ ] |
| Urządzenie bez AR pokazuje działający widok 3D + komunikat | [ ] | [ ] |
| Desktop: QR prowadzi do tej samej konfiguracji na telefonie | [ ] | [ ] |

Uwaga: przeglądarkowe AR nie gwarantuje okluzji, automatycznego wycięcia
istniejących drzwi ani centymetrowej dokładności. AR jest wizualizacją skali
i wyglądu, nie narzędziem pomiarowym.

## Monitoring (do podłączenia w produkcji)

- czas i błędy generowania PDF/USDZ (worker loguje czas każdego zadania)
- błędy WebGL i czas ładowania modelu (telemetria do dodania w viewerze)
- liczba zadań nieudanych w kolejce (dashboard admina pokazuje `failedModelJobs`)
