# ADR-0001: Baza projektu pisana od zera

Status: przyjęte, 2026-07-11

## Kontekst
Specyfikacja dopuszcza start od nowego repozytorium albo od kodu `maxjvjohansson/3d-configurator` (MIT).
Repozytorium docelowe było puste. W środowisku budowy dostęp do zewnętrznych repozytoriów jest
ograniczony, więc treści licencji projektów referencyjnych nie dało się zweryfikować u źródła.

## Decyzja
Cały kod powstaje od zera w tym repozytorium. Z projektów referencyjnych nie kopiujemy kodu,
assetów, tekstur ani nazewnictwa. Ich zakres funkcjonalny odtwarzamy własną implementacją
(macierz: docs/REFERENCE_ANALYSIS.md).

## Konsekwencje
- zero ryzyka licencyjnego po stronie kodu aplikacji
- THIRD_PARTY_NOTICES obejmuje wyłącznie zależności npm
- większy nakład pracy własnej, w zamian pełna kontrola nad architekturą renderSpec/manifestów
