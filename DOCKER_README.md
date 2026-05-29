# Br1WebEngine - Docker Setup

Guida operativa per eseguire Br1WebEngine con Docker. Per architettura completa, DSL frontend e personalizzazione del progetto, vedi anche [README.md](README.md).

## Modello di utilizzo

Il template Docker e' progettato per essere **riusabile su piu' progetti sulla stessa VPS**. Ogni progetto derivato dal template viene eseguito in una propria cartella con un proprio `global-settings.json` e una propria porta.

### Inizializzazione (una sola volta dopo la clonazione)

Tutta la configurazione vive in **`global-settings.json`** (accanto a `deploy.sh`), validato da `global-settings.schema.json` per l'autocomplete nell'editor. È l'unica sorgente di verità: lo leggono `deploy.sh` (bash, via Node), il backend ASP.NET Core (`AddJsonFile`) e il Node SSR del frontend (`readFileSync`). Imposta lì hostname, porta, `Security.ApiKeys`, `Security.Token.SecretKey`, `Security.CorsOrigins`, ecc.

### Avvio di un progetto derivato

```bash
# Edita global-settings.json, poi:
./deploy.sh
```

`deploy.sh` legge `global-settings.json`, verifica la configurazione e avvia i container. Il file viene montato in entrambi i container in sola lettura (`/app/global-settings.json:ro`): cambiare il file e rieseguire il deploy è sufficiente per applicare la configurazione a tutti i livelli.

### Esposizione dei servizi

- Ogni progetto espone il frontend su una porta host dedicata (`frontend.port`, es. `http://IP:3000`, `http://IP:3001`)
- Il backend puo' essere esposto impostando `backend.public: true` (richiede `docker-compose.backend-exposed.yml`)
- Frontend e backend comunicano sempre tramite rete Docker interna

### Esempio: due progetti sulla stessa VPS

```text
/home/deploy/progetto-a/global-settings.json   →  project.name "Progetto A"  frontend.port 3000
/home/deploy/progetto-b/global-settings.json   →  project.name "Progetto B"  frontend.port 3001
```

Risultato:
- `http://IP:3000` → progetto-a
- `http://IP:3001` → progetto-b
- `COMPOSE_PROJECT_NAME` è derivato slugificando `project.name` (`Progetto A` → `progetto-a`)
- Volumi separati: `progetto-a_uploads-data`, `progetto-b_uploads-data` (naming automatico Docker Compose)
- Nessun conflitto di container

## File Compose

- **`docker-compose.yml`** — base: servizi, build, rete, volumi. Usato direttamente in produzione.
- **`docker-compose.override.yml`** — sviluppo locale: applicato automaticamente, frontend con `ng serve`, backend in Development
- **`docker-compose.backend-exposed.yml`** — opzionale: espone il backend verso l'host su `BACKEND_PORT`
- **`docker-compose.public-test.yml`** — overlay locale per simulare un reverse proxy pubblico davanti al frontend SSR

## Configurazione: `global-settings.json`

Unico file da modificare. Le chiavi e i loro vincoli sono documentati in `global-settings.schema.json` (`description`, `examples`, default), quindi l'editor offre autocomplete e validazione.

| Chiave | Default | Descrizione |
|---|---|---|
| `project.name` | `App` | Nome del progetto; slugificato in `COMPOSE_PROJECT_NAME` (`Mercatino App` → `mercatino-app`) |
| `frontend.hostname` | `""` | Dominio pubblico senza schema (es. `miodominio.it`). Vuoto in locale. Deriva `FRONTEND_BASE_URL` e `NG_ALLOWED_HOSTS` |
| `frontend.port` | `3000` | Porta host del frontend |
| `backend.public` | `false` | `true` espone il backend sull'host (richiede `docker-compose.backend-exposed.yml`) |
| `backend.publicPort` | `null` | Porta host del backend, solo se `public: true` |
| `Localization.DefaultLanguage` | `it` | Lingua di default (tag BCP-47) |
| `Localization.SupportedLanguages` | `["it","en"]` | Lingue supportate |
| `Security.ApiKeys` | `["frontend"]` | Chiavi API del backend (header `X-Api-Key`); il frontend usa `[0]`. In prod ≥32 char |
| `Security.CorsOrigins` | `[]` | Origini CORS ammesse. Vuoto in locale |
| `Security.BehindProxy` | `false` | `true` quando si è dietro un reverse proxy (legge `X-Forwarded-For`) |
| `Security.Token.SecretKey` | `""` | Segreto JWT (≥32 char): se valorizzato attiva il login. Vuoto = login disabilitato |
| `Security.Token.ExpirationSeconds` | `3000` | Durata dei JWT emessi |
| `OpenTelemetry.Endpoint` | `""` | Collector OTLP. Vuoto = telemetria disabilitata |
| `Custom` | `{}` | Valori liberi leggibili da backend (`IConfiguration["Custom:..."]`) e Node SSR (`getBr1Settings().Custom`) |

`deploy.sh` deriva da questo file le poche variabili che servono a Docker Compose (`COMPOSE_PROJECT_NAME`, `FRONTEND_PORT`, `FRONTEND_BASE_URL`, `NG_ALLOWED_HOSTS`, esposizione backend) e le passa inline. Backend e Node SSR leggono invece il file montato direttamente.

`BACKEND_ORIGIN` (`http://backend:8080`) resta una variabile d'ambiente del compose: è l'indirizzo Docker-interno del backend, non una scelta di configurazione utente.

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

## Produzione e Sicurezza Blue/Green

```bash
# Edita global-settings.json con i tuoi valori, poi:
./deploy.sh
```

In produzione:

- **Frontend** su `http://localhost:FRONTEND_PORT`
- **Backend** solo interno per default (per esporlo, imposta `backend.public: true` in `global-settings.json`)

Il frontend gira su Node SSR: serve l'app Angular e proxya `/api/*` al backend sulla rete Docker interna, iniettando l'API key lato server.

Lo script `./deploy.sh` utilizza una logica avanzata **"Pre-flight" (Blue/Green safety)** per garantirti zero downtime e prevenire errori fatali:
1. **Build con Quality Check**: Compila le immagini Docker (eseguendo anche `npm run lint` per bloccare subito la build in caso di codice di bassa qualita').
2. **Pre-flight Test**: Avvia i nuovi container su un ambiente isolato (su una porta temporanea e nascosta).
3. **Validazione e Test Suite**: Attende che il server risponda con HTTP 200 (Healthcheck). Inoltre, esegue *automaticamente* tutta la suite di test (`run-all.sh`) sull'ambiente nascosto.
4. **Scambio (Swap)**: Solo se l'healthcheck e i test passano con successo, il deploy procede rimpiazzando i container vecchi. Se c'e' un errore, il deploy si annulla e il sito in produzione resta online intatto.

Se hai un'emergenza e devi eseguire un deploy saltando i test post-deploy (l'healthcheck base verra' comunque eseguito), puoi usare:
```bash
./deploy.sh --skip-post-deploy
```

## Test pubblico dietro reverse proxy

Per riprodurre in locale la catena reale `browser -> reverse proxy -> frontend SSR -> backend` usa l'overlay dedicato:

```bash
docker compose -f docker-compose.yml -f docker-compose.public-test.yml up -d --build
```

URL di test predefinito:

- `http://localhost:8088`

Cosa simula davvero:

- browser che parla con un hostname pubblico
- reverse proxy che inoltra `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` e `X-Forwarded-Port`
- frontend SSR che valida l'host autorizzato
- proxy `/api/*` del frontend verso il backend interno Docker

Smoke test utili:

```bash
curl -i http://localhost:8088/health
curl -i http://localhost:8088/
curl -i http://localhost:8088/api/health
```

Script pronti:

```bash
./deploy.sh --uptest --down-after
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

Imposta `backend.public: true` (e `backend.publicPort`) in `global-settings.json`. `deploy.sh` ne deriva l'esposizione e applica l'overlay `docker-compose.backend-exposed.yml`.

Nota: la porta pubblicata controlla solo la porta sull'host. Il container backend continua ad ascoltare internamente su `8080`, quindi l'overlay `docker-compose.backend-exposed.yml` mappa `publicPort:8080`.

### Controlli all'avvio

`deploy.sh` verifica che `COMPOSE_PROJECT_NAME` e `FRONTEND_PORT` siano impostati prima di avviare Docker.
Lo script esegue anche un controllo intelligente sulle porte: legge le etichette (`com.docker.compose.project`) dei container Docker per capire se una porta occupata appartiene al tuo stesso progetto (che sta per essere aggiornato) o a un altro progetto, prevenendo conflitti incrociati.
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
| Configurazione backend | `global-settings.json` (ASPNETCORE_ENVIRONMENT=Development) | `global-settings.json` (ASPNETCORE_ENVIRONMENT=Production) |
| Container | 2 | 2 |

## Nota pratica

Se sviluppi ogni giorno con Visual Studio e Angular CLI, Docker non e' obbligatorio. Rimane utile per:

- primo avvio rapido del template
- test della configurazione container
- deploy e ambienti simili alla produzione
