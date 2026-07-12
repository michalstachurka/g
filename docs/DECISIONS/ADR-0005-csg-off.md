# ADR-0005: CSG wyłączone w MVP

Status: przyjęte, 2026-07-11

Dostarczone GLB pokrywają ścieżki demo, a spec zabrania zastępowania GLB przez CSG i nakazuje
zgodność klient/worker przed publikacją do AR. W MVP flaga featureFlags.csg=false dla wszystkich
tenantów; kontrakt deklaratywnych operacji (whitelista glass_division) jest zdefiniowany w
packages/contracts, bez implementacji wykonawczej. Włączenie wymaga: implementacji w viewerze,
identycznej implementacji w workerze eksportu, testów zgodności i limitów złożoności.
