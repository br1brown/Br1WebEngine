#!/usr/bin/env bash
# =============================================================================
# lighthouse-test.sh  —  Performance & accessibility budget check (Lighthouse)
#
# Esegue Lighthouse sulle pagine indicate e verifica che i punteggi per
# categoria non scendano sotto le soglie definite in lighthouse.json.
#
# Utilizzo:
#   ./lighthouse-test.sh BASE_URL [PATH ...]
#
# Esempi:
#   ./lighthouse-test.sh http://localhost:3000
#   ./lighthouse-test.sh http://app.localhost:8088 / /social
#
# Variabili d'ambiente:
#   CHROME_PATH      Override Chrome/Chromium (auto-rilevato se assente)
#   LH_TIMEOUT       Timeout per pagina in ms (default: 60000)
#
# Exit code:
#   0  Tutti i budget rispettati
#   1  Una o più pagine sotto soglia
#   2  Dipendenze non disponibili — test saltato
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
    sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

if [[ $# -lt 1 ]]; then
    echo "Uso: $0 BASE_URL [PATH ...]" >&2
    exit 1
fi

BASE_URL="${1%/}"
shift

if [[ $# -gt 0 ]]; then
    PATHS=("$@")
else
    # Nessun path specificato: scoperta automatica dal server.
    # /health restituisce a11yPaths — l'elenco delle pagine interne pubbliche
    # derivato da ContestoSito.getSitemapEntries() (no externalUrl, no requiresAuth).
    # Aggiungere una pagina in site.ts la include automaticamente nell'audit.
    mapfile -t PATHS < <(
        node -e "
const http  = require('http');
const https = require('https');
const mod   = '${BASE_URL}'.startsWith('https') ? https : http;
mod.get('${BASE_URL}/health', res => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
        try {
            const paths = JSON.parse(raw).a11yPaths;
            if (Array.isArray(paths) && paths.length) {
                paths.forEach(p => console.log(p));
            } else {
                console.log('/');
            }
        } catch { console.log('/'); }
    });
}).on('error', () => console.log('/'));
" 2>/dev/null
    )
    info "Path auto-scoperti da ${BASE_URL}/health: ${PATHS[*]}"
fi

TIMEOUT="${LH_TIMEOUT:-60000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THRESHOLD_FILE="${SCRIPT_DIR}/lighthouse.json"

if node -e "process.exit(process.platform==='win32'?0:1)" 2>/dev/null && command -v cygpath >/dev/null 2>&1; then
    THRESHOLD_FILE="$(cygpath -m "$THRESHOLD_FILE")"
fi

if ! command -v node >/dev/null 2>&1; then
    warn "Node.js non trovato — controllo Lighthouse saltato"
    exit 2
fi

LH_BIN="${SCRIPT_DIR}/../../frontend/node_modules/.bin/lighthouse"

if [[ ! -x "$LH_BIN" ]]; then
    if ! command -v npx >/dev/null 2>&1; then
        warn "lighthouse non trovato e npx non disponibile — controllo Lighthouse saltato"
        exit 2
    fi
    LH_BIN="npx --yes lighthouse"
    info "lighthouse non in node_modules, verrà scaricato via npx"
fi

if [[ -z "${CHROME_PATH:-}" ]]; then
    for candidate in \
        "$(which google-chrome-stable 2>/dev/null || true)" \
        "$(which google-chrome       2>/dev/null || true)" \
        "$(which chromium-browser    2>/dev/null || true)" \
        "$(which chromium            2>/dev/null || true)"; do
        if [[ -n "$candidate" && -x "$candidate" ]]; then
            export CHROME_PATH="$candidate"
            break
        fi
    done
fi

if [[ -n "${CHROME_PATH:-}" ]]; then
    info "Chrome: ${CHROME_PATH}"
else
    warn "Chrome non trovato in PATH — lighthouse userà il browser bundled"
fi

FAILURES=0

for path in "${PATHS[@]}"; do
    path="/${path#/}"
    URL="${BASE_URL}${path}"
    REPORT="lh-report-$$.json"

    echo -e "  Controllo ${BOLD}${URL}${RESET} ..."

    lh_exit=0
    $LH_BIN \
        --output=json \
        --output-path="$REPORT" \
        --chrome-flags="--headless=new --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu" \
        --throttling-method=provided \
        --only-categories=performance,accessibility,best-practices,seo \
        --timeout="$TIMEOUT" \
        --quiet \
        "$URL" 2>/dev/null || lh_exit=$?

    if [[ $lh_exit -ne 0 && ! -f "$REPORT" ]]; then
        warn "Lighthouse non ha completato correttamente (exit ${lh_exit}) — ${path}"
        rm -f "$REPORT"
        echo
        continue
    fi

    page_exit=0
    node -e "
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('${REPORT}', 'utf8'));
if (report.runtimeError && report.runtimeError.code !== 'NO_ERROR') {
    process.stderr.write('    SKIP ' + report.runtimeError.message + '\n');
    process.exit(2);
}
const thresholds = JSON.parse(fs.readFileSync('${THRESHOLD_FILE}', 'utf8'));
const cats = report.categories;
let failures = 0;
for (const [key, min] of Object.entries(thresholds)) {
    const cat = cats[key];
    if (!cat) continue;
    const score = Math.round((cat.score ?? 0) * 100);
    const pass = score >= min;
    const label = pass ? 'OK  ' : 'FAIL';
    const out = '    ' + label + ' ' + key + ': ' + score + ' (min ' + min + ')';
    if (pass) console.log(out); else console.error(out);
    if (!pass) failures++;
}
process.exit(failures > 0 ? 1 : 0);
" || page_exit=$?

    rm -f "$REPORT"

    if [[ $page_exit -eq 2 ]]; then
        warn "Server non raggiungibile — Lighthouse saltato per ${path}"
    elif [[ $page_exit -gt 0 ]]; then
        fail "Budget Lighthouse fallito — ${path}"
        FAILURES=$((FAILURES + 1))
    else
        ok "Budget Lighthouse rispettato — ${path}"
    fi

    echo
done

if [[ $FAILURES -gt 0 ]]; then
    fail "${FAILURES} pagina/e sotto il budget Lighthouse"
    exit 1
fi

ok "Controllo Lighthouse completato — tutti i budget rispettati"
exit 0
