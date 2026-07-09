#!/usr/bin/env bash
# =============================================================================
# backup.sh - Backup dei volumi dati persistenti (uploads, db) con retention.
#
# I dati che sopravvivono ai deploy vivono nei volumi Docker
# <progetto>_uploads-data e <progetto>_db-data. Questo script ne crea un
# archivio .tar.gz datato e tiene solo gli ultimi N backup.
#
# Uso:
#   ./backup.sh                    Backup in ./backups, retention 14
#   BACKUP_DIR=/mnt/dati ./backup.sh
#   RETENTION=30 ./backup.sh
#
# Cron (ogni notte alle 3:00):
#   0 3 * * * cd /percorso/progetto && ./backup.sh >> backups/backup.log 2>&1
#
# Ripristino di un volume da un archivio (ESEMPIO, sovrascrive i dati!):
#   docker run --rm -v <progetto>_uploads-data:/data -v "$PWD/backups":/b alpine:3.22 \
#     sh -c 'rm -rf /data/* && tar xzf /b/uploads-data-AAAAmmGG-HHMMSS.tar.gz -C /data'
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION="${RETENTION:-14}"

if [[ -t 1 ]]; then
    BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; RESET='\033[0m'
else
    BOLD=''; GREEN=''; YELLOW=''; RED=''; RESET=''
fi
ok()   { echo -e "  ${GREEN}OK${RESET} $*"; }
warn() { echo -e "  ${YELLOW}WARN${RESET} $*"; }

command -v docker >/dev/null 2>&1 || { echo -e "  ${RED}ERR${RESET} Docker non trovato" >&2; exit 1; }
command -v node   >/dev/null 2>&1 || { echo -e "  ${RED}ERR${RESET} Node.js non trovato (serve per leggere il nome progetto)" >&2; exit 1; }
[[ -f global-settings.json ]] || { echo -e "  ${RED}ERR${RESET} global-settings.json non trovato (esegui dalla root del progetto)" >&2; exit 1; }

# Nome progetto = slug di project.name, identico a quello che deriva deploy.sh:
# i volumi Docker Compose sono prefissati con questo nome.
PROJ="$(node --input-type=module --eval "
import { readFileSync } from 'fs';
const s = JSON.parse(readFileSync('global-settings.json','utf-8'));
const slug = String(s.project?.name || 'app').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
process.stdout.write(slug);
")"
[[ -n "$PROJ" ]] || { echo -e "  ${RED}ERR${RESET} Impossibile derivare il nome progetto da global-settings.json" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"

echo
echo -e "${BOLD}Backup volumi del progetto '${PROJ}' → ${BACKUP_DIR}${RESET}"

backed_up=0
for vol_suffix in uploads-data db-data; do
    vol="${PROJ}_${vol_suffix}"

    if ! docker volume inspect "$vol" >/dev/null 2>&1; then
        warn "Volume ${vol} inesistente — saltato (nessun dato ancora?)"
        continue
    fi

    archive="${BACKUP_DIR}/${vol_suffix}-${STAMP}.tar.gz"
    # Container effimero alpine: monta il volume in sola lettura e lo comprime.
    # Tag pinnato (non ":latest" implicito, quello che risolve "alpine" nudo): uno script di
    # backup gira spesso da cron, senza controllo umano — una breaking change silenziosa
    # nell'immagine "latest" (es. comportamento di tar/busybox) romperebbe i backup notturni
    # senza che nessuno se ne accorga fino al giorno del ripristino, il momento peggiore possibile.
    if docker run --rm \
        -v "${vol}:/data:ro" \
        -v "$(cd "$BACKUP_DIR" && pwd):/backup" \
        alpine:3.22 tar czf "/backup/$(basename "$archive")" -C /data . ; then
        ok "Creato $(basename "$archive") ($(du -h "$archive" 2>/dev/null | cut -f1))"
        backed_up=$((backed_up + 1))
    else
        echo -e "  ${RED}ERR${RESET} Backup del volume ${vol} fallito" >&2
        exit 1
    fi

    # Retention: tiene i RETENTION archivi più recenti di questo volume, elimina i più vecchi.
    mapfile -t old < <(ls -1t "${BACKUP_DIR}/${vol_suffix}-"*.tar.gz 2>/dev/null | tail -n +$((RETENTION + 1)) || true)
    for f in "${old[@]}"; do
        [[ -n "$f" ]] && rm -f "$f" && echo "    rimosso vecchio backup: $(basename "$f")"
    done
done

echo
if (( backed_up == 0 )); then
    warn "Nessun volume di dati trovato — niente di cui fare backup."
else
    ok "Backup completato (${backed_up} volume/i). Retention: ultimi ${RETENTION}."
fi
