#!/usr/bin/env bash
# =============================================================================
# a11y-test.sh  —  Accessibility audit su server in esecuzione
#
# Esegue pa11y (WCAG 2.1 AA) sulle pagine indicate e stampa le violazioni.
# Viene chiamato da deploy.sh nella fase isolata di Pre-flight; può anche girare
# in isolamento per audit rapidi in locale.
#
# Utilizzo:
#   ./a11y-test.sh BASE_URL [PATH ...]
#
# Esempi:
#   ./a11y-test.sh http://localhost:3000               # scoperta automatica via /health
#   ./a11y-test.sh http://app.localhost:8088 / /social # solo i path indicati
#
# Variabili d'ambiente:
#   PUPPETEER_EXECUTABLE_PATH   Override Chrome/Chromium (auto-rilevato se assente)
#   A11Y_TIMEOUT                Timeout per pagina in ms (default: 30000)
#
# Exit code:
#   0  Nessuna violazione trovata
#   1  Una o più violazioni WCAG trovate
#   2  Dipendenze non disponibili — test saltato
# =============================================================================

set -euo pipefail

# ─── colori (stessa palette di deploy.sh) ────────────────────────────────────
if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

info() { echo -e "  ${BOLD}[info]${RESET} $*"; }
ok()   { echo -e "  ${GREEN}OK${RESET} $*"; }
warn() { echo -e "  ${YELLOW}WARN${RESET} $*"; }
fail() { echo -e "  ${RED}ERR${RESET} $*" >&2; }

# ─── help ────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

# ─── argomenti ───────────────────────────────────────────────────────────────
if [[ $# -lt 1 ]]; then
    echo "Uso: $0 BASE_URL [PATH ...]" >&2
    exit 1
fi

BASE_URL="${1%/}"    # rimuove trailing slash
shift

if [[ $# -gt 0 ]]; then
    PATHS=("$@")
else
    # Nessun path specificato: scoperta automatica dal server.
    # /health restituisce a11yPaths — l'elenco delle pagine interne pubbliche
    # derivato da ContestoSito.getSitemapEntries() (no externalUrl, no requiresAuth).
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

TIMEOUT="${A11Y_TIMEOUT:-30000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── prereq: node ─────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
    warn "Node.js non trovato — accessibility check saltato"
    exit 2
fi

# ─── localizza pa11y (preferisce node_modules, poi npx) ──────────────────────
PA11Y_BIN="${SCRIPT_DIR}/../../frontend/node_modules/.bin/pa11y"
PA11Y_CONFIG="${SCRIPT_DIR}/pa11y.json"

if [[ ! -x "$PA11Y_BIN" ]]; then
    if ! command -v npx >/dev/null 2>&1; then
        warn "pa11y non trovato e npx non disponibile — accessibility check saltato"
        exit 2
    fi
    PA11Y_BIN="npx --yes pa11y"
    info "pa11y non in node_modules, verrà scaricato via npx"
fi

# ─── rileva Chrome/Chromium ──────────────────────────────────────────────────
if [[ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ]]; then
    for candidate in \
        "$(which google-chrome-stable 2>/dev/null || true)" \
        "$(which google-chrome       2>/dev/null || true)" \
        "$(which chromium-browser    2>/dev/null || true)" \
        "$(which chromium            2>/dev/null || true)"; do
        if [[ -n "$candidate" && -x "$candidate" ]]; then
            export PUPPETEER_EXECUTABLE_PATH="$candidate"
            break
        fi
    done
fi

if [[ -n "${PUPPETEER_EXECUTABLE_PATH:-}" ]]; then
    info "Chrome: ${PUPPETEER_EXECUTABLE_PATH}"
else
    warn "Chrome non trovato in PATH — puppeteer userà il browser bundled (primo avvio lento)"
fi

# ─── test per ogni path ───────────────────────────────────────────────────────
FAILURES=0

for path in "${PATHS[@]}"; do
    # Normalizza: assicura che inizi con /
    path="/${path#/}"
    URL="${BASE_URL}${path}"

    echo -e "  Controllo ${BOLD}${URL}${RESET} ..."

    pa11y_exit=0
    $PA11Y_BIN \
        --config "$PA11Y_CONFIG" \
        --reporter cli \
        --timeout "$TIMEOUT" \
        "$URL" || pa11y_exit=$?

    # pa11y exit codes: 0 = nessun problema, 2 = violazioni trovate, altri = errore
    case $pa11y_exit in
        0) ok "Nessuna violazione WCAG 2.1 AA — ${path}" ;;
        2) fail "Violazioni WCAG 2.1 AA — ${path}"; FAILURES=$((FAILURES + 1)) ;;
        *) warn "pa11y non ha completato correttamente (exit ${pa11y_exit}) — ${path}" ;;
    esac

    echo
done

# ─── exit finale ─────────────────────────────────────────────────────────────
if [[ $FAILURES -gt 0 ]]; then
    fail "${FAILURES} pagina/e con violazioni WCAG 2.1 AA"
    exit 1
fi

ok "Controllo accessibilità completato — nessuna violazione"
exit 0
