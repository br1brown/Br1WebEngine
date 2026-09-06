#!/usr/bin/env bash
# =============================================================================
# a11y-test.sh  —  Accessibility audit su server in esecuzione
#
# Esegue pa11y (WCAG 2.1 AA) sulle pagine indicate e stampa le violazioni.
# Viene chiamato da scripts/deploy.sh nella fase isolata di Pre-flight; può anche girare
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
#   A11Y_CONCURRENCY            Pagine auditate in parallelo (default: 2). pa11y misura
#                                struttura/DOM, non tempi, quindi la contesa di risorse fra pagine
#                                concorrenti in genere rallenta ma non falsa il risultato (a
#                                differenza di Lighthouse, seriale apposta) — eccezione: la regola
#                                color-contrast di axe-core, su più tab dello stesso browser
#                                condiviso, dà falsi positivi intermittenti con 3+ pagine insieme.
#                                Alza questo valore solo se hai già verificato che il tuo set di
#                                pagine non ne risente.
#   A11Y_DYNAMIC_MAX            URL dinamiche dalla sitemap da auditare (default: 100).
#
# Exit code:
#   0  Nessuna violazione trovata
#   1  Una o più violazioni WCAG trovate
#   2  Dipendenze non disponibili, o path da auditare non scopribili — test saltato
# =============================================================================

set -euo pipefail

# ─── colori (stessa palette di scripts/deploy.sh) ────────────────────────────────────
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
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    # `$(...)` invece di `mapfile < <(...)`: un fallimento di discover-audit-paths.cjs (server giù,
    # /sitemap.xml mancante, JSON malformato) deve fermare lo script qui — con la process substitution
    # l'exit code del comando sostituito si perde, PATHS resterebbe vuoto in silenzio e il ciclo di
    # audit sotto, su un array vuoto, uscirebbe con successo senza aver controllato nessuna pagina.
    if ! DISCOVERED="$(node "${SCRIPT_DIR}/discover-audit-paths.cjs" "$BASE_URL" "${A11Y_DYNAMIC_MAX:-100}")"; then
        fail "Scoperta path fallita — server non raggiungibile o endpoint /health o /sitemap.xml non validi"
        exit 2
    fi
    # DISCOVERED vuoto → nessun path scoperto: un `mapfile <<< ""` produrrebbe comunque un array di
    # UN elemento (stringa vuota, per via del newline finale del here-string), non un array vuoto —
    # il controllo sotto non lo vedrebbe e finirebbe per auditare "/" anche su un sito senza pagine.
    if [[ -z "$DISCOVERED" ]]; then
        PATHS=()
    else
        mapfile -t PATHS <<< "$DISCOVERED"
    fi
    if [[ ${#PATHS[@]} -eq 0 ]]; then
        warn "Nessun path da auditare — controllo saltato"
        exit 2
    fi
    info "Path auto-scoperti (statiche + sitemap dinamica): ${PATHS[*]}"
fi

TIMEOUT="${A11Y_TIMEOUT:-30000}"
CONCURRENCY="${A11Y_CONCURRENCY:-2}"
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
FRONTEND_DIR="${SCRIPT_DIR}/../../frontend"
PA11Y_CONFIG="${SCRIPT_DIR}/pa11y.json"

# ─── prereq: node ─────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
    warn "Node.js non trovato — accessibility check saltato"
    exit 2
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

FAILURES=0

# ─── pa11y locale disponibile: un solo browser riusato, pagine in parallelo ───
# La CLI pa11y invocata una volta a pagina (comportamento precedente) apre e
# chiude un intero Chromium ad ogni URL — stesso pattern, stesso costo/rischio
# già corretto in lighthouse-test.sh (pressione CPU/memoria crescente sul
# runner CI, terreno tipico per timeout/crash del browser man mano che il sito
# ha più pagine). L'API JS di pa11y espone proprio per questo un'opzione
# `browser`: passando un'istanza Puppeteer già avviata, pa11y apre solo una
# nuova *tab* per ogni pagina invece di un intero processo Chromium — il
# pattern che pa11y stesso documenta per testare più URL, qui anche in
# CONCORRENZA (limitata, vedi A11Y_CONCURRENCY sopra): a differenza di
# Lighthouse — dove il team stesso sconsiglia audit concorrenti sulla stessa
# macchina perché la contesa di CPU/rete falsa il punteggio di performance —
# pa11y misura struttura/DOM (axe-core/HTML_CodeSniffer), non tempi: pagine
# in parallelo rallentano sotto contesa ma non alterano l'esito.
if [[ -f "${FRONTEND_DIR}/node_modules/pa11y/package.json" ]]; then
    info "Concorrenza: ${CONCURRENCY} pagine in parallelo (A11Y_CONCURRENCY per cambiarla)"
    RUNNER="${FRONTEND_DIR}/.a11y-run-$$.cjs"
    trap 'rm -f "$RUNNER"' EXIT

    # Git Bash/MSYS converte ogni argomento che inizia con `/` in un path Windows:
    # le route `/policy/...` finirebbero quindi in Pa11y come `C:/Program Files/Git/...`.
    # Disabilitiamo la conversione solo per Node e convertiamo esplicitamente i due file locali
    # che Node deve leggere. Su Linux/macOS le variabili restano invariate.
    NODE_RUNNER="$RUNNER"
    NODE_CONFIG="$PA11Y_CONFIG"
    if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
        NODE_RUNNER="$(cygpath -w "$RUNNER")"
        NODE_CONFIG="$(cygpath -w "$PA11Y_CONFIG")"
    fi

    cat > "$RUNNER" <<'NODEEOF'
'use strict';
const fs = require('fs');
const pa11y = require('pa11y');
const puppeteer = require('puppeteer');
const cliReporter = require('pa11y/lib/reporters/cli');

const [, , baseUrl, configPath, timeoutArg, concurrencyArg, ...rawPaths] = process.argv;
const timeout = Number(timeoutArg) || 30000;
const concurrency = Math.max(1, Number(concurrencyArg) || 3);
const { chromeLaunchConfig, ...pa11yOptions } = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const isTTY = process.stdout.isTTY;
const paint = (code, s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);

// Pool a concorrenza limitata: `concurrency` worker "tirano" dalla stessa coda finché non
// si esaurisce. Ogni pagina bufferizza il proprio output (non lo stampa subito) così i blocchi
// restano leggibili anche se le pagine finiscono in un ordine diverso da quello di partenza —
// li stampiamo tutti insieme, in ordine originale, a pool esaurito.
async function runPool(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    async function pull() {
        while (next < items.length) {
            const i = next++;
            results[i] = await worker(items[i]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, pull));
    return results;
}

async function auditPage(browser, raw) {
    const path = '/' + raw.replace(/^\/+/, '');
    const url = baseUrl + path;
    const out = [`  Controllo ${paint('1', url)} ...`];
    let failed = false;

    try {
        const result = await pa11y(url, { ...pa11yOptions, browser, timeout });
        if (result.issues.length === 0) {
            out.push(`  ${paint('32', 'OK')} Nessuna violazione WCAG 2.1 AA — ${path}`);
        } else {
            out.push(cliReporter.results(result));
            out.push(`  ${paint('31', 'ERR')} Violazioni WCAG 2.1 AA — ${path}`);
            failed = true;
        }
    } catch (err) {
        out.push(`  ${paint('31', 'ERR')} pa11y non ha completato (${err.message}) — ${path}: NON misurato, tratto come fallimento`);
        failed = true;
    }
    return { out, failed };
}

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        args: chromeLaunchConfig?.args ?? [],
    });

    let failures = 0;
    try {
        const results = await runPool(rawPaths, concurrency, raw => auditPage(browser, raw));
        for (const { out, failed } of results) {
            console.log(out.join('\n'));
            console.log('');
            if (failed) failures++;
        }
    } finally {
        await browser.close();
    }

    if (failures > 0) {
        console.error(`  ${paint('31', 'ERR')} ${failures} pagina/e con violazioni WCAG 2.1 AA o non misurate`);
        process.exit(1);
    }
    console.log(`  ${paint('32', 'OK')} Controllo accessibilità completato — nessuna violazione`);
    process.exit(0);
})();
NODEEOF

    runner_exit=0
    MSYS_NO_PATHCONV=1 node "$NODE_RUNNER" "$BASE_URL" "$NODE_CONFIG" "$TIMEOUT" "$CONCURRENCY" "${PATHS[@]}" || runner_exit=$?
    rm -f "$RUNNER"

    # Il runner Node gestisce già il conteggio per-pagina e stampa il proprio riepilogo finale
    # (il numero reale di pagine fallite, non solo 0/1) — qui resta solo da propagarne l'esito.
    # Un exit diverso da 0/1 (crash del runner stesso, non delle singole pagine) è comunque
    # fail-closed: NON misurato, trattato come fallimento.
    if [[ $runner_exit -gt 1 ]]; then
        fail "Il runner pa11y non ha completato (exit ${runner_exit}): NON misurato, tratto come fallimento"
    fi
    exit $((runner_exit > 1 ? 1 : runner_exit))
else
    # pa11y non è un pacchetto locale (npm ci non eseguito): fallback via npx, un avvio
    # Chromium per pagina — più lento e più esposto al flake da risorse, ma resta corretto;
    # è un percorso già degradato (dipendenza scaricata al volo), non quello raccomandato.
    if ! command -v npx >/dev/null 2>&1; then
        warn "pa11y non trovato e npx non disponibile — accessibility check saltato"
        exit 2
    fi
    PA11Y_BIN="npx --yes pa11y"
    info "pa11y non in node_modules, verrà scaricato via npx (un avvio Chromium per pagina)"

    for path in "${PATHS[@]}"; do
        path="/${path#/}"
        URL="${BASE_URL}${path}"

        echo -e "  Controllo ${BOLD}${URL}${RESET} ..."

        pa11y_exit=0
        $PA11Y_BIN \
            --config "$PA11Y_CONFIG" \
            --reporter cli \
            --timeout "$TIMEOUT" \
            "$URL" || pa11y_exit=$?

        case $pa11y_exit in
            0) ok "Nessuna violazione WCAG 2.1 AA — ${path}" ;;
            2) fail "Violazioni WCAG 2.1 AA — ${path}"; FAILURES=$((FAILURES + 1)) ;;
            *) fail "pa11y non ha completato (exit ${pa11y_exit}) — ${path}: NON misurato, tratto come fallimento"; FAILURES=$((FAILURES + 1)) ;;
        esac

        echo
    done
fi

# ─── exit finale ─────────────────────────────────────────────────────────────
if [[ $FAILURES -gt 0 ]]; then
    fail "${FAILURES} pagina/e con violazioni WCAG 2.1 AA o non misurate"
    exit 1
fi

ok "Controllo accessibilità completato — nessuna violazione"
exit 0
