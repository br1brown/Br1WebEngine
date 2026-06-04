#!/usr/bin/env bash
# =============================================================================
# tsc-check.sh  —  Type-check del frontend senza emettere file
#
# Esegue tsc --noEmit sul progetto Angular. Cattura errori di tipo che il
# build production potrebbe ignorare o che emergono solo a runtime.
#
# Utilizzo:
#   ./tsc-check.sh
#
# Exit code:
#   0  Nessun errore di tipo
#   1  Uno o più errori TypeScript
#   2  Node.js o TypeScript locale non disponibili — test saltato
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'
else
    GREEN=''; RED=''; RESET=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/../../frontend"
TSC_BIN="${FRONTEND_DIR}/node_modules/typescript/bin/tsc"

if ! command -v node >/dev/null 2>&1; then
    echo "  WARN Node.js non trovato — controllo tsc saltato"
    exit 2
fi

if [[ ! -f "$TSC_BIN" ]]; then
    echo "  WARN TypeScript non installato localmente (npm ci --include=dev mancante) — controllo tsc saltato"
    exit 2
fi

cd "$FRONTEND_DIR"

if node "$TSC_BIN" --noEmit; then
    echo -e "  ${GREEN}OK${RESET} Controllo dei tipi TypeScript superato"
else
    echo -e "  ${RED}ERR${RESET} Controllo dei tipi TypeScript fallito" >&2
    exit 1
fi
