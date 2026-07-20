# Third Party Notices

Ten produkt korzysta z otwartoźródłowych bibliotek npm. Poniżej najważniejsze
zależności produkcyjne i ich licencje. Pełne podsumowanie generuje
`pnpm run licenses:check` (skrypt `scripts/license-check.mjs`), który zawodzi
build, jeżeli w drzewie pojawi się licencja spoza listy dozwolonych.

Cały kod aplikacji w tym repozytorium został napisany od zera (ADR-0001).
Z projektów referencyjnych nie skopiowano kodu, modeli, tekstur ani innych
zasobów. Assety 3D użyte w seedzie demonstracyjnym pochodzą z IArchway na
licencji dokumentowanej w `assets/source-models/door-model-sources.json` oraz
`docs/LICENSE_AUDIT.md`.

## Kluczowe zależności produkcyjne

| Pakiet | Licencja | Zastosowanie |
| --- | --- | --- |
| next, react, react-dom | MIT | frontendy (configurator, admin) |
| three | MIT | silnik 3D |
| @react-three/fiber, @react-three/drei | MIT | React renderer dla three |
| @google/model-viewer | Apache-2.0 | warstwa AR (WebXR/Scene Viewer/Quick Look) |
| @nestjs/* | MIT | backend API |
| prisma, @prisma/client | Apache-2.0 | ORM i migracje |
| zod | MIT | walidacja kontraktów i DTO |
| bullmq, ioredis | MIT | kolejki zadań workera |
| @gltf-transform/core, /functions | MIT | inspekcja i składanie GLB |
| argon2 | MIT | hashowanie haseł (argon2id) |
| playwright-core | Apache-2.0 | serwerowe PDF i render |
| qrcode | MIT | generowanie kodów QR |
| @tanstack/react-query | MIT | dane serwerowe we frontendach |
| zustand | MIT | lokalny stan interakcji konfiguratora |
| tailwindcss | MIT | style UI |

## Wyjątki udokumentowane

- `webgl-constants` (tranzytywna zależność three/drei): pole `license` puste w
  package.json, pakiet zawiera plik LICENSE z treścią MIT (autor T. van Scherpenzeel).
- `@img/sharp-libvips-*` (tranzytywna, opcjonalna zależność sharp/Next.js image):
  LGPL-3.0-or-later, linkowanie dynamiczne - patrz `docs/DECISIONS/ADR-0007-lgpl-libvips.md`.

Pełne teksty licencji poszczególnych pakietów znajdują się w ich katalogach w
`node_modules`. Aby wygenerować aktualne zestawienie, uruchom
`pnpm run licenses:check`.

## Tekstury sceny loftowej (tymczasowe)
- `apps/configurator/public/textures/{brick,wood}/` - pliki `brick_*`/`hardwood2_*`
  z repozytorium three.js (https://github.com/mrdoob/three.js), licencja MIT.
  Oznaczone jako tymczasowe - do podmiany na zestawy CC0 (Poly Haven/ambientCG)
  po otwarciu dostępu sieciowego środowiska. Szczegóły:
  apps/configurator/public/textures/LICENSES.md
