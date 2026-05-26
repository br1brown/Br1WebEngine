#!/usr/bin/env bash
# =============================================================================
# i18n-check.sh  —  Verifica completezza file i18n per tutte le lingue
#
# Legge le lingue disponibili da ContestoSito.config.availableLanguages
# (frontend/src/app/site.ts) e per ogni catalogo (basic, addon) verifica
# che tutte le lingue abbiano esattamente gli stessi tasti.
#
# Se domani viene aggiunta o rimossa una lingua da site.ts, il test si
# adatta automaticamente senza modifiche allo script.
#
# Utilizzo:
#   ./i18n-check.sh
#
# Exit code:
#   0  Tutti i file presenti e chiavi sincronizzate
#   1  File mancanti o chiavi non allineate
#   2  Node.js non disponibile — test saltato
# =============================================================================

set -euo pipefail

if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

info() { echo -e "  ${BOLD}[info]${RESET} $*"; }
ok()   { echo -e "  ${GREEN}OK${RESET} $*"; }
warn() { echo -e "  ${YELLOW}WARN${RESET} $*"; }
fail() { echo -e "  ${RED}ERR${RESET} $*" >&2; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

if ! command -v node >/dev/null 2>&1; then
    warn "Node.js non trovato — controllo i18n saltato"
    exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_TS="${SCRIPT_DIR}/../../frontend/src/app/site.ts"
I18N_DIR="${SCRIPT_DIR}/../../frontend/src/assets/i18n"

# Su Git Bash/Windows, Node.js è il binario nativo Win32 e non capisce i path
# Unix-style /c/Users/... — li converte in C:/Users/... con cygpath -m.
if node -e "process.exit(process.platform==='win32'?0:1)" 2>/dev/null && command -v cygpath >/dev/null 2>&1; then
    SITE_TS="$(cygpath -m "$SITE_TS")"
    I18N_DIR="$(cygpath -m "$I18N_DIR")"
fi

# ─── Leggi le lingue da site.ts ──────────────────────────────────────────────
# Fonte: ContestoSito.config.availableLanguages — non hardcoded.
# Aggiungere o rimuovere una lingua da site.ts cambia automaticamente
# quali file vengono verificati, senza toccare questo script.
FRONTEND_DIR="${SCRIPT_DIR}/../../frontend"

mapfile -t LANGS < <(
    cd "$FRONTEND_DIR" && npx tsx -e "
import { ContestoSito } from './src/app/site';
const langs = ContestoSito.config.availableLanguages || [ContestoSito.config.defaultLang || 'it'];
langs.forEach(l => console.log(l));
" 2>/dev/null
)

# Fallback: se tsx non riesce (es. import circolare Angular), estrae le lingue
# direttamente dal sorgente con node puro — nessuna dipendenza dal runtime Angular.
# Usa SITE_TS che è già stato convertito con cygpath se necessario.
if [[ ${#LANGS[@]} -lt 1 ]]; then
    mapfile -t LANGS < <(
        node -e "
const fs = require('fs');
const src = fs.readFileSync('${SITE_TS}', 'utf8');
const multi = src.match(/availableLanguages\s*:\s*\[([^\]]+)\]/);
if (multi) {
    const langs = (multi[1].match(/[a-z]{2}(?:-[A-Z]{2})?/g) || []);
    if (langs.length) { langs.forEach(l => console.log(l)); process.exit(0); }
}
const single = src.match(/defaultLang\s*:\s*['\"]([a-z]{2}(?:-[A-Z]{2})?)['\"]/)
if (single) { console.log(single[1]); }
" 2>/dev/null
    )
fi

if [[ ${#LANGS[@]} -lt 1 ]]; then
    fail "Nessuna lingua trovata in site.ts — impossibile proseguire"
    exit 1
fi

if [[ ${#LANGS[@]} -eq 1 ]]; then
    ok "Una sola lingua configurata (${LANGS[0]}), test superato"
    exit 0
fi

info "Lingue rilevate da site.ts: ${LANGS[*]}"

# Costruisce un array JSON bash-side: ["it","en"] → passato inline a Node
langs_json=$(printf '"%s",' "${LANGS[@]}"); langs_json="[${langs_json%,}]"

# ─── Verifica catalogo ───────────────────────────────────────────────────────
check_catalog() {
    local catalog="$1"

    # Verifica che tutti i file esistano prima di controllare le chiavi
    local missing_files=0
    for lang in "${LANGS[@]}"; do
        local file="${I18N_DIR}/${catalog}.${lang}.json"
        if [[ ! -f "$file" ]]; then
            fail "File mancante: ${catalog}.${lang}.json"
            missing_files=$((missing_files + 1))
        fi
    done
    [[ $missing_files -gt 0 ]] && return 1

    # Calcola l'unione di tutte le chiavi e segnala quelle mancanti per lingua
    node -e "
const fs   = require('fs');
const langs = ${langs_json};
const dir   = '${I18N_DIR}';
const cat   = '${catalog}';

const keysets = new Map(langs.map(l => [
    l,
    new Set(Object.keys(JSON.parse(fs.readFileSync(dir + '/' + cat + '.' + l + '.json', 'utf8'))))
]));

const union = new Set([...keysets.values()].flatMap(s => [...s]));
let failures = 0;

for (const lang of langs) {
    for (const key of union) {
        if (!keysets.get(lang).has(key)) {
            process.stderr.write('    ' + cat + '.' + lang + '.json — chiave mancante: ' + key + '\n');
            failures++;
        }
    }
}

process.exit(failures > 0 ? 1 : 0);
" || return 1
}

# ─── Esecuzione ──────────────────────────────────────────────────────────────
FAILURES=0

for catalog in basic addon; do
    info "Controllo catalogo: ${catalog}"
    if check_catalog "$catalog"; then
        ok "${catalog} — tutte le lingue allineate"
    else
        fail "${catalog} — chiavi non sincronizzate (vedi sopra)"
        FAILURES=$((FAILURES + 1))
    fi
    echo
done

if [[ $FAILURES -gt 0 ]]; then
    fail "${FAILURES} catalogo/i con chiavi non sincronizzate"
    exit 1
fi

ok "Controllo completezza i18n superato"
exit 0
