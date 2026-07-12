#!/usr/bin/env bash
# Uruchamia całe demo w jednym kontenerze: PostgreSQL, Redis, API, worker,
# konfigurator i reverse proxy. Przeznaczone do wdrożenia demonstracyjnego
# (np. Railway) - jeden publiczny port, jeden adres.
set -uo pipefail
cd /app

log() { echo "[start] $*"; }

# Wspólny token API<->worker (jeśli hosting nie ustawił, użyj demo).
export WORKER_TOKEN="${WORKER_TOKEN:-demo-worker-token}"
export SESSION_SECRET="${SESSION_SECRET:-demo-session-secret-change-me}"
export SIGNED_URL_SECRET="${SIGNED_URL_SECRET:-demo-signed-url-secret-change-me}"
export SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@demo.local}"
export SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-Demo1234!}"
export SEED_PLATFORM_OWNER_EMAIL="${SEED_PLATFORM_OWNER_EMAIL:-owner@platform.local}"
export SEED_PLATFORM_OWNER_PASSWORD="${SEED_PLATFORM_OWNER_PASSWORD:-Owner1234!}"

# Publiczny adres z hostingu (QR i AR muszą wskazywać zewnętrzny URL).
if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  export CONFIGURATOR_URL="https://${RAILWAY_PUBLIC_DOMAIN}"
elif [ -n "${PUBLIC_URL:-}" ]; then
  export CONFIGURATOR_URL="${PUBLIC_URL}"
fi
export API_PUBLIC_URL="${CONFIGURATOR_URL:-http://localhost:8080}"
log "Publiczny adres: ${CONFIGURATOR_URL:-(lokalny)}"

# ── PostgreSQL (dane w kontenerze - demo, ulotne) ──────────────────────────
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | head -1)"
export PGDATA=/app/var/pgdata
mkdir -p "$PGDATA" /app/var/storage
chown -R postgres:postgres /app/var
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  log "Inicjalizacja PostgreSQL..."
  su postgres -c "$PGBIN/initdb -D $PGDATA -E UTF8 --auth=trust" >/dev/null
fi
log "Start PostgreSQL..."
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-c listen_addresses=127.0.0.1 -p 5432' -w start" >/dev/null
su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='doorconf'\"" | grep -q 1 \
  || su postgres -c "createdb doorconf"
su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres'\"" >/dev/null 2>&1 || true
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/doorconf"

# ── Redis ──────────────────────────────────────────────────────────────────
log "Start Redis..."
redis-server --daemonize yes --bind 127.0.0.1 --port 6379 --save "" >/dev/null
export REDIS_URL="redis://127.0.0.1:6379"

# ── Migracje + seed ────────────────────────────────────────────────────────
log "Migracje bazy..."
pnpm --filter @door/api exec prisma migrate deploy || { log "BŁĄD migracji"; exit 1; }
log "Seed tenanta demo..."
node apps/api/dist/seed/seed.js || log "Seed pominięty/nieudany - kontynuuję."

# ── Procesy aplikacji ──────────────────────────────────────────────────────
export API_PORT=4000
export NODE_ENV=production
export CHROMIUM_PATH=/usr/bin/chromium

log "Start API (:4000)..."
node apps/api/dist/main.js &
API_PID=$!

log "Start workera..."
API_URL="http://127.0.0.1:4000" pnpm --filter @door/worker start &
WORKER_PID=$!

log "Start konfiguratora (:3000)..."
# Browser woła API po tym samym originie (proxy); SSR używa adresu wewnętrznego.
PORT=3000 API_INTERNAL_URL="http://127.0.0.1:4000" pnpm --filter @door/configurator start &
WEB_PID=$!

log "Start panelu admina (:3001, pod /panel)..."
PORT=3001 pnpm --filter @door/admin start &
ADMIN_PID=$!

# Sprzątanie przy zatrzymaniu kontenera.
trap 'kill $API_PID $WORKER_PID $WEB_PID $ADMIN_PID 2>/dev/null' TERM INT

log "Start proxy (publiczny port ${PORT:-8080})..."
exec node infra/docker/proxy.mjs
