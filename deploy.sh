#!/usr/bin/env bash
# =============================================================================
# deploy.sh - Pubblica Br1WebEngine in produzione (semplice e disaccoppiato).
#
# Uso:
#   ./deploy.sh                      Pubblica frontend + backend
#   ./deploy.sh --frontend           Pubblica solo il frontend
#   ./deploy.sh --backend            Pubblica solo il backend (privato o pubblico secondo config)
#   ./deploy.sh --no-cache           Forza la build Docker ignorando la cache
#   ./deploy.sh --help               Mostra questo messaggio
#
# Modello: leggi la config, controlla i segreti, poi un preflight isolato (build +
# avvio su porte effimere con --wait sugli HEALTHCHECK). Solo se la nuova build è SANA
# si fa lo swap in produzione: se non compila o non parte, il sito attuale resta intatto.
# I conflitti di porta vengono solo segnalati: nessun container viene fermato automaticamente.
#
# Backend privato vs pubblico: si decide con 'backend.public' in global-settings.json
# (true -> esposto sull'host tramite docker-compose.backend-exposed.yml).
#
# Sviluppo locale: usa lo script del frontend + Visual Studio per il backend
# (non c'è più un dev-via-Docker).
#
# Configurazione: tutto vive in global-settings.json (+ override global-settings.local.json).
# =============================================================================

set -euo pipefail

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Variabili di stato
NO_CACHE=false
DEPLOY_FRONTEND=false
DEPLOY_BACKEND=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --frontend) DEPLOY_FRONTEND=true; shift ;;
        --backend)  DEPLOY_BACKEND=true; shift ;;
        --no-cache) NO_CACHE=true; shift ;;
        *) echo "  WARN opzione sconosciuta ignorata: $1" >&2; shift ;;
    esac
done

# Default: se non specifichi nulla, pubblichi tutto.
if [[ "$DEPLOY_FRONTEND" == false && "$DEPLOY_BACKEND" == false ]]; then
    DEPLOY_FRONTEND=true
    DEPLOY_BACKEND=true
fi

if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi

info() { echo -e "  ${BOLD}[info]${RESET} $*"; }
ok()   { echo -e "  ${GREEN}OK${RESET} $*"; }
warn() { echo -e "  ${YELLOW}WARN${RESET} $*"; }
fail() { echo -e "  ${RED}ERR${RESET} $*" >&2; ERRORS=$((ERRORS + 1)); }

# Riavvia un servizio compose SOLO se è attualmente in esecuzione (restart, non rebuild).
# Usato per riallineare all'ApiKey nuova il lato NON toccato da un deploy parziale, senza
# che tu debba ricordartene: se non gira, non c'è nulla da riallineare.
restart_if_running() {
    local svc="$1" cid
    cid="$(docker compose "${compose_files[@]}" ps -q "$svc" 2>/dev/null || true)"
    if [[ -n "$cid" && "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" == "true" ]]; then
        info "Riavvio '$svc' per riallineare la chiave..."
        if docker compose "${compose_files[@]}" restart "$svc" >/dev/null 2>&1; then
            ok "'$svc' riavviato: chiave riallineata"
        else
            warn "Riavvio di '$svc' fallito: riavvialo a mano ('docker compose ${compose_files[*]} restart $svc') per evitare 401"
        fi
    else
        info "'$svc' non in esecuzione: nessun riallineamento necessario"
    fi
}

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
# shellcheck source=scripts/lib/br1-config.sh
source "${ROOT}/scripts/lib/br1-config.sh"

# Legge Security.ApiKeys[0] da un file JSON (vuoto se il file non c'è o è illeggibile).
_read_api_key() {
    [[ -f "$1" ]] || { printf ''; return 0; }
    BR1_KEYFILE="$1" node --input-type=module --eval "
import { readFileSync } from 'fs';
try { const s = JSON.parse(readFileSync(process.env.BR1_KEYFILE, 'utf-8')); process.stdout.write(String(s.Security?.ApiKeys?.[0] ?? '')); }
catch { process.stdout.write(''); }
" 2>/dev/null || true
}

# ApiKey ATTUALE, catturata dal file effective del deploy precedente PRIMA di rigenerarlo:
# è esattamente la chiave che i container già in esecuzione hanno in cache (l'hanno letta
# all'avvio dallo stesso file e non la rileggono più).
OLD_API_KEY="$(_read_api_key "./.br1-settings.effective.json")"

br1_load_config || { echo -e "  ${RED}ERR${RESET} Lettura/merge di global-settings(.local).json fallito (JSON non valido?)" >&2; exit 1; }
ok "Configurazione letta (${BR1_SETTINGS_FILE})"

# ApiKey NUOVA (dopo la rigenerazione). Se differisce, il lato non deployato ma in esecuzione
# ha la chiave vecchia in cache e va riavviato per riallinearsi (vedi fondo script).
NEW_API_KEY="$(_read_api_key "$BR1_SETTINGS_FILE")"
KEY_CHANGED=false
[[ "$OLD_API_KEY" != "$NEW_API_KEY" ]] && KEY_CHANGED=true

[[ -z "$COMPOSE_PROJECT_NAME" ]] && fail "COMPOSE_PROJECT_NAME non derivabile da global-settings.json (project.name)"
[[ -n "$COMPOSE_PROJECT_NAME" && ! "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9_-]+$ ]] && fail "COMPOSE_PROJECT_NAME contiene caratteri non validi (ammessi: a-z, 0-9, - e _)"
[[ -z "$FRONTEND_PORT" ]] && fail "FRONTEND_PORT non valido in global-settings.json (frontend.port)"
if [[ "${EXPOSE_BACKEND:-no}" == "yes" && -z "${BACKEND_PORT:-}" ]]; then
    fail "backend.public=true richiede backend.publicPort"
fi
# Hostname obbligatorio quando pubblichi il frontend. Senza, l'SSR è fail-closed: accetta solo
# gli host locali, quindi al dominio reale risponde 421 (e sitemap/canonical/og userebbero
# example.com). Insidioso: l'healthcheck del preflight gira su localhost e PASSEREBBE, quindi
# il deploy sembrerebbe riuscito mentre il sito è irraggiungibile dal dominio vero.
if [[ "$DEPLOY_FRONTEND" == true && -z "${FRONTEND_BASE_URL:-}" ]]; then
    fail "frontend.hostname non impostato in global-settings.local.json: il sito risponderebbe 421 al dominio reale e gli URL SEO userebbero example.com. Imposta es. \"frontend\": { \"hostname\": \"miodominio.it\" }."
fi
if (( ERRORS > 0 )); then
    echo
    echo -e "  ${RED}ERR${RESET} Correggi la configurazione in global-settings.json prima di pubblicare" >&2
    exit 1
fi
ok "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"
ok "FRONTEND_PORT=${FRONTEND_PORT}"
# Avviso (non bloccante): dietro un reverse proxy serve BehindProxy=true, altrimenti il rate
# limiter del backend vede l'IP del proxy per OGNI utente → li conta come uno solo → 100 req/min
# condivise da tutti (429 intermittenti sotto traffico modesto). Se NON usi un proxy, ignora.
if [[ "$DEPLOY_BACKEND" == true && "${BEHIND_PROXY:-no}" != "yes" ]]; then
    warn "Security.BehindProxy non è true: se pubblichi dietro un reverse proxy (es. nginx) il rate limiter conterà tutti gli utenti come un solo IP. Imposta \"Security\": { \"BehindProxy\": true } in global-settings.local.json."
fi

# File compose: base + (se il backend è pubblico) l'override che lo espone sull'host.
compose_files=(-f docker-compose.yml)
if [[ "${EXPOSE_BACKEND:-no}" == "yes" ]]; then
    if [[ -f docker-compose.backend-exposed.yml ]]; then
        compose_files+=(-f docker-compose.backend-exposed.yml)
        ok "Backend pubblico sulla porta host ${BACKEND_PORT}"
    else
        warn "backend.public=true ma docker-compose.backend-exposed.yml non trovato, continuo senza"
    fi
else
    ok "Backend privato (solo rete Docker interna)"
fi

# Servizi da pubblicare in base ai flag.
services=()
[[ "$DEPLOY_FRONTEND" == true ]] && services+=(frontend)
[[ "$DEPLOY_BACKEND" == true ]] && services+=(backend)
info "Pubblico: ${services[*]}"

# ── GUARD SEGRETI DI PRODUZIONE (automatico) ─────────────────────────────────
# Se hai lasciato i segreti segnaposto/deboli di default, ci fermiamo qui: non puoi
# pubblicare per sbaglio con la chiave di sviluppo.
echo
echo -e "${BOLD}Controllo segreti${RESET}"
_secret_errs="$(mktemp)"
if node --input-type=module --eval "
import { readFileSync } from 'fs';
const s = JSON.parse(readFileSync('${BR1_SETTINGS_FILE}','utf-8'));
const DEV = 'dev-only-change-me-chiave-di-sviluppo-min-32-byte';
const sk = String(s.Security?.Token?.SecretKey ?? '').trim();
const keys = Array.isArray(s.Security?.ApiKeys) ? s.Security.ApiKeys : [];
const errs = [];
if (sk) {
  if (sk === DEV) errs.push('Security.Token.SecretKey e ancora il segreto di sviluppo. Generane uno: openssl rand -base64 48');
  else if (sk.length < 32) errs.push('Security.Token.SecretKey e troppo corta (<32 caratteri). Generane una robusta: openssl rand -base64 48');
}
if (keys.length === 0) errs.push('Security.ApiKeys e vuoto: il frontend non puo autenticarsi col backend.');
for (const k of keys) {
  if (k === 'frontend') errs.push('Security.ApiKeys contiene la chiave segnaposto \"frontend\". Sostituiscila: openssl rand -base64 32');
  else if (String(k).length < 32) errs.push('Security.ApiKeys contiene una chiave troppo corta (<32 caratteri): ' + k);
}
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
" 2>"$_secret_errs"; then
    ok "Segreti di produzione validi"
else
    while IFS= read -r _err; do [[ -n "$_err" ]] && fail "$_err"; done < "$_secret_errs"
fi
rm -f "$_secret_errs"
if (( ERRORS > 0 )); then
    echo
    echo -e "  ${RED}ERR${RESET} Correggi i segreti in global-settings.local.json prima di pubblicare" >&2
    exit 1
fi

# ── MAILER (informativo) ─────────────────────────────────────────────────────
# Il mailer si attiva se Mail.Host + Mail.FromAddress sono presenti. La password SMTP può
# arrivare dal JSON montato oppure, meglio, da una variabile d'ambiente (Mail__Password) che
# il backend legge con precedenza e che NON finisce nel file su disco. Qui mostriamo solo la
# fonte; non blocchiamo (un relay potrebbe non richiedere autenticazione).
_mail_state="$(BR1_EFFECTIVE="$BR1_SETTINGS_FILE" node --input-type=module --eval "
import { readFileSync } from 'fs';
const s = JSON.parse(readFileSync(process.env.BR1_EFFECTIVE, 'utf-8'));
const m = s.Mail || {};
const on = Boolean(String(m.Host||'').trim() && String(m.FromAddress||'').trim());
const jsonPwd = Boolean(String(m.Password||'').trim());
process.stdout.write((on?'on':'off') + ' ' + (jsonPwd?'json':'nojson'));
")"
read -r _mail_on _mail_pwd <<< "${_mail_state:-off nojson}"
if [[ "$_mail_on" == "on" ]]; then
    if [[ -n "${Mail__Password:-}" ]]; then
        ok "Mailer attivo (password SMTP da variabile d'ambiente: fuori dal file su disco)"
    elif [[ "$_mail_pwd" == "json" ]]; then
        ok "Mailer attivo (password SMTP dal JSON montato)"
        info "Per tenerla fuori dal disco: export Mail__Password='...' prima di ./deploy.sh"
    else
        warn "Mailer attivo ma senza password SMTP (né JSON né Mail__Password): ok solo se il relay non la richiede"
    fi
else
    info "Mailer non configurato (sezione Mail assente o incompleta): invio email disattivato"
fi

# ── CONTROLLO PORTE (solo avviso, nessuna chiusura automatica) ───────────────
echo
echo -e "${BOLD}Controllo porte${RESET}"
check_port() {
    local port="$1" conflicting project_label normalized
    conflicting=$(docker ps --format '{{.Names}}\t{{.Ports}}\t{{.Label "com.docker.compose.project"}}' \
        | grep -E ":${port}->" | head -n1 || true)
    if [[ -z "$conflicting" ]]; then
        ok "Porta ${port} libera"
        return
    fi
    project_label=$(printf '%s' "$conflicting" | awk -F'\t' '{print $3}')
    normalized=$(printf '%s' "$COMPOSE_PROJECT_NAME" | tr '[:upper:]' '[:lower:]')
    if [[ -n "$project_label" && "$project_label" == "$normalized" ]]; then
        ok "Porta ${port} in uso da questo stesso progetto (verrà aggiornato)"
    else
        warn "Porta ${port} occupata da '${project_label:-container esterno}'. Procedo comunque: se il bind fallisce, Docker lo segnala. Per liberarla: docker stop <container>."
    fi
}
[[ "$DEPLOY_FRONTEND" == true ]] && check_port "${FRONTEND_PORT}"
[[ "$DEPLOY_BACKEND" == true && "${EXPOSE_BACKEND:-no}" == "yes" && -n "${BACKEND_PORT:-}" ]] && check_port "${BACKEND_PORT}"

# ── BUILD + PREFLIGHT (la produzione non viene toccata finché la nuova build non è sana) ──
# Costruiamo e avviamo le NUOVE immagini in una copia isolata su porte effimere
# (FRONTEND_PORT=0/BACKEND_PORT=0: Docker assegna porte libere, niente collisioni con
# la produzione). `--wait` usa gli HEALTHCHECK dei Dockerfile: se la build non compila
# O non parte sana, ci fermiamo qui e il sito attuale resta intatto.
echo
echo -e "${BOLD}Build + preflight${RESET}"
preflight() {
    env COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}-pf" FRONTEND_PORT=0 BACKEND_PORT=0 \
        docker compose "${compose_files[@]}" "$@"
}
preflight down -v >/dev/null 2>&1 || true
if [[ "$NO_CACHE" == true ]]; then
    preflight build --no-cache "${services[@]}"
else
    preflight build "${services[@]}"
fi
info "Avvio isolato delle nuove immagini e attesa che siano sane..."
if preflight up -d --wait --wait-timeout 120 "${services[@]}"; then
    ok "Nuova build sana (verificata in isolamento)"
    preflight down -v >/dev/null 2>&1 || true
else
    fail "La nuova build non è sana: la produzione NON è stata toccata"
    preflight logs --tail 20 || true
    preflight down -v >/dev/null 2>&1 || true
    exit 1
fi

# ── PUBBLICAZIONE (swap) ─────────────────────────────────────────────────────
# Il preflight ha buildato sotto il progetto "-pf", quindi le immagini di produzione
# vanno ricostruite esplicitamente: senza questa build, `up` riuserebbe l'immagine
# del deploy precedente. La build attinge alla cache calda del preflight (istantaneo)
# e `--wait` ricontrolla la salute sulle porte reali.
echo
echo -e "${BOLD}Pubblicazione${RESET}"
info "Build delle immagini di produzione (dalla cache del preflight)..."
docker compose "${compose_files[@]}" build "${services[@]}"
info "Sostituzione dei container di produzione..."
docker compose "${compose_files[@]}" up -d --wait --wait-timeout 120 "${services[@]}"
ok "Container avviati e sani"

echo
echo -e "${BOLD}Pulizia${RESET}"
docker image prune -f --filter "dangling=true" >/dev/null
ok "Immagini orfane rimosse"

# ── COERENZA CHIAVE FRONTEND↔BACKEND (deploy parziale + ApiKey ruotata) ──────
# Frontend SSR e backend leggono l'ApiKey dal file effective (montato read-only) UNA sola
# volta all'avvio e la tengono in cache (frontend: _br1/_backend ??=; backend: ValidKeys
# catturate alla registrazione DI). Se la chiave è cambiata e hai deployato UN SOLO lato,
# quello NON deployato ma in esecuzione ha ancora la chiave vecchia → ogni /api va in 401.
# Il file è montato (non baked): basta riavviare quel lato (restart, non rebuild) perché
# rilegga la config e si riallinei. Simmetrico: vale in entrambe le direzioni.
if [[ "$KEY_CHANGED" == true ]]; then
    echo
    echo -e "${BOLD}Coerenza frontend↔backend${RESET}"
    info "ApiKey cambiata rispetto al deploy precedente: riallineo i lati non deployati"
    [[ "$DEPLOY_FRONTEND" == false ]] && restart_if_running frontend
    [[ "$DEPLOY_BACKEND"  == false ]] && restart_if_running backend
fi

echo
echo -e "  ${GREEN}OK${RESET} Pubblicazione completata (${services[*]})"
echo "  Log:   docker compose ${compose_files[*]} logs -f"
echo "  Stato: docker compose ${compose_files[*]} ps"
echo
