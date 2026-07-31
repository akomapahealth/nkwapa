# ── Stage 1: Install dependencies ──
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/

# Prisma generation happens after the schema is copied in the build stage.
RUN npm ci --omit=dev --ignore-scripts && \
    mkdir -p /prod_apps_api_node_modules /prod_packages_db_node_modules && \
    cp -R node_modules /prod_node_modules && \
    if [ -d apps/api/node_modules ]; then cp -R apps/api/node_modules/. /prod_apps_api_node_modules/; fi && \
    if [ -d packages/db/node_modules ]; then cp -R packages/db/node_modules/. /prod_packages_db_node_modules/; fi && \
    npm ci --ignore-scripts && \
    mkdir -p apps/api/node_modules packages/db/node_modules

# ── Stage 2: Generate Prisma & Build ──
FROM node:22-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules

COPY package.json tsconfig.base.json ./
COPY packages/db/ ./packages/db/
COPY apps/api/ ./apps/api/

RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN cd packages/db && npx tsc
RUN cd apps/api && npx tsc -p tsconfig.build.json

# ── Stage 3: Production image ──
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 app && \
    adduser --system --uid 1001 app

COPY --from=deps /prod_node_modules ./node_modules
COPY --from=deps /prod_apps_api_node_modules ./apps/api/node_modules
COPY --from=deps /prod_packages_db_node_modules ./packages/db/node_modules
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY package.json ./

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

USER app

CMD ["node", "apps/api/dist/main.js"]
