#!/usr/bin/env bash
# =============================================================================
# lint-check.sh  —  ESLint sul frontend (include regole accessibilità)
#
# Esegue npm run lint nella cartella frontend. Le violazioni bloccano
# anche il pre-commit hook e il job CI frontend.
#
# Utilizzo:
#   ./lint-check.sh
#
# Exit code:
#   0  Nessun errore ESLint
#   1  Una o più violazioni
#   2  npm o ESLint locale non disponibili — test saltato
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'
else
    GREEN=''; RED=''; RESET=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/../../frontend"
ESLINT_BIN="${FRONTEND_DIR}/node_modules/.bin/eslint"

if ! command -v npm >/dev/null 2>&1; then
    echo "  WARN npm non trovato — controllo ESLint saltato"
    exit 2
fi

if [[ ! -f "$ESLINT_BIN" ]]; then
    echo "  WARN ESLint non installato localmente (npm ci --include=dev mancante) — controllo saltato"
    exit 2
fi

cd "$FRONTEND_DIR"

if npm run lint --silent; then
    echo -e "  ${GREEN}OK${RESET} ESLint superato"
else
    echo -e "  ${RED}ERR${RESET} ESLint ha trovato errori" >&2
    exit 1
fi
