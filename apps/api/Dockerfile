# API-image (NestJS + Prisma + Puppeteer/Chromium) — B-312 / WP-C4 / DEP-8.
#
# Bouwen vanuit de REPO-ROOT (pnpm-workspace: de API hangt aan
# @inspexi/entitlements en @inspexi/calibration):
#
#   docker build -f apps/api/Dockerfile -t inspexi-api .
#
# Kritiek in deze image (zie docs/herstelplan/RUNBOOK-DEPLOY.md stap 4):
# - `chromium` + `PUPPETEER_EXECUTABLE_PATH`: Puppeteer-documentgeneratie
#   (apps/api/src/modules/document-generation/pdf-generation.service.ts).
# - `fonts-noto-cjk` (B-312): zonder CJK-font verdwijnen Chinese/Japanse/
#   Koreaanse tekens STIL uit gegenereerde PDF's (Chromium tekent geen
#   tofu-blokjes); de render-CSS verwijst expliciet naar 'Noto Sans CJK SC'.
#   Alleen in de echte image te testen — macOS-fallback maskeert het gemis.
# - `NODE_ENV=production` als default (DEP-8): JWT-uniciteitscheck, throttling
#   en Swagger-uit hangen eraan; de seed-guard weigert dan seeds.
#
# NB: de Prisma-CLI (devDependency) zit bewust NIET in de runtime —
# `prisma migrate deploy` draait volgens het runbook vanuit de repo-checkout,
# niet vanuit de container. De gegenereerde Prisma-client + query-engine
# (linux/OpenSSL 3) zitten wél in de image (prisma generate in /deploy).

FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    # Systeem-Chromium wordt gebruikt; geen eigen browser-download van Puppeteer.
    PUPPETEER_SKIP_DOWNLOAD=1
RUN corepack enable

# ── Build: workspace-install → packages + prisma generate → nest build ──────
FROM base AS build
# openssl is nodig voor Prisma's binary-target-detectie: zonder valt `prisma
# generate` terug op openssl-1.1.x en mist de runtime z'n query-engine.
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# Manifests eerst voor een cachebare install-laag.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/entitlements/package.json packages/entitlements/package.json
COPY packages/calibration/package.json packages/calibration/package.json
RUN pnpm install --frozen-lockfile --filter api...

COPY packages ./packages
COPY apps/api ./apps/api

# Workspace-packages bouwen (main → dist/), Prisma-client genereren, API bouwen.
RUN pnpm --filter "@inspexi/*" run build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api run build

# Slanke, op zichzelf staande prod-tree: node_modules zonder devDeps, met de
# workspace-packages als echte packages erin. Daarna de Prisma-client opnieuw
# genereren ín de deploy-tree (de client + query-engine leven in node_modules
# en komen niet mee met `pnpm deploy`).
RUN pnpm --filter api --prod --legacy deploy /deploy \
 && cp -R apps/api/dist /deploy/dist \
 && pnpm --filter api exec prisma generate --schema /deploy/prisma/schema.prisma

# ── Runtime: Chromium + fonts (incl. CJK) + de deploy-tree ──────────────────
FROM base AS runtime

# fonts-noto-cjk is hier de B-312-borging — NIET verwijderen.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      chromium \
      fonts-noto-cjk \
      fonts-liberation \
      fonts-dejavu \
      openssl \
      curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    API_PORT=3000 \
    UPLOAD_DIR=/app/uploads

WORKDIR /app
COPY --from=build --chown=node:node /deploy /app
RUN mkdir -p /app/uploads && chown node:node /app/uploads

# Niet als root draaien: Chromium start met --no-sandbox (zie
# pdf-generation.service.ts) en hoort dan zeker geen root te zijn.
USER node

EXPOSE 3000

# /api/v1/health is @Public en subdomein-vrij (DEP-3).
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main"]
