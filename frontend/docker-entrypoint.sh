#!/bin/sh
# Avvia il server Node SSR del frontend Angular.
PORT="${PORT:-3000}"
DIST_PATH="${DIST_PATH:-app}"

echo "[entrypoint] PORT=${PORT}"

exec node "/app/dist/${DIST_PATH}/server/server.mjs"
