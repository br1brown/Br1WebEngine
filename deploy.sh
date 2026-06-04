#!/usr/bin/env bash
# =============================================================================
# deploy.sh - Deploy Br1WebEngine
#
# Uso:
#   ./deploy.sh                      Deploy in produzione
#   ./deploy.sh --skip-post-deploy   Salta gli health check post-deploy
#   ./deploy.sh --dev                Modalità sviluppo (Angular dev server + backend locale)
#   ./deploy.sh --no-cache           Forza la build Docker ignorando la cache
#   ./deploy.sh --uptest             Ambiente CI: Alza lo stack isolato e lo lascia acceso (NON fa deploy).
#   ./deploy.sh --help               Mostra questo messaggio
#
# Opzioni per --uptest:
#   --down-after                     Spegne lo stack di test alla fine
#   --public-host HOST               Host pubblico per i test (default: localhost)
#   --public-port PORT               Porta del proxy pubblico per i test (default: 8088)
#   --skip-invalid-host-check        Salta il controllo negativo sull'host
#
# Configurazione:
#   Tutte le impostazioni vivono in global-settings.json (accanto a questo file).
#   Le variabili necessarie a docker-compose vengono lette direttamente da global-settings.json.
# =============================================================================

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

# Variabili di stato
DEV_MODE=false
NO_CACHE=false
UPTEST=false
TEST_POST_DEPLOY=true

# Variabili specifiche per i test pubblici
DOWN_AFTER=false
SKIP_INVALID_HOST_CHECK=false
PUBLIC_HOST="localhost"
PUBLIC_PORT="8088"

# Parsing argomenti
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dev) DEV_MODE=true; shift ;;
        --no-cache) NO_CACHE=true; shift ;;
        --uptest) UPTEST=true; shift ;;
        --skip-post-deploy) TEST_POST_DEPLOY=false; shift ;;
        --down-after) DOWN_AFTER=true; shift ;;
        --public-host) PUBLIC_HOST="$2"; shift 2 ;;
        --public-port) PUBLIC_PORT="$2"; shift 2 ;;
        --skip-invalid-host-check) SKIP_INVALID_HOST_CHECK=true; shift ;;
        *)
            echo "  WARN opzione sconosciuta ignorata: $1" >&2
            shift
            ;;
    esac
done

if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

info() { echo -e "  ${BOLD}[info]${RESET} $*"; }
ok()   { echo -e "  ${GREEN}OK${RESET} $*"; }
warn() { echo -e "  ${YELLOW}WARN${RESET} $*"; }
fail() { echo -e "  ${RED}ERR${RESET} $*" >&2; ERRORS=$((ERRORS + 1)); }

ERRORS=0

echo
echo -e "${BOLD}Prerequisiti${RESET}"

command -v docker >/dev/null 2>&1 && ok "Docker trovato" || { echo -e "  ${RED}ERR${RESET} Docker non trovato" >&2; exit 1; }
docker compose version >/dev/null 2>&1 && ok "docker compose trovato" || { echo -e "  ${RED}ERR${RESET} docker compose non trovato" >&2; exit 1; }
[[ -f docker-compose.yml ]] && ok "docker-compose.yml presente" || { echo -e "  ${RED}ERR${RESET} docker-compose.yml mancante" >&2; exit 1; }
command -v node >/dev/null 2>&1 && ok "Node.js trovato" || { echo -e "  ${RED}ERR${RESET} Node.js non trovato (richiesto per leggere global-settings.json)" >&2; exit 1; }
[[ -f global-settings.json ]] && ok "global-settings.json presente" || { echo -e "  ${RED}ERR${RESET} global-settings.json non trovato!" >&2; exit 1; }

echo
echo -e "${BOLD}Configurazione${RESET}"

# Legge tutte le variabili necessarie da global-settings.json in un'unica chiamata Node
_read_br1_vars() {
    node --input-type=module --eval "
import { readFileSync } from 'fs';
const s = JSON.parse(readFileSync('global-settings.json', 'utf-8'));
const slugify = n => String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const h = (s.frontend?.hostname || '').trim();
const langs = Array.isArray(s.Localization?.SupportedLanguages) ? s.Localization.SupportedLanguages : [];
const lines = [
    'COMPOSE_PROJECT_NAME=' + slugify(s.project?.name || 'app'),
    'FRONTEND_PORT=' + String(s.frontend?.port || 3000),
    'EXPOSE_BACKEND=' + (s.backend?.public ? 'yes' : 'no'),
    'BACKEND_PORT=' + String(s.backend?.publicPort || ''),
    'FRONTEND_BASE_URL=' + (h ? 'https://' + h : ''),
    'NG_ALLOWED_HOSTS=' + h,
    // Localization passata come build ARG al frontend (vedi Dockerfile/generate-statics).
    'DEFAULT_LANG=' + String(s.Localization?.DefaultLanguage || ''),
    'SUPPORTED_LANGS=' + langs.join(','),
];
process.stdout.write(lines.join('\n') + '\n');
"
}

while IFS= read -r _line; do
    [[ -z "$_line" ]] && continue
    _key="${_line%%=*}"
    _val="${_line#*=}"
    export "$_key=$_val"
done < <(_read_br1_vars)
ok "Configurazione letta da global-settings.json"

if [[ "$DEV_MODE" == true ]]; then
    echo
    echo -e "${BOLD}Sviluppo${RESET}"
    echo "  Frontend: http://localhost:4200"
    echo "  Backend:  http://localhost:5000"
    echo
    docker compose up --build
    exit 0
fi

[[ -z "$COMPOSE_PROJECT_NAME" ]] && fail "COMPOSE_PROJECT_NAME non derivabile da global-settings.json (project.name)"
[[ -n "$COMPOSE_PROJECT_NAME" && ! "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9_-]+$ ]] && fail "COMPOSE_PROJECT_NAME contiene caratteri non validi (sono ammessi solo: a-z, 0-9, trattino - e underscore _)"
[[ -z "$FRONTEND_PORT" ]] && fail "FRONTEND_PORT non valido in global-settings.json (frontend.port)"

if [[ "${EXPOSE_BACKEND:-no}" == "yes" && -z "${BACKEND_PORT:-}" ]]; then
    fail "EXPOSE_BACKEND=yes richiede BACKEND_PORT"
fi

[[ -n "$COMPOSE_PROJECT_NAME" ]] && ok "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"
[[ -n "$FRONTEND_PORT" ]] && ok "FRONTEND_PORT=${FRONTEND_PORT}"

if [[ -n "$FRONTEND_BASE_URL" ]]; then
    ok "FRONTEND_BASE_URL=${FRONTEND_BASE_URL}"
else
    warn "FRONTEND_BASE_URL non impostato"
fi

if [[ -n "$NG_ALLOWED_HOSTS" ]]; then
    ok "NG_ALLOWED_HOSTS=${NG_ALLOWED_HOSTS}"
else
    warn "NG_ALLOWED_HOSTS non impostato"
fi

if (( ERRORS > 0 )); then
    echo
    echo -e "  ${RED}ERR${RESET} Correggi la configurazione in global-settings.json prima di fare il deploy" >&2
    exit 1
fi

compose_files=(-f docker-compose.yml)
if [[ "${EXPOSE_BACKEND:-no}" == "yes" ]]; then
    if [[ ! -f docker-compose.backend-exposed.yml ]]; then
        warn "EXPOSE_BACKEND=yes ma docker-compose.backend-exposed.yml non trovato, continuo senza"
    else
        compose_files+=(-f docker-compose.backend-exposed.yml)
        ok "Backend esposto sulla porta host ${BACKEND_PORT:-8080}"
    fi
else
    ok "Backend mantenuto interno alla rete Docker"
fi

# =============================================================================
# SEZIONE FUNZIONI DI TEST E CURL
# =============================================================================

curl_with_host() {
    local url="$1"
    local host_header="$2"
    local body_file
    local status
    body_file="$(mktemp)"
    status="$(curl -sS --max-time 10 -o "$body_file" -w '%{http_code}' -H "Host: ${host_header}" "$url")"
    printf '%s\n' "$status"
    cat "$body_file"
    rm -f "$body_file"
}

curl_plain() {
    local url="$1"
    local body_file
    local status
    body_file="$(mktemp)"
    status="$(curl -sS --max-time 10 -o "$body_file" -w '%{http_code}' "$url")"
    printf '%s\n' "$status"
    cat "$body_file"
    rm -f "$body_file"
}

wait_for_http() {
    local url="$1"
    local host_header="$2"
    local expected_status="${3:-200}"
    local attempts="${4:-40}"
    local delay_seconds="${5:-2}"
    local i status body response

    for ((i=1; i<=attempts; i++)); do
        if [[ -n "$host_header" ]]; then
            if mapfile -t response < <(curl_with_host "$url" "$host_header" 2>/dev/null); then
                status="${response[0]:-}"
                if [[ "$status" == "$expected_status" ]]; then
                    return 0
                fi
            fi
        else
            status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)"
            if [[ "$status" == "$expected_status" ]]; then
                return 0
            fi
        fi
        sleep "$delay_seconds"
    done

    echo -e "  ${RED}ERR${RESET} Il servizio non ha restituito HTTP ${expected_status} per ${url}" >&2
    return 1
}

assert_contains() {
    local haystack="$1"
    local needle="$2"
    local message="$3"
    if [[ "$haystack" != *"$needle"* ]]; then
        echo -e "  ${RED}ERR${RESET} $message" >&2
        return 1
    fi
}

assert_status() {
    local actual="$1"
    local expected="$2"
    local message="$3"
    if [[ "$actual" != "$expected" ]]; then
        echo -e "  ${RED}ERR${RESET} $message (got HTTP ${actual})" >&2
        return 1
    fi
}

wait_backend_internal() {
    local attempts="${1:-40}"
    local delay_seconds="${2:-2}"
    local i

    for ((i=1; i<=attempts; i++)); do
        if env docker compose "${compose_files[@]}" exec -T backend sh -lc 'wget -qO- http://127.0.0.1:8080/health >/dev/null' >/dev/null 2>&1; then
            return 0
        fi
        sleep "$delay_seconds"
    done

    echo -e "  ${RED}ERR${RESET} l'endpoint interno /health del backend non è diventato pronto" >&2
    return 1
}

# =============================================================================
# ESECUZIONE TEST PUBBLICI (ISOLATO)
# =============================================================================

if [[ "$UPTEST" == true ]]; then
    echo
    echo -e "${BOLD}Avvio Esecuzione Public Test${RESET}"

    test_compose_files=("${compose_files[@]}" -f docker-compose.public-test.yml)
    compose_files_text="${test_compose_files[*]}"

    public_base_url="http://127.0.0.1:${PUBLIC_PORT}"
    browser_url="http://${PUBLIC_HOST}:${PUBLIC_PORT}"
    invalid_host="invalid-${PUBLIC_HOST}"

    compose_test() {
        env \
            PUBLIC_TEST_PORT="${PUBLIC_PORT}" \
            PUBLIC_TEST_BASE_URL="http://${PUBLIC_HOST}:${PUBLIC_PORT}" \
            PUBLIC_TEST_ALLOWED_HOSTS="${PUBLIC_HOST}" \
            BACKEND_PORT="${BACKEND_PORT:-8080}" \
            docker compose "${test_compose_files[@]}" "$@"
    }

    cleanup_test() {
        if [[ "$DOWN_AFTER" == true ]]; then
            info "Arresto dello stack di test..."
            compose_test down
        fi
    }
    trap cleanup_test EXIT

    info "URL browser pubblico: ${browser_url}"
    info "URL proxy di test: ${public_base_url}"

    if [[ "$NO_CACHE" == true ]]; then
        info "Costruzione dello stack di test con --no-cache"
        compose_test build --no-cache
    else
        info "Costruzione dello stack di test"
        compose_test build
    fi
    compose_test up -d

    info "In attesa di risposta dal proxy pubblico..."
    wait_for_http "${public_base_url}/health" "$PUBLIC_HOST" 200 && ok "Proxy pubblico ha restituito HTTP 200" || exit 1

    if [[ "${EXPOSE_BACKEND:-no}" == "yes" ]]; then
        mapfile -t backend_response < <(curl_plain "http://127.0.0.1:${BACKEND_PORT}/health")
        assert_status "${backend_response[0]}" "200" "/health del backend esposto ha restituito uno stato inatteso" || exit 1
        ok "/health del backend esposto ha restituito HTTP 200"
    fi

    echo
    ok 'Test pubblico completato con successo.'
    exit 0
fi

# =============================================================================
# ESECUZIONE DEPLOY PRODUZIONE REALE
# =============================================================================

echo
echo -e "${BOLD}Controllo porte${RESET}"

check_port_conflict() {
    local port="$1"
    local conflicting
    # Estraiamo anche la label del progetto per un confronto preciso
    conflicting=$(docker ps --format "{{.Names}}\t{{.Ports}}\t{{.Label \"com.docker.compose.project\"}}" \
        | grep -E ":${port}->" || true)

    if [[ -n "$conflicting" ]]; then
        local container_name project_label normalized_proj
        container_name=$(echo "$conflicting" | awk -F'\t' '{print $1}')
        project_label=$(echo "$conflicting" | awk -F'\t' '{print $3}')

        # Docker Compose normalizza il nome progetto (es. rimuove maiuscole e caratteri speciali)
        normalized_proj=$(echo "$COMPOSE_PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9_-]//g')

        if [[ "$project_label" != "$normalized_proj" ]]; then
            fail "Porta ${port} già in uso dal progetto '${project_label}' (container: ${container_name})"
            echo "  Stai cercando di fare il deploy come '${COMPOSE_PROJECT_NAME}', ma la porta è occupata." >&2
            echo "  Se è una vecchia versione, fermala con: docker stop ${container_name}" >&2
            return 1
        fi
        ok "La porta ${port} è in uso da questo stesso progetto (verrà aggiornato senza problemi)"
    else
        ok "La porta ${port} è libera"
    fi
}

check_port_conflict "${FRONTEND_PORT}"
if [[ "${EXPOSE_BACKEND:-no}" == "yes" && -n "${BACKEND_PORT:-}" ]]; then
    check_port_conflict "${BACKEND_PORT}"
fi

if (( ERRORS > 0 )); then
    echo
    echo -e "  ${RED}ERR${RESET} Risolvi i conflitti di porta prima di fare il deploy" >&2
    exit 1
fi

echo
echo -e "${BOLD}Deploy (Fase 1: Build)${RESET}"

if [[ "$NO_CACHE" == true ]]; then
    ok "Esecuzione build Docker pulita"
    env docker compose "${compose_files[@]}" build --no-cache frontend backend
else
    env docker compose "${compose_files[@]}" build frontend backend
fi

echo
echo -e "${BOLD}Pre-flight Test (Sicurezza Blue/Green)${RESET}"
info "Avvio delle nuove immagini su un ambiente isolato per verificarle..."
PREFLIGHT_PROJ="${COMPOSE_PROJECT_NAME}-preflight"
PREFLIGHT_PORT=$((FRONTEND_PORT + 10000))

# Avvia solo frontend e backend base, senza esporre il backend per evitare conflitti
env COMPOSE_PROJECT_NAME="$PREFLIGHT_PROJ" FRONTEND_PORT="$PREFLIGHT_PORT" EXPOSE_BACKEND="no" \
    docker compose -f docker-compose.yml up -d >/dev/null 2>&1

info "Attesa healthcheck sul nuovo container (max 60s)..."
if wait_for_http "http://127.0.0.1:${PREFLIGHT_PORT}/health" "" 200 30 2; then
    ok "La nuova build è sana e funzionante (Healthcheck OK)!"

    info "Spegnimento ambiente isolato..."
    env COMPOSE_PROJECT_NAME="$PREFLIGHT_PROJ" FRONTEND_PORT="$PREFLIGHT_PORT" EXPOSE_BACKEND="no" \
        docker compose -f docker-compose.yml down -v >/dev/null 2>&1
else
    echo
    fail "LA NUOVA BUILD È ROTTA! Il deploy è stato annullato."
    echo "  Il sito attualmente in produzione NON è stato toccato ed è ancora online."
    echo "  Controllo log del container fallito:"
    env COMPOSE_PROJECT_NAME="$PREFLIGHT_PROJ" FRONTEND_PORT="$PREFLIGHT_PORT" EXPOSE_BACKEND="no" \
        docker compose -f docker-compose.yml logs --tail 20
    info "Pulizia ambiente isolato rotto..."
    env COMPOSE_PROJECT_NAME="$PREFLIGHT_PROJ" FRONTEND_PORT="$PREFLIGHT_PORT" EXPOSE_BACKEND="no" \
        docker compose -f docker-compose.yml down -v >/dev/null 2>&1
    exit 1
fi

echo
echo -e "${BOLD}Deploy (Fase 2: Scambio in Produzione)${RESET}"
info "Aggiornamento dei container di produzione con le immagini validate..."
env docker compose "${compose_files[@]}" up -d

# =============================================================================
# ESECUZIONE CONTROLLI POST-DEPLOY (Opzionale)
# =============================================================================

if [[ "$TEST_POST_DEPLOY" == true ]]; then
    echo
    echo -e "${BOLD}Test Post-Deploy${RESET}"

    echo "  Controllo salute frontend su http://127.0.0.1:${FRONTEND_PORT}/health"
    wait_for_http "http://127.0.0.1:${FRONTEND_PORT}/health" "" 200 && ok "Frontend /health ha restituito HTTP 200" || exit 1

    if [[ "${EXPOSE_BACKEND:-no}" == "yes" && -n "${BACKEND_PORT:-}" ]]; then
        echo "  Controllo salute backend esposto su http://127.0.0.1:${BACKEND_PORT}/health"
        wait_for_http "http://127.0.0.1:${BACKEND_PORT}/health" "" 200 && ok "Backend /health ha restituito HTTP 200 sulla porta esposta" || exit 1
    else
        echo "  Controllo salute backend interno in Docker"
        wait_backend_internal && ok "Backend interno /health ha restituito HTTP 200" || exit 1
    fi
fi

echo
echo -e "${BOLD}Pulizia Docker...${RESET}"
docker image prune -f --filter "dangling=true"
ok "Immagini orfane rimosse per liberare spazio"

echo
echo -e "  ${GREEN}OK${RESET} Deploy completato"
echo "  Log:   docker compose -f docker-compose.yml logs -f"
echo "  Stato: docker compose -f docker-compose.yml ps"
echo
