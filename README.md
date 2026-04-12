# Br1WebEngine

[![CI](https://github.com/br1brown/Br1WebEngine/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/br1brown/Br1WebEngine/actions/workflows/ci.yml)

**Un'engine personale e moderna per costruire siti web, basata su ASP.NET Core 9 e Angular 19.**

Br1WebEngine e' un'engine full-stack per siti content-driven e piccoli portali: si usa direttamente cosi' com'e', oppure come base da cui derivare progetti con nome e identita' propri. L'idea e' avere una struttura gia' pronta in cui il frontend centralizza rotte, menu, sitemap e meta tag, mentre il backend espone API, contenuti localizzati e una pipeline di sicurezza gia' cablata.

---

## Indice
- [Guida Rapida](#guida-rapida)
- [Cosa fa da solo](#cosa-fa-da-solo)
- [Tech Stack](#tech-stack)
- [Architettura del Progetto](#architettura-del-progetto)
- [Dettagli Tecnici](#dettagli-tecnici)
- [Configurazione](#configurazione)
- [Operazioni Comuni](#operazioni-comuni)
- [Da locale a produzione](#da-locale-a-produzione)
- [Estendere l'Engine](#estendere-lengine)
- [Licenza](#licenza)

---

## Guida Rapida

```bash
# 1. Clona il repository
git clone https://github.com/br1brown/Br1WebEngine.git
cd Br1WebEngine

# 2. (Opzionale) Personalizza il nome del progetto
./init-project.sh mio-progetto

# 3. Configura le variabili d'ambiente
cp .env.example .env
# Modifica .env con i tuoi valori (PROJECT_NAME, porte, API key)

# 4. Avvia con Docker
docker compose --env-file .env up -d --build
```

Il frontend sara' disponibile sulla porta configurata in `FRONTEND_PORT`. Per lo sviluppo locale senza Docker, consulta la sezione [Configurazione](#configurazione).

---

## Cosa fa da solo

Br1WebEngine e' costruito intorno a un principio: **se una cosa puo' derivarsi dalla configurazione, non va scritta a mano.** Configuri `site.ts` e `appsettings.json`, e l'engine si occupa di rotte, menu, sicurezza, tema, traduzioni, meta tag e deploy. Di seguito il dettaglio, organizzato per area.

### Configurazione e Frontend

- Modifichi [`site.ts`](#dsl-dichiarativa-e-builder) e rotte, menu, sitemap, meta tag e manifest si aggiornano da soli
- Scrivi un oggetto con `component`, `children` o `externalUrl` e il [builder deduce il tipo di pagina](#dsl-dichiarativa-e-builder) senza che tu lo dichiari
- Aggiungi un valore a [`PageType`](#enum-pagetype) e TypeScript ti guida ovunque serva usarlo; lo rimuovi e ti segnala ogni riferimento rimasto
- La [navigazione header e footer](#navigazione-header-e-footer) si costruisce con `addPage(PageType.X)`: le pagine disabilitate spariscono da sole, i gruppi vuoti pure
- [`PageBaseComponent`](#pagebasecomponent) inietta `translate`, `api`, `asset`, `notify` una volta; ogni pagina [estende e basta](#pagebasecomponent)
- Ogni pagina sceglie il [proprio layout](#pannello-e-layout) con `showPanel: false` per andare a schermo intero
- Le [pagine di errore](#pagine-di-errore) per `400`, `401`, `403`, `404`, `500`, `503` si generano da un array con `.map()`, messaggi inclusi via i18n
- I [titoli pagina](#titoli-pagina) si compongono da soli: `AppTitleStrategy` traduce la chiave della route e formatta `"Pagina | NomeApp"`
- Ogni pagina puà dichiarare il proprio [`renderMode`](#ssr-e-prerender) (`client`, `prerender`, `server`) direttamente in `site.ts`: il piano di rendering SSR viene derivato automaticamente senza toccare la configurazione Angular
- Ogni pagina puo' dichiarare una `description` in `site.ts` (chiave i18n o stringa letterale): il layout la legge da `route.data` e aggiorna automaticamente title e meta tag social a navigazione o cambio lingua, con fallback sulla descrizione globale del sito

### Tema, Stile e Accessibilita'

- Un [colore hex](#gestione-del-tema) in configurazione genera contrasto testo WCAG 2.1, tono light/dark, variabili CSS e meta tag mobile
- Il CSS usa [`color-mix()`](#sistema-css-con-color-mix) per derivare tutti i colori dal tema: surface, hover, bordi, testo. Il JS imposta solo `--colorTema`
- [Accessibilita'](#accessibilita) integrata: skip-link WCAG 2.4.1, `prefers-reduced-motion`, `safe-area-inset` per notch, contrasto AA su testi secondari

### Internazionalizzazione e Contenuti

- Due file di [traduzione per lingua](#sistema-di-traduzione-addon) (`basic` + `addon`): l'addon sovrascrive il template con un `Object.assign`, senza plugin
- Le [pagine legali](#pagine-legali) sono file Markdown in `/assets/legal/`, caricati con fallback lingua, revisionabili senza toccare codice
- Il [Markdown](#markdown-e-protezione-xss) viene renderizzato con protezione XSS integrata: qualsiasi HTML raw nel sorgente viene ignorato
- Il [consenso cookie](#consenso-cookie) si rileva da solo e blocca le scritture in silenzio finche' l'utente non accetta

### Backend e Sicurezza

- [`Security.Token.SecretKey`](#login-condizionale) valorizzata accende JWT, middleware, guard e interceptor; vuota, il sistema funziona senza, senza overhead
- [`AddTemplateSecurity()`](#pipeline-di-sicurezza) registra in una riga schemi di autenticazione (API key + JWT condizionale), policy di autorizzazione, CORS, rate limiting, security headers e gestione errori ProblemDetails
- Tre [controller astratti](#controller-e-ereditarieta) applicano `[Authorize]`, policy e dipendenze: il concreto aggiunge solo routing e logica
- [`IContentStore`](#content-store) definisce il contratto di accesso ai dati; [sostituire l'implementazione](#sostituire-il-content-store) richiede una riga
- L'[interceptor HTTP](#interceptor-http) aggiunge `X-Api-Key`, `Accept-Language` e `Bearer` a ogni chiamata backend, senza toccare i componenti

### Componenti Riusabili

- Un [context menu](#context-menu) con directive: click destro su desktop, long-press su mobile, posizionamento automatico e chiusura con Escape
- 35+ [social con icona e colore brand](#social-link) mappati in un componente: passi il nome, esce l'icona giusta col colore giusto
- Un [servizio di condivisione](#condivisione-e-clipboard) unifica Clipboard API, Web Share API e download in un'unica interfaccia con fallback automatico
- L'[image builder](#generazione-immagini-su-canvas) genera immagini su canvas con word-wrap calcolato via `measureText()`, pronte per social sharing
- Gli [asset](#asset-mapping) si risolvono da un `mapping.json` cachato con `shareReplay`

### Build e Deploy

- [`npm run build`](#build-e-script) lancia meta tag e sitemap in automatico; le [icone PWA](#build-e-script) si rigenerano da `favicon.png`
- [Docker](#docker) esegue proxy, sostituzione env a runtime e caching hashato senza configurare nulla

## Tech Stack
| Categoria | Tecnologia | Note |
|---|---|---|
| Backend | ASP.NET Core 9, C# | REST API, API key, JWT opzionale, ProblemDetails |
| Frontend | Angular 19, TypeScript, Bootstrap 5 | SPA/PWA, prerender, i18n, tema dinamico |
| Container | Docker, Docker Compose, Node SSR | template riusabile per multi-progetto, `.env`-driven |
| Tooling | Node 22+, npm 10+ | script meta, sitemap e icone |

## Architettura del Progetto

```
┌──────────────────────────────────────────────┐
│  Frontend (Angular 19)                       │
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
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Base API │ │ Auth API │ │ Protected API│  │
│  │ (aperto) │ │(transito)│ │  (riservato) │  │
│  └──────────┘ └──────────┘ └──────────────┘  │
│  ┌──────────────────────────────────────────┐│
│  │ Security: API Key + JWT + CORS + Rate    ││
│  │ Limiting + Security Headers              ││
│  └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

### Struttura rapida
```text
Br1WebEngine/
|-- backend/
|   |-- Engine/        basi condivise del template
|   |-- Controllers/   endpoint concreti del progetto
|   |-- Services/      logica applicativa
|   |-- Store/         contratto storage + implementazioni
|   |-- Security/      pipeline di sicurezza
|   `-- data/          contenuti JSON del progetto
`-- frontend/
    |-- src/app/       pagine, layout, configurazione sito
    |-- src/assets/    i18n, file statici, pagine legali
    `-- scripts/       meta, sitemap, icone
```

---

## Dettagli Tecnici

Questa sezione approfondisce il funzionamento interno dell'engine. Se vuoi solo provarlo, parti dalla [Guida Rapida](#guida-rapida). Se vuoi capire come funziona sotto il cofano, o hai bisogno di estenderlo, continua qui.

### Backend

Il backend e' un'API ASP.NET Core 9 con sicurezza a piu' livelli (API key obbligatoria, JWT opzionale), rate limiting e gestione errori strutturata.

#### API attuale
| Metodo | Path | Auth | Note |
|---|---|---|---|
| `GET` | `/api/profile` | API key | profilo aziendale localizzato |
| `GET` | `/api/social` | API key | filtro opzionale con `nomi` |
| `POST` | `/api/auth/login` | API key | placeholder, esposto solo quando il login JWT e' abilitato |
| `GET` | `/health` | nessuna | health check |

Le API protette stanno in `backend/Controllers/ProtectedController.cs` e diventano realmente utilizzabili solo quando configuri il JWT.

#### Controller e ereditarieta'

Tre controller astratti dell'engine abilitano automaticamente attributi di sicurezza e dipendenze condivise:

| Controller astratto | Attributi ereditati | Cosa fornisce |
|---|---|---|
| `EngineBaseController` | `[ApiController]`, `[Authorize]` | `IContentStore` e `ILogger` pronti all'uso |
| `EngineAuthController` | `[ApiController]`, `[Authorize]` | `AuthService` per generazione e validazione JWT |
| `EngineProtectedController` | `[ApiController]`, `[Authorize(Policy = RequireLoginPolicy)]` | `ILogger` condiviso, richiede API key + JWT con ruolo `Authenticated` |

Il controller concreto estende la base giusta e aggiunge solo routing (`[Route]`) e logica endpoint. Non deve ripetere `[Authorize]` ne' il wiring delle dipendenze. I controller che ereditano da `EngineAuthController` o `EngineProtectedController` vengono esposti solo quando il login JWT e' attivo.

#### Pipeline di sicurezza
La sicurezza si divide in due parti: **registrazione** (`AddTemplateSecurity`) e **pipeline HTTP** (`UseTemplateSecurity`).

**`AddTemplateSecurity()`** registra:
- **Schema API key**: handler custom che valida `X-Api-Key` su ogni richiesta (tranne preflight OPTIONS). Le richieste OPTIONS vengono lasciate passare per non bloccare i preflight CORS del browser
- **Schema JWT Bearer** (condizionale): registrato solo se `LoginEnabled = true`. Firma HMAC-SHA256, `ClockSkew = Zero`, issuer/audience non vincolati
- **Policy `RequireLogin`**: richiede API key valida + JWT con ruolo `Authenticated`. Se `LoginEnabled = false`, il ruolo non puo' mai essere soddisfatto e `ProtectedController` resta inaccessibile
- **CORS**: origini configurabili; header consentiti limitati a `Content-Type`, `Authorization`, `X-Api-Key`, `Accept-Language`
- **Rate limiting**: `100 req/min` globali per IP, `5 req/min` su login (policy `login` applicata via `[EnableRateLimiting]`)
- **Gestione errori**: `ApiExceptionHandler` normalizza le eccezioni in `ProblemDetails` RFC 9457

**`UseTemplateSecurity()`** applica i middleware in ordine:
1. **Forwarded headers** (solo se `BehindProxy = true`): sovrascrive `RemoteIpAddress` con `X-Forwarded-For`, necessario perche' il rate limiter partiziona per IP
2. **CORS**: prima del rate limiter, cosi' i preflight OPTIONS non consumano il budget
3. **Rate limiter**: fail fast — se il client sta abusando, viene bloccato prima di arrivare ai controller
4. **Security headers**: iniettati PRIMA di `_next()`, quindi presenti anche su risposte di errore (401, 500, ecc.). Include X-Frame-Options, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
5. **HSTS**: forza HTTPS
6. **Exception handler + status code pages**: errori → ProblemDetails JSON

Dopo `UseTemplateSecurity()`, `Program.cs` chiama `UseAuthentication()` e `UseAuthorization()` separatamente.

#### Content store
`IContentStore` definisce il contratto (`GetProfileAsync`, `GetSocialAsync`) senza sapere dove risiedano i dati. `SiteService` dipende solo dall'interfaccia e orchestra filtri social e localizzazione profilo senza conoscere il formato di persistenza.

L'implementazione attiva (`FileContentStore`) legge da `backend/data/` e include un `LocalizedJsonDeserializer` che risolve ricorsivamente le strutture `{ "it": ..., "en": ... }`, sceglie la lingua richiesta, ripega sul fallback italiano e scarta nodi vuoti.

#### Login condizionale
Il sistema JWT si accende in base a una sola condizione: `Security.Token.SecretKey` in `appsettings.json`.

- **Chiave vuota** -> `LoginEnabled = false`: nessun `AuthService` registrato, nessun middleware JWT, nessun overhead e nessun controller auth/protected esposto
- **Chiave valorizzata** -> `LoginEnabled = true`: `AuthService` singleton, middleware JWT attivo, rotte con `requiresAuth: true` protette da guard Angular

Se la chiave e' troppo corta per HMAC-SHA256, viene espansa tramite SHA-256. Il token frontend vive in `sessionStorage` (sopravvive al refresh, si cancella alla chiusura del tab).

### Frontend

Il frontend e' una SPA Angular 19 con tema dinamico, i18n, PWA e un sistema dichiarativo che genera rotte, navigazione e meta tag da un unico file di configurazione.

#### DSL dichiarativa e builder
Il sito si configura in `frontend/src/app/site.ts` attraverso una DSL a builder in tre fasi:

1. **Dichiarazione**: configurazione, pagine e navigazione con tipi `*Input` e campi opzionali
2. **Normalizzazione**: il builder deduce `kind` dalla struttura (`children` → parent, `component` → leaf, `externalUrl` → external), valida la coerenza e costruisce la mappa `PageType → path`
3. **Generazione**: produce rotte Angular, `NavLink[]` per header/footer (con flag `isExternal` su ogni link), `getPath(PageType)` e `getSitemapEntries()`

Il risultato (`ContestoSito`) viene consumato da router, navbar, footer e script di build.

`getSitemapEntries()` restituisce `SitemapEntry[]` — oggetti `{ path, description? }` — invece di semplici stringhe. Le pagine con `requiresAuth: true` vengono escluse automaticamente. Il campo `description` rispecchia quanto dichiarato in `site.ts` (chiave i18n o stringa letterale) ed è disponibile per script che ne abbiano bisogno, come la generazione di sitemap estesa o feed.

Ogni `NavLink` porta un flag `isExternal: boolean` impostato a compile-time dal builder. Navbar e footer lo usano direttamente senza dover rilevare al runtime se un path è esterno tramite heuristica sulle stringhe.

#### Enum PageType
Ogni pagina ha un valore nell'enum `PageType`. L'enum e' l'identita' stabile: path, titoli e componenti possono cambiare, il `PageType` no.

```typescript
export enum PageType {
    Home, 
    PrivacyPolicy,
    CookiePolicy,
    TermsOfService,
    LegalNotice,
     ...
    Impostazioni
}
```

Rinomini un path → cambi una riga in `setSitePages`, menu e link interni seguono. Rimuovi un valore → TypeScript segnala ogni riferimento rimasto.

#### Navigazione header e footer
Si definisce in `site.ts` tramite builder type-safe:

```typescript
configureSiteNavigation(nav => {
    nav.configureHeaderNavigation(header => {
        header.addPage(PageType.Impostazioni);
        header.addGroup('policies', group => {
            group.addPage(PageType.PrivacyPolicy);
            group.addPage(PageType.CookiePolicy);
        });
        header.addPage(PageType.Social);
    });
    nav.configureFooterNavigation(footer => {
        footer.addPage(PageType.GitHub);
        footer.addGroup('policies', group => { /* ... */ });
    });
});
```

Pagine disabilitate escluse in automatico. Gruppi svuotati rimossi. I path non si scrivono mai a mano.

#### Gestione del tema
Un colore hex in `site.ts` (`colorTema: '#131e24'`). Il `ThemeService` calcola:

- **Contrasto testo** WCAG 2.1 (nero o bianco per luminanza relativa)
- **Tono globale** `light`/`dark` propagato a Bootstrap 5 (`data-bs-theme`)
- **Colore primario** derivato (tema + nero al 40%)
- **CSS variable** `--colorTema` su `:root`
- **Meta tag** `theme-color` per browser mobile

Tutto reattivo via Angular signals.

#### Sistema di traduzione addon
Due file per lingua: `basic.{lang}.json` (template) e `addon.{lang}.json` (progetto). Caricati in parallelo, fusi con `Object.assign` — l'addon vince. Supporta placeholder posizionali: `t('saluto', 'Mario')` → `"Ciao Mario"`.

I loader per ciascuna lingua sono registrati in `frontend/src/app/core/i18n/translation-catalogs.ts` come import statici. Questo garantisce che i file JSON vengano inclusi nel bundle a compile time, rendendo le traduzioni disponibili anche durante l'eventuale build prerender SSR senza richieste HTTP aggiuntive.

La lingua si persiste in cookie (solo con consenso GDPR), si ripristina al reload e si propaga al backend tramite `Accept-Language`.

#### PageBaseComponent
Ogni componente-pagina estende `PageBaseComponent`, che inietta una sola volta:

| Servizio | Accesso |
|---|---|
| `TranslateService` | `this.translate.t('chiave')` |
| `ApiService` | `this.api.get(...)` |
| `AssetService` | `this.asset.getUrl(...)` |
| `NotificationService` | `this.notify.error(...)` |

Il componente estende la base e implementa il template, senza ripetere `inject()`.

I meta tag route-based non vivono nei componenti pagina: vengono sincronizzati centralmente dal layout leggendo `title` e `pageDescription` dalla route attiva. Questo evita boilerplate nei componenti e non richiede chiamate a `super.ngOnInit()`.

#### Pannello e layout
Il pannello centrale si mostra di default (`showPanel: true`). Per lo schermo intero basta `showPanel: false` nella definizione della pagina:

```typescript
{ path: 'social-feed', component: SocialComponent, showPanel: false }
```

Il valore arriva al layout tramite `route.data` e viene letto dall'`AppComponent` con un signal reattivo.

#### Pagine di errore
`buildErrorRoutes()` prende un array di codici HTTP (`400`, `401`, `403`, `404`, `500`, `503`) e genera tutte le rotte con `.map()`. I messaggi si traducono via i18n (chiavi `errore404Info`, `errore404Desc`) con fallback generico. Il wildcard `**` cattura qualsiasi URL non riconosciuto.

#### Interceptor HTTP
Ogni richiesta verso il backend riceve automaticamente `X-Api-Key`, `Accept-Language` nella lingua corrente e `Authorization: Bearer` se c'e' un token attivo. L'interceptor filtra solo le chiamate al backend, lasciando intatte richieste verso asset o servizi esterni.

#### Consenso cookie
`CookieConsentService` rileva se il consenso e' necessario (es. piu' lingue → preferenza da persistere). Se l'utente non ha accettato, le scritture su cookie vengono bloccate in silenzio. Lettura e cancellazione restano sempre consentite.

#### Build e script
`npm run build` lancia in automatico `generate:statics` (meta tag + sitemap in un unico script) prima della compilazione Angular. Gli script leggono da `ContestoSito`: nome app, descrizione, colore tema, lingue e path delle pagine. Le icone PWA si rigenerano da `favicon.png` in tutte le dimensioni necessarie. Per una `sitemap.xml` corretta in produzione, impostare `SITEMAP_BASE_URL` con l'URL pubblico del sito; se manca, la build usa `https://example.com` e stampa un warning.

#### Docker
Il template Docker e' progettato per essere riusabile: piu' progetti derivati possono girare sulla stessa VPS, ciascuno su una porta dedicata configurata via `.env`. Per derivare un nuovo progetto dal template si usa `./init-project.sh nome-progetto`, che rinomina i riferimenti interni principali e prepara la configurazione iniziale. Non si usano `container_name` fissi ne' porte hardcoded. I volumi dati sono isolati per progetto tramite `PROJECT_NAME`. Il frontend gira su Node SSR: `docker-entrypoint.sh` sostituisce `API_URL` e `API_KEY` a runtime nei bundle JavaScript, poi avvia `dist/.../server/server.mjs`. Quando `API_URL` e' vuoto, lo stesso server Node proxya `/api/*` verso il backend interno. Asset hashati cachati un anno con `immutable`; service worker e manifest non vengono cachati.

#### Asset mapping
`AssetService` carica `mapping.json` una volta, lo mette in cache con `shareReplay`, e risolve ID in path reali o URL esterni.

#### Context menu
La directive `[appContextMenu]` aggiunge un menu contestuale personalizzato a qualsiasi elemento:

- **Desktop**: click destro, presentazione a popover posizionato al puntatore
- **Mobile**: long-press (450ms) con soglia di movimento (12px) per distinguere dallo scroll, presentazione a sheet dal basso
- **Chiusura**: click fuori, Escape, o apertura di un altro menu
- **Cleanup**: listener e subscription rimossi automaticamente; la subscription alla selezione si completa con `take(1)` dopo la prima scelta

Uso: `<div [appContextMenu]="menuOptions">...</div>`

#### Social link
`SocialLinkComponent` mappa 35+ piattaforme social con icona Font Awesome e colore brand esatto. Passi il nome del social (`type`) e l'URL (`value`), il componente risolve automaticamente icona e colore. Piattaforme non riconosciute ricevono un'icona link generica come fallback.

Piattaforme incluse: Facebook, Instagram, Twitter/X, LinkedIn, TikTok, YouTube, Twitch, Spotify, Telegram, WhatsApp, Discord, Reddit, GitHub, Mastodon, Pinterest, Snapchat, Dribbble, Vimeo, SoundCloud, e altre.

#### Markdown e protezione XSS
`MarkdownPipe` converte Markdown in HTML usando `marked` con GitHub Flavored Markdown (tabelle, checklist, a capo automatici). La protezione XSS e' integrata nel renderer: `renderer.html = () => ''` ignora completamente qualsiasi tag HTML raw nel sorgente. Utilizzabile nei template (`{{ testo | markdown }}`) e da codice (`MarkdownPipe.render(testo)`).

#### Pagine legali
Un singolo componente (`PolicyComponent`) gestisce tutte le pagine legali: privacy, cookie policy, termini di servizio e note legali. Il contenuto viene caricato da file Markdown in `/assets/legal/{tipo}.{lang}.md` con fallback all'italiano. Il `PageType` della route determina quale file caricare.

Questo separa i contenuti legali dal codice applicativo: i testi restano revisionabili come semplici file Markdown.

#### Titoli pagina
`AppTitleStrategy` è l'unica sorgente per titolo e meta tag: traduce la chiave `title` della route, compone il titolo browser nel formato `"Pagina | NomeApp"` e delega a `PageMetaService` l'aggiornamento dei tag. `PageMetaService` è un setter puro: riceve titolo e descrizione già pronti e aggiorna in un'unica chiamata `description`, `og:title`, `og:description` e `twitter:description` — nessuna logica, solo applicazione. La `description` viene letta da `route.data` tramite la chiave `pageDescription` se dichiarata in `site.ts`, altrimenti cade sul valore globale `ContestoSito.config.description`. Quando cambia lingua senza navigazione, `AppComponent` chiama `refresh()` sulla strategy per riallineare titolo e meta tag senza ricaricare la pagina.

La strategy è registrata due volte nel DI: come `TitleStrategy` (richiesto da Angular per agganciarsi al router) e come `AppTitleStrategy` tramite `useExisting`, così chi ne ha bisogno può iniettarla direttamente senza cast.

#### SSR e Prerender
Il motore include anche il wiring base per Angular SSR. Se non ti serve, puoi ignorarlo: il default pratico resta `client`. Ogni `LeafPage` in `site.ts` puo' opzionalmente specificare un campo `renderMode`:

```typescript
{ path: 'home', component: ..., renderMode: 'prerender' }  // HTML statico a build time
{ path: 'profilo', component: ..., renderMode: 'server' }  // renderizzato a runtime lato server
{ path: 'dashboard', component: ..., renderMode: 'client' } // default, solo browser
```

Le rotte non dichiarate esplicitamente restano `client`. In un progetto derivato, `server` o `prerender` vanno usati solo per pagine compatibili con quel modello di esecuzione.

#### Sistema CSS con color-mix()
Il `ThemeService` imposta una sola variabile CSS (`--colorTema`). Tutto il resto viene derivato dal browser via `color-mix()`:

```css
--colorBase:          color-mix(in srgb, var(--colorTema), white 20%);
--colorPrimary:       color-mix(in srgb, var(--colorTema), black 40%);
--colorSurface:       color-mix(in srgb, var(--colorTema), white 24%);
--colorSurfaceHover:  color-mix(in srgb, var(--colorTema), white 30%);
--colorSurfaceBorder: color-mix(in srgb, var(--colorTema), white 38%);
--colorSurfaceText:   color-mix(in srgb, white 94%, var(--colorTema) 6%);
```

Il pannello contenuti si adatta automaticamente: su temi scuri usa superficie chiara con testo scuro, su temi chiari l'opposto. Varianti forzabili con `.panel-light` e `.panel-dark`.

#### Condivisione e clipboard
`ShareService` unifica tre API del browser in un'unica interfaccia:

- **Clipboard API**: copia testo con notifica di conferma/errore
- **Web Share API**: condivisione nativa di testo, file e canvas (se supportata dal browser)
- **Download**: fallback automatico quando Web Share non e' disponibile

Supporta anche la condivisione di canvas come immagini PNG tramite `shareCanvas()`.

#### Generazione immagini su canvas
`ImgBuilder` genera immagini dinamiche su canvas con:

- Word-wrap intelligente via `measureText()` (spezza per parola, poi per carattere se necessario)
- Centratura verticale automatica del testo
- Altezza minima proporzionale alla larghezza (aspect ratio 4:3)
- Font web-safe selezionabili (Arial, Georgia, Courier New, Verdana, Times)

Utile per banner, placeholder e immagini di condivisione social generate al volo.

#### Accessibilita'
L'engine include supporto WCAG integrato nel CSS base:

- **Skip-link** (WCAG 2.4.1): link "salta al contenuto" visibile solo su focus, per navigazione da tastiera
- **`prefers-reduced-motion`** (WCAG 2.3.3): animazioni shake e zoom disabilitate per chi ha la preferenza attiva
- **`safe-area-inset`**: navbar e footer si adattano ai dispositivi con notch (iPhone X+)
- **Contrasto AA**: `text-body-secondary` forzato a `#595f66` per garantire rapporto di contrasto sufficiente

### Servizi e componenti inclusi

Riepilogo di tutti i servizi, componenti e dati disponibili out-of-the-box. Utile come riferimento rapido quando cerchi cosa c'e' gia' prima di scrivere qualcosa di nuovo.

**Backend** (`Program.cs`):
| Servizio | Lifetime | Ruolo |
|---|---|---|
| `FileContentStore` | Singleton | Legge contenuti da `backend/data/*.json` |
| `SiteService` | Scoped | Filtro social, profilo localizzato |
| `AuthService` | Singleton (condizionale) | Generazione e validazione JWT |

**Frontend** (tutti `providedIn: 'root'`):
| Servizio | Ruolo |
|---|---|
| `ThemeService` | Tema dinamico da colore iniziale; tutta la logica colore è esposta come metodi statici (`prefersDarkText`, `getReadableTextColor`, `mixHexColors`) |
| `TranslateService` | i18n con sistema addon |
| `AuthService` | Login, token in sessionStorage, interceptor Bearer |
| `ApiService` | HTTP client con API key e Accept-Language |
| `AssetService` | Risoluzione URL asset statici da mapping |
| `ShareService` | Clipboard, Web Share API e download con fallback |
| `CookieConsentService` | Gestione consenso cookie GDPR |
| `NotificationService` | Toast, errori e parsing ProblemDetails RFC 9457; SweetAlert2 caricato in lazy loading al primo utilizzo |
| `AppTitleStrategy` | Titoli pagina tradotti nel formato `Pagina \| NomeApp` |

**Componenti e directive riusabili**:
| Componente/Directive | Ruolo |
|---|---|
| `SocialLinkComponent` | 35+ social con icona e colore brand |
| `ContextMenuDirective` | Menu contestuale desktop (click destro) e mobile (long-press) |
| `CookieBannerComponent` | Banner GDPR con testo Markdown e placeholder dinamici |
| `BackToTopComponent` | Pulsante scroll-to-top con soglia; colori derivati automaticamente dal tema |
| `SmokeEffectComponent` | Effetto particellare su canvas configurabile da `site.ts` |
| `MarkdownPipe` | Markdown → HTML con protezione XSS integrata |

**Dati demo** (`backend/data/`):
- `social.json`: 32 social network preconfigurati
- `irl.json`: profilo aziendale con campi localizzati it/en (ragione sociale, P.IVA, sede legale, contatti, dati societari)

---

## Configurazione

L'engine si configura in tre posti: file di contenuto (testi, traduzioni, pagine legali), `appsettings.json` (backend) e `.env` (Docker). Nessuno dei tre richiede di modificare il codice applicativo.

### Contenuti gestiti da file
La maggior parte dei contenuti testuali e' gestita tramite file, aggiornabili senza toccare i componenti:

- `backend/data/irl.json`: dati legali del sito
- `frontend/src/assets/i18n/`: traduzioni del progetto (`addon.*.json`)
- `frontend/src/assets/legal/`: privacy, cookie policy, termini di servizio e note legali
- `frontend/src/assets/file/` e `frontend/src/assets/mapping.json`: file statici e mapping asset

### Backend (`appsettings.json`)
| Chiave | Effetto |
|---|---|
| `Security.ApiKeys` | chiavi API accettate |
| `Security.CorsOrigins` | origini consentite; vuoto = aperto |
| `Security.BehindProxy` | abilita `ForwardedHeaders` dietro reverse proxy |
| `Security.Token.SecretKey` | vuoto = login e JWT disabilitati |
| `Security.Token.ExpirationSeconds` | durata del token |
| `Security.Headers` | header di sicurezza aggiunti alle risposte |

### Variabili Docker (`.env`)
| Variabile | Obbligatoria | Effetto |
|---|---|---|
| `PROJECT_NAME` | si | Identifica il progetto, usato per i nomi dei volumi |
| `FRONTEND_PORT` | si | Porta del frontend in produzione, uguale lato host e container |
| `BACKEND_PORT` | si | Porta del backend nella rete Docker; se esposto resta uguale anche lato host |
| `API_URL` | no | Vuota = proxy Node SSR su `/api`; valorizzata = backend remoto |
| `SITEMAP_BASE_URL` | no | URL pubblico canonico del sito, usato in build per generare `sitemap.xml` |
| `API_KEY` | no | API key iniettata a runtime nel frontend (default: `frontend`) |

Se stai creando un progetto derivato, esegui prima `./init-project.sh nome-progetto`: lo script aggiorna i riferimenti del template e crea `.env` a partire da `.env.example` con `PROJECT_NAME` gia' valorizzato. Per la lista completa vedi `.env.example`. Se frontend e backend girano su host separati, allineare anche `Security__CorsOrigins__*` sul backend.

### Script di utilita'
- `npm run generate:statics`: genera meta tag e sitemap in un unico passaggio
- `npm run generate:icons`: rigenera le icone PWA da `favicon.png`
- `npm run build`: build production + meta + sitemap in automatico

---

## Operazioni Comuni

Le operazioni piu' frequenti che farai lavorando con l'engine. Ogni ricetta e' pensata per essere seguita passo-passo.

### Inizializzare un progetto derivato
Br1WebEngine funziona direttamente cosi' com'e': puoi clonare, configurare `.env` e avviare senza toccare nient'altro. Se vuoi invece partire con un nome di progetto personalizzato fin dall'inizio, esegui una sola volta:

```bash
./init-project.sh mio-progetto
```

Lo script sostituisce i riferimenti interni al template (`br1-web-engine`, `Br1WebEngine`) nei file principali frontend/backend, rinomina il file `.sln` e genera `.env` con `PROJECT_NAME` coerente. E' un'operazione opzionale: se preferisci mantenere i nomi originali o rinominarli a mano in un secondo momento, puoi farlo.

### Aggiungere una pagina
1. Aggiungi un valore a `PageType` in `frontend/src/app/site.ts`.
2. Crea il componente sotto `frontend/src/app/pages/` estendendo `PageBaseComponent`.
3. Registra la pagina in `setSitePages(...)` con path, titolo e componente.
4. (Opzionale) Aggiungi `description: 'chiaveI18n'` per personalizzare i meta tag social della pagina.
5. Aggiungila alla navigazione con `addPage(PageType.X)` se serve.
6. Inserisci le chiavi i18n in `addon.it.json` e `addon.en.json`.

### Aggiungere un endpoint API
1. Scegli il controller giusto: `BaseController`, `AuthController` o `ProtectedController`. Quelli auth/protected vengono esposti solo quando il login JWT e' abilitato.
2. Crea la logica in `backend/Services/` o in un servizio dedicato.
3. Se serve, estendi `FileContentStore` tramite `backend/Store/IContentStore.cs`.
4. Esponi la chiamata lato frontend in `frontend/src/app/core/services/api.service.ts`.


### Abilitare il login
1. Imposta `Security.Token.SecretKey` in `appsettings.json` o via env var.
2. Implementa la validazione credenziali in `backend/Controllers/AuthController.cs`.
3. Emetti il token tramite `Auth.GenerateToken()`.

---

## Da locale a produzione

Checklist per portare il progetto da locale a una VPS o un altro server. Segui i passi nell'ordine indicato.

1. **Prepara la macchina**
   - Installa Docker Engine + plugin Docker Compose.
   - Apri in firewall solo le porte necessarie (di solito `80/443`; evita di esporre il backend se non serve).
   - Crea una cartella di deploy, ad esempio `/opt/br1webengine`.

2. **Copia i file essenziali sul server**
   - `docker-compose.yml`
   - `docker-compose.backend-exposed.yml` (solo se vuoi pubblicare anche la porta backend)
   - `.env` (obbligatorio, puoi partire da `.env.example`)
   - eventuali override (`docker-compose.override.yml`) se vuoi differenziare ambiente dev/prod

3. **Configura `.env` per l'ambiente remoto**
   - `PROJECT_NAME`: nome stack/volumi (es. `miosito`).
   - `FRONTEND_PORT`: porta del frontend. Il template usa lo stesso valore sia dentro al container sia sull'host.
   - `BACKEND_PORT`: porta del backend nella rete Docker. Se vuoi esporlo anche fuori, verra' pubblicata la stessa porta.
   - `API_URL`: lascia vuota se frontend e backend stanno nello stesso compose (Node SSR usa il proxy interno `/api`); valorizzala solo se punti a backend esterno.
   - `SITEMAP_BASE_URL`: URL pubblico canonico del sito; viene letto in fase di build per generare `sitemap.xml`.
   - `API_KEY`: chiave usata dal frontend per chiamare le API.
   - Se usi backend separato o domini diversi, ricorda di allineare anche le CORS nel backend (`Security__CorsOrigins__*`).

4. **Scegli come esporre i servizi**
   - **Scenario consigliato**: esponi solo il frontend e lascia il backend interno alla rete Docker.
   - **Scenario con client alternativi**: aggiungi `-f docker-compose.backend-exposed.yml` se il progetto ha UI non web (app mobile, desktop, client terzi) che devono raggiungere il backend direttamente.

5. **Avvia e verifica**
   ```bash
   docker compose --env-file .env up -d --build
   docker compose ps
   docker compose logs -f frontend
   docker compose logs -f backend
   ```
   Verifica poi: homepage raggiungibile, chiamate `/api/*` funzionanti, health check backend OK.

6. **Aggiornamenti futuri (deploy successivi)**
   - Aggiorna codice/immagini.
   - Riesegui `docker compose --env-file .env up -d --build`.
   - Se hai cambiato solo env/runtime e non il codice, basta `docker compose --env-file .env up -d`.

7. **Hardening minimo produzione**
   - Metti HTTPS davanti (Nginx/Caddy/Traefik o proxy del provider).
   - Usa API key e secret JWT robusti, non quelli di esempio.
   - Tieni backup di `.env` e dei volumi nominati.
   - Imposta una policy di restart (`unless-stopped`/`always`) e monitora i log.

Se vuoi, puoi tenere `DOCKER_README.md` come riferimento operativo dettagliato e lasciare questa sezione nel README come guida rapida da "locale" a "server".

---

## Estendere l'Engine

L'engine e' progettato per essere esteso senza modificare il codice base. Le operazioni piu' comuni sono: sostituire lo storage, aggiungere controller protetti, supportare nuove lingue e cambiare tema.

### Sostituire il content store
Crea una classe che implementa `IContentStore` e registrala in `Program.cs`:
```csharp
builder.Services.AddSingleton<IContentStore, MyDatabaseStore>();
```
Controller e servizi continuano a funzionare senza modifiche.

### Aggiungere un controller protetto
Estendi `EngineProtectedController`: erediti `[Authorize(Policy = RequireLoginPolicy)]` e `ILogger` senza configurare nulla.
```csharp
[Route("api/admin")]
public class AdminController : EngineProtectedController
{
    public AdminController(ILogger<AdminController> logger) : base(logger) { }

    [HttpGet("dashboard")]
    public IActionResult Dashboard() => Ok(new { status = "ok" });
}
```

### Aggiungere una lingua
1. Aggiungi il codice in `availableLanguages` dentro `site.ts`.
2. Crea `basic.{lang}.json` e `addon.{lang}.json` in `frontend/src/assets/i18n/`.
3. Registra il loader della nuova lingua in `frontend/src/app/core/i18n/translation-catalogs.ts`, seguendo il pattern delle lingue esistenti.
4. Aggiungi la `CultureInfo` corrispondente in `Program.cs` nell'array `supported`.
5. Se i contenuti JSON in `backend/data/` hanno campi localizzati, aggiungi il ramo della nuova lingua.

### Cambiare il tema
Modifica `colorTema` in `site.ts`. Il `ThemeService` ricalcola automaticamente contrasto, tono, colore primario e variabili CSS.

## Licenza
Questo progetto e' rilasciato sotto licenza MIT. Vedi [`LICENSE`](LICENSE).
