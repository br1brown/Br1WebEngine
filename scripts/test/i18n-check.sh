#!/usr/bin/env bash
# =============================================================================
# i18n-check.sh  —  Verifica simmetria chiavi EN↔IT nei file i18n
#
# Controlla che ogni chiave presente nel file EN esista anche in IT e
# viceversa, per ciascuna coppia (basic, addon).
#
# Utilizzo:
#   ./i18n-check.sh
#
# Exit code:
#   0  Tutte le chiavi presenti in entrambe le lingue
#   1  Una o più chiavi mancanti
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

info() { echo -e "  ${BOLD}[info]${RESET} $*"; }
ok()   { echo -e "  ${GREEN}OK${RESET} $*"; }
fail() { echo -e "  ${RED}ERR${RESET} $*" >&2; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

if ! command -v node >/dev/null 2>&1; then
    echo "  WARN Node.js non trovato — i18n check saltato"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
I18N_DIR="${SCRIPT_DIR}/../../frontend/src/assets/i18n"

check_pair() {
    local name="$1" file_en="$2" file_it="$3"
    info "Checking ${name}: $(basename "$file_en") ↔ $(basename "$file_it")"

    node_exit=0
    node -e "
const fs = require('fs');
const en = Object.keys(JSON.parse(fs.readFileSync('${file_en}', 'utf8')));
const it = Object.keys(JSON.parse(fs.readFileSync('${file_it}', 'utf8')));
const enSet = new Set(en);
const itSet = new Set(it);
const missingInIt = en.filter(k => !itSet.has(k));
const missingInEn = it.filter(k => !enSet.has(k));
missingInIt.forEach(k => console.error('    missing in IT: ' + k));
missingInEn.forEach(k => console.error('    missing in EN: ' + k));
process.exit(missingInIt.length + missingInEn.length > 0 ? 1 : 0);
" || node_exit=$?

    if [[ $node_exit -eq 0 ]]; then
        ok "${name}"
    else
        fail "${name} — chiavi non sincronizzate (vedi sopra)"
        return 1
    fi
}

FAILURES=0

check_pair "basic" "${I18N_DIR}/basic.en.json" "${I18N_DIR}/basic.it.json" || FAILURES=$((FAILURES + 1))
echo
check_pair "addon" "${I18N_DIR}/addon.en.json" "${I18N_DIR}/addon.it.json" || FAILURES=$((FAILURES + 1))
echo

if [[ $FAILURES -gt 0 ]]; then
    fail "${FAILURES} coppia/e con chiavi non sincronizzate"
    exit 1
fi

ok "i18n completeness check superato"
exit 0
