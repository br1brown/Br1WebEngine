# Br1WebEngine - Docker Setup

Guida operativa per eseguire Br1WebEngine con Docker. Per architettura completa, DSL frontend e personalizzazione del progetto, vedi anche [README.md](README.md).

## Modello di utilizzo

Il template Docker e' progettato per essere **riusabile su piu' progetti sulla stessa VPS**. Ogni progetto derivato dal template viene eseguito in una propria cartella con un proprio file `.env` e una propria porta.

### Inizializzazione (una sola volta dopo la clonazione)

```bash
./init-project.sh mio-progetto
```

Rinomina tutti i riferimenti interni al template (`package.json`, `angular.json`, `.csproj`, Dockerfile, README) e crea il file `.env` con `PROJECT_NAME` gia' impostato.

### Avvio di un progetto derivato

```bash
# Se non hai gia' eseguito init-project.sh:
cp .env.example .env
# Modificare .env: impostare almeno PROJECT_NAME e FRONTEND_PORT
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Esposizione dei servizi

- Ogni progetto espone il frontend su una porta host dedicata (es. `http://IP:3000`, `http://IP:3001`)
- Il backend puo' essere esposto aggiungendo `docker-compose.backend-exposed.yml`
- Frontend e backend comunicano sempre tramite rete Docker interna

### Scelta architetturale: niente sottopath

> Il template espone ogni progetto su una porta dedicata e non usa sottopath del tipo `/nome-progetto`.
> Questa scelta evita di dover adattare il frontend per supportare base path custom (routing Angular, asset statici, base href).
> In futuro, se necessario, i servizi potranno essere pubblicati tramite subdomain o tunnel, mantenendo invariata la struttura dell'applicazione.

### Esempio: due progetti sulla stessa VPS

```text
/home/deploy/progetto-a/.env   →  PROJECT_NAME=progetto-a  FRONTEND_PORT=3000
/home/deploy/progetto-b/.env   →  PROJECT_NAME=progetto-b  FRONTEND_PORT=3001
```

Risultato:
- `http://IP:3000` → progetto-a
- `http://IP:3001` → progetto-b
- Volumi separati: `progetto-a-app-data`, `progetto-b-app-data`
- Nessun conflitto di container (nomi gestiti automaticamente da Docker Compose)

## File Compose

- **`docker-compose.yml`** - base riusabile: servizi, build, rete, volumi con nome derivato da `PROJECT_NAME`
- **`docker-compose.override.yml`** - sviluppo locale: applicato automaticamente, frontend con `npm run start:docker`, backend su porta dev
- **`docker-compose.prod.yml`** - produzione: `restart: always` e log rotation JSON
- **`docker-compose.backend-exposed.yml`** - opzionale: espone il backend verso l'host su `BACKEND_PORT`

## Variabili `.env`

| Variabile | Obbligatoria | Default | Descrizione |
|---|---|---|---|
| `PROJECT_NAME` | si | — | Identifica il progetto, usato per i volumi |
| `FRONTEND_PORT` | si | — | Porta host del frontend in produzione |
| `BACKEND_PORT` | no | vuoto | Porta host del backend (vuoto = solo rete interna) |
| `API_KEY` | no | `frontend` | API key iniettata nel frontend a runtime |
| `API_URL` | no | vuoto | Vuoto = proxy Nginx; valorizzato = backend remoto |
| `DEV_FRONTEND_PORT` | no | `4200` | Porta frontend in sviluppo |
| `DEV_BACKEND_PORT` | no | `5000` | Porta backend in sviluppo |

## Sviluppo

```bash
docker compose up --build
```

Questo comando usa automaticamente `docker-compose.override.yml` e avvia:

- **Frontend** su `http://localhost:4200` (o `DEV_FRONTEND_PORT`)
- **Backend** su `http://localhost:5000` (o `DEV_BACKEND_PORT`)

Note pratiche:

- Al primo avvio il frontend esegue `npm ci` nel container, quindi puo' metterci un po'
- Nel container frontend le richieste `/api/*` vengono proxate internamente al backend
- In sviluppo restano due container separati: uno per il frontend e uno per il backend

## Produzione

```bash
cp .env.example .env
# Modificare .env
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

In produzione:

- **Frontend** su `http://localhost:FRONTEND_PORT`
- **Backend** solo interno (per esporlo, aggiungere `docker-compose.backend-exposed.yml`)

Il frontend gira su Node SSR: serve l'app Angular e proxya `/api/*` al backend sulla rete Docker interna.

### Esporre il backend

Per rendere il backend raggiungibile dall'esterno, impostare `BACKEND_PORT` in `.env` e aggiungere il file dedicato:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.backend-exposed.yml up -d --build
```

### Controlli all'avvio

- Se `PROJECT_NAME` o `FRONTEND_PORT` mancano nel `.env`, Docker Compose fallisce con errore esplicito
- Se `PROJECT_NAME` contiene ancora il placeholder `CHANGE_ME`, il frontend si ferma con errore

## Host separati

Se frontend e backend stanno su macchine diverse:

```bash
# Server backend
docker compose up --build -d backend

# Server frontend
API_URL=https://api.tuodominio.it docker compose up --build -d frontend
```

In questo scenario:

- `API_URL` valorizzata fa chiamare il backend remoto direttamente dal browser
- `API_KEY` puo' essere sovrascritta via variabile d'ambiente
- il backend deve avere `Security__CorsOrigins` configurato per il dominio del frontend

## Comandi utili

```bash
# Avvia in background
docker compose up --build -d

# Ferma i servizi
docker compose down

# Ferma e rimuovi anche i volumi
docker compose down -v

# Logs frontend
docker compose logs -f frontend

# Logs backend
docker compose logs -f backend

# Shell nel frontend
docker compose exec frontend sh

# Shell nel backend
docker compose exec backend sh
```

## Dev vs Prod

| | Dev (default) | Prod |
|---|---|---|
| Compose usata | `docker-compose.yml` + `override` | `docker-compose.yml` + `prod` |
| Frontend | `npm run start:docker` su `DEV_FRONTEND_PORT` | Node SSR su `FRONTEND_PORT` |
| Backend | ASP.NET Core su `DEV_BACKEND_PORT` | ASP.NET Core su `8080` (interno) |
| Container | 2 | 2 |
| Nomi container | generati da Compose | generati da Compose |
| Volumi | `PROJECT_NAME-app-data` | `PROJECT_NAME-app-data` |

## Nota pratica

Se sviluppi ogni giorno con Visual Studio e Angular CLI, Docker non e' obbligatorio. Rimane utile per:

- primo avvio rapido del template
- test della configurazione container
- deploy e ambienti simili alla produzione
