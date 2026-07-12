# ADR-0006: DIN lewy/prawy przez kompozycję anchorów

Status: przyjęte, 2026-07-11

## Decyzja
Zmiana DIN odbywa się na backendzie w builderze renderSpec:
1) oś zawiasów i pozycja klamki odbijane względem pionowej osi środka światła drzwi (mm),
2) kierunek animacji = f(DIN, inward/outward),
3) części oznaczane `mirrored` tylko gdy manifest assetu ma mirrorPolicy=allow (assety bez tekstu/logo,
   geometrycznie symetryczne); w innym wypadku wymagany osobny wariant assetu — publikacja wariantu
   DIN bez takiego wariantu kończy się błędem walidacji,
4) viewer wykonuje odbicie na poziomie klonu geometrii części (odwrócenie windingu + przeliczenie
   normalnych), nigdy globalnym scale(-1) sceny.

Seedy IArchway: geometria symetryczna, bez tekstów — mirrorPolicy=allow (zweryfikowane inspekcją).
