#!/usr/bin/env bash
# =============================================================================
# site-builder-check.sh  —  Invarianti statiche di SiteBuilder (Engine)
#
# Esegue site-builder-invariants.ts via tsx: costruisce ContestoSito (site.ts) come lo
# farebbe l'SSR e verifica invarianti che ogni figlio eredita — es. che gli audit live
# (Pa11y/Lighthouse) restino alla sola lingua di default mentre la sitemap copra tutte le
# lingue configurate (hreflang). Puramente statico: nessun server necessario, gira prima
# e più veloce degli audit live (stesso spirito di i18n-check.sh/tsc-check.sh).
#
# Utilizzo:
#   ./site-builder-check.sh
#
# Exit code:
#   0  Invarianti rispettate
#   1  Una o più invarianti violate
#   2  Dipendenze non disponibili (npm ci non eseguito, o environment.ts non generato) — test saltato
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'
else
    GREEN=''; RED=''; RESET=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/../../frontend"
TSX_BIN="${FRONTEND_DIR}/node_modules/.bin/tsx"

if ! command -v node >/dev/null 2>&1; then
    echo "  WARN Node.js non trovato — controllo invarianti SiteBuilder saltato"
    exit 2
fi

if [[ ! -x "$TSX_BIN" ]]; then
    echo "  WARN tsx non installato localmente (npm ci mancante) — controllo invarianti SiteBuilder saltato"
    exit 2
fi

if [[ ! -f "${FRONTEND_DIR}/src/environments/environment.ts" ]]; then
    echo "  WARN environment.ts non generato (esegui 'npm run generate:statics' in frontend/) — controllo saltato"
    exit 2
fi

cd "$FRONTEND_DIR"

if "$TSX_BIN" src/app/core/engine/scripts/checks/site-builder-invariants.ts; then
    echo -e "  ${GREEN}OK${RESET} Invarianti SiteBuilder rispettate"
else
    echo -e "  ${RED}ERR${RESET} Invarianti SiteBuilder violate" >&2
    exit 1
fi
