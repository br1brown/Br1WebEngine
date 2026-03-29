# =============================================================================
# Frontend — Angular build + Nginx
# =============================================================================
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN npm run build

# =============================================================================
# Esecuzione — Nginx serve i file statici + proxy API al backend
# =============================================================================
FROM nginx:alpine

# Rimuovi la config predefinita di Nginx
RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copia build Angular
COPY --from=build /app/dist/br1-web-engine/browser /usr/share/nginx/html

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
