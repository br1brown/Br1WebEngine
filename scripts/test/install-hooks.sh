#!/usr/bin/env bash
# =============================================================================
# install-hooks.sh  —  Installa i git hook del progetto
#
# Crea .git/hooks/pre-push che richiama scripts/test/pre-push.sh, così i
# controlli del workflow CI girano in locale prima di ogni push.
#
# Utilizzo:
#   bash scripts/test/install-hooks.sh
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOK="${ROOT}/.git/hooks/pre-push"

if [[ ! -d "${ROOT}/.git" ]]; then
    echo "ERR: ${ROOT}/.git non trovato (non è un repo git?)" >&2
    exit 1
fi

cat > "$HOOK" <<'EOF'
#!/usr/bin/env bash
# Hook generato da scripts/test/install-hooks.sh — non modificare a mano.
# Esegue i controlli CI in locale prima della push.
ROOT="$(git rev-parse --show-toplevel)"
exec bash "${ROOT}/scripts/test/pre-push.sh"
EOF

chmod +x "$HOOK"
echo "OK: hook pre-push installato in ${HOOK}"
echo "    Bypass una tantum: git push --no-verify"
echo "    Per includere i test live in Docker: RUN_LIVE_TESTS=1 git push"
