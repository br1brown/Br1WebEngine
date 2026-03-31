#!/bin/sh
# =============================================================================
# Inizializzazione progetto derivato dal template Br1WebEngine.
#
# Eseguire una sola volta dopo la clonazione:
#   ./init-project.sh mio-progetto
#
# Lo script rinomina tutti i riferimenti interni al template
# (package.json, angular.json, Dockerfile, .csproj, ecc.),
# sostituisce i README con uno scheletro del nuovo progetto
# e prepara il file .env a partire da .env.example.
#
# Al termine lo script si autoelimina.
# =============================================================================

set -e

# --- Argomento obbligatorio ---
if [ -z "$1" ]; then
    echo "Uso: ./init-project.sh <nome-progetto>"
    echo ""
    echo "  nome-progetto   Nome in kebab-case (es. mio-sito, portfolio-2026)"
    echo ""
    echo "Lo script rinomina tutti i riferimenti interni al template."
    exit 1
fi

RAW_NAME="$1"

# --- Validazione nome ---
if ! echo "$RAW_NAME" | grep -qE '^[a-z][a-z0-9-]*$'; then
    echo "ERRORE: il nome progetto deve essere in kebab-case (solo lettere minuscole, numeri e trattini)."
    echo "  Esempio: mio-sito, portfolio-2026, app-cliente"
    exit 1
fi

# --- Derive varianti ---
KEBAB="$RAW_NAME"

# PascalCase: mio-sito → MioSito
PASCAL=$(echo "$KEBAB" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2))}1' | sed 's/ //g')

echo ""
echo "=== Inizializzazione progetto ==="
echo "  kebab-case:  $KEBAB"
echo "  PascalCase:  $PASCAL"
echo ""

# --- Funzione di sostituzione ---
replace_in_file() {
    local file="$1"
    local old="$2"
    local new="$3"
    if [ -f "$file" ]; then
        sed -i "s|$old|$new|g" "$file"
    fi
}

# --- Frontend ---
echo "[1/5] frontend/package.json"
replace_in_file "frontend/package.json" "br1-web-engine" "$KEBAB"

echo "[2/5] frontend/angular.json"
replace_in_file "frontend/angular.json" "br1-web-engine" "$KEBAB"

echo "[3/5] frontend/package-lock.json"
replace_in_file "frontend/package-lock.json" "br1-web-engine" "$KEBAB"

# --- Dockerfile ---
echo "[4/5] frontend/Dockerfile"
replace_in_file "frontend/Dockerfile" "ARG DIST_PATH=br1-web-engine" "ARG DIST_PATH=$KEBAB"

# --- Backend ---
echo "[5/5] backend/backend.csproj"
replace_in_file "backend/backend.csproj" "<RootNamespace>Br1WebEngine</RootNamespace>" "<RootNamespace>$PASCAL</RootNamespace>"

# --- README: sostituisci con scheletro nuovo progetto ---
echo ""
echo "[readme] Creo README.md per $PASCAL"

cat > README.md << EOF
# $PASCAL

Progetto basato su [Br1WebEngine](https://github.com/br1brown/Br1WebEngine) — template full-stack ASP.NET Core 9 + Angular 19.

## Avvio rapido

\`\`\`bash
# Sviluppo
docker compose up --build

# Produzione
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
\`\`\`

## Configurazione

Copiare \`.env.example\` in \`.env\` e personalizzare. Vedi [DOCKER_README.md](DOCKER_README.md) per i dettagli.

## Struttura

\`\`\`text
$PASCAL/
|-- backend/     API ASP.NET Core 9
|-- frontend/    SPA Angular 19
\`\`\`
EOF

echo "[readme] Creo DOCKER_README.md per $PASCAL"

cat > DOCKER_README.md << EOF
# $PASCAL - Docker Setup

Guida operativa per eseguire $PASCAL con Docker.

## File Compose

- **\`docker-compose.yml\`** - base: servizi, build, rete, volumi con nome derivato da \`PROJECT_NAME\`
- **\`docker-compose.override.yml\`** - sviluppo locale (applicato automaticamente)
- **\`docker-compose.prod.yml\`** - produzione: \`restart: always\` e log rotation
- **\`docker-compose.backend-exposed.yml\`** - opzionale: espone il backend su \`BACKEND_PORT\`

## Avvio

\`\`\`bash
# Sviluppo
docker compose up --build

# Produzione
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Produzione con backend esposto
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.backend-exposed.yml up -d --build
\`\`\`

## Variabili \`.env\`

| Variabile | Obbligatoria | Default | Descrizione |
|---|---|---|---|
| \`PROJECT_NAME\` | si | — | Identifica il progetto, usato per i volumi |
| \`FRONTEND_PORT\` | si | — | Porta host del frontend in produzione |
| \`BACKEND_PORT\` | no | vuoto | Porta host del backend (richiede compose backend-exposed) |
| \`API_KEY\` | no | \`frontend\` | API key iniettata nel frontend a runtime |
| \`API_URL\` | no | vuoto | Vuoto = proxy Nginx; valorizzato = backend remoto |
| \`DEV_FRONTEND_PORT\` | no | \`4200\` | Porta frontend in sviluppo |
| \`DEV_BACKEND_PORT\` | no | \`5000\` | Porta backend in sviluppo |

## Note

- Ogni progetto sulla stessa VPS usa una porta diversa (\`FRONTEND_PORT\`)
- Il template non usa sottopath (\`/nome-progetto\`): ogni istanza ha una porta dedicata
- I volumi sono isolati per progetto tramite \`PROJECT_NAME\`
EOF

# --- .env ---
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo ""
    echo "[env] Creo .env da .env.example con PROJECT_NAME=$KEBAB"
    cp .env.example .env
    sed -i "s|PROJECT_NAME=CHANGE_ME|PROJECT_NAME=$KEBAB|g" .env
fi

# --- Pulizia ---
echo ""
echo "Fatto. Riferimenti rinominati:"
echo "  br1-web-engine  →  $KEBAB"
echo "  Br1WebEngine    →  $PASCAL"
echo ""
echo "README.md e DOCKER_README.md ricreati per $PASCAL."
echo ""
echo "Prossimi passi:"
echo "  1. Controlla .env e imposta FRONTEND_PORT"
echo "  2. Personalizza frontend/src/app/site.ts"
echo "  3. git add -A && git commit -m 'init: $KEBAB'"
echo ""

# Autoelimina lo script
rm -- "$0"
