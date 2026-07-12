# Wymagania assetów 3D

Stan na: 2026-07-11. Jednostki źródłowe: metry (1 jednostka glTF = 1 m). W domenie trzymamy milimetry.

## 1. Inwentaryzacja dostarczonych plików (models.zip)

Wszystkie drzwi: format glTF 2.0 (GLB), Y w górę, origin w lewym dolnym narożniku ościeżnicy, oś Z = grubość (strona A w kierunku -Z), bez kamer, bez świateł, bez animacji, **bez materiałów** (sloty nadawane w mapowaniu), węzły nienazwane (mapowanie po ścieżce indeksów węzłów).

| Plik | Źródło | Wymiar całk. [m] | Węzły (interpretacja po inspekcji geometrii) | Status |
| --- | --- | --- | --- | --- |
| basic-flat.glb | IArchway Door1 | 0.90 × 2.10 × 0.115 | 0/2: rozety A/B; 1/7: klamki A/B; 3: skrzydło (0.83×2.03×0.035); 4: ościeżnica; 5/6: zawias dolny/górny (x≈0.862, prawa strona) | użyty w seedzie |
| basic-glass.glb | IArchway Door7 | 0.90 × 2.10 × 0.115 | 0/4: pochwyty A/B; 1: ościeżnica; 2/3: zawiasy; 5/6: pasy szkła (0.058×1.827); 7: skrzydło z otworami | użyty w seedzie |
| basic-apartment-solid.glb | IArchway Door3 | 0.90 × 2.10 × 0.115 | 0/4: pochwyty A/B; 1: ościeżnica; 2/3: zawiasy; 5: listwa ozdobna; 6: skrzydło | użyty w seedzie |
| basic-double.glb | IArchway Door18 | 1.80 × 2.10 × 0.115 | 0-3: pochwyty (2 skrzydła × A/B); 4/6: listwy; 5: skrzydło prawe; 7: skrzydło lewe; 8/9 i 11/12: zawiasy L/P; 10: ościeżnica | użyty w seedzie |
| basic-hidden.glb | IArchway Door33 | 1.80 × 2.10 × 0.050 | 0/1: pochwyty A/B; 2: skrzydło strona B (172 tris, frez); 3: skrzydło strona A (płaska); 4: zabudowa ścienna | użyty w seedzie (osobne meshe stron A i B) |
| basic-frame.glb | IArchway Door38 | 1.80 × 2.10 × 0.050 | 0: skrzydło strona A; 1: skrzydło strona B (frez); 2/3: pochwyty A/B; 4: przeszklenie górne (0.38×0.71); 5: zabudowa | użyty w seedzie |
| basic-apartment-secure.glb | IArchway Door46 | 1.80 × 2.10 × 0.050 | lustrzana kompozycja Door38 (przeszklenie po lewej) | użyty w seedzie jako wariant lustrzany DIN |
| interior_trim_assets.glb / " low" | Sketchfab (autor nieznany) | 5.67 × 2.28 × 1.30 (pakiet) | listwy, opaski, ościeża, zawiasy, gałki, kratki, lampy | **WYKLUCZONY — licencja niepotwierdzona** (patrz LICENSE_AUDIT §3.2) |

Podział na moduły: skrypt `scripts/prepare-seed-assets.mjs` dzieli każdy plik źródłowy na moduł `door_leaf` (skrzydło + okucia + szkło jako części) i `frame` (ościeżnica/zabudowa), zachowując oryginalne współrzędne. Anchory (`hinge_axis`, `handle_center`) wyliczane automatycznie z bboxów węzłów i zapisywane w manifeście. To modyfikacja dozwolona licencją źródła; żadna geometria nie jest tworzona.

## 2. Manifest wymaganych kluczy assetów

| Klucz | Przeznaczenie | Wymagana skala/pivot | Rola | Status |
| --- | --- | --- | --- | --- |
| door.solid.single.base | drzwi pełne, skrzydło+rama | 1u=1m, pivot: lewy dolny róg ramy, montaż: ściana | door_leaf + frame | DOSTARCZONY (Door1, Door3) |
| door.glass.single.base | drzwi szklane | jw. | door_leaf(+glass) + frame | DOSTARCZONY (Door7) |
| door.hidden.single.base | drzwi ukryte, zlicowane | jw. | door_leaf + frame(hidden) | DOSTARCZONY (Door33) |
| door.double.swing.base | dwuskrzydłowe | jw. | active_leaf + passive_leaf + frame | DOSTARCZONY (Door18) |
| door.toplight.single.base | skrzydło z przeszkleniem górnym | jw. | door_leaf + glass + frame | DOSTARCZONY (Door38/46) |
| door.sliding.wall.single | drzwi przesuwne naścienne | jw.; pivot: lewy dolny róg światła przejścia | door_leaf + sliding_rail + sliding_cover | **BRAK** |
| door.mirrored.single.base | drzwi lustrzane | jw. | door_leaf + mirror | **BRAK** |
| frame.adjustable.base | ościeżnica regulowana (osobna bryła) | 1u=1m, pivot jw. | frame | BRAK (w seedach rama jest częścią pliku modelu — wystarcza na demo) |
| frame.hidden.base | ościeżnica ukryta | jw. | frame | BRAK (jw., Door33 zawiera zabudowę) |
| hardware.handle.default | klamka wymienna (warianty do wyboru) | 1u=1m, pivot: oś rozety | handle_inside/outside | **BRAK** (seedy mają klamki wbudowane w plik modelu — działa widoczność i kolor, nie podmiana bryły) |
| hardware.pull.default | pochwyt do przesuwnych | jw. | handle_inside/outside | **BRAK** |
| hardware.threshold.default | próg | 1u=1m, pivot: lewy dolny róg | threshold | **BRAK** |
| sidelight.left/right, toplight.base | naświetla | 1u=1m, pivot: dolna krawędź przy ramie | sidelight_left/right, toplight | **BRAK** |

## 3. ZBIORCZA LISTA BRAKUJĄCYCH GLB (prośba do właściciela projektu)

Aby odblokować pełną wizualizację wszystkich sześciu kategorii i wymianę okuć, proszę o dostarczenie poniższych uproszczonych publicznych modeli. Wymagania wspólne: GLB (glTF 2.0), 1 jednostka = 1 metr, oś Y w górę, przód w -Z, bez kamer/świateł, bez tekstur produkcyjnych, geometria uproszczona (wizualna), nazwy węzłów dowolne (mapowanie robimy w panelu).

1. **Drzwi przesuwne naścienne** (`door.sliding.wall.single`) — skrzydło ok. 0.9×2.05 m, osobne węzły: skrzydło, prowadnica (długość ok. 2× szerokość skrzydła), maskownica, pochwyt; pivot: lewy dolny róg światła otworu; polityka skalowania: szerokość/wysokość skrzydła niezależnie, prowadnica skalowana tylko w osi X.
2. **Drzwi lustrzane** (`door.mirrored.single.base`) — skrzydło 0.9×2.1 m z wydzielonym węzłem tafli lustra (osobny materiał), rama/ościeżnica jak w pozostałych; wariant lustro strona A, opcjonalnie A+B.
3. **Klamki wymienne** (`hardware.handle.*`) — 2-3 warianty (dźwignia prosta, dźwignia łukowa, gałka), każdy jako osobny GLB, pivot w osi rozety, przód w -Z; ok. 0.15 m długości dźwigni.
4. **Pochwyt do drzwi przesuwnych** (`hardware.pull.default`) — muszla lub listwa, pivot w środku, wysokość ok. 0.3 m.
5. **Próg** (`hardware.threshold.default`) — belka 0.9×0.02×0.06 m, pivot lewy dolny róg, skalowanie tylko w osi X.
6. **Naświetla** (`sidelight.left`, `sidelight.right`, `toplight.base`) — rama + tafla szkła jako osobne węzły; boczne ok. 0.35×2.1 m, górne ok. 0.9×0.35 m; pivot: narożnik przylegający do ościeżnicy.
7. **Potwierdzenie licencji pakietu trim** (`interior_trim_assets.glb`) — autor, link, licencja; do tego czasu zawiasy/gałki/kratki z tego pakietu nie są używane.

Braki są widoczne w panelu admina jako status `MISSING_ASSET` przy kategoriach "Drzwi przesuwne" i "Drzwi lustrzane"; publiczny konfigurator pokazuje dla nich uczciwy komunikat zamiast wizualizacji (wycena i zapis działają).

## 4. Walidacja przy uploadzie (egzekwowana w API)

- poprawny nagłówek GLB i JSON glTF 2.0
- limit rozmiaru (domyślnie 50 MB, konfigurowalny)
- brak kamer i świateł (ostrzeżenie + automatyczne czyszczenie kopii publicznej)
- liczba trójkątów i tekstur w budżecie tenanta (ostrzeżenie/odrzucenie)
- wyliczenie bounding box i sugerowanych wymiarów bazowych
- checksum SHA-256, wersjonowanie
- publikacja zablokowana bez: roli semantycznej, wymiarów bazowych, polityki skalowania, pivotu, płaszczyzny montażu i wymaganych mapowań węzłów
