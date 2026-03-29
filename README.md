# Br1WebEngine

Template full-stack riutilizzabile per la realizzazione di siti web di varia natura: vetrine aziendali, landing page, portali con area riservata. L'obiettivo e' avere una base solida, sicura e gia' strutturata da cui partire ogni volta, concentrandosi solo sulla logica specifica del nuovo progetto.

## Architettura

| Componente | Tecnologia | Ruolo |
|---|---|---|
| **Backend** | ASP.NET Core 9 | REST API con autenticazione, sicurezza multi-livello, contenuti localizzati |
| **Frontend** | Angular 19 | SPA con SSR, PWA, i18n, tema dinamico, DSL dichiarativo per la struttura |
| **Infrastruttura** | Docker + Nginx | 2 container in dev (hot reload), container unico in prod (Nginx + reverse proxy API) |

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

---

## Backend

### Tre controller, tre contesti di accesso

Il backend non e' pensato per avere decine di controller. Ne bastano tre, uno per ogni stato in cui si puo' trovare l'utente:

- **BaseController** (`api/`) — sei **fuori**. Endpoint pubblici che richiedono solo l'API key. Ad oggi mostra il profilo aziendale localizzato e i link social.
- **AuthController** (`api/auth`) — sei **in mezzo**. Gestisce il passaggio dentro/fuori: login con generazione JWT, rate limiting dedicato (5 tentativi/min per IP).
- **ProtectedController** (`api/`) — sei **dentro**. Controller unico ad oggi vuoto e viene riempito con gli endpoint riservati agli utenti autenticati per tutto cio' che richiede JWT.

Nuovi endpoint si aggiungono nel controller giusto in base al livello di accesso richiesto.

### Sicurezza multi-livello

La sicurezza e' organizzata come una pipeline di strati concentrici. Ogni richiesta HTTP attraversa tutti gli strati in ordine, e ognuno puo' bloccarla prima che arrivi al controller. Tutto si registra con una sola chiamata (`AddTemplateSecurity`) in `Program.cs`, che compone i pezzi nell'ordine corretto:

1. **Forwarded headers** (condizionale) — attivo solo se `Security.BehindProxy` e' `true` in `appsettings.json`. Ricostruisce l'IP reale del client dall'header `X-Forwarded-For` iniettato dal reverse proxy, sovrascrivendo `RemoteIpAddress`. Senza proxy il middleware non viene registrato, cosi' nessuno puo' spoofare l'IP mandando un header finto.
2. **CORS** — `CorsOrigins` vuoto = accetta qualsiasi origine (utile in sviluppo), altrimenti whitelist stretta. In produzione va sempre configurato. Sta prima del rate limiter cosi' i preflight OPTIONS del browser non consumano il budget del rate limit.
3. **Rate limiting** — due policy: `fixed` (100 req/min per IP, globale) e `login` (5 req/min per IP, solo su `api/auth/login`). Ogni policy partiziona automaticamente per `RemoteIpAddress`, cosi' un client che abusa non penalizza gli altri. Sta in alto nella pipeline (fail fast): se un client sta abusando, viene bloccato subito senza sprecare risorse sui middleware successivi.
4. **Security headers** — middleware che aggiunge a ogni risposta (anche 429 e 4xx/5xx) gli header di sicurezza configurati in `appsettings.json` (CSP, X-Frame-Options, etc.).
5. **API Key** — ogni richiesta deve avere l'header `X-Api-Key` con un valore presente nell'array `Security.ApiKeys`. Le richieste OPTIONS passano senza controllo (servono al preflight CORS del browser). Se la chiave manca o e' sbagliata, la richiesta si ferma qui con un 401.
6. **JWT Bearer** — attivato condizionalmente: se `Security.Token.SecretKey` e' vuoto in `appsettings.json`, questo strato non viene nemmeno registrato. Quando e' attivo, valida il token nell'header `Authorization: Bearer` e popola l'identita' dell'utente nel contesto della richiesta.

```
Richiesta HTTP
  │
  ▼
[Forwarded Headers] → ricostruisce IP reale (solo se BehindProxy = true)
  │
  ▼
[CORS] → gestisce preflight OPTIONS, filtra origini
  │
  ▼
[Rate Limiting] → 429 se troppe richieste (fail fast)
  │
  ▼
[Security Headers] → aggiunge CSP, X-Frame-Options, etc.
  │
  ▼
[API Key Check] → 401 se manca o sbagliata
  │
  ▼
[JWT Validation] → (solo se SecretKey configurata) popola identita'
  │
  ▼
[Controller] → BaseController / AuthController / ProtectedController
```

### Eccezioni API strutturate

I controller non gestiscono gli errori: li lanciano. Esiste una gerarchia di eccezioni custom (`NotFoundException`, `DecodingException`, `DataNotFoundException`, `InvalidParametersException`), ognuna con il proprio status code HTTP (404, 422, 404, 400). Un middleware globale `ApiExceptionHandler` intercetta qualsiasi `ApiException` e la converte in una risposta JSON nel formato ProblemDetails (RFC 9457):

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.5",
  "title": "Not Found",
  "status": 404,
  "detail": "Il profilo richiesto non esiste"
}
```

Questo pattern ha due vantaggi: i controller restano puliti (lanciano e basta), e il frontend riceve sempre errori in un formato prevedibile che `NotificationService` sa gia' come mostrare all'utente.

### Persistenza disaccoppiata

L'interfaccia `IContentStore` astrae l'accesso ai dati. L'implementazione attuale (`FileContentStore`) legge da file JSON in `backend/data/`.

La parte interessante e' la **deserializzazione localizzata ricorsiva**: il deserializzatore attraversa l'intero albero JSON e, per ogni oggetto, controlla se tutte le chiavi sono codici lingua (es. `it`, `en`). Se si', risolve al valore della lingua richiesta (con fallback all'italiano). Se no, continua a scendere nei figli. Questo significa che la localizzazione puo' stare a qualsiasi livello di profondita', mescolata con campi normali:

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

Con `lang=en`, il risultato e': `ragioneSociale = "Acme S.r.l."`, `descrizione = "Italian company"`, `sede.via = "1 Rome Street"`, `sede.cap = "20100"`. I nodi vuoti dopo la risoluzione vengono eliminati automaticamente.

E' possibile sostituire i file JSON con un database o un CMS implementando `IContentStore`, senza toccare controller o servizi.

### Localizzazione automatica delle risposte

Il backend legge l'header `Accept-Language` di ogni richiesta e imposta la cultura corrente del thread (`CultureInfo.CurrentUICulture`). Il frontend non deve fare nulla: l'interceptor HTTP aggiunge gia' l'header con la lingua selezionata dall'utente, e il backend lo usa per risolvere i contenuti localizzati. Il fallback e' l'italiano. La configurazione si trova in `Program.cs` (`RequestLocalizationOptions`), dove sono elencate le culture supportate e il provider usato (`AcceptLanguageHeaderRequestCultureProvider`).

### Registrazione condizionale dei servizi

`Program.cs` registra `AuthService` nel container DI **solo se** `Security.Token.SecretKey` e' valorizzata (cioe' `security.LoginEnabled == true`). Se il login non serve, il servizio non esiste a runtime: nessuna allocazione, nessun singleton in memoria. Lo stesso principio vale per il JWT bearer handler e la policy `RequireLogin`, che vengono configurati solo quando l'autenticazione e' attiva.

### Health check integrato

Il Dockerfile del backend include una direttiva `HEALTHCHECK` che ogni 30 secondi chiama `GET /api/social`. Se il backend non risponde, Docker lo segnala come unhealthy e puo' riavviarlo automaticamente (con `restart: always` in produzione). L'endpoint `/health` di ASP.NET e' mappato separatamente con `AllowAnonymous`, quindi non richiede API key.

---

## Frontend

### DSL dichiarativo per la struttura del sito

Il cuore del frontend e' un **builder pattern** che funziona in tre fasi. In `site.ts` si descrive il sito in modo dichiarativo — nome, lingue, colore tema, pagine, menu, footer. Il builder in `siteBuilder.ts` prende questa descrizione e genera tutto cio' che serve ad Angular per funzionare.

**Fase 1 — Dichiarazione (site.ts):** si descrivono tre cose separate: la configurazione globale, l'albero delle pagine, e la struttura di navigazione (quali pagine appaiono in header e footer).

**Fase 2 — Normalizzazione (siteBuilder.ts):** il builder analizza ogni pagina e ne deduce il tipo (`leaf`, `parent`, `external`) dalla struttura stessa: se ha `children` e' un parent, se ha `externalUrl` e' external, altrimenti e' leaf. Non serve specificare il tipo a mano. Assegna valori di default, valida la coerenza, e costruisce una mappa `PageType → path` che diventa il registry centrale.

**Fase 3 — Generazione:** dalla struttura normalizzata vengono prodotti:
- Le **rotte Angular** (`Route[]`), filtrate per escludere pagine disabilitate e link esterni
- I **link di navigazione** per header e footer, con i PageType risolti nei path reali
- Il metodo `getPath(PageType)` per ottenere il path di qualsiasi pagina a runtime

Il risultato finale e' l'oggetto `DLSCustom`, esportato da `site.ts`, che contiene tutto. Navbar, footer, router e sitemap leggono tutti da questo singolo oggetto: modificare una pagina in `site.ts` aggiorna automaticamente rotte, menu e sitemap senza toccare altro.

Le pagine sono di tre tipi:
- **LeafPage** — rotta interna con componente Angular (lazy loaded)
- **ParentPage** — contenitore per raggruppare sotto-rotte (es. `/legale/privacy`, `/legale/cookie`)
- **ExternalPage** — link esterno che appare nei menu ma non genera rotte

### PageBaseComponent

Ogni componente pagina estende `PageBaseComponent`, una classe base (decorata con `@Directive()`) che elimina il boilerplate. Fornisce automaticamente via injection: `TranslateService`, `ApiService`, `AssetService`, `NotificationService`, e il `PageType` della pagina corrente (letto dalla route data). Cosi' un componente pagina puo' concentrarsi solo sul proprio template e logica, senza ripetere inject in ogni file.

### Servizi principali

| Servizio | Responsabilita' |
|---|---|
| `TranslateService` | i18n a due livelli (basic + addon), placeholder, cambio lingua reattivo |
| `ThemeService` | Tema con calcoli WCAG 2.1 di contrasto, CSS variable, integrazione Bootstrap |
| `NotificationService` | Wrapper SweetAlert2: toast, alert, conferme, parsing ProblemDetails |
| `AuthService` | Ciclo JWT completo: login, logout, ripristino sessione, stato reattivo |
| `CookieConsentService` | GDPR: blocca cookie fino al consenso, persiste su localStorage |
| `AssetService` | Registry ID→file tramite `mapping.json` |
| `ShareService` | Web Share API con fallback a clipboard e download |
| `ImgBuilderService` | Rendering testo su canvas con word-wrap |

#### Come funziona il sistema i18n

`TranslateService` carica due file JSON per lingua: `basic.{lang}.json` (le traduzioni del template: errori, label, sezioni) e `addon.{lang}.json` (le traduzioni del tuo progetto). I due file vengono uniti con un merge: le chiavi dell'addon sovrascrivono quelle del basic, permettendo di personalizzare qualsiasi testo senza modificare i file del template.

La lingua corrente e' un signal reattivo. Quando cambia, il servizio ricarica i JSON, aggiorna l'attributo `lang` dell'`<html>` (per accessibilita' e SEO), e notifica tutti i componenti. La preferenza lingua viene salvata come cookie tramite `CookieConsentService` — mai con accesso diretto a `document.cookie`. Se il consenso cookie non e' stato dato, il servizio usa la lingua di default dalla configurazione.

I placeholder sono posizionali: `"benvenuto": "Ciao {0}, oggi e' {1}"` → `translate.t('benvenuto', 'Mario', 'lunedi')`.

#### Come funziona il tema dinamico

`ThemeService` prende il colore esadecimale dalla configurazione del sito e calcola automaticamente se il testo sopra quel colore deve essere chiaro o scuro. Lo fa implementando l'algoritmo WCAG 2.1 per il rapporto di contrasto:

1. Converte l'esadecimale in RGB
2. Applica la correzione gamma sRGB per ottenere la luminanza relativa
3. Calcola il rapporto di contrasto tra il colore tema e il bianco, poi tra il colore tema e il nero
4. Sceglie il colore testo con il rapporto migliore

Il risultato viene esposto come signal `isDarkTextPreferred` e come CSS variable `--colorTema`. Imposta anche l'attributo `data-bs-theme` su `<html>` cosi' Bootstrap adatta automaticamente tutti i suoi componenti al tono chiaro/scuro del tema scelto.

#### Come funziona il consenso cookie (GDPR)

`CookieConsentService` gestisce un modello a tre stati:

- **Non ha risposto** → il banner e' visibile, i cookie non vengono scritti
- **Ha accettato** → i cookie vengono scritti normalmente
- **Ha rifiutato** → i cookie non vengono scritti, ma quelli gia' esistenti restano leggibili

Lo stato del consenso e' salvato in localStorage (non in un cookie — sarebbe circolare). Tutti gli altri servizi che vogliono scrivere un cookie passano da `CookieConsentService.setCookie()`, che controlla il consenso prima di scrivere. Questo centralizza il check in un unico punto invece di sparpagliarlo nel codice.

#### Come funziona l'autenticazione

`AuthService` gestisce il ciclo JWT con un approccio basato su signal Angular:

1. **Login:** invia le credenziali a `POST /api/auth/login`, riceve un token JWT
2. **Persistenza:** il token viene salvato in un signal (`_token`) e in `sessionStorage` (non `localStorage`: il token sparisce quando si chiude il tab, per sicurezza)
3. **Stato reattivo:** `isLoggedIn` e' un signal computed — i template e i guard si aggiornano automaticamente
4. **Ripristino:** all'avvio dell'app, `restoreSession()` recupera il token da `sessionStorage` (cosi' un refresh non disconnette)
5. **Logout:** pulisce sia il signal che il `sessionStorage`

L'interceptor HTTP aggiunge automaticamente `Authorization: Bearer {token}` a ogni richiesta verso il backend quando il token e' presente.

#### Come funziona la gestione errori

`NotificationService` fa da ponte tra gli errori backend e l'utente. Quando una chiamata API fallisce, il servizio ispeziona la risposta:

1. Se contiene `detail` o `title` (formato ProblemDetails RFC 9457), li usa come messaggio
2. Altrimenti, cerca una traduzione i18n per lo status code (es. `errore404Info`, `errore404Desc`)
3. Come ultimo fallback, mostra un errore generico tradotto

Questo significa che il backend puo' restituire messaggi specifici nelle eccezioni, oppure affidarsi ai codici HTTP standard: il frontend gestisce entrambi i casi.

### Layout e componenti condivisi

- **Navbar** — generata dal DSL, con dropdown, cambio lingua, gestione mobile
- **Footer** — carica il profilo dall'API, mostra contatti/dati societari/social (nasconde sezioni vuote)
- **Smoke Effect** — effetto particellare su canvas, configurabile dal DSL
- **Back-to-top** — pulsante con colore calcolato dal tema
- **Context Menu** — direttiva per click destro (desktop) e long-press (mobile)
- **Cookie Banner** — contenuto Markdown con placeholder dinamici
- **Social Link** — 30+ piattaforme con icona e colore brand

### Titolo pagina automatico

`AppTitleStrategy` estende la `TitleStrategy` di Angular e aggiorna automaticamente il titolo del browser tab a ogni navigazione. Legge la chiave `title` dalla configurazione della rotta (che e' una chiave di traduzione), la traduce con `TranslateService`, e compone il titolo finale nel formato `"{titolo pagina} | {appName}"`. Se la pagina non ha titolo o coincide con il nome app, mostra solo `appName`. Non serve nessun codice nei componenti pagina: basta che la rotta abbia un `title` definito nel DSL.

### Bootstrap dell'applicazione

All'avvio, prima che Angular renda qualsiasi cosa, un inizializzatore in `app.config.ts` esegue in sequenza:

1. Carica la lingua iniziale (dal cookie se presente, altrimenti dal default in configurazione)
2. Ripristina la sessione JWT da `sessionStorage` (se c'era un token attivo)
3. Attiva il `ThemeService` (che imposta le CSS variable e il tono Bootstrap)

Solo dopo che questi tre passi sono completati, l'app diventa visibile. Questo evita flash di contenuto non tradotto o temi che "saltano" al caricamento.

L'interceptor HTTP e' unico e funzionale (stile Angular 17+): aggiunge a ogni richiesta verso il backend tre header: `X-Api-Key` (dall'environment), `Accept-Language` (dalla lingua corrente), e `Authorization: Bearer` (se l'utente e' loggato).

---

## Infrastruttura Docker e Nginx

### Come funziona l'orchestrazione

L'infrastruttura Docker e' composta usando tre file che si sovrappongono:

- **`docker-compose.yml`** — definisce la struttura: due servizi (frontend e backend), la rete condivisa, il volume per i dati. Non specifica come buildarli o eseguirli.
- **`docker-compose.override.yml`** — sovrascrittura per lo sviluppo (applicata automaticamente da Docker Compose). Usa Node 22 Alpine per il frontend con `ng serve`, espone frontend e backend su porte dedicate per il lavoro locale, e monta i sorgenti nei container.
- **`docker-compose.prod.yml`** — sovrascrittura per la produzione (va specificata esplicitamente con `-f`). Aggiunge `restart: always` e configura il logging JSON con rotazione (max 10MB, 3 file).

In sviluppo si lavora con due container separati (frontend su 4200, backend su 5000). In produzione il frontend viene buildato in un'immagine Nginx che serve i file statici e proxya le API.

### Cosa fa Nginx

In produzione, Nginx ha quattro responsabilita':

1. **Serve la SPA** — tutti gli URL che non matchano un file reale vengono reindirizzati a `index.html`, dove il router Angular prende il controllo
2. **Proxya le API** — le richieste a `/api/*` vengono inoltrate a `http://backend:8080` sulla rete interna Docker, aggiungendo gli header `X-Real-IP`, `X-Forwarded-For` e `X-Forwarded-Proto`
3. **Cache intelligente** — la regex `\.[0-9a-f]{16,}\.(js|css|woff2?|...)$` intercetta i file con hash generato dal build Angular e li serve con `Cache-Control: public, immutable` e scadenza a 1 anno. Il service worker (`ngsw-worker.js`, `ngsw.json`) riceve esplicitamente `no-store` per garantire aggiornamenti PWA immediati. Il manifest ha cache di 1 giorno.
4. **Compressione** — gzip attivo per testo, CSS, JSON, JavaScript e SVG (soglia minima 256 byte)

### Sostituzione placeholder a runtime

A runtime, prima di avviare Nginx, `docker-entrypoint.sh` esegue `find` + `sed` su tutti i file `.js` compilati nella cartella di serving, sostituendo i placeholder con i valori delle variabili d'ambiente:

| Placeholder | Variabile | Default | Scopo |
|---|---|---|---|
| `__API_URL__` | `API_URL` | *(vuoto = proxy Nginx)* | URL base del backend |
| `__API_KEY__` | `API_KEY` | `frontend` | Chiave API per il backend |

Questo permette di buildare l'immagine Docker una sola volta e deployarla su ambienti diversi cambiando solo le variabili d'ambiente, senza rifare la build Angular.

---

## Primi 10 minuti

Se sei nuovo sul progetto, non serve capire subito tutta l'architettura. Parti cosi':

- **Prerequisiti minimi** - `Docker Desktop` per il primo avvio rapido, oppure `Visual Studio 2022` + `.NET 9` + `Node.js 22` se vuoi lavorare senza Docker
- **Primo obiettivo** - avviare il template con uno dei comandi del Quick Start qui sotto e verificare che frontend e backend rispondano
- **URL da controllare in sviluppo Docker** - frontend `http://localhost:4200`, backend `http://localhost:5000`
- **Primi file da aprire per orientarti** - `frontend/src/app/site.ts`, `backend/data/irl.json`, `backend/data/social.json`, `frontend/src/assets/i18n/addon.it.json`
- **Guida Docker dedicata** - se vuoi solo compose, servizi, variabili e comandi utili, vedi [DOCKER_README.md](DOCKER_README.md)

Quando hai visto il progetto girare, puoi leggere con calma le sezioni sopra per capire architettura e responsabilita' dei pezzi, poi scendere a `Come personalizzare il template` per mettere mano alle modifiche vere.

---

## Quick Start

### Sviluppo locale

```bash
docker compose up --build
```

- Docker Compose applica automaticamente `docker-compose.override.yml`
- Backend: `http://localhost:5000`
- Frontend con `ng serve`: `http://localhost:4200`

### Produzione

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
```

Frontend su `http://localhost:80`, Nginx proxya `/api/*` al backend internamente.

### Senza Docker (Visual Studio + Angular CLI)

Baseline consigliata:

- backend e frontend restano entrambi parte del progetto
- Visual Studio, se usato, gestisce solo build e debug del backend
- il frontend si avvia in modo indipendente con Angular CLI
- `start-frontend.bat` e' solo una comodita' per Windows, non una dipendenza architetturale

Flusso tipico:

1. Apri `template-sito-next.sln` in Visual Studio
2. Apri la PowerShell integrata di Visual Studio, oppure un terminale qualsiasi
3. Avvia il frontend con `.\start-frontend.bat` oppure con `cd frontend && npm start`
4. Premi `F5` in Visual Studio per avviare e debuggare solo il backend
5. Il frontend chiama il backend all'URL definito in `src/environments/environment.ts`

---

## Come personalizzare il template

Questa sezione spiega **cosa modificare e dove** per adattare il template al tuo progetto.

### 1. Aggiungere una nuova pagina

L'enum `PageType` in `frontend/src/app/site.ts` e' **obbligatorio**. Ogni pagina del sito deve avere un valore nell'enum. Senza un `PageType`, il sistema non sa che quella pagina esiste.

**Passo 1 — Aggiungi il valore all'enum:**

```typescript
// frontend/src/app/site.ts
export enum PageType {
    Home,
    Social,
    ...
    ChiSiamo,        // ← nuovo
}
```

**Passo 2 — Crea il componente** (deve estendere `PageBaseComponent`):

```typescript
// frontend/src/app/pages/chi-siamo/chi-siamo.component.ts
import { Component } from '@angular/core';
import { PageBaseComponent } from '../page-base.component';

@Component({
    selector: 'app-chi-siamo',
    standalone: true,
    template: `<h1>{{ translate.t('chiSiamo') }}</h1>`
})
export class ChiSiamoComponent extends PageBaseComponent {}
```

**Passo 3 — Aggiungi la pagina nell'albero `setSitePages`:**

```typescript
{
    path: 'chi-siamo',
    title: 'chiSiamo',           // chiave di traduzione
    enabled: true,
    pageType: PageType.ChiSiamo,
    component: () => import('./pages/chi-siamo/chi-siamo.component')
        .then(m => m.ChiSiamoComponent),
}
```

**Passo 4 — Aggiungila ai menu** (header, footer, o entrambi):

```typescript
headerNavigationBuilder.addPage(PageType.ChiSiamo);
```

**Passo 5 — Aggiungi le traduzioni** in `assets/i18n/addon.it.json` e `addon.en.json`:

```json
{
  "chiSiamo": "Chi siamo"
}
```

I file `basic.*.json` contengono le traduzioni del template (errori, label comuni). I file `addon.*.json` sono quelli del progetto specifico e sovrascrivono i basic. **Modifica sempre gli addon, non i basic.**

### 2. Tipi di pagina speciali

- **Pagina protetta** — aggiungi `requiresAuth: true` alla pagina. Il guard blocca l'accesso senza JWT.
- **Pagina senza pannello** — aggiungi `showPanel: false` per una pagina a tutto schermo (utile per landing page).
- **Pagina disabilitata** — metti `enabled: false`. Viene esclusa da rotte, menu e sitemap. Puoi usarla come placeholder per funzionalita' future.
- **Pagina esterna** — usa `externalUrl` al posto di `path` e `component`. Appare nei menu ma non genera rotte Angular.
- **Gruppo di pagine** — usa `ParentPage` con `children` per creare gerarchie di URL (es. `/legale/privacy`, `/legale/cookie`).

### 3. Configurare il sito

In `site.ts`, nella sezione `setSiteConfiguration`:

```typescript
{
    appName: 'Il Mio Sito',           // nome visualizzato
    defaultLang: 'it',                 // lingua di default
    availableLanguages: ['it', 'en'],  // lingue supportate
    description: 'Descrizione SEO',    // meta description
    colorTema: '#1a5276',              // colore tema principale (hex)
    showFooter: true,                  // mostra/nascondi il footer
    smoke: {                           // effetto particelle di sfondo
        enable: true,
        color: '#b5d9ff',
        opacity: 0.7,
        maximumVelocity: 120,
        particleRadius: 350,
        density: 18
    }
}
```

Il colore tema influenza automaticamente: il back-to-top button, il tono del testo (chiaro/scuro calcolato con WCAG 2.1), e la CSS variable `--colorTema` usabile ovunque nei fogli di stile.

### 4. Modificare i dati aziendali

**Profilo legale** — `backend/data/irl.json`:

Contiene ragione sociale, P.IVA, codice fiscale, sede legale, contatti, dati societari e metadati. I campi supportano la localizzazione inline:

```json
{
  "ragioneSociale": "La Mia Azienda S.r.l.",
  "sedeLegale": {
    "via": {
      "it": "Via Roma",
      "en": "Rome Street"
    },
    "citta": "Milano"
  }
}
```

Qualsiasi campo puo' essere una stringa semplice o un oggetto `{"it": "...", "en": "..."}`. Il backend risolve la lingua automaticamente.

**Social** — `backend/data/social.json`:

Dizionario nome→URL. Aggiungi o rimuovi piattaforme:

```json
{
    "instagram": "https://www.instagram.com/mioprofilo",
    "linkedin": "https://www.linkedin.com/company/miaazienda"
}
```

Il frontend ha gia' il mapping icona+colore per 30+ piattaforme. Il filtro per nome e' **case-insensitive**: richiedere `?nomi=Facebook` matcha la chiave `facebook` nello store.

### 5. Documenti legali

I file Markdown in `frontend/src/assets/legal/` servono le pagine policy:

| File | Pagina |
|---|---|
| `privacy.{lang}.md` | Privacy Policy |
| `cookie.{lang}.md` | Cookie Policy |
| `TOS.{lang}.md` | Termini di Servizio |
| `legal.{lang}.md` | Note Legali |
| `cookie-banner.{lang}.md` | Testo del banner cookie |

Ogni documento va tradotto per ogni lingua supportata. Il banner cookie supporta il placeholder `{{COOKIE_POLICY_URL}}` che viene sostituito con il path reale della pagina cookie.

### 6. Traduzioni

Il sistema i18n usa due file per lingua in `frontend/src/assets/i18n/`:

- `basic.{lang}.json` — traduzioni del template (errori, label UI, nomi sezioni). **Non modificare.**
- `addon.{lang}.json` — traduzioni del tuo progetto. **Lavora qui.** Sovrascrivono le chiavi di basic.

Supporta placeholder posizionali: `"benvenuto": "Ciao {0}, oggi e' {1}"` → `translate.t('benvenuto', 'Mario', 'lunedi')`.

### 7. Asset e immagini

Mappa in `frontend/src/assets/mapping.json` gli ID logici ai file fisici:

```json
{
  "logo": {
    "file": "logo.png",
    "maxW": 200
  }
}
```

Nel codice: `asset.getUrl('logo')` restituisce il path risolto. Metti i file in `frontend/src/assets/file/`.

### 8. Sicurezza backend

In `backend/appsettings.json`, sezione `Security`:

| Campo | Scopo | Default |
|---|---|---|
| `ApiKeys` | Array di chiavi API accettate | `["frontend"]` |
| `CorsOrigins` | Origini CORS consentite (vuoto = tutte) | `[]` |
| `BehindProxy` | Attiva ForwardedHeaders per ricostruire l'IP reale dietro reverse proxy | `false` |
| `Token.SecretKey` | Chiave firma JWT. **Vuoto = login disabilitato** | `""` |
| `Token.ExpirationSeconds` | Durata token JWT in secondi | `3000` |
| `Headers` | Security headers iniettati in ogni risposta | CSP, X-Frame-Options, etc. |

Se `Token.SecretKey` e' vuota, l'infrastruttura JWT non viene attivata e il flusso di login non e' utilizzabile. Le API pubbliche restano operative.

Per **abilitare il login**: valorizza `Token.SecretKey` con almeno 32 caratteri. Quando e' presente, il template attiva automaticamente a runtime il bearer handler, la policy `RequireLogin`, la validazione token e `AuthService`.

`AuthController`, invece, resta volutamente un punto di integrazione applicativo: nel template base l'endpoint di login e' dimostrativo e la verifica reale delle credenziali va implementata nel progetto finale.

Per la **produzione**, sovrascrivi i segreti tramite variabili d'ambiente Docker:

```yaml
environment:
  - Security__ApiKeys__0=una-chiave-robusta
  - Security__Token__SecretKey=min-32-caratteri-segreto
  - Security__CorsOrigins__0=https://miosito.it
```

### 9. Aggiungere endpoint API

Scegli il controller giusto in base al contesto:

```csharp
// Endpoint pubblico (solo API key)
// → aggiungi in BaseController
[HttpGet("catalogo")]
public async Task<IActionResult> GetCatalogo() { ... }

// Endpoint protetto (API key + JWT)
// → aggiungi in ProtectedController
[HttpPost("ordine")]
public async Task<IActionResult> CreaOrdine([FromBody] OrdineDto dto) { ... }
```

Per nuove sorgenti dati, implementa `IContentStore` o crea un nuovo servizio registrandolo in `Program.cs`.

**Lato frontend**, `ApiService` centralizza tutte le chiamate HTTP. Gli endpoint sono dichiarati come costanti in cima al file (`frontend/src/app/core/services/api.service.ts`) per evitare stringhe duplicate:

```typescript
const API = {
    social:  `${environment.apiUrl}/api/social`,
    profile: `${environment.apiUrl}/api/profile`,
    login:   `${environment.apiUrl}/api/auth/login`,
    catalogo: `${environment.apiUrl}/api/catalogo`,  // ← nuovo
} as const;
```

Poi aggiungi il metodo pubblico corrispondente nella classe:

```typescript
getCatalogo(): Promise<Catalogo> {
    return firstValueFrom(
        this.http.get<Catalogo>(API.catalogo)
            .pipe(catchError(err => this.handleError(err)))
    );
}
```

La gestione errori e' automatica: `handleError` passa l'errore a `NotificationService`, che lo mostra all'utente nel formato giusto (vedi sezione "Come funziona la gestione errori").

### 10. Deploy

**Stesso host (default):**

```bash
docker compose up --build -d
```

Frontend e backend sullo stesso server. Nginx su porta 80 proxya `/api/*` al backend sulla porta 8080 internamente.

**Host separati:**

```bash
# Server backend (del cliente)
docker compose up backend -d

# Server frontend (tuo)
API_URL=https://api.cliente.it docker compose up frontend -d
```

Il frontend chiama direttamente il backend remoto. Configurare CORS di conseguenza.

### Script frontend e hook npm automatici

Il frontend usa gli hook `pre` di npm per eseguire automaticamente la generazione di metadati e sitemap. Gli script nella tabella partono **senza intervento manuale** — basta lanciare `npm start` o `npm run build`:

| Hook | Scatenato da | Cosa esegue |
|---|---|---|
| `prestart` | `npm start` | `generate:site-meta` |
| `prebuild` | `npm run build` | `generate:site-meta` + `generate:sitemap` |
| `prebuild:prerender` | `npm run build:prerender` | `generate:site-meta` + `generate:sitemap` |

- **`generate:site-meta`** — legge la configurazione da `site.ts` e sincronizza `src/index.html` (title, meta description, OG tags, Twitter cards, theme-color) e `public/manifest.webmanifest` (nome PWA, descrizione, colore tema, lingua). Modificare `site.ts` basta: i file statici si aggiornano da soli.
- **`generate:sitemap`** — genera `public/sitemap.xml` dalle pagine del DSL. Solo le pagine con `enabled: true` vengono incluse. Usa la variabile d'ambiente `SITEMAP_BASE_URL` come dominio base (default: `https://example.com` con warning).
- **`generate:icons`** — unico script manuale. Rigenera le icone PWA (`icon-192x192.png`, `icon-512x512.png`) a partire da `src/assets/file/favicon.png` usando `sharp`. Se `sharp` non e' disponibile, copia il favicon senza ridimensionamento (fallback graceful). Va eseguito quando cambi favicon o branding.

Per una build frontend di produzione conviene quindi:

```bash
cd frontend
npm install
npm run generate:icons
SITEMAP_BASE_URL=https://tuodominio.it npm run build
```

Se il frontend viene pubblicato via Docker, `npm run build` viene eseguito nel `Dockerfile`, quindi `generate:site-meta` e `generate:sitemap` partono gia' in automatico.

---

## Struttura file

```
template-sito-next/
├── backend/
│   ├── Controllers/          # BaseController, AuthController, ProtectedController
│   ├── Models/               # ApiException, SecurityOptions, UniversalLegalModel
│   ├── Security/             # Auth handlers, middleware, extensions
│   ├── Services/             # AuthService, SiteService
│   ├── Store/                # IContentStore, FileContentStore
│   ├── data/                 # irl.json (profilo), social.json (link social)
│   ├── Program.cs            # Startup e DI
│   ├── appsettings.json      # Configurazione sicurezza e logging
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── site.ts           # ★ ENUM PageType + configurazione DSL
│   │   │   ├── siteBuilder.ts    # Motore del DSL
│   │   │   ├── app.routes.ts     # Generazione rotte da DSL
│   │   │   ├── app.config.ts     # Providers, interceptor, inizializzazione
│   │   │   ├── pages/            # Componenti pagina (Home, Policy, Social, Error)
│   │   │   ├── layout/           # Navbar, Footer, Smoke Effect
│   │   │   ├── shared/           # Componenti, pipe, direttive condivisi
│   │   │   └── core/             # Servizi, DTO, interceptor
│   │   ├── assets/
│   │   │   ├── i18n/             # Traduzioni (basic.*.json + addon.*.json)
│   │   │   ├── legal/            # Documenti legali in Markdown
│   │   │   ├── file/             # Immagini e asset statici
│   │   │   └── mapping.json      # Mappa ID→file per AssetService
│   │   └── environments/         # Config dev/prod (apiUrl, apiKey)
│   ├── nginx.conf                # Reverse proxy + cache + SPA routing
│   └── Dockerfile
├── docker-compose.yml            # Orchestrazione container
└── template-sito-next.sln        # Solution Visual Studio
```

## Licenza

Vedi [LICENSE](LICENSE).
