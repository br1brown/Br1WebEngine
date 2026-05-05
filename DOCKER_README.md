# Br1WebEngine - Docker Setup

Guida operativa per eseguire Br1WebEngine con Docker. Per architettura completa, DSL frontend e personalizzazione del progetto, vedi anche [README.md](README.md).

## Modello di utilizzo

Il template Docker e' progettato per essere **riusabile su piu' progetti sulla stessa VPS**. Ogni progetto derivato dal template viene eseguito in una propria cartella con un proprio file `.env` e una propria porta.

### Inizializzazione (una sola volta dopo la clonazione)

```bash
./init-project.sh mio-progetto
```

Crea il file `.env` con `COMPOSE_PROJECT_NAME` gia' impostato, poi edita `.env.param` e `backend/appsettings.json` con i valori specifici del progetto.

### Avvio di un progetto derivato

```bash
# Se non hai gia' eseguito init-project.sh:
# Crea un file .env.param inserendo le tue variabili
# Edita .env.param e backend/appsettings.json (segreti)
./deploy.sh
```

`deploy.sh` sincronizza `.env` a partire da `.env.param`, verifica la configurazione e avvia i container.

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
- **`docker-compose.public-test.yml`** — overlay locale per simulare un reverse proxy pubblico davanti al frontend SSR

## Variabili `.env.param`

Questo e' il file "umano" da modificare in produzione.

| Variabile | Obbligatoria | Default | Descrizione |
|---|---|---|---|
| `SITE_HOSTNAME` | si | -- | Hostname pubblico del sito |
| `SITE_SCHEME` | no | `https` | Schema usato per derivare `FRONTEND_BASE_URL` |
| `FRONTEND_PORT` | si | -- | Porta host del frontend |
| `EXPOSE_BACKEND` | no | `no` | `yes` per esporre il backend sull'host |
| `BACKEND_PORT` | no | `8080` | Porta host del backend, solo se esposto |
| `COMPOSE_PROJECT_NAME` | no | derivato da `SITE_HOSTNAME` | Nome progetto Docker Compose |

Da qui `deploy.sh` deriva automaticamente:

- `FRONTEND_BASE_URL`
- `NG_ALLOWED_HOSTS`
- `COMPOSE_PROJECT_NAME` se non specificato

## Variabili `.env`

Questo resta il file consumato da Docker Compose.

| Variabile | Obbligatoria | Default | Descrizione |
|---|---|---|---|
| `COMPOSE_PROJECT_NAME` | si | — | Identifica il progetto; Docker Compose usa questo per nominare i volumi (built-in) |
| `FRONTEND_PORT` | si | — | Porta host del frontend in produzione |
| `BACKEND_PORT` | no | `8080` | Porta host del backend (usata solo con `backend-exposed.yml`) |
| `BACKEND_ORIGIN` | no | `http://backend:8080` | Host backend per proxy Node e chiamate SSR |
| `BACKEND_API_KEY` | no | `frontend` | API key iniettata dal proxy Node verso il backend |
| `NG_ALLOWED_HOSTS` | no | derivato da `FRONTEND_BASE_URL` via `deploy.sh` | Host autorizzati da Angular SSR |
| `DEV_FRONTEND_PORT` | no | `4200` | Porta frontend in sviluppo |
| `DEV_BACKEND_PORT` | no | `5000` | Porta backend in sviluppo |
| `FRONTEND_BASE_URL` | no | — | URL canonico pubblico del frontend |
| `EXPOSE_BACKEND` | no | — | Impostata da `deploy.sh`: `yes` espone la porta backend sull'host |
| `PUBLIC_TEST_PORT` | no | `8088` | Porta host usata dal reverse proxy del test pubblico |
| `PUBLIC_TEST_BASE_URL` | no | `http://br1gaming.localhost:8088` | URL pubblico simulato per il test locale |
| `PUBLIC_TEST_ALLOWED_HOSTS` | no | `br1gaming.localhost` | Host inoltrato dal reverse proxy al frontend SSR |

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
# Crea o modifica .env.param e backend/appsettings.json con i tuoi valori, poi:
./deploy.sh
```

In produzione:

- **Frontend** su `http://localhost:FRONTEND_PORT`
- **Backend** solo interno per default (per esporlo, imposta `EXPOSE_BACKEND=yes` in `.env.param`)

Il frontend gira su Node SSR: serve l'app Angular e proxya `/api/*` al backend sulla rete Docker interna, iniettando l'API key lato server.

## Test pubblico dietro reverse proxy

Per riprodurre in locale la catena reale `browser -> reverse proxy -> frontend SSR -> backend` usa l'overlay dedicato:

```bash
docker compose -f docker-compose.yml -f docker-compose.public-test.yml up -d --build
```

URL di test predefinito:

- `http://br1gaming.localhost:8088`

Cosa simula davvero:

- browser che parla con un hostname pubblico
- reverse proxy che inoltra `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` e `X-Forwarded-Port`
- frontend SSR che valida l'host autorizzato
- proxy `/api/*` del frontend verso il backend interno Docker

Smoke test utili:

```bash
curl -i http://127.0.0.1:8088/health -H "Host: br1gaming.localhost"
curl -i http://127.0.0.1:8088/avventura/poveri-maschi -H "Host: br1gaming.localhost"
curl -i http://127.0.0.1:8088/generatori/incel -H "Host: br1gaming.localhost"
curl -i http://127.0.0.1:8088/api/stories -H "Host: br1gaming.localhost"
```

Script pronti:

```bash
./deploy.sh --test-public --down-after
```

Per cambiare dominio/porta simulati senza toccare i file:

```bash
PUBLIC_TEST_PORT=9090 \
PUBLIC_TEST_BASE_URL=http://miosito.localhost:9090 \
PUBLIC_TEST_ALLOWED_HOSTS=miosito.localhost \
docker compose -f docker-compose.yml -f docker-compose.public-test.yml up -d --build
```

Se vuoi verificare che il problema sia davvero l'host check SSR, prova intenzionalmente un host non autorizzato:

```bash
curl -i http://127.0.0.1:8088/avventura/poveri-maschi -H "Host: host-sbagliato.localhost"
```

In quel caso il frontend dovrebbe loggare il rifiuto dell'host e smettere di comportarsi come se fosse una richiesta pubblica valida.

### Esporre il backend

Imposta `EXPOSE_BACKEND=yes` in `.env.param`. `deploy.sh` sincronizza il valore in `.env` per Docker Compose.

Nota: `BACKEND_PORT` controlla solo la porta pubblicata sull'host. Il container backend continua ad ascoltare internamente su `8080`, quindi l'overlay `docker-compose.backend-exposed.yml` mappa `BACKEND_PORT:8080`.

### Controlli all'avvio

`deploy.sh` verifica che `COMPOSE_PROJECT_NAME` e `FRONTEND_PORT` siano impostati prima di avviare Docker.
Con `--no-cache` forza la ricostruzione delle immagini partendo da zero.

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
