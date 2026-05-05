#!/usr/bin/env bash
# =============================================================================
# deploy.sh - Deploy and Test Br1WebEngine
#
# Usage:
#   ./deploy.sh                      Production deploy with health checks
#   ./deploy.sh --skip-post-deploy   Skip health checks after deployment
#   ./deploy.sh --dev                Development mode
#   ./deploy.sh --no-cache           Force clean Docker rebuild
#   ./deploy.sh --test-public        Run isolated public tests (e.g., in CI)
#   ./deploy.sh --help               Show this message
#
# Options for --test-public:
#   --down-after                     Stop the test stack at the end
#   --public-host HOST               Public host header (default: br1gaming.localhost)
#   --public-port PORT               Public reverse proxy port (default: 8088)
#   --skip-invalid-host-check        Skip the negative host authorization check
# =============================================================================

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

# Variabili di stato
DEV_MODE=false
NO_CACHE=false
TEST_PUBLIC=false
TEST_POST_DEPLOY=true

# Variabili specifiche per i test pubblici
DOWN_AFTER=false
SKIP_INVALID_HOST_CHECK=false
PUBLIC_HOST="br1gaming.localhost"
PUBLIC_PORT="8088"

# Parsing argomenti
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dev) DEV_MODE=true; shift ;;
        --no-cache) NO_CACHE=true; shift ;;
        --test-public) TEST_PUBLIC=true; shift ;;
        --skip-post-deploy) TEST_POST_DEPLOY=false; shift ;;
        --down-after) DOWN_AFTER=true; shift ;;
        --public-host) PUBLIC_HOST="$2"; shift 2 ;;
        --public-port) PUBLIC_PORT="$2"; shift 2 ;;
        --skip-invalid-host-check) SKIP_INVALID_HOST_CHECK=true; shift ;;
        *) shift ;; # Ignora opzioni sconosciute
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

env_get() {
    local key="$1"
    local line
    line=$(grep -E "^[[:space:]]*${key}=" .env 2>/dev/null | tail -n 1 || true)
    line="${line#*=}"
    if [[ "$line" =~ ^\"(.*)\"$ ]]; then printf '%s\n' "${BASH_REMATCH[1]}"; return; fi
    if [[ "$line" =~ ^\'(.*)\'$ ]]; then printf '%s\n' "${BASH_REMATCH[1]}"; return; fi
    printf '%s\n' "$line"
}

env_set() {
    local key="$1" val="$2"
    if grep -qE "^${key}=" .env 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${val}|" .env
    else
        echo "${key}=${val}" >> .env
    fi
}

param_get() {
    local key="$1"
    local line
    line=$(grep -E "^[[:space:]]*${key}=" .env.param 2>/dev/null | tail -n 1 || true)
    line="${line#*=}"
    if [[ "$line" =~ ^\"(.*)\"$ ]]; then printf '%s\n' "${BASH_REMATCH[1]}"; return; fi
    if [[ "$line" =~ ^\'(.*)\'$ ]]; then printf '%s\n' "${BASH_REMATCH[1]}"; return; fi
    printf '%s\n' "$line"
}

slugify() {
    local value="$1"
    value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
    value="$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
    printf '%s\n' "$value"
}

sync_env_from_params() {
    local site_hostname site_scheme frontend_port expose_backend backend_port compose_project_name frontend_base_url backend_api_key

    [[ -f .env.param ]] || return 0

    site_hostname="$(param_get SITE_HOSTNAME)"
    site_scheme="$(param_get SITE_SCHEME)"
    frontend_port="$(param_get FRONTEND_PORT)"
    expose_backend="$(param_get EXPOSE_BACKEND)"
    backend_port="$(param_get BACKEND_PORT)"
    compose_project_name="$(param_get COMPOSE_PROJECT_NAME)"
    backend_api_key="$(param_get BACKEND_API_KEY)"

    if [[ -z "$site_scheme" ]]; then
        site_scheme="https"
    fi

    if [[ -z "$compose_project_name" && -n "$site_hostname" ]]; then
        compose_project_name="$(slugify "$site_hostname")"
    fi

    if [[ -n "$site_hostname" ]]; then
        frontend_base_url="${site_scheme}://${site_hostname}"
        env_set FRONTEND_BASE_URL "$frontend_base_url"
        env_set NG_ALLOWED_HOSTS "$site_hostname"
        ok ".env.param -> FRONTEND_BASE_URL=${frontend_base_url}"
        ok ".env.param -> NG_ALLOWED_HOSTS=${site_hostname}"
    fi

    if [[ -n "$compose_project_name" ]]; then
        env_set COMPOSE_PROJECT_NAME "$compose_project_name"
        ok ".env.param -> COMPOSE_PROJECT_NAME=${compose_project_name}"
    fi

    if [[ -n "$frontend_port" ]]; then
        env_set FRONTEND_PORT "$frontend_port"
        ok ".env.param -> FRONTEND_PORT=${frontend_port}"
    fi

    if [[ -n "$expose_backend" ]]; then
        env_set EXPOSE_BACKEND "$expose_backend"
        ok ".env.param -> EXPOSE_BACKEND=${expose_backend}"
    fi

    if [[ -n "$backend_port" ]]; then
        env_set BACKEND_PORT "$backend_port"
        ok ".env.param -> BACKEND_PORT=${backend_port}"
    fi

    if [[ -n "$backend_api_key" ]]; then
        env_set BACKEND_API_KEY "$backend_api_key"
        ok ".env.param -> BACKEND_API_KEY configurata (***)"
    fi
}

ERRORS=0

echo
echo -e "${BOLD}Prerequisites${RESET}"

command -v docker >/dev/null 2>&1 && ok "Docker found" || { echo -e "  ${RED}ERR${RESET} Docker not found" >&2; exit 1; }
docker compose version >/dev/null 2>&1 && ok "docker compose found" || { echo -e "  ${RED}ERR${RESET} docker compose not found" >&2; exit 1; }
[[ -f docker-compose.yml ]] && ok "docker-compose.yml present" || { echo -e "  ${RED}ERR${RESET} docker-compose.yml missing" >&2; exit 1; }

echo
echo -e "${BOLD}Configuration${RESET}"

if [[ ! -f .env ]]; then
    if [[ -f .env.param ]]; then
        touch .env
        ok ".env created"
    else
        echo -e "  ${RED}ERR${RESET} .env.param non trovato!" >&2
        echo "  Crea un file .env.param con le tue configurazioni e riprova."
        exit 1
    fi
fi
ok ".env present"

if [[ -f .env.param ]]; then
    sync_env_from_params
else
    warn ".env.param not present, using .env directly"
fi

if [[ "$DEV_MODE" == true ]]; then
    echo
    echo -e "${BOLD}Development${RESET}"
    echo "  Frontend: http://localhost:$(env_get DEV_FRONTEND_PORT || echo 4200)"
    echo "  Backend:  http://localhost:$(env_get DEV_BACKEND_PORT || echo 5000)"
    echo
    docker compose up --build
    exit 0
fi

COMPOSE_PROJECT_NAME="$(env_get COMPOSE_PROJECT_NAME)"
FRONTEND_PORT="$(env_get FRONTEND_PORT)"
BACKEND_PORT="$(env_get BACKEND_PORT)"
EXPOSE_BACKEND="$(env_get EXPOSE_BACKEND)"
FRONTEND_BASE_URL="$(env_get FRONTEND_BASE_URL)"
NG_ALLOWED_HOSTS="$(env_get NG_ALLOWED_HOSTS)"

[[ -z "$COMPOSE_PROJECT_NAME" ]] && fail "COMPOSE_PROJECT_NAME missing in .env"
[[ "$COMPOSE_PROJECT_NAME" == "CHANGE_ME" ]] && fail "COMPOSE_PROJECT_NAME is still CHANGE_ME"
[[ -n "$COMPOSE_PROJECT_NAME" && ! "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9_-]+$ ]] && fail "COMPOSE_PROJECT_NAME contains invalid characters"
[[ -z "$FRONTEND_PORT" ]] && fail "FRONTEND_PORT missing in .env"

if [[ "${EXPOSE_BACKEND:-no}" == "yes" && -z "${BACKEND_PORT:-}" ]]; then
    fail "EXPOSE_BACKEND=yes requires BACKEND_PORT"
fi

[[ -n "$COMPOSE_PROJECT_NAME" && "$COMPOSE_PROJECT_NAME" != "CHANGE_ME" ]] && ok "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"
[[ -n "$FRONTEND_PORT" ]] && ok "FRONTEND_PORT=${FRONTEND_PORT}"

if [[ -n "$FRONTEND_BASE_URL" ]]; then
    ok "FRONTEND_BASE_URL=${FRONTEND_BASE_URL}"
else
    warn "FRONTEND_BASE_URL not set"
fi

if [[ -n "$NG_ALLOWED_HOSTS" ]]; then
    ok "NG_ALLOWED_HOSTS=${NG_ALLOWED_HOSTS}"
else
    warn "NG_ALLOWED_HOSTS not set"
fi

if (( ERRORS > 0 )); then
    echo
    echo -e "  ${RED}ERR${RESET} Fix configuration before deploying" >&2
    exit 1
fi

compose_files=(-f docker-compose.yml)
if [[ "${EXPOSE_BACKEND:-no}" == "yes" ]]; then
    if [[ ! -f docker-compose.backend-exposed.yml ]]; then
        warn "EXPOSE_BACKEND=yes but docker-compose.backend-exposed.yml not found, continuing without it"
    else
        compose_files+=(-f docker-compose.backend-exposed.yml)
        ok "Backend exposed on host port ${BACKEND_PORT:-8080}"
    fi
else
    ok "Backend kept internal to Docker network"
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
    local i status body

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

    echo -e "  ${RED}ERR${RESET} Service did not return HTTP ${expected_status} for ${url}" >&2
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

    echo -e "  ${RED}ERR${RESET} backend internal /health did not become ready" >&2
    return 1
}

# =============================================================================
# ESECUZIONE TEST PUBBLICI (ISOLATO)
# =============================================================================

if [[ "$TEST_PUBLIC" == true ]]; then
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
            info "Stopping test stack..."
            compose_test down
        fi
    }
    trap cleanup_test EXIT

    info "Public browser URL: ${browser_url}"
    info "Proxy test URL: ${public_base_url}"

    if [[ "$NO_CACHE" == true ]]; then
        info "Building test stack with --no-cache"
        compose_test build --no-cache
    else
        info "Building test stack"
        compose_test build
    fi
    compose_test up -d

    info "Waiting for public proxy to respond..."
    wait_for_http "${public_base_url}/health" "$PUBLIC_HOST" 200 && ok "Public proxy health returned HTTP 200" || exit 1

    mapfile -t home_response < <(curl_with_host "${public_base_url}/" "$PUBLIC_HOST")
    assert_status "${home_response[0]}" "200" "/ returned unexpected status" || exit 1
    assert_contains "${home_response[*]:1}" "<app-root" "/ did not contain <app-root" || exit 1
    ok "/ returned HTTP 200 with app markup"

    mapfile -t story_response < <(curl_with_host "${public_base_url}/avventura/poveri-maschi" "$PUBLIC_HOST")
    assert_status "${story_response[0]}" "200" "/avventura/poveri-maschi returned unexpected status" || exit 1
    assert_contains "${story_response[*]:1}" "<app-root" "/avventura/poveri-maschi did not contain <app-root" || exit 1
    assert_contains "${story_response[*]:1}" "poveri-maschi" "/avventura/poveri-maschi did not contain story markers" || exit 1
    ok "/avventura/poveri-maschi SSR returned HTTP 200 with app markup"

    mapfile -t generator_response < <(curl_with_host "${public_base_url}/generatori/incel" "$PUBLIC_HOST")
    assert_status "${generator_response[0]}" "200" "/generatori/incel returned unexpected status" || exit 1
    assert_contains "${generator_response[*]:1}" "<app-root" "/generatori/incel did not contain <app-root" || exit 1
    assert_contains "${generator_response[*]:1}" "generator" "/generatori/incel did not contain generator markers" || exit 1
    ok "/generatori/incel SSR returned HTTP 200 with app markup"

    mapfile -t api_response < <(curl_with_host "${public_base_url}/api/stories" "$PUBLIC_HOST")
    assert_status "${api_response[0]}" "200" "/api/stories returned unexpected status" || exit 1
    if [[ "${api_response[*]:1}" != \[* && "${api_response[*]:1}" != \{* ]]; then
        fail "/api/stories did not return JSON"
        exit 1
    fi
    ok "/api/stories returned HTTP 200 JSON"

    if [[ "$SKIP_INVALID_HOST_CHECK" != true ]]; then
        mapfile -t invalid_response < <(curl_with_host "${public_base_url}/avventura/poveri-maschi" "$invalid_host")
        if [[ "${invalid_response[0]}" == "200" ]]; then
            warn "Invalid host check returned HTTP 200. Review frontend logs."
        else
            ok "Invalid host check returned HTTP ${invalid_response[0]}"
        fi
    fi

    if [[ "${EXPOSE_BACKEND:-no}" == "yes" ]]; then
        mapfile -t backend_response < <(curl_plain "http://127.0.0.1:${BACKEND_PORT}/health")
        assert_status "${backend_response[0]}" "200" "Exposed backend /health returned unexpected status" || exit 1
        ok "Exposed backend /health returned HTTP 200"
    fi

    echo
    ok 'Public Smoke Test completed successfully.'
    exit 0
fi

# =============================================================================
# ESECUZIONE DEPLOY PRODUZIONE REALE
# =============================================================================

echo
echo -e "${BOLD}Port check${RESET}"

check_port_conflict() {
    local port="$1"
    local conflicting
    conflicting=$(docker ps --format "{{.Names}}\t{{.Ports}}" \
        | grep -E "(0\.0\.0\.0|:::):${port}->" \
        | grep -v "^${COMPOSE_PROJECT_NAME}-" || true)
    if [[ -n "$conflicting" ]]; then
        local container_name
        container_name=$(echo "$conflicting" | awk '{print $1}')
        fail "Port ${port} already used by: ${container_name}"
        echo "  Stop it with: docker stop ${container_name}" >&2
        return 1
    fi
    ok "Port ${port} is free"
}

check_port_conflict "${FRONTEND_PORT}"
if [[ "${EXPOSE_BACKEND:-no}" == "yes" && -n "${BACKEND_PORT:-}" ]]; then
    check_port_conflict "${BACKEND_PORT}"
fi

if (( ERRORS > 0 )); then
    echo
    echo -e "  ${RED}ERR${RESET} Fix port conflicts before deploying" >&2
    exit 1
fi

echo
echo -e "${BOLD}Deploy${RESET}"

if [[ "$NO_CACHE" == true ]]; then
    ok "Running clean Docker build"
    env docker compose "${compose_files[@]}" build --no-cache frontend backend
    env docker compose "${compose_files[@]}" up -d
else
    env docker compose "${compose_files[@]}" up -d --build
fi

# =============================================================================
# ESECUZIONE CONTROLLI POST-DEPLOY (Opzionale)
# =============================================================================

if [[ "$TEST_POST_DEPLOY" == true ]]; then
    echo
    echo -e "${BOLD}Test Post-Deploy${RESET}"
    
    echo "  Checking frontend health on http://127.0.0.1:${FRONTEND_PORT}/health"
    wait_for_http "http://127.0.0.1:${FRONTEND_PORT}/health" "" 200 && ok "Frontend /health returned HTTP 200" || exit 1

    if [[ "${EXPOSE_BACKEND:-no}" == "yes" && -n "${BACKEND_PORT:-}" ]]; then
        echo "  Checking exposed backend health on http://127.0.0.1:${BACKEND_PORT}/health"
        wait_for_http "http://127.0.0.1:${BACKEND_PORT}/health" "" 200 && ok "Backend /health returned HTTP 200 on exposed port" || exit 1
    else
        echo "  Checking backend internal health inside Docker"
        wait_backend_internal && ok "Backend internal /health returned HTTP 200" || exit 1
    fi
fi

echo
echo -e "${BOLD}Pulizia Docker...${RESET}"
docker image prune -f --filter "dangling=true"
ok "Immagini orfane rimosse per liberare spazio"

echo
echo -e "  ${GREEN}OK${RESET} Deploy completed"
echo "  Logs:  docker compose -f docker-compose.yml logs -f"
echo "  State: docker compose -f docker-compose.yml ps"
echo
