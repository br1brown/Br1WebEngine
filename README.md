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
## Dove si interviene

Questa e' la mappa operativa del template: se devi adattare il progetto, i file da guardare davvero sono questi. Il repository separa la parte riusabile del template da quella custom del progetto, quindi qui i percorsi sono gia' raggruppati per ruolo invece di essere sparsi in sezioni diverse.

### Frontend

- [`frontend/src/app/site.ts`](frontend/src/app/site.ts): struttura del sito, pagine, navigazione, branding, lingue e opzioni di visibilita'
- [`frontend/src/app/siteBuilder.ts`](frontend/src/app/siteBuilder.ts): normalizza la configurazione frontend e genera rotte e sitemap
- [`frontend/src/assets/i18n/addon.it.json`](frontend/src/assets/i18n/addon.it.json) e [`frontend/src/assets/i18n/addon.en.json`](frontend/src/assets/i18n/addon.en.json): testi del progetto
- [`frontend/src/assets/legal/`](frontend/src/assets/legal): privacy, cookie, termini, banner
- [`frontend/src/assets/mapping.json`](frontend/src/assets/mapping.json): registry logico degli asset
- [`frontend/src/assets/file/`](frontend/src/assets/file): immagini e file statici

### Backend

Il backend e' diviso in due zone:

- [`backend/Engine/`](backend/Engine): base condivisa del template. Qui stanno controller astratti e servizi riusabili; di norma si tocca solo se vuoi cambiare comportamento comune a piu' progetti.
- [`backend/Controllers/`](backend/Controllers), [`backend/Services/`](backend/Services), [`backend/Store/FileContentStore.cs`](backend/Store/FileContentStore.cs) e [`backend/data/`](backend/data): area di progetto, cioe' endpoint concreti, logica applicativa e contenuti.
- [`backend/Program.cs`](backend/Program.cs) e [`backend/Security/`](backend/Security): wiring applicativo e pipeline di sicurezza.
- [`backend/Store/IContentStore.cs`](backend/Store/IContentStore.cs): contratto di accesso ai dati; resta stabile anche se cambi la persistenza.

### Controller: dove mettere cosa

I controller vanno letti insieme ai file reali che tocchi:

- [`backend/Engine/Controllers/`](backend/Engine/Controllers): basi riusabili (`EngineBaseController`, `EngineAuthController`, `EngineProtectedController`) con attributi comuni, dipendenze condivise e regole di accesso. Non sono il posto in cui aggiungere route di progetto.
- [`backend/Controllers/BaseController.cs`](backend/Controllers/BaseController.cs): endpoint pubblici del progetto. Richiedono API key e raccolgono quello che non riguarda autenticazione o area protetta.
- [`backend/Controllers/AuthController.cs`](backend/Controllers/AuthController.cs): flussi di autenticazione o operazioni collegate all'identita'. Nel template contiene il placeholder di login.
- [`backend/Controllers/ProtectedController.cs`](backend/Controllers/ProtectedController.cs): endpoint disponibili solo dopo autenticazione. Richiedono API key + JWT.
- [`backend/Services/SiteService.cs`](backend/Services/SiteService.cs) o servizi dedicati: logica applicativa da tenere fuori dai controller.

Regola pratica:

- il template definisce come impostare sicurezza, dipendenze e struttura comune
- il progetto definisce route, endpoint, logica e contenuti
- se devi aggiungere un endpoint, in genere tocchi prima il controller concreto giusto e poi il servizio o lo store collegato

Completano il quadro:

- [`backend/Store/FileContentStore.cs`](backend/Store/FileContentStore.cs): implementazione storage pronta all'uso, sostituibile con altre fonti dati
- [`backend/data/irl.json`](backend/data/irl.json) e [`backend/data/social.json`](backend/data/social.json): contenuti di esempio dello storage file-based
- [`docker-compose.yml`](docker-compose.yml), [`docker-compose.override.yml`](docker-compose.override.yml) e [`docker-compose.prod.yml`](docker-compose.prod.yml): orchestrazione dev e prod

## API attuale

| Metodo | Path | Auth | Note |
|---|---|---|---|
| `GET` | `/api/profile` | API key | profilo aziendale localizzato |
| `GET` | `/api/social` | API key | filtro opzionale con `nomi` |
| `POST` | `/api/auth/login` | API key | placeholder, nel template risponde `valid = false` |
| `GET` | `/health` | nessuna | health check |

Le API protette stanno in [`backend/Controllers/ProtectedController.cs`](backend/Controllers/ProtectedController.cs) e diventano realmente utilizzabili solo quando configuri il JWT.

Questi endpoint servono soprattutto come base di partenza del template: mostrano come organizzare accesso pubblico, autenticazione e area protetta, lasciando al progetto la definizione degli endpoint reali.

### Pipeline di sicurezza

Ogni richiesta HTTP attraversa una pipeline gia' pronta, registrata in `Program.cs` con una sola chiamata (`AddTemplateSecurity`).

In ordine:

1. **Forwarded headers** — ricostruisce IP reale da `X-Forwarded-For` se `BehindProxy = true`
2. **CORS** — gestisce origini consentite e preflight `OPTIONS`
3. **Rate limiting** — applica limiti globali e policy dedicate
4. **Security headers** — aggiunge gli header di sicurezza a ogni risposta
5. **API Key** — richiede `X-Api-Key` dove previsto
6. **JWT Bearer** — se configurato, valida il token e popola l'identita'

In pratica, il template fornisce gia' il wiring completo della sicurezza: il progetto interviene soprattutto sulla configurazione (`appsettings`, env vars, policy e chiavi), non sulla struttura della pipeline.

### Eccezioni API strutturate

I controller lanciano eccezioni custom (`NotFoundException`, `DecodingException`, `InvalidParametersException`), ognuna con il proprio status code. `ApiExceptionHandler` le intercetta e le converte in ProblemDetails (RFC 9457):

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "detail": "Il profilo richiesto non esiste"
}
```

### Persistenza

`IContentStore` astrae l'accesso ai dati. Il template non impone un database e non richiede obbligatoriamente JSON: definisce solo il contratto con cui il backend recupera contenuti.

L'implementazione pronta all'uso e' [`FileContentStore`](backend/Store/FileContentStore.cs), che legge file da `backend/data/`. Di default e' gia' predisposta per lavorare bene con JSON, soprattutto perche' la gestione delle traduzioni localizzate e' gia' implementata su quella struttura, ma lo store puo' essere adattato anche ad altri formati testuali oppure sostituito del tutto con database, CMS o altre fonti dati.

Questo significa che:

- **il JSON non e' un vincolo del template**
- **il file storage e' solo una base pronta all'uso**
- **la parte gia' implementata per la localizzazione lavora bene sui JSON strutturati**

La localizzazione puo' stare a qualsiasi livello di profondita' e viene risolta in base alla lingua richiesta, con fallback all'italiano. Esempio:

```json
{
  "ragioneSociale": "Acme S.r.l.",
  "descrizione": { "it": "Azienda italiana", "en": "Italian company" },
  "sede": {
    "via": { "it": "Via Roma 1", "en": "1 Rome Street" },
    "cap": "20100"
  }
}
```

Con `lang=en`: `ragioneSociale = "Acme S.r.l."`, `descrizione = "Italian company"`, `sede.via = "1 Rome Street"`, `sede.cap = "20100"`.

Questa parte esiste per mostrare il comportamento dello store file-based gia' incluso nel template; non e' un vincolo architetturale sul tipo di persistenza da usare nel progetto.

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

## Convenzioni di progetto

### Frontend

- `PageType` e' l'identita' stabile delle pagine. Se aggiungi una pagina, parti da li.
- [`frontend/src/app/site.ts`](frontend/src/app/site.ts) centralizza configurazione del sito, navigazione, footer, struttura delle pagine e relative opzioni di visibilita'.
- [`frontend/src/app/siteBuilder.ts`](frontend/src/app/siteBuilder.ts) normalizza questa configurazione e genera gli elementi derivati, come rotte e sitemap.
- Le page component estendono [`frontend/src/app/pages/page-base.component.ts`](frontend/src/app/pages/page-base.component.ts).
- I file `basic.*.json` appartengono al template. Per il progetto si lavora su `addon.*.json`.

Non si tratta di una DSL da estendere come sistema a se': e' semplicemente il modo con cui il frontend tiene in un solo punto menu, link strutturali, albero delle pagine e impostazioni collegate, cosi' da poterli adattare progetto per progetto senza spargere configurazione in piu' file.

### Backend

- Le route stanno nei controller concreti in [`backend/Controllers/`](backend/Controllers); l'engine serve solo a centralizzare comportamento condiviso.
- La logica applicativa va in [`backend/Services/`](backend/Services) o in servizi dedicati, non nei controller.
- Se una modifica vale solo per questo progetto, resta fuori da [`backend/Engine/`](backend/Engine); l'engine va toccato solo per comportamento davvero riusabile.

## Operazioni comuni

### Aggiungere una pagina

1. Aggiungi un valore a `PageType` in [`frontend/src/app/site.ts`](frontend/src/app/site.ts).
2. Crea il componente sotto [`frontend/src/app/pages/`](frontend/src/app/pages/).
3. Registra la pagina in `setSitePages(...)`.
4. Aggiungila alla navigazione se serve.
5. Inserisci le chiavi i18n in `addon.it.json` e `addon.en.json`.

### Aggiungere un endpoint API

1. Aggiungi il metodo nel controller concreto ([`backend/Controllers/`](backend/Controllers)) in base al livello di accesso: `BaseController` per endpoint pubblici, `AuthController` per i flussi di accesso, `ProtectedController` per quelli autenticati.
2. Sposta la logica in [`backend/Services/SiteService.cs`](backend/Services/SiteService.cs) o in un servizio dedicato.
3. Esponi la chiamata lato frontend in [`frontend/src/app/core/services/api.service.ts`](frontend/src/app/core/services/api.service.ts).

Se l'engine espone un metodo `abstract` o `virtual`, implementalo o ridefiniscilo nel controller concreto. In questo template `GetProfile` viene implementato nel progetto, mentre `Login` e' definito direttamente in [`backend/Controllers/AuthController.cs`](backend/Controllers/AuthController.cs).

### Abilitare il login

1. Imposta `Security.Token.SecretKey` in [`backend/appsettings.json`](backend/appsettings.json) o via env var.
2. Implementa la validazione credenziali in [`backend/Controllers/AuthController.cs`](backend/Controllers/AuthController.cs), dentro `Login`.
3. Emetti il token tramite `Auth.GenerateToken()` (ereditato dall'engine).

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
|   |-- Engine/                  ← basi condivise del template
|   |   |-- Controllers/             controller astratti
|   |   `-- Services/                AuthService (JWT)
|   |-- Controllers/             ← Backend.Controllers (custom)
|   |-- Services/                ← Backend.Services (custom)
|   |-- Store/                       IContentStore (engine) + FileContentStore (custom)
|   |-- Models/                      modelli ed eccezioni condivise
|   |-- Security/                    pipeline di sicurezza
|   |-- data/                        contenuti JSON del progetto
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
