#!/usr/bin/env bash
# =============================================================================
# run-all.sh  —  Orchestratore: esegue tutti gli script di test in sequenza
#
# Chiama ogni script di test uno per uno, raccoglie i fallimenti e riporta
# il risultato complessivo. Progettato per deploy.sh (fase isolata di Pre-flight)
# e per audit completi in locale.
#
# Utilizzo:
#   ./run-all.sh [BASE_URL]
#
# Esempio:
#   ./run-all.sh http://localhost:3000
#
# Exit code:
#   0  Tutti i test superati (o saltati se opzionali)
#   1  Uno o più test falliti (o obbligatori saltati)
#
# Come dichiarare un test obbligatorio:
#   run_test --required "Nome" script.sh
#   → se lo script non può girare (exit 2), il deploy viene bloccato.
#   Senza --required il test è opzionale: salta senza bloccare.
#
# Limitazione nota — test sull'host, non nei container:
#   Questo script gira sulla macchina host, non dentro Docker. Se sull'host
#   mancano node/npm (scenario tipico su una VPS dove Node è solo nell'immagine
#   del frontend), i test che li richiedono escono con exit 2 e vengono saltati.
#   In CI non è un problema perché il workflow installa node prima di chiamare
#   questo script. Sulla VPS i test statici (lint, tsc, i18n) saltano sempre;
#   quelli live (a11y, lighthouse) saltano se manca anche il server.
#   Se un giorno node fosse installato sull'host, tutto girerebbe normalmente.
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${1:-http://localhost:3000}"

FAILURES=0

# -----------------------------------------------------------------------------
# run_test [--required] "Nome" script.sh [args...]
#
# Exit code dello script figlio:
#   0  → OK
#   1  → fallito  → sempre un errore
#   2  → saltato  → errore solo se --required
# -----------------------------------------------------------------------------
run_test() {
    local required=false
    if [[ "${1:-}" == "--required" ]]; then
        required=true
        shift
    fi

    local name="$1"; shift

    echo
    echo -e "${BOLD}══ ${name} ══${RESET}"

    local exit_code=0
    bash "$@" || exit_code=$?

    case $exit_code in
        0)
            ;;
        2)
            if $required; then
                echo -e "  ${RED}ERR${RESET} Test obbligatorio saltato — strumenti non disponibili" >&2
                FAILURES=$((FAILURES + 1))
            fi
            ;;
        *)
            FAILURES=$((FAILURES + 1))
            ;;
    esac
}

# Ordine: statici prima (veloci, nessun server), live dopo (richiedono BASE_URL).
# i18n e tsc prima di a11y/lighthouse perché fallire su un errore di tipo
# o una chiave mancante è più veloce e informativo di un errore a runtime.
#
# Aggiungi --required ai test che DEVONO girare; senza flag sono opzionali.
run_test "Lint"                 "${SCRIPT_DIR}/lint-check.sh"
run_test "Completezza i18n"     "${SCRIPT_DIR}/i18n-check.sh"
run_test "TypeScript"           "${SCRIPT_DIR}/tsc-check.sh"
run_test "Dipendenze cicliche"  "${SCRIPT_DIR}/circular-deps-check.sh"
run_test           "Accessibilità (WCAG)" "${SCRIPT_DIR}/a11y-test.sh"       "${BASE_URL}"
run_test           "Budget Lighthouse"    "${SCRIPT_DIR}/lighthouse-test.sh" "${BASE_URL}"

echo

if [[ $FAILURES -gt 0 ]]; then
    echo -e "  ${RED}ERR${RESET} ${FAILURES} test/i fallito/i"
    exit 1
fi

echo -e "  ${GREEN}OK${RESET} Tutti i test superati"
exit 0
