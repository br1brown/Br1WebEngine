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

# ─── Chrome persistente, riusato per tutte le pagine ──────────────────────────
# Un chrome-launcher a freddo per pagina (comportamento precedente) somma un
# intero avvio+arresto Chrome ad ogni URL — con poche pagine costa solo tempo,
# ma la pressione su CPU/memoria del runner CI (già condiviso con i container
# backend/frontend sotto test) sale ad ogni riavvio, ed è esattamente il terreno
# in cui Lighthouse produce NO_NAVSTART/NO_FCP: la registrazione della trace
# arriva prima che Chrome sia davvero pronto a navigare. Un solo Chrome headless
# avviato una volta, con Lighthouse che vi si collega via --port per ogni pagina
# (il pattern che Lighthouse stesso raccomanda per audit multi-URL), rimuove il
# costo e il rischio: elimina N-1 cicli di avvio/arresto, non solo l'ultimo.
# Se CHROME_PATH non è risolto (bundled/npx) si ricade sul comportamento
# precedente, un avvio per pagina — più lento ma sempre corretto.
CHROME_DEBUG_PORT=""
CHROME_PID=""
CHROME_LOG="$(mktemp)"

cleanup_chrome() {
    if [[ -n "$CHROME_PID" ]]; then
        kill "$CHROME_PID" 2>/dev/null || true
        wait "$CHROME_PID" 2>/dev/null || true
    fi
    rm -f "$CHROME_LOG"
}
trap cleanup_chrome EXIT

if [[ -n "${CHROME_PATH:-}" ]] && command -v curl >/dev/null 2>&1; then
    CHROME_DEBUG_PORT="$(node -e "
const net = require('net');
const s = net.createServer();
s.listen(0, () => { const p = s.address().port; s.close(() => console.log(p)); });
")"

    "$CHROME_PATH" \
        --headless=new --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu \
        --remote-debugging-port="$CHROME_DEBUG_PORT" \
        about:blank >"$CHROME_LOG" 2>&1 &
    CHROME_PID=$!

    ready=0
    for _ in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version" >/dev/null 2>&1; then
            ready=1
            break
        fi
        sleep 0.5
    done

    if [[ $ready -eq 1 ]]; then
        info "Chrome persistente pronto (porta ${CHROME_DEBUG_PORT}) — un solo avvio riusato per tutte le pagine"
    else
        warn "Chrome persistente non pronto in tempo — fallback: un avvio Chrome per pagina"
        kill "$CHROME_PID" 2>/dev/null || true
        CHROME_PID=""
        CHROME_DEBUG_PORT=""
    fi
fi

# Codici runtimeError di Lighthouse considerati transitori — sintomi di timing/risorse
# (Chrome non ancora pronto, trace non registrata, tab bloccata), non di una pagina
# realmente rotta: vale la pena ritentare una volta prima di dichiarare fallimento.
# Codici come DNS_FAILURE/INVALID_URL/ERRORED_DOCUMENT_REQUEST restano fuori apposta:
# lì la pagina è davvero irraggiungibile, ritentare sprecherebbe solo tempo.
TRANSIENT_RUNTIME_ERRORS="NO_NAVSTART|NO_FCP|NO_LCP|PAGE_HUNG|TARGET_CRASHED|PROTOCOL_TIMEOUT|NO_SPEEDLINE_FRAMES|NO_SCREENSHOTS"

MAX_ATTEMPTS=2
FAILURES=0

for path in "${PATHS[@]}"; do
    path="/${path#/}"
    URL="${BASE_URL}${path}"

    echo -e "  Controllo ${BOLD}${URL}${RESET} ..."

    attempt=1
    page_result=1   # 0 = ok, 1 = fallimento finale, 2 = transitorio (si ritenta)

    while [[ $attempt -le $MAX_ATTEMPTS ]]; do
        REPORT="lh-report-$$-${attempt}.json"

        LH_ARGS=(
            --output=json
            --output-path="$REPORT"
            --throttling-method=provided
            --only-categories=performance,accessibility,best-practices,seo
            --timeout="$TIMEOUT"
            --quiet
        )
        if [[ -n "$CHROME_PID" ]]; then
            LH_ARGS+=(--port="$CHROME_DEBUG_PORT")
        else
            LH_ARGS+=(--chrome-flags="--headless=new --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu")
        fi

        lh_exit=0
        $LH_BIN "${LH_ARGS[@]}" "$URL" 2>/dev/null || lh_exit=$?

        # Fail-CLOSED: se Lighthouse non ha prodotto un report, NON abbiamo misurato → è un
        # fallimento (o un caso da ritentare), non un warn silenzioso.
        if [[ $lh_exit -ne 0 && ! -f "$REPORT" ]]; then
            if [[ $attempt -lt $MAX_ATTEMPTS ]]; then
                warn "Lighthouse non ha completato (exit ${lh_exit}) — ${path}: ritento (tentativo $((attempt + 1))/${MAX_ATTEMPTS})"
                attempt=$((attempt + 1))
                continue
            fi
            fail "Lighthouse non ha completato (exit ${lh_exit}) — ${path}: NON misurato, tratto come fallimento"
            page_result=1
            break
        fi

        node_exit=0
        node -e "
const fs = require('fs');
const report = JSON.parse(fs.readFileSync('${REPORT}', 'utf8'));
const transient = new Set('${TRANSIENT_RUNTIME_ERRORS}'.split('|'));
if (report.runtimeError && report.runtimeError.code !== 'NO_ERROR') {
    process.stderr.write('    SKIP ' + report.runtimeError.code + ': ' + report.runtimeError.message + '\n');
    process.exit(transient.has(report.runtimeError.code) ? 2 : 3);
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
" || node_exit=$?

        rm -f "$REPORT"

        if [[ $node_exit -eq 2 && $attempt -lt $MAX_ATTEMPTS ]]; then
            warn "Errore Lighthouse transitorio — ${path}: ritento (tentativo $((attempt + 1))/${MAX_ATTEMPTS})"
            attempt=$((attempt + 1))
            continue
        fi

        # 0 = ok; 1 = budget fallito; 2/3 = runtimeError (esaurito il retry o non transitorio) → NON misurato.
        if [[ $node_exit -ge 2 ]]; then
            fail "Server non raggiungibile / pagina in errore — ${path}: NON misurato, tratto come fallimento"
        elif [[ $node_exit -gt 0 ]]; then
            fail "Budget Lighthouse fallito — ${path}"
        fi
        page_result=$node_exit
        break
    done

    if [[ $page_result -eq 0 ]]; then
        ok "Budget Lighthouse rispettato — ${path}"
    else
        FAILURES=$((FAILURES + 1))
    fi

    echo
done

if [[ $FAILURES -gt 0 ]]; then
    fail "${FAILURES} pagina/e sotto il budget Lighthouse o non misurate"
    exit 1
fi

ok "Controllo Lighthouse completato — tutti i budget rispettati"
exit 0
