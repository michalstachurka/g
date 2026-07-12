# Analiza projektów referencyjnych

Projekty referencyjne służą wyłącznie jako materiał analityczny (CLAUDE.md 4.1). W tym środowisku ich kod nie był otwierany ani kopiowany — poniższa macierz opiera się na zakresie funkcjonalnym opisanym w specyfikacji projektu i standardowej wiedzy domenowej. Każda funkcja ma własną implementację napisaną od zera.

Legenda statusu: `done` = działa end-to-end w tym repo, `partial` = działa w ograniczonym zakresie (opis w uwagach), `planned` = zaplanowane po MVP, `blocked_asset` = zablokowane brakiem GLB (patrz ASSET_REQUIREMENTS), `rejected` = odrzucone z uzasadnieniem.

| Funkcja | Referencja | Nasza implementacja | Etap | Status | Test akceptacyjny |
| --- | --- | --- | --- | --- | --- |
| Konfiguracja wymiarów (szer./wys.) z walidacją zakresów | DDstar1 | pola `width_mm`/`height_mm` w schemacie kroków; limity per model + `allowedDimensionRange` manifestu; walidacja w `evaluate` | 3-4 | done | zmiana wymiaru poza zakres zwraca błąd blokujący z komunikatem; w zakresie — renderSpec skaluje wg `scalePolicy` |
| Skalowanie modelu wg polityk (bez rozciągania głębokości/okuć) | DDstar1 | `scalePolicy` w manifeście (`fixed/uniform/width_height/approved_axes/variant_only`); przeliczenie w builderze renderSpec; testy jednostkowe | 3 | done | test: wysokość 2300 przy bazie 2100 skaluje wyłącznie oś Y skrzydła; klamka pozostaje niezmieniona |
| DIN lewy/prawy (zawiasy, klamka, animacja, diagram) | DDstar1 | kompozycja serwerowa: lustrzane anchory + `mirrorPolicy` per asset; zakaz ślepego ujemnego skalowania; diagram SVG w UI | 3-4 | done | zmiana DIN przenosi oś zawiasów i klamkę na drugą stronę, odwraca kierunek animacji; test jednostkowy kompozycji |
| Widoczność części sterowana konfiguracją | DDstar1 | `renderSpec.visibleParts` liczony na backendzie; viewer tylko aplikuje | 3-4 | done | wyłączenie przeszklenia usuwa `glass` z visibleParts; frontend nie zawiera reguł `if doorType` |
| Pozycjonowanie okuć | DDstar1 | semantyczne anchory (`hinge_axis`, `handle_center`, `lock_center`) w manifeście, wartości mm auto-wyliczane przy imporcie seed | 3 | done | test anchorów: pozycja klamki = anchor, po DIN = odbicie względem osi skrzydła |
| Składanie drzwi z osobnych GLB (skrzydło, rama, szkło, klamki, naświetla) | romi-mc | `AssetBundle` + sloty semantyczne; moduły montowane pod jednym korzeniem; seed dzieli źródłowe GLB na moduł skrzydła i ościeżnicy | 3 | done | ścieżka demo składa min. 2 GLB (skrzydło + ościeżnica); test deterministycznej kompozycji |
| Mapowanie materiałów (strona A/B, rama, szkło) | romi-mc | `materialBindings` w manifeście + publiczne definicje materiałów; klonowanie materiałów przed mutacją | 3 | done | zmiana dekoru strony A nie zmienia strony B (model z osobnymi meshami stron); test |
| Naświetla boczne i górne | romi-mc | role `sidelight_left/right`, `toplight` w słowniku ról i bundlach | 3 | blocked_asset | brak dostarczonych modułów naświetli; rola i slot gotowe |
| Zapis konfiguracji + link publiczny | conor-v | `Configuration` + `shareId`, autosave draft, link `/c/[shareId]` | 4 | done | zapis → otwarcie linku w trybie incognito pokazuje tę samą konfigurację |
| PDF oferty | conor-v | wyłącznie serwerowo (worker + Playwright + szablon HTML z bazy + snapshot) | 5 | done | PDF zawiera render, dane konfiguracji, cenę i QR; regeneracja starej oferty używa snapshotu, nie nowego cennika |
| QR do konfiguracji | conor-v | QR generowany serwerowo (biblioteka `qrcode`), prowadzi do kanonicznego linku | 5-6 | done | skan QR z desktopu otwiera tę samą konfigurację na telefonie |
| Animacja otwierania | conor-v | parametry animacji w renderSpec (`hinge`/`slide`, pivotAnchor, maxAngleDeg, direction) | 3 | done | otwarcie/zamknięcie płynne; kierunek zgodny z DIN |
| CSG / cięcia w geometrii | conor-v | odrzucone dla geometrii produktu w MVP; kontrakt deklaratywnych operacji zdefiniowany, funkcja wyłączona per tenant | warunkowy | rejected (MVP) | uzasadnienie: dostarczone GLB wystarczają na demo; CSG nie może zastępować GLB (CLAUDE.md 10.4); włączenie wymaga zgodności klient/worker |
| Parametryczne podziały szklenia, szprosy | adambien94 | zaplanowane jako zatwierdzony tryb CSG (whitelist `glass_division`), po MVP | warunkowy | planned | wynik viewer = wynik workera na tej samej liście operacji |
| Katalog wariantów/kolekcji | wszystkie | katalog w bazie per tenant (kategorie→rodziny→modele→warianty) edytowalny w adminie | 2 | done | admin dodaje model bez zmian w kodzie |
| Ościeżnica: typy i grubość ściany | DDstar1 | grupy opcji + reguły serwerowe; wizualnie jeden typ ościeżnicy na seedach | 2-4 | partial | typy stała/regulowana/ukryta liczone w cenie i regułach; osobne bryły ościeżnic wymagają GLB (lista braków) |
| Zamki, zawiasy, wentylacja jako opcje handlowe | DDstar1 | grupy opcji + reguły + BOM; wizualizacja tylko tam, gdzie istnieje geometria (zawiasy, rozety w seedach) | 2-4 | done | wybór zamka zmienia cenę i BOM; brak geometrii danego zamka nie udaje wizualizacji |
| Tryb AR (ściana, skala 1:1) | brak w referencjach | model-viewer: WebXR/Scene Viewer/Quick Look, `ar-placement="wall"`, `ar-scale="fixed"`, worker GLB+USDZ | 6 | done (wymaga testu na urządzeniach) | telefon ustawia drzwi na ścianie w skali; checklist manualny w docs |
| Panel admina white-label | brak w referencjach | pełny panel: branding, katalog, assety, reguły, cenniki, BOM, szablony, użytkownicy | 2 | done | zmiana koloru i nazwy pola w adminie widoczna w konfiguratorze bez deployu |
| Mapowanie dowolnych meshy bez zmian kodu | romi-mc (idea) | drzewo GLB w adminie, przypisywanie ról klikiem, zapis `nodeBindings` po ścieżce indeksów (działa dla nienazwanych węzłów) | 2-3 | done | upload GLB z innymi nazwami meshy → mapowanie → publikacja → poprawny render |
| Multi-tenant + izolacja | brak w referencjach | `tenantId` w każdej encji domenowej, scoping w serwisach, testy izolacji | 1 | done | test: użytkownik tenanta A nie odczyta danych tenanta B |
| Silnik reguł deklaratywnych | brak w referencjach | JSON warunki (AND/OR/NOT, porównania, zbiory) + efekty (require/exclude/set/warn/error/limit), wersje draft/published | 4 | done | testy jednostkowe reguł; reguła ostrzegająca i blokująca w seedzie |
| Cennik serwerowy | brak w referencjach | PriceList + reguły (baza, dopłaty, macierz wymiarowa, usługi, min, VAT, zaokrąglenia), snapshot przy zapisie | 4 | done | cena nie występuje w kodzie frontendu; test macierzy wymiarowej |
| BOM wewnętrzny | brak w referencjach | receptury + pozycje z formułami deklaratywnymi; endpoint tylko dla ról `production`/`tenant_admin`/`platform_owner` | 5 | done | rola `sales` dostaje 403; publiczny PDF nie zawiera BOM |

## Funkcje odrzucone lub przesunięte — uzasadnienia

1. **CSG w MVP** — odrzucone: geometria produktu pochodzi wyłącznie z GLB (zasada bezwzględna nr 20); dostarczone modele wystarczają na pełne demo. Kontrakt operacji przygotowany na przyszłość.
2. **Drugi silnik reguł w React** — odrzucone celowo (zasada 19): frontend renderuje `renderSpec`, nie podejmuje decyzji produktowych.
3. **PDF w przeglądarce** — odrzucone (bezpieczeństwo + spójność): generacja wyłącznie w workerze.
4. **Import CSV/XLSX katalogu** — przesunięte po MVP (nie blokuje Definition of Done; katalog edytowalny w adminie).
5. **Wizualizacje drzwi przesuwnych i lustrzanych** — zablokowane brakiem GLB; ścieżka konfiguracji i wycena działają, wizualizacja uczciwie oznaczona jako niedostępna (zasada 7-9: żadnych atrap).
