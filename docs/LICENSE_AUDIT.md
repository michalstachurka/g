# Audyt licencyjny

Data audytu: 2026-07-11. Audyt obejmuje: bazę kodu, projekty referencyjne, dostarczone assety 3D oraz zależności npm.

Zasada nadrzędna (CLAUDE.md, sekcja 2, pkt 16-18): kod i zasoby bez jednoznacznej licencji komercyjnej nie są kopiowane. Brak pliku licencyjnego oznacza brak zgody na kopiowanie.

## 1. Baza kodu

| Źródło | Licencja | Decyzja |
| --- | --- | --- |
| Repozytorium `michalstachurka/g` | puste w chwili startu (brak commitów) | cały kod napisany od zera w tym repozytorium |
| Projekty referencyjne (sekcja 2) | niepotwierdzone / brak możliwości weryfikacji | zero kopiowania kodu, assetów, tekstur i nazewnictwa; wyłącznie inspiracja funkcjonalna opisana w `docs/REFERENCE_ANALYSIS.md` |
| `maxjvjohansson/3d-configurator` (MIT wg specyfikacji) | MIT (deklarowana) | **nie wykorzystano żadnego kodu** — implementacja własna; gdyby w przyszłości kod został użyty, wymagane jest zachowanie licencji i wpis w `THIRD_PARTY_NOTICES.md` |

Uzasadnienie decyzji "wszystko od zera": w tym środowisku dostęp sieciowy do repozytoriów referencyjnych jest ograniczony do `michalstachurka/g`, więc nie da się zweryfikować treści ich plików LICENSE. Zgodnie z regułą "status licencji niejasny = nie używaj" żaden kod z zewnątrz nie został skopiowany. Patrz `docs/DECISIONS/ADR-0001-baza-projektu.md`.

## 2. Projekty referencyjne

| Projekt | Status licencji na dzień audytu | Użycie w tym repozytorium |
| --- | --- | --- |
| `DDstar1/door_3d_configurator_nextJS` | niepotwierdzona | tylko inspiracja architektoniczna (macierz w REFERENCE_ANALYSIS) |
| `romi-mc/superior-door-window-configurator` | niepotwierdzona | tylko inspiracja architektoniczna |
| `conor-v/door-configurator` | niepotwierdzona | tylko inspiracja funkcjonalna |
| `adambien94/door-configurator` | niepotwierdzona | tylko inspiracja algorytmiczna |
| `maxjvjohansson/3d-configurator` | MIT wg specyfikacji projektu, treść niezweryfikowana w tym środowisku | kod nie został użyty |

## 3. Dostarczone assety 3D (models.zip od właściciela projektu)

### 3.1. Modele drzwi — IArchway

Źródło i licencja udokumentowane w `assets/source-models/door-model-sources.json` (dostarczone przez właściciela projektu).

Warunki IArchway (wg `door-model-sources.json`, https://iarchway.com/en/download_policy/):
darmowe użycie osobiste i komercyjne; modyfikacja dozwolona; atrybucja niewymagana;
**zakaz redystrybucji/odsprzedaży lekko zmodyfikowanych danych źródłowych jako assetu**.

| Plik | Źródło | Użycie w projekcie | Ocena zgodności |
| --- | --- | --- | --- |
| basic-flat.glb (Door1) | IArchway | seed demo: skrzydło pełne + ościeżnica + okucia | zgodne: użycie w produkcie |
| basic-frame.glb (Door38) | IArchway | seed demo: model z przeszkleniem górnym | zgodne |
| basic-glass.glb (Door7) | IArchway | seed demo: drzwi szklane | zgodne |
| basic-hidden.glb (Door33) | IArchway | seed demo: drzwi ukryte | zgodne |
| basic-double.glb (Door18) | IArchway | seed demo: drzwi dwuskrzydłowe | zgodne |
| basic-apartment-solid.glb (Door3) | IArchway | seed demo: drzwi pełne premium | zgodne |
| basic-apartment-secure.glb (Door46) | IArchway | seed demo: wariant z naświetlem | zgodne |

Uwagi ryzyka (do decyzji właściciela przed produkcją):

1. Konfigurator udostępnia użytkownikowi uproszczony wynikowy GLB/USDZ do AR i pobrania. Dla modeli seedowych IArchway plik wynikowy jest pochodną danych źródłowych. Interpretujemy to jako "użycie w projekcie komercyjnym" (dozwolone), a nie "odsprzedaż assetu" (zakazana), ponieważ plik jest funkcjonalną częścią prezentacji produktu, a nie dystrybucją biblioteki modeli. **Ostateczna interpretacja prawna należy do właściciela projektu.** Modele seedowe służą wyłącznie demonstracji platformy; tenanci produkcyjni wgrywają własne modele.
2. Pliki zostały podzielone na moduły (skrzydło, ościeżnica) na potrzeby systemu modułowego. To modyfikacja — dozwolona wprost przez warunki źródła.

### 3.2. interior_trim_assets.glb oraz interior_trim_assets low.glb — WYKLUCZONE

- Metadane pliku wskazują generator `Sketchfab-15.61.0` i źródłowy plik `interior_trim_assets.fbx` (pakiet: listwy przypodłogowe, opaski, ościeża, zawiasy, gałki, kratki wentylacyjne, lampy).
- Plik **nie ma wpisu** w `door-model-sources.json`. Modele ze Sketchfab wymagają zwykle co najmniej atrybucji (CC-BY), a część wyklucza użycie komercyjne.
- Decyzja: **status licencji niejasny → asset nie jest używany** w seedzie, viewerze, eksportach ani AR. Pliki pozostają w `assets/source-models/` wyłącznie jako materiał dostarczony przez właściciela, ze statusem `license_unconfirmed`.
- Wymagane działanie właściciela: dostarczyć nazwę autora, link źródłowy i licencję, albo potwierdzić prawo użycia. Do tego czasu role okuć wymiennych pozostają na liście braków w `docs/ASSET_REQUIREMENTS.md`.

### 3.3. Tekstury i materiały

Dostarczone GLB drzwi nie zawierają materiałów ani tekstur. Materiały publiczne (kolory, dekory, szkło, metal) są definiowane parametrycznie w katalogu tenanta (PBR: kolor, roughness, metalness, transmission) — bez kopiowania tekstur z zewnątrz. Nie użyto żadnych zewnętrznych tekstur, fontów graficznych ani ikon z projektów referencyjnych.

## 4. Fonty

- UI: fonty systemowe (`system-ui`) — bez osadzania plików fontów.
- PDF: fonty systemowe środowiska renderującego (DejaVu Sans w kontenerze, licencja wolna, dozwolone osadzanie). Tenant może wgrać własny font wyłącznie z licencją pozwalającą na osadzanie (pole w panelu opisuje wymóg).

## 5. Zależności npm

Pełna lista z wersjami: `THIRD_PARTY_NOTICES.md` (generowana skryptem `pnpm run licenses:check`).

Polityka (egzekwowana w CI przez `scripts/license-check.mjs`):

- dozwolone bez decyzji: MIT, ISC, Apache-2.0, BSD-2-Clause, BSD-3-Clause, 0BSD, CC0-1.0, Unlicense, BlueOak-1.0.0, Python-2.0, CC-BY-4.0 (dokumentacyjne)
- wymagają ADR przed użyciem: GPL, AGPL, LGPL, SSPL, BUSL, licencje niestandardowe i nieznane
- skrypt zawodzi build, jeżeli w drzewie produkcyjnym pojawi się licencja spoza listy dozwolonych bez wpisu wyjątku

Kluczowe zależności produkcyjne i ich licencje:

| Pakiet | Licencja |
| --- | --- |
| next, react, react-dom | MIT |
| three | MIT |
| @react-three/fiber, @react-three/drei | MIT |
| @nestjs/* | MIT |
| prisma, @prisma/client | Apache-2.0 |
| zod | MIT |
| bullmq, ioredis | MIT |
| @gltf-transform/core, /functions, /extensions | MIT |
| argon2 | MIT |
| playwright-core | Apache-2.0 |
| qrcode | MIT |
| `<model-viewer>` (@google/model-viewer) | Apache-2.0 |
| tailwindcss | MIT |
| zustand, @tanstack/react-query, react-hook-form | MIT |

## 6. Rejestr LicenseRecord

Wpisy licencyjne assetów są przechowywane per asset w bazie (pole `licenseInfo` w tabeli `Asset`) i wypełniane przy uploadzie. Seed zapisuje wpisy IArchway z `door-model-sources.json`, a pliki trim otrzymują status `license_unconfirmed` i są zablokowane przed publikacją.
