# Obraz demonstracyjny: całe demo w jednym kontenerze (PostgreSQL, Redis, API,
# worker, konfigurator, reverse proxy). Jeden publiczny port -> jeden adres.
# Do wdrożenia demo (np. Railway). NIE jest to układ produkcyjny - patrz
# docs/DEPLOYMENT.md dla wariantu z rozdzielonymi usługami i managed DB.
FROM node:22-bookworm-slim

# PostgreSQL, Redis, Chromium (PDF) + biblioteki uruchomieniowe przeglądarki.
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql postgresql-client redis-server \
    chromium ca-certificates openssl fonts-dejavu-core \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 libpango-1.0-0 \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable
WORKDIR /app
COPY . .

# Zależności + build wszystkich potrzebnych paczek. Konfigurator woła API po tym
# samym originie (proxy), więc NEXT_PUBLIC_API_URL jest puste (adres względny).
ENV NEXT_PUBLIC_API_URL=""
RUN pnpm install --frozen-lockfile --prod=false \
  && pnpm --filter @door/contracts build \
  && pnpm --filter @door/api exec prisma generate \
  && pnpm --filter @door/api build \
  && node scripts/prepare-seed-assets.mjs \
  && pnpm --filter @door/configurator build

ENV NODE_ENV=production
ENV STORAGE_DRIVER=fs
ENV STORAGE_FS_ROOT=/app/var/storage
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PORT=8080
EXPOSE 8080

RUN chmod +x infra/docker/start-all.sh
CMD ["bash", "infra/docker/start-all.sh"]
