# =============================================================================
# Frontend - Angular build + Node SSR runtime
# =============================================================================
FROM node:22-alpine AS build

WORKDIR /app

ARG SITEMAP_BASE_URL
ENV SITEMAP_BASE_URL=${SITEMAP_BASE_URL}

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# =============================================================================
# Runtime - Node SSR serves Angular and proxies /api to the backend
# =============================================================================
FROM node:22-alpine

# Angular dist output path.
# Default: br1-web-engine (template project name).
# Override with: docker build --build-arg DIST_PATH=... ./frontend
ARG DIST_PATH=br1-web-engine
ENV NODE_ENV=production \
    DIST_PATH=${DIST_PATH} \
    PORT=3000 \
    BACKEND_PORT=8080

WORKDIR /app

COPY docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/${DIST_PATH} ./dist/${DIST_PATH}

RUN chmod +x /docker-entrypoint.sh \
    && adduser -D -u 1000 appuser \
    && chown -R appuser:appuser /app /docker-entrypoint.sh

USER appuser

EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
