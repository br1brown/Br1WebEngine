# Br1WebEngine

Template full-stack per siti content-driven e piccoli portali con `Angular 19` + `ASP.NET Core 9`.

L'idea e' semplice:

- il frontend descrive struttura del sito, rotte, menu e sitemap da un solo file
- il backend serve contenuti JSON localizzati ed espone una API gia' cablata
- Docker copre sia sviluppo che deploy senza cambiare repository layout

Il target e' partire da una base gia' pronta e sostituire contenuti, pagine ed endpoint senza riscrivere l'infrastruttura ogni volta.

## Stack

| Area | Tecnologia | Note |
|---|---|---|
| Frontend | Angular 19, Bootstrap 5 | SPA/PWA, i18n, tema dinamico, sitemap/meta generate da script |
| Backend | ASP.NET Core 9 | REST API, API key, JWT opzionale, localizzazione via `Accept-Language` |
| Infra | Docker, Nginx | dev con hot reload, prod con frontend statico e reverse proxy |

## Architettura

```
┌──────────────────────────────────────────────┐
│  Frontend (Angular 19 + Nginx)               │
│  porta 80                                    │
│  ┌─────────────┐  ┌───────────────────────┐  │
│  │ Static SPA  │  │ /api/* → proxy backend│  │
│  └─────────────┘  └───────────────────────┘  │
└────────────────────────┬─────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────┐
│  Backend (ASP.NET Core 9)                    │
│  porta 8080                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Base API │ │ Auth API │ │ Protected API│ │
│  │ (aperto) │ │(transito)│ │  (riservato) │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
│  ┌──────────────────────────────────────────┐│
│  │ Security: API Key + JWT + CORS + Rate    ││
│  │ Limiting + Security Headers              ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

## Cosa c'e' dentro

- DSL frontend in [`frontend/src/app/site.ts`](frontend/src/app/site.ts): pagine, navigazione, branding, lingue, tema
- builder in [`frontend/src/app/siteBuilder.ts`](frontend/src/app/siteBuilder.ts): normalizza il DSL e genera rotte e sitemap
- contenuti backend in [`backend/data/irl.json`](backend/data/irl.json) e [`backend/data/social.json`](backend/data/social.json)
- security pipeline in [`backend/Program.cs`](backend/Program.cs) e [`backend/Security/`](backend/Security)
- compose files per dev e prod in [`docker-compose.yml`](docker-compose.yml), [`docker-compose.override.yml`](docker-compose.override.yml) e [`docker-compose.prod.yml`](docker-compose.prod.yml)

## API attuale

| Metodo | Path | Auth | Note |
|---|---|---|---|
| `GET` | `/api/profile` | API key | profilo aziendale localizzato |
| `GET` | `/api/social` | API key | filtro opzionale con `nomi` |
| `POST` | `/api/auth/login` | API key | placeholder, nel template risponde `valid = false` |
| `GET` | `/health` | nessuna | health check |

Le API protette stanno in [`backend/Controllers/ProtectedController.cs`](backend/Controllers/ProtectedController.cs) e diventano realmente utilizzabili solo quando configuri il JWT.

## Quick start

### Docker dev

```bash
docker compose up --build
```

- frontend: `http://localhost:4200`
- backend: `http://localhost:5000`

`docker compose` applica in automatico [`docker-compose.override.yml`](docker-compose.override.yml), quindi in sviluppo hai `ng serve` lato frontend e backend separato.

### Locale senza Docker

Prerequisiti: `.NET 9`, `Node 22`, `npm 10`.

Backend:

```bash
cd backend
dotnet run --launch-profile backend
```

Frontend:

```bash
cd frontend
npm install
npm start
```

- frontend: `http://localhost:4200`
- backend: `http://localhost:62715`

`npm start` usa [`frontend/proxy.local.conf.json`](frontend/proxy.local.conf.json), quindi il frontend chiama `/api/*` in relativo e il proxy inoltra al backend locale. Se usi Visual Studio, ha senso usarlo solo per il backend; il frontend resta indipendente.

### Produzione

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

- frontend: `http://localhost`
- backend: `http://localhost:8080`

Per dettagli su compose, env vars e deploy separato frontend/backend c'e' [`DOCKER_README.md`](DOCKER_README.md).

## File che tocchi davvero

### Frontend

- [`frontend/src/app/site.ts`](frontend/src/app/site.ts): struttura del sito, pagine, menu, lingue, branding
- [`frontend/src/assets/i18n/addon.it.json`](frontend/src/assets/i18n/addon.it.json) e [`frontend/src/assets/i18n/addon.en.json`](frontend/src/assets/i18n/addon.en.json): testi del progetto
- [`frontend/src/assets/legal/`](frontend/src/assets/legal): privacy, cookie, termini, banner
- [`frontend/src/assets/mapping.json`](frontend/src/assets/mapping.json): registry logico degli asset
- [`frontend/src/assets/file/`](frontend/src/assets/file): immagini e file statici

### Backend

- [`backend/data/irl.json`](backend/data/irl.json): profilo aziendale / dati legali
- [`backend/data/social.json`](backend/data/social.json): social links
- [`backend/appsettings.json`](backend/appsettings.json): API keys, CORS, JWT, security headers

## Convenzioni di progetto

### Frontend

- `PageType` e' l'identita' stabile delle pagine. Se aggiungi una pagina, parti da li.
- [`frontend/src/app/site.ts`](frontend/src/app/site.ts) e' la source of truth per router, header, footer e sitemap.
- Le page component estendono [`frontend/src/app/pages/page-base.component.ts`](frontend/src/app/pages/page-base.component.ts).
- I file `basic.*.json` sono del template. Per il progetto lavora su `addon.*.json`.

### Backend

- [`backend/Controllers/BaseController.cs`](backend/Controllers/BaseController.cs): endpoint pubblici dietro API key
- [`backend/Controllers/AuthController.cs`](backend/Controllers/AuthController.cs): punto di integrazione per il login
- [`backend/Controllers/ProtectedController.cs`](backend/Controllers/ProtectedController.cs): endpoint API key + JWT
- [`backend/Store/IContentStore.cs`](backend/Store/IContentStore.cs): astrazione storage; l'implementazione corrente legge JSON da disco
- [`backend/Security/ApiExceptionHandler.cs`](backend/Security/ApiExceptionHandler.cs): normalizza gli errori in `ProblemDetails`

## Operazioni comuni

### Aggiungere una pagina

1. Aggiungi un valore a `PageType` in [`frontend/src/app/site.ts`](frontend/src/app/site.ts).
2. Crea il componente sotto [`frontend/src/app/pages/`](frontend/src/app/pages/).
3. Registra la pagina in `setSitePages(...)`.
4. Aggiungila alla navigazione se serve.
5. Inserisci le chiavi i18n in `addon.it.json` e `addon.en.json`.

### Aggiungere un endpoint API

1. Mettilo in `BaseController` o `ProtectedController` in base al livello di accesso.
2. Sposta la logica in [`backend/Services/`](backend/Services) o in uno store dedicato.
3. Esponi la chiamata lato frontend in [`frontend/src/app/core/services/api.service.ts`](frontend/src/app/core/services/api.service.ts).

### Abilitare il login

1. Imposta `Security.Token.SecretKey` in [`backend/appsettings.json`](backend/appsettings.json) o via env var.
2. Implementa la validazione credenziali in [`backend/Controllers/AuthController.cs`](backend/Controllers/AuthController.cs).
3. Emetti il token tramite `AuthService.GenerateToken()`.

## Configurazione runtime

### Backend

| Chiave | Effetto |
|---|---|
| `Security.ApiKeys` | chiavi API accettate |
| `Security.CorsOrigins` | origini consentite; vuoto = aperto |
| `Security.BehindProxy` | abilita `ForwardedHeaders` dietro reverse proxy |
| `Security.Token.SecretKey` | vuoto = login/JWT disabilitati |
| `Security.Token.ExpirationSeconds` | durata del token |
| `Security.Headers` | security headers aggiunti alle risposte |

### Frontend container

| Variabile | Effetto |
|---|---|
| `API_URL` | vuota = stesso host con proxy Nginx; valorizzata = backend remoto |
| `API_KEY` | API key iniettata a runtime nel frontend |

Esempio deploy su host separati:

```bash
# server backend
docker compose up --build -d backend

# server frontend
API_URL=https://api.example.com docker compose up --build -d frontend
```

In quel caso devi allineare anche `Security__CorsOrigins__*` sul backend.

## Script frontend

Da [`frontend/package.json`](frontend/package.json):

- `npm start`: sviluppo locale con proxy verso il backend
- `npm run start:docker`: sviluppo dentro container
- `npm run build`: build production, con generazione automatica di meta e sitemap
- `npm run generate:icons`: rigenera le icone PWA da `favicon.png`
- `npm test`: test Angular

## Repository layout

```text
Br1WebEngine/
|-- backend/
|   |-- Controllers/
|   |-- Security/
|   |-- Services/
|   |-- Store/
|   |-- data/
|   `-- Program.cs
|-- frontend/
|   |-- src/app/
|   |-- src/assets/
|   |-- scripts/
|   `-- nginx.conf
|-- docker-compose.yml
|-- docker-compose.override.yml
|-- docker-compose.prod.yml
`-- Br1WebEngine.sln
```

## Licenza

Vedi [`LICENSE`](LICENSE).
