# ADR-0007: LGPL libvips przez sharp (linkowanie dynamiczne)

Status: przyjęte, 2026-07-11

## Kontekst
Kontrola licencji wykryła `@img/sharp-libvips-*` na licencji LGPL-3.0-or-later.
Pakiet jest tranzytywną, opcjonalną zależnością `sharp` (Apache-2.0), którego
Next.js używa do optymalizacji obrazów. libvips jest ładowany jako biblioteka
natywna (linkowanie dynamiczne).

## Decyzja
Dopuszczamy użycie. LGPL-3.0 zezwala na dynamiczne linkowanie z oprogramowaniem
o innej licencji bez nakładania LGPL na nasz kod. Nie modyfikujemy libvips i nie
dystrybuujemy go w formie statycznie zlinkowanej. Wpis dodany do wyjątków w
`scripts/license-check.mjs` i do `docs/LICENSE_AUDIT.md`.

## Alternatywa
Wyłączenie optymalizacji obrazów Next (`images.unoptimized`) usuwa sharp z drzewa
produkcyjnego. Do rozważenia, jeżeli klient wymaga eliminacji zależności LGPL.
