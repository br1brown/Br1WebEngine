# =============================================================================
# Frontend - Angular build + Node SSR runtime
# =============================================================================
FROM node:22-alpine AS build

WORKDIR /app

ARG FRONTEND_BASE_URL
ENV FRONTEND_BASE_URL=${FRONTEND_BASE_URL}

# Localization congelata nel bundle a build-time (lingue, <html lang>, manifest).
# Derivate da global-settings.json da deploy.sh: il file non è nel build context.
ARG DEFAULT_LANG
ARG SUPPORTED_LANGS
ENV DEFAULT_LANG=${DEFAULT_LANG} \
    SUPPORTED_LANGS=${SUPPORTED_LANGS}

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --include=dev; else npm install; fi

COPY . .
# Esegui il linter prima della build per bloccare deploy con codice errato
RUN npm run lint
RUN npm run build
RUN npm prune --omit=dev

# =============================================================================
# Runtime - Node SSR serves Angular and proxies /api to the backend
# =============================================================================
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DIST_PATH=app

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/app ./dist/app
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN apk add --no-cache fontconfig ttf-dejavu font-roboto font-noto font-liberation wget && fc-cache -f && \
    chmod +x /docker-entrypoint.sh && \
    addgroup -S app && adduser -S -G app app && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://localhost:3000/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/app/server/server.mjs"]
