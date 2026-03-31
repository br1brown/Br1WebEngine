#!/bin/sh
# Sostituisce i placeholder nei file JS buildati con i valori delle env vars.
# Se la variabile non e' impostata, il placeholder viene rimosso (stringa vuota).
#
# Placeholder supportati:
#   __API_URL__  →  URL base del backend (vuoto = stesso dominio via Nginx proxy)
#   __API_KEY__  →  API key per il backend (predefinita: frontend)

# --- Controllo placeholder non sostituiti ---
if [ "$PROJECT_NAME" = "CHANGE_ME" ]; then
    echo "ERRORE: PROJECT_NAME contiene ancora il placeholder. Impostare un valore reale nel file .env"
    exit 1
fi

API_URL="${API_URL:-}"
API_KEY="${API_KEY:-frontend}"

echo "[entrypoint] API_URL=${API_URL:-<vuoto, usa proxy Nginx>}"
echo "[entrypoint] API_KEY=${API_KEY}"

# Escape dei caratteri speciali sed nei valori delle variabili
escape_sed() {
    printf '%s' "$1" | sed 's/[&/\]/\\&/g'
}

API_URL_ESCAPED=$(escape_sed "$API_URL")
API_KEY_ESCAPED=$(escape_sed "$API_KEY")

# Sostituisci nei file JS buildati
find /usr/share/nginx/html -name '*.js' -exec \
    sed -i "s|__API_URL__|${API_URL_ESCAPED}|g;s|__API_KEY__|${API_KEY_ESCAPED}|g" {} +

exec nginx -g 'daemon off;'
