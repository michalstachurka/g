# Plan implementacji

Aktualizowany po każdym etapie. Stan na: 2026-07-11.

## Architektura przepływu (obowiązująca)

```text
formularz konfiguratora
  -> POST /public/:tenant/evaluate (walidacja, reguły, dostępność)
  -> backend wylicza publiczną cenę
  -> backend zwraca wersjonowany publiczny renderSpec (+ wersje reguł/cennika/assetów + checksum)
  -> three-viewer składa moduły GLB wg renderSpec i manifestów publicznych
  -> zapis konfiguracji -> snapshot -> worker: PDF/oferta/BOM
  -> worker: wynikowy GLB + USDZ dla AR (te same moduły i transformacje co renderSpec)
```

## Stos (zgodny ze specyfikacją)

pnpm workspaces + Turborepo, TypeScript strict, Next.js App Router (configurator, admin),
React Three Fiber + drei, NestJS (api), PostgreSQL + Prisma, Redis + BullMQ (worker),
storage: adapter lokalny FS (dev) + interfejs S3, RHF + Zod, TanStack Query, Zustand,
Playwright (PDF + render serwerowy), Vitest, OpenAPI (@nestjs/swagger).

## Etapy i status

| Etap | Zakres | Status |
| --- | --- | --- |
| 0 Audyt | repo (puste), licencje, inwentaryzacja GLB, plan, kontrakty, lista braków | **done** — patrz LICENSE_AUDIT, ASSET_REQUIREMENTS, DOMAIN_MODEL |
| 1 Fundament | monorepo, baza, tenanty, auth+role, storage, kolejki, seed | done |
| 2 Katalog i admin | branding, katalog, dynamiczne kroki/pola, asset manager (upload→raport→mapowanie→publikacja), draft/published | done |
| 3 Konfigurator i 3D | 6 kategorii, dynamiczne kroki, viewer modułowy, DIN L/P, materiały A/B, animacja, mobile | done |
| 4 Domena serwerowa | evaluate: walidacja, kompatybilność, cena, renderSpec, snapshoty, zapis/udostępnianie | done |
| 5 Dokumenty i BOM | PDF publiczny, oferta, BOM wewnętrzny (role), karta pomiarowa | done |
| 6 AR | wynikowy GLB, USDZ, model-viewer (wall/fixed), QR | done (testy na fizycznych urządzeniach — checklist manualny otwarty) |
| 7 Dopracowanie | responsywność, błędy/empty states, wydajność, dokumentacja | done w zakresie MVP |

## Decyzje kluczowe (ADR w docs/DECISIONS/)

- ADR-0001: kod w 100% od zera; projekty referencyjne bez weryfikowalnej licencji nie są kopiowane
- ADR-0002: storage adapterowy (lokalny FS w dev, S3 przez ten sam interfejs w prod)
- ADR-0003: USDZ generowany w workerze przez USDZExporter (three) + fallback konwersji model-viewer po stronie klienta iOS
- ADR-0004: seedowe GLB dzielone na moduły (skrzydło/ościeżnica) narzędziem gltf-transform — bez tworzenia geometrii
- ADR-0005: CSG wyłączone w MVP; kontrakt operacji zdefiniowany, funkcja per tenant
- ADR-0006: DIN przez lustrzaną kompozycję anchorów + `mirrorPolicy` per asset (nigdy globalny scale -1)

## Znane braki / dalsze kroki

1. GLB: przesuwne, lustrzane, klamki wymienne, próg, naświetla — zbiorcza lista w ASSET_REQUIREMENTS §3.
2. Testy AR na fizycznych urządzeniach (Android Chrome, iPhone Safari) — checklist w DEPLOYMENT.md.
3. Import/eksport CSV katalogu; 2FA administratorów; e-mail SMTP (obecnie driver logujący do bazy).
4. KTX2/Draco w pipeline optymalizacji kopii publicznej (obecnie prune+dedup).
5. Kreator wizualny reguł (obecnie edytor strukturalny JSON z walidacją i testem na przykładowej konfiguracji).
