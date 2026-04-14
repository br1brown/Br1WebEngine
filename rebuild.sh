#!/usr/bin/env bash
# =============================================================================
# rebuild.sh — Deploy e rebuild produzione Br1WebEngine
#
# Uso:
#   ./rebuild.sh          Controlla .env, poi ricostruisce e riavvia
#   ./rebuild.sh --help   Mostra questo messaggio
#
# Prima installazione: cp .env.example .env, edita .env, poi ./rebuild.sh
# =============================================================================

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,10p' "$0" | sed 's/^# \?//'
    exit 0
fi

# ── Colori ─────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
warn() { echo -e "  ${YELLOW}!${RESET} $*"; }
fail() { echo -e "  ${RED}✗${RESET} $*" >&2; ERRORS=$(( ERRORS + 1 )); }

env_get() { grep -E "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true; }

ERRORS=0

# ── Prerequisiti ───────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}Controllo prerequisiti...${RESET}"

command -v docker &>/dev/null      && ok "Docker trovato" || { echo -e "  ${RED}✗${RESET} Docker non trovato" >&2; exit 1; }
docker compose version &>/dev/null && ok "docker compose trovato" || { echo -e "  ${RED}✗${RESET} Plugin 'docker compose' non trovato" >&2; exit 1; }
[[ -f docker-compose.yml ]]        && ok "docker-compose.yml presente" || { echo -e "  ${RED}✗${RESET} docker-compose.yml non trovato — eseguire dalla root del progetto" >&2; exit 1; }

# ── Controllo .env ─────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}Controllo .env...${RESET}"

if [[ ! -f .env ]]; then
    echo -e "  ${RED}✗${RESET} File .env non trovato." >&2
    echo -e "    Crea il file di configurazione e riprova:" >&2
    echo -e "      cp .env.example .env" >&2
    echo -e "      # edita .env con i tuoi valori, poi:" >&2
    echo -e "      ./rebuild.sh" >&2
    exit 1
fi
ok ".env presente"

PROJECT_NAME=$(env_get PROJECT_NAME)
FRONTEND_PORT=$(env_get FRONTEND_PORT)

[[ -z "$PROJECT_NAME" ]]             && fail "PROJECT_NAME non impostato in .env"
[[ "$PROJECT_NAME" == "CHANGE_ME" ]] && fail "PROJECT_NAME è ancora il placeholder 'CHANGE_ME'"
[[ -z "$FRONTEND_PORT" ]]            && fail "FRONTEND_PORT non impostato in .env"

[[ -n "$PROJECT_NAME" && "$PROJECT_NAME" != "CHANGE_ME" ]] && ok "PROJECT_NAME = $PROJECT_NAME"
[[ -n "$FRONTEND_PORT" ]] && ok "FRONTEND_PORT = $FRONTEND_PORT"

if (( ERRORS > 0 )); then
    echo
    echo -e "  ${RED}Trovati $ERRORS errori. Correggere .env prima di procedere.${RESET}" >&2
    exit 1
fi

# ── Esposizione backend ────────────────────────────────────────────────────────
EXPOSE=$(env_get EXPOSE_BACKEND)

if [[ -z "$EXPOSE" ]]; then
    echo
    read -rp "  Esporre la porta backend sull'host? [s/N]: " _reply
    if [[ "$_reply" =~ ^[SsYy]$ ]]; then
        EXPOSE=yes
        echo "EXPOSE_BACKEND=yes" >> .env
    else
        EXPOSE=no
        echo "EXPOSE_BACKEND=no" >> .env
    fi
fi

# ── Determina comando compose ──────────────────────────────────────────────────
if [[ "$EXPOSE" == "yes" ]]; then
    if [[ ! -f docker-compose.backend-exposed.yml ]]; then
        warn "EXPOSE_BACKEND=yes ma docker-compose.backend-exposed.yml non trovato — procedo senza"
        COMPOSE="docker compose -f docker-compose.yml"
    else
        COMPOSE="docker compose -f docker-compose.yml -f docker-compose.backend-exposed.yml"
        ok "Backend esposto sull'host (porta $(env_get BACKEND_PORT))"
    fi
else
    COMPOSE="docker compose -f docker-compose.yml"
    ok "Backend interno alla rete Docker"
fi

# ── Deploy ─────────────────────────────────────────────────────────────────────
echo
echo -e "${BOLD}Avvio rebuild...${RESET}"
echo
$COMPOSE up -d --build
echo
echo -e "  ${GREEN}✓ Deploy completato.${RESET}"
echo
echo "  Logs:  docker compose -f docker-compose.yml logs -f"
echo "  Stato: docker compose -f docker-compose.yml ps"
echo
