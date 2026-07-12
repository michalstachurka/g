# ADR-0004: Podział seedowych GLB na moduły

Status: przyjęte, 2026-07-11

## Kontekst
Dostarczone pliki IArchway zawierają w jednym GLB skrzydło, ościeżnicę i okucia (osobne węzły,
bez nazw). Spec wymaga demonstracji składania drzwi z kilku plików GLB oraz zakazuje tworzenia
geometrii produktu.

## Decyzja
Skrypt `scripts/prepare-seed-assets.mjs` (gltf-transform) dzieli każdy plik źródłowy na dwa GLB:
moduł skrzydła (skrzydło+okucia+szkło jako części) i moduł ościeżnicy. Węzły są wyłącznie
przenoszone — bez syntezowania geometrii. Anchory wyliczane z bboxów istniejących węzłów.
Licencja źródła dopuszcza modyfikację.

## Konsekwencje
Ścieżka demo składa konfigurację z >=2 GLB; kolor ościeżnicy niezależny od skrzydła.
