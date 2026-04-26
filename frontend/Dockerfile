# =============================================================================
# Frontend - Angular build + Node SSR runtime
# =============================================================================
FROM node:22-alpine AS build

WORKDIR /app

ARG SITEMAP_BASE_URL
ENV SITEMAP_BASE_URL=${SITEMAP_BASE_URL}

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install; fi

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# =============================================================================
# Runtime - Node SSR serves Angular and proxies /api to the backend
# =============================================================================
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/app ./dist/app

RUN addgroup -S app && adduser -S -G app app && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://localhost:3000/health" || exit 1

CMD ["node", "dist/app/server/server.mjs"]
