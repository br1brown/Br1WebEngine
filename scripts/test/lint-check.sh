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
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'
else
    GREEN=''; RED=''; RESET=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/../../frontend"

cd "$FRONTEND_DIR"

if npm run lint --silent; then
    echo -e "  ${GREEN}OK${RESET} ESLint superato"
else
    echo -e "  ${RED}ERR${RESET} ESLint ha trovato errori" >&2
    exit 1
fi
