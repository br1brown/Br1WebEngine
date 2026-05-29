#!/usr/bin/env bash
# =============================================================================
# pre-push.sh  —  Esegue in locale gli stessi controlli del workflow CI
#                 ("Controlli Automatici di Tutto") PRIMA di una push,
#                 così gli errori emergono qui e non dopo aver pushato.
#
# Installazione come git hook:
#   bash scripts/test/install-hooks.sh
#   (l'hook .git/hooks/pre-push richiama questo script)
#
# Esecuzione manuale:
#   bash scripts/test/pre-push.sh                # controlli statici + build
#   RUN_LIVE_TESTS=1 bash scripts/test/pre-push.sh   # aggiunge i test live in Docker
#
# Bypass una tantum (sconsigliato):
#   git push --no-verify
#
# Cosa copre per default (job CI: backend, frontend, i18n):
#   - backend: dotnet build Release + scan pacchetti NuGet vulnerabili
#   - frontend: npm audit, lint, type-check, generate statics/icons, ng build prod
#   - i18n: simmetria chiavi di traduzione
#
# Con RUN_LIVE_TESTS=1 aggiunge il job CI "live-tests":
#   - deploy.sh --uptest (stack Docker dietro reverse proxy) + a11y + Lighthouse
#   Richiede Docker attivo; è lento (qualche minuto), per questo è opt-in.
# =============================================================================

set -uo pipefail

if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; RED=''; YELLOW=''; RESET=''
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FAILURES=()

step() { echo; echo -e "${BOLD}══ $1 ══${RESET}"; }
record() {
    local name="$1"; shift
    if "$@"; then
        echo -e "  ${GREEN}OK${RESET} ${name}"
    else
        echo -e "  ${RED}ERR${RESET} ${name}" >&2
        FAILURES+=("$name")
    fi
}

# ── Backend: build + scan vulnerabilità (job CI "backend") ───────────────────
step "Backend — build Release"
record "Backend build" dotnet build backend/backend.csproj --configuration Release

step "Backend — pacchetti NuGet vulnerabili"
check_vulnerable() {
    local out
    out="$(dotnet list backend/backend.csproj package --vulnerable --include-transitive 2>&1)"
    echo "$out"
    ! echo "$out" | grep -q "has the following vulnerable packages"
}
record "Backend vulnerable packages" check_vulnerable

# ── Frontend: audit, lint, tsc, build (job CI "frontend") ────────────────────
step "Frontend — npm audit (high, prod)"
record "Frontend npm audit" bash -c "cd frontend && npm audit --audit-level=high --omit=dev"

step "Frontend — ESLint"
record "Frontend lint" bash scripts/test/lint-check.sh

step "Frontend — type-check"
record "Frontend tsc" bash scripts/test/tsc-check.sh

step "Frontend — generate statics + icons + build produzione"
record "Frontend production build" bash -c "cd frontend && npm run generate:statics && npm run generate:icons && npx ng build --configuration production"

# ── i18n: simmetria chiavi (job CI "i18n") ───────────────────────────────────
step "i18n — simmetria chiavi"
record "i18n symmetry" bash scripts/test/i18n-check.sh

# ── Live tests opzionali in Docker (job CI "live-tests") ─────────────────────
if [[ "${RUN_LIVE_TESTS:-0}" == "1" ]]; then
    step "Live tests — stack Docker + a11y + Lighthouse"
    if bash deploy.sh --uptest; then
        record "Accessibilità (a11y)" bash scripts/test/a11y-test.sh http://localhost:8088
        record "Budget Lighthouse"   bash scripts/test/lighthouse-test.sh http://localhost:8088
        # Teardown: stesso project name che deploy.sh --uptest deriva (slug di project.name).
        COMPOSE_PROJECT_NAME="$(node --input-type=module --eval "import{readFileSync}from'fs';const s=JSON.parse(readFileSync('global-settings.json','utf-8'));process.stdout.write(String(s.project?.name||'app').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,''))")" \
            docker compose -f docker-compose.yml -f docker-compose.public-test.yml down >/dev/null 2>&1 || true
    else
        FAILURES+=("Avvio stack live (deploy.sh --uptest)")
    fi
else
    echo
    echo -e "  ${YELLOW}nota${RESET} Test live (Docker a11y/Lighthouse) saltati. Per eseguirli: RUN_LIVE_TESTS=1 git push"
fi

# ── Riepilogo ────────────────────────────────────────────────────────────────
echo
if (( ${#FAILURES[@]} > 0 )); then
    echo -e "  ${RED}ERR${RESET} Push bloccata: ${#FAILURES[@]} controllo/i fallito/i:"
    for f in "${FAILURES[@]}"; do echo "    - $f"; done
    echo "  Correggi e riprova, oppure 'git push --no-verify' per forzare (sconsigliato)."
    exit 1
fi

echo -e "  ${GREEN}OK${RESET} Tutti i controlli superati — push consentita."
exit 0
