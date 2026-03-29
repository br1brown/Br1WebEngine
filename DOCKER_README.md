# Br1WebEngine - Docker Setup

Guida operativa per eseguire Br1WebEngine con Docker. Per architettura completa, DSL frontend e personalizzazione del progetto, vedi anche [README.md](README.md).

## File Compose

- **`docker-compose.yml`** - base comune: frontend Nginx su porta `80`, backend ASP.NET Core su porta `8080`, rete condivisa e volume `app-data`
- **`docker-compose.override.yml`** - sviluppo locale: applicato automaticamente da Docker Compose, frontend con `ng serve` su `4200`, backend esposto su `5000`
- **`docker-compose.prod.yml`** - produzione: aggiunge `restart: always` e log rotation JSON per entrambi i servizi

## Sviluppo

```bash
docker compose up --build
```

Questo comando usa automaticamente `docker-compose.override.yml` e avvia:

- **Frontend** su `http://localhost:4200`
- **Backend** su `http://localhost:5000`

Note pratiche:

- Al primo avvio il frontend esegue `npm ci` nel container, quindi puo' metterci un po'
- In sviluppo restano due container separati: uno per il frontend e uno per il backend

## Produzione

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

In produzione restano comunque due container:

- **Frontend** su `http://localhost:80`
- **Backend** su `http://localhost:8080`

Il frontend serve i file statici con Nginx e proxya `/api/*` al backend sulla rete Docker interna.

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

## Variabili utili

- **`API_URL`** - vuota = Nginx proxya verso il backend locale; valorizzata = il frontend chiama un backend remoto
- **`API_KEY`** - chiave API che il frontend inietta nei file buildati a runtime; default `frontend`
- **`Security__...`** - le impostazioni backend in `appsettings.json` possono essere sovrascritte via environment variables Docker

Esempio:

```yaml
environment:
  - API_KEY=una-chiave-robusta
  - Security__ApiKeys__0=una-chiave-robusta
  - Security__Token__SecretKey=min-32-caratteri-segreto
  - Security__CorsOrigins__0=https://tuodominio.it
```

## Comandi utili

```bash
# Avvia in background
docker compose up --build -d

# Ferma i servizi
docker compose down

# Ferma e rimuove anche i volumi
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
| Compose usata | `docker-compose.yml` + `docker-compose.override.yml` | `docker-compose.yml` + `docker-compose.prod.yml` |
| Frontend | `ng serve` su `4200` | Nginx su `80` |
| Backend | ASP.NET Core su `5000` | ASP.NET Core su `8080` |
| Container | 2 | 2 |

## Nota pratica

Se sviluppi ogni giorno con Visual Studio e Angular CLI, Docker non e' obbligatorio. Rimane utile per:

- primo avvio rapido del template
- test della configurazione container
- deploy e ambienti simili alla produzione
