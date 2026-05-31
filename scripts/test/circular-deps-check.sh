#!/usr/bin/env bash
# =============================================================================
# circular-deps-check.sh  —  Rilevatore generico di cicli di import pericolosi
#
# Esegue circular-deps.mjs: analizza l'AST TypeScript del frontend, costruisce
# il grafo degli import di valore (gli `import type` sono cancellati da tsc),
# distingue gli usi eager (a livello di modulo) da quelli lazy (dentro
# funzioni/metodi/campi → es. `inject()`), simula l'ordine di valutazione dei
# moduli ES dai veri entry point e fallisce solo se un modulo legge un binding
# di un modulo del ciclo non ancora inizializzato (errore di init reale).
#
# I cicli leciti di Dependency Injection restano verdi.
#
# Utilizzo:
#   ./circular-deps-check.sh
#
# Exit code:
#   0  Nessun ciclo eager pericoloso
#   1  Ciclo eager pericoloso (rischio binding `undefined` all'init)
#   2  Node.js/TypeScript non disponibili — test saltato
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'
else
    GREEN=''; RED=''; RESET=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
    echo "  WARN Node.js non trovato — controllo dipendenze cicliche saltato"
    exit 2
fi

set +e
node "${SCRIPT_DIR}/circular-deps.mjs"
code=$?
set -e

case $code in
    0) echo -e "  ${GREEN}OK${RESET} Nessuna dipendenza ciclica pericolosa" ;;
    2) exit 2 ;;
    *) echo -e "  ${RED}ERR${RESET} Dipendenza ciclica pericolosa rilevata" >&2; exit 1 ;;
esac
