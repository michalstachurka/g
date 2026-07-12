#!/usr/bin/env bash
# Przygotowuje środowisko sesji web: usługi, zależności, klient Prisma, moduły GLB.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

service postgresql start >/dev/null 2>&1 || true
redis-server --daemonize yes >/dev/null 2>&1 || true
sleep 2

if [ ! -d node_modules ] || [ ! -d node_modules/.pnpm ]; then
  pnpm install --prefer-offline >/dev/null 2>&1 || pnpm install
fi

# Klient Prisma i build kontraktów potrzebne do typecheck/testów.
pnpm --filter @door/api exec prisma generate >/dev/null 2>&1 || true
pnpm --filter @door/contracts build >/dev/null 2>&1 || true

# Moduły GLB (jeśli brak) - potrzebne do testów inspektora i seeda.
[ -d assets/seed-modules ] || node scripts/prepare-seed-assets.mjs >/dev/null 2>&1 || true

echo "Sesja gotowa: Postgres+Redis wystartowane, zależności i klient Prisma dostępne."
