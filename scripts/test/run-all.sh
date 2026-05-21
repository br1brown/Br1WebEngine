#!/usr/bin/env bash
# =============================================================================
# run-all.sh  —  Orchestratore: esegue tutti gli script di test in sequenza
#
# Chiama ogni script di test uno per uno, raccoglie i fallimenti e riporta
# il risultato complessivo. Progettato per deploy.sh --run-tests e per
# audit completi in locale.
#
# Utilizzo:
#   ./run-all.sh [BASE_URL]
#
# Esempio:
#   ./run-all.sh http://localhost:3000
#
# Exit code:
#   0  Tutti i test superati
#   1  Uno o più test falliti
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; RED=''; RESET=''
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${1:-http://localhost:3000}"

FAILURES=0

run_test() {
    local name="$1"; shift
    echo
    echo -e "${BOLD}══ ${name} ══${RESET}"
    if bash "$@"; then
        return 0
    else
        FAILURES=$((FAILURES + 1))
        return 0
    fi
}

run_test "Lint"                 "${SCRIPT_DIR}/lint-check.sh"
run_test "i18n completeness"    "${SCRIPT_DIR}/i18n-check.sh"
run_test "TypeScript"           "${SCRIPT_DIR}/tsc-check.sh"
run_test "Accessibility (WCAG)" "${SCRIPT_DIR}/a11y-test.sh"       "${BASE_URL}"
run_test "Lighthouse budgets"   "${SCRIPT_DIR}/lighthouse-test.sh"  "${BASE_URL}"

echo

if [[ $FAILURES -gt 0 ]]; then
    echo -e "  ${RED}ERR${RESET} ${FAILURES} test/i fallito/i"
    exit 1
fi

echo -e "  ${GREEN}OK${RESET} Tutti i test superati"
exit 0
