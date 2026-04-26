# Br1WebEngine - Docker Setup

Guida operativa per eseguire Br1WebEngine con Docker. Per architettura completa, DSL frontend e personalizzazione del progetto, vedi anche [README.md](README.md).

## Modello di utilizzo

Il template Docker e' progettato per essere **riusabile su piu' progetti sulla stessa VPS**. Ogni progetto derivato dal template viene eseguito in una propria cartella con un proprio file `.env` e una propria porta.

### Inizializzazione (una sola volta dopo la clonazione)

```bash
./init-project.sh mio-progetto
```

Crea il file `.env` con `COMPOSE_PROJECT_NAME` gia' impostato, poi edita `.env` e `backend/appsettings.json` con i valori specifici del progetto.

### Avvio di un progetto derivato

```bash
# Se non hai gia' eseguito init-project.sh:
cp .env.example .env
# Edita .env (COMPOSE_PROJECT_NAME, FRONTEND_PORT) e backend/appsettings.json (segreti)
./deploy.sh
```

`deploy.sh` verifica la configurazione e avvia i container.

### Esposizione dei servizi

- Ogni progetto espone il frontend su una porta host dedicata (es. `http://IP:3000`, `http://IP:3001`)
- Il backend puo' essere esposto aggiungendo `docker-compose.backend-exposed.yml`
- Frontend e backend comunicano sempre tramite rete Docker interna

### Esempio: due progetti sulla stessa VPS

```text
/home/deploy/progetto-a/.env   →  COMPOSE_PROJECT_NAME=progetto-a  FRONTEND_PORT=3000
/home/deploy/progetto-b/.env   →  COMPOSE_PROJECT_NAME=progetto-b  FRONTEND_PORT=3001
```

Risultato:
- `http://IP:3000` → progetto-a
- `http://IP:3001` → progetto-b
- Volumi separati: `progetto-a_uploads-data`, `progetto-b_uploads-data` (naming automatico Docker Compose)
- Nessun conflitto di container

## File Compose

- **`docker-compose.yml`** — base: servizi, build, rete, volumi. Usato direttamente in produzione.
- **`docker-compose.override.yml`** — sviluppo locale: applicato automaticamente, frontend con `ng serve`, backend in Development
- **`docker-compose.backend-exposed.yml`** — opzionale: espone il backend verso l'host su `BACKEND_PORT`

## Variabili `.env`

| Variabile | Obbligatoria | Default | Descrizione |
|---|---|---|---|
| `COMPOSE_PROJECT_NAME` | si | — | Identifica il progetto; Docker Compose usa questo per nominare i volumi (built-in) |
| `FRONTEND_PORT` | si | — | Porta host del frontend in produzione |
| `BACKEND_PORT` | no | `8080` | Porta host del backend (usata solo con `backend-exposed.yml`) |
| `BACKEND_ORIGIN` | no | `http://backend:8080` | Host backend per proxy Node e chiamate SSR |
| `BACKEND_API_KEY` | no | `frontend` | API key iniettata dal proxy Node verso il backend |
| `DEV_FRONTEND_PORT` | no | `4200` | Porta frontend in sviluppo |
| `DEV_BACKEND_PORT` | no | `5000` | Porta backend in sviluppo |
| `SITEMAP_BASE_URL` | no | — | URL canonico build-time per sitemap.xml |
| `EXPOSE_BACKEND` | no | — | Impostata da `deploy.sh`: `yes` espone la porta backend sull'host |

I valori di produzione (ApiKeys, CorsOrigins, BehindProxy, Token.SecretKey) vanno in `backend/appsettings.json`, committato direttamente.

## Sviluppo

```bash
docker compose up --build
```

Questo comando usa automaticamente `docker-compose.override.yml` e avvia:

- **Frontend** su `http://localhost:4200` (o `DEV_FRONTEND_PORT`)
- **Backend** su `http://localhost:5000` (o `DEV_BACKEND_PORT`)

Note pratiche:

- Al primo avvio il frontend esegue `npm ci` nel container, quindi puo' metterci un po'
- In sviluppo restano due container separati: uno per il frontend e uno per il backend

## Produzione

```bash
cp .env.example .env
# Edita .env e backend/appsettings.json con i tuoi valori, poi:
./deploy.sh
```

In produzione:

- **Frontend** su `http://localhost:FRONTEND_PORT`
- **Backend** solo interno per default (per esporlo, rispondere `s` alla domanda di `deploy.sh`)

Il frontend gira su Node SSR: serve l'app Angular e proxya `/api/*` al backend sulla rete Docker interna, iniettando l'API key lato server.

### Esporre il backend

Rispondere `s` alla domanda di `deploy.sh` alla prima esecuzione. La scelta viene salvata in `.env` (`EXPOSE_BACKEND=yes`) e ricordata nei deploy successivi.

### Controlli all'avvio

`deploy.sh` verifica che `COMPOSE_PROJECT_NAME` e `FRONTEND_PORT` siano impostati prima di avviare Docker.

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
| Compose usata | `docker-compose.yml` + `override` | `docker-compose.yml` |
| Frontend | `ng serve` su `DEV_FRONTEND_PORT` | Node SSR su `FRONTEND_PORT` |
| Backend | ASP.NET Core Development su `DEV_BACKEND_PORT` | ASP.NET Core Production su `8080` (interno) |
| Configurazione backend | `appsettings.json` (ASPNETCORE_ENVIRONMENT=Development) | `appsettings.json` (ASPNETCORE_ENVIRONMENT=Production) |
| Container | 2 | 2 |

## Nota pratica

Se sviluppi ogni giorno con Visual Studio e Angular CLI, Docker non e' obbligatorio. Rimane utile per:

- primo avvio rapido del template
- test della configurazione container
- deploy e ambienti simili alla produzione
