#!/usr/bin/env bash
# =============================================================================
# rebuild.sh — Deploy e rebuild produzione Br1WebEngine
#
# Prima installazione (nessun .env):
#   ./rebuild.sh     → wizard interattivo → crea .env → avvia i container
#
# Aggiornamento istanza esistente:
#   ./rebuild.sh     → legge .env → conferma → ricostruisce e riavvia
# =============================================================================

set -euo pipefail

# ── Colori (solo se stdout è un terminale) ─────────────────────────────────────
if [[ -t 1 ]]; then
    BOLD='\033[1m'; DIM='\033[2m'
    GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'
    RESET='\033[0m'
else
    BOLD=''; DIM=''; GREEN=''; YELLOW=''; RED=''; CYAN=''; RESET=''
fi

info()    { echo -e "  ${CYAN}→${RESET} $*"; }
ok()      { echo -e "  ${GREEN}✓${RESET} $*"; }
warn()    { echo -e "  ${YELLOW}!${RESET} $*"; }
fatal()   { echo -e "  ${RED}✗${RESET} $*" >&2; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}"; }
sep()     { echo -e "${DIM}──────────────────────────────────────────────${RESET}"; }

# ── Prerequisiti ───────────────────────────────────────────────────────────────
check_deps() {
    command -v docker &>/dev/null       || fatal "Docker non trovato. Installarlo prima di continuare."
    docker compose version &>/dev/null  || fatal "Plugin 'docker compose' non trovato."
    [[ -f docker-compose.yml ]]         || fatal "docker-compose.yml non trovato. Eseguire dalla root del progetto."
}

# ── Input helpers ──────────────────────────────────────────────────────────────
# Uso: ask VARNAME "Domanda" ["default"]
ask() {
    local var=$1 prompt=$2 default=${3:-} value
    if [[ -n "$default" ]]; then
        read -rp "    $prompt [$default]: " value
        value="${value:-$default}"
    else
        read -rp "    $prompt: " value
        while [[ -z "$value" ]]; do
            warn "Campo obbligatorio."
            read -rp "    $prompt: " value
        done
    fi
    printf -v "$var" '%s' "$value"
}

# Uso: ask_secret VARNAME "Domanda" (input nascosto, non finisce in history)
ask_secret() {
    local var=$1 prompt=$2 value
    read -rsp "    $prompt: " value
    echo
    printf -v "$var" '%s' "$value"
}

# Uso: ask_yn VARNAME "Domanda" ["y"|"n" (default)]
ask_yn() {
    local var=$1 prompt=$2 default=${3:-n} value hint
    [[ "$default" =~ ^[Yy]$ ]] && hint="S/n" || hint="s/N"
    read -rp "    $prompt [$hint]: " value
    value="${value:-$default}"
    [[ "$value" =~ ^[SsYy]$ ]] && printf -v "$var" 'yes' || printf -v "$var" 'no'
}

validate_port() {
    local p=$1
    [[ "$p" =~ ^[0-9]+$ ]] && (( p >= 1 && p <= 65535 )) \
        || fatal "Porta non valida: '$p'. Usare un numero tra 1 e 65535."
}

validate_name() {
    [[ "$1" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] \
        || fatal "Nome non valido: '$1'. Usare solo lettere, numeri, trattini e underscore."
}

# ── Lettura .env ───────────────────────────────────────────────────────────────
env_get() {
    grep -E "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true
}

# ── Wizard prima installazione ─────────────────────────────────────────────────
setup_wizard() {
    echo
    echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}║      Br1WebEngine — Prima installazione      ║${RESET}"
    echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
    echo -e "  ${DIM}Premi Invio per accettare il valore predefinito.${RESET}"

    # ── Progetto ────────────────────────────────────────────────────────────
    header "Progetto"
    ask PROJECT_NAME "Nome progetto, es. mio-sito (lettere, numeri, trattini)"
    validate_name "$PROJECT_NAME"

    # ── Porte ───────────────────────────────────────────────────────────────
    header "Porte"
    ask FRONTEND_PORT "Porta frontend esposta sull'host" "3000"
    validate_port "$FRONTEND_PORT"
    ask BACKEND_PORT  "Porta backend nella rete Docker" "8080"
    validate_port "$BACKEND_PORT"

    # ── URL ─────────────────────────────────────────────────────────────────
    header "URL"
    echo -e "  ${DIM}SITEMAP_BASE_URL: usato a build time per sitemap.xml. Vuoto = usa https://example.com con warning.${RESET}"
    ask SITEMAP_BASE_URL "URL pubblico del sito (es. https://miosito.it)" ""
    echo -e "  ${DIM}API_URL: lascia vuoto se frontend e backend stanno nello stesso server (Node SSR fa da proxy).${RESET}"
    echo -e "  ${DIM}Valorizza solo se il backend gira su un host separato.${RESET}"
    ask API_URL "URL backend remoto" ""

    # ── API Key ─────────────────────────────────────────────────────────────
    header "API Key"
    echo -e "  ${DIM}Chiave che il frontend invia al backend in ogni richiesta (header X-Api-Key).${RESET}"
    echo -e "  ${DIM}Deve corrispondere a Security__ApiKeys__0 nel backend (default: 'frontend').${RESET}"
    ask API_KEY "API key del frontend" "frontend"

    # ── Backend esposto ──────────────────────────────────────────────────────
    header "Esposizione backend"
    echo -e "  ${DIM}Di default il backend è raggiungibile solo dalla rete Docker interna (consigliato).${RESET}"
    echo -e "  ${DIM}Esponi la porta solo se hai client non-web (app mobile, API pubbliche, terze parti).${RESET}"
    ask_yn EXPOSE_BACKEND "Esporre la porta backend sull'host?"

    # ── Reverse proxy ────────────────────────────────────────────────────────
    header "Infrastruttura"
    echo -e "  ${DIM}Se il server è dietro Nginx/Cloudflare/ALB, il rate limiter ha bisogno di leggere${RESET}"
    echo -e "  ${DIM}l'IP reale dal header X-Forwarded-For invece dell'IP del proxy.${RESET}"
    ask_yn BEHIND_PROXY "Il server è dietro un reverse proxy (Nginx, Cloudflare, ecc.)?"

    # ── Login JWT ────────────────────────────────────────────────────────────
    header "Login JWT"
    echo -e "  ${DIM}Lascia disabilitato se il sito non ha un'area riservata.${RESET}"
    echo -e "  ${DIM}Per abilitarlo in un secondo momento: imposta Security__Token__SecretKey in .env.${RESET}"
    ask_yn ENABLE_JWT "Abilitare il login JWT?"

    JWT_SECRET="" CORS_ORIGIN=""
    if [[ "$ENABLE_JWT" == "yes" ]]; then
        echo
        ask_secret JWT_SECRET "SecretKey JWT (min 32 caratteri, nascosto)"
        if [[ -n "$JWT_SECRET" && ${#JWT_SECRET} -lt 32 ]]; then
            warn "Chiave corta (${#JWT_SECRET} car.). Il backend la espanderà, ma usa almeno 32 caratteri."
        fi
        echo -e "  ${DIM}Origini CORS: obbligatorio se il backend è esposto o su host separato.${RESET}"
        echo -e "  ${DIM}Vuoto = nessuna restrizione (solo per sviluppo).${RESET}"
        ask CORS_ORIGIN "Origine CORS consentita (es. https://miosito.it)" ""
    fi

    # ── Scrive .env ──────────────────────────────────────────────────────────
    echo; sep; info "Genero .env..."

    {
        echo "# Generato da rebuild.sh il $(date '+%Y-%m-%d %H:%M')"
        echo "# Per l'elenco completo delle variabili disponibili vedere .env.example"
        echo
        echo "# --- Obbligatori ---"
        printf 'PROJECT_NAME=%s\n'    "$PROJECT_NAME"
        printf 'FRONTEND_PORT=%s\n'   "$FRONTEND_PORT"
        echo
        echo "# --- Backend ---"
        printf 'BACKEND_PORT=%s\n'    "$BACKEND_PORT"
        printf 'API_URL=%s\n'         "$API_URL"
        printf 'API_KEY=%s\n'         "$API_KEY"
        echo
        echo "# --- Build ---"
        printf 'SITEMAP_BASE_URL=%s\n' "$SITEMAP_BASE_URL"
        echo
        echo "# --- Deploy (usato da rebuild.sh) ---"
        printf 'EXPOSE_BACKEND=%s\n'  "$EXPOSE_BACKEND"
        echo
        echo "# --- Sicurezza backend ---"
        printf 'Security__BehindProxy=%s\n' "$( [[ "$BEHIND_PROXY" == "yes" ]] && echo true || echo false )"
        if [[ -n "$JWT_SECRET" ]]; then
            printf 'Security__Token__SecretKey=%s\n' "$JWT_SECRET"
        fi
        if [[ -n "$CORS_ORIGIN" ]]; then
            printf 'Security__CorsOrigins__0=%s\n' "$CORS_ORIGIN"
        fi
        if [[ "$API_KEY" != "frontend" ]]; then
            echo "# L'API key è stata cambiata: aggiorna anche il backend."
            printf 'Security__ApiKeys__0=%s\n' "$API_KEY"
        fi
        echo
        echo "# --- Opzionali (decommentare per sovrascrivere i default) ---"
        echo "# PROXY_TIMEOUT_MS=30000"
        echo "# DIST_PATH=br1-web-engine"
        echo "# SECURITY_CSP="
    } > .env

    ok ".env creato."
}

# ── Riepilogo istanza esistente ────────────────────────────────────────────────
show_summary() {
    local name port bport expose
    name=$(env_get PROJECT_NAME)
    port=$(env_get FRONTEND_PORT)
    bport=$(env_get BACKEND_PORT)
    expose=$(env_get EXPOSE_BACKEND)

    echo
    echo -e "${BOLD}╔══════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}║          Br1WebEngine — Rebuild              ║${RESET}"
    echo -e "${BOLD}╚══════════════════════════════════════════════╝${RESET}"
    echo
    echo -e "  ${BOLD}Progetto ${RESET}  ${name:-??}"
    echo -e "  ${BOLD}Frontend ${RESET}  porta ${port:-??}"
    if [[ "$expose" == "yes" ]]; then
        echo -e "  ${BOLD}Backend  ${RESET}  esposto sull'host (porta ${bport:-8080})"
    else
        echo -e "  ${BOLD}Backend  ${RESET}  interno alla rete Docker"
    fi
    echo
}

# ── Esegue il deploy ───────────────────────────────────────────────────────────
do_rebuild() {
    local expose
    expose=$(env_get EXPOSE_BACKEND)

    local compose_cmd
    if [[ "$expose" == "yes" ]]; then
        if [[ ! -f docker-compose.backend-exposed.yml ]]; then
            warn "docker-compose.backend-exposed.yml non trovato. Procedo senza esposizione backend."
            compose_cmd="docker compose -f docker-compose.yml"
        else
            compose_cmd="docker compose -f docker-compose.yml -f docker-compose.backend-exposed.yml"
            info "Backend esposto sull'host."
        fi
    else
        compose_cmd="docker compose -f docker-compose.yml"
    fi

    sep
    info "Avvio rebuild e deploy..."
    echo
    $compose_cmd up -d --build
    echo
    sep
    ok "Deploy completato."
    echo
    echo -e "  ${DIM}Comandi utili:${RESET}"
    echo -e "  ${DIM}  docker compose -f docker-compose.yml logs -f frontend${RESET}"
    echo -e "  ${DIM}  docker compose -f docker-compose.yml logs -f backend${RESET}"
    echo -e "  ${DIM}  docker compose -f docker-compose.yml ps${RESET}"
    echo
}

# ── Main ───────────────────────────────────────────────────────────────────────
main() {
    if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
        echo "Uso: ./rebuild.sh"
        echo "  Prima volta (nessun .env): wizard interattivo → crea .env → avvia"
        echo "  Rebuild successivi: legge .env → conferma → ricostruisce e riavvia"
        exit 0
    fi

    check_deps

    if [[ ! -f .env ]]; then
        setup_wizard
        echo; sep
        info "Prima installazione completata. Avvio i container..."
        echo
        do_rebuild
    else
        show_summary
        local confirm
        ask_yn confirm "Ricostruisco e riavvio i container?"
        [[ "$confirm" == "yes" ]] || { echo; info "Operazione annullata."; exit 0; }
        echo
        do_rebuild
    fi
}

main "$@"
