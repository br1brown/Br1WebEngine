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
- [Da locale a produzione](#da-locale-a-produzione)
- [Guide allo sviluppo](#guide-allo-sviluppo)
- [Licenza](#licenza)

---

## Guida Rapida

```bash
# 1. Clona il repository
git clone https://github.com/br1brown/Br1WebEngine.git
cd Br1WebEngine

# 2. (Opzionale) Personalizza il nome del progetto
#    Lo script crea .env a partire da .env.example con COMPOSE_PROJECT_NAME già valorizzato.
./init-project.sh mio-progetto

# 3. Configura variabili d'ambiente e segreti backend
cp .env.example .env  # se non hai eseguito init-project.sh
# Modifica .env: COMPOSE_PROJECT_NAME, FRONTEND_PORT, SITEMAP_BASE_URL
# Modifica backend/appsettings.json: Token.SecretKey, ApiKeys, CorsOrigins, BehindProxy

# 4. Deploy in produzione
./deploy.sh
```

Lo script controlla la configurazione e avvia i container. Il frontend sara' disponibile sulla porta configurata in `FRONTEND_PORT`. Per lo sviluppo locale senza Docker, consulta la sezione [Configurazione](#configurazione).

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
- [`ApiService`](#apiservice) aggiunge `X-Api-Key`, `Accept-Language` e `Bearer` a ogni chiamata backend: essendo l'unico punto di accesso al backend, non serve un interceptor globale

### Componenti Riusabili

- Un [context menu](#context-menu) con directive: click destro su desktop, long-press su mobile, posizionamento automatico e chiusura con Escape
- 35+ [social con icona e colore brand](#social-link) mappati in un componente: passi il nome, esce l'icona giusta col colore giusto
- Un [servizio di condivisione](#condivisione-e-clipboard) unifica Clipboard API, Web Share API e download in un'unica interfaccia con fallback automatico
- L'[image builder](#generazione-immagini-su-canvas) genera immagini su canvas con word-wrap calcolato via `measureText()`; i colori di default seguono automaticamente il tema attivo con contrasto WCAG garantito, pronte per social sharing
- Il [generatore QR code](#generatore-qr-code) produce blob PNG e SVG per cinque formati (testo/URL, WhatsApp, email, Wi-Fi, SEPA); SSR-safe, con caching payload+colori e colori automatici dal tema
- `<app-loading>` e' un [wrapper di caricamento](#componente-loading) riusabile: mostra uno spinner Bootstrap quando `loading = true`, proietta il contenuto via `<ng-content>` quando e' `false`
- Gli [asset](#ottimizzazione-immagini) si risolvono da un `mapping.json` piatto: immagini raster vengono ottimizzate con Sharp, gli altri file serviti direttamente — tutto accessibile tramite ID, senza esporre il filesystem
- [`AssetService.getUrlFromBlob()`](#ottimizzazione-immagini-e-asset) crea URL da Blob (API esterne o canvas) con tracking automatico e rilascio memoria al cambio pagina
- Il [controllo versione](#controllo-versione-e-aggiornamenti) rileva automaticamente se è disponibile una nuova versione dell'app e propone all'utente di ricaricare la pagina

### Build e Deploy

- [`npm run build`](#build-e-script) lancia meta tag, sitemap e icone PWA in automatico via `prebuild`
- [Docker](#docker) esegue proxy, sostituzione env a runtime e caching hashato senza configurare nulla
- Le [immagini degli asset](#ottimizzazione-immagini) vengono ottimizzate on-demand dal server Node: resize, WebP e cache automatici, senza configurazione

## Tech Stack
| Categoria | Tecnologia | Note |
|---|---|---|
| Backend | ASP.NET Core 9, C# | REST API, API key, JWT opzionale, ProblemDetails |
| Frontend | Angular 19, TypeScript, Bootstrap 5 | SPA/PWA, prerender, i18n, tema dinamico |
| Container | Docker, Docker Compose, Node SSR | template riusabile per multi-progetto, `.env`-driven |
| Tooling | Node 22+, npm 10+, Sharp | script meta, sitemap, icone e ottimizzazione immagini |

## Architettura del Progetto

```
┌──────────────────────────────────────────────────────┐
│  Frontend — Node SSR (Angular 19 + Express)          │
│  porta 80                                            │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Angular SSR  │  │/api/* proxy│  │/cdn-cgi/asset│  │
│  │  (pagine)    │  │ → backend  │  │ Sharp + cache│  │
│  └──────────────┘  └────────────┘  └──────────────┘  │
└───────────────────────────┬──────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────┐
│  Backend (ASP.NET Core 9)                    │
│  porta 8080                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Base API │ │ Auth API │ │ Protected API│  │
│  │(api key) │ │(transito)│ │  (riservato) │  │
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
| `GET` | `/api/blob/{slug}` | API key | file dal volume `/app/uploads`; path traversal bloccato; Content-Type rilevato automaticamente |
| `POST` | `/api/auth/login` | API key | placeholder; body JSON `{ "pwd": "..." }`; esposto solo quando il login JWT e' abilitato |
| `GET` | `/health` | nessuna | health check |

Le API protette stanno in `backend/Controllers/ProtectedController.cs` e diventano realmente utilizzabili solo quando configuri il JWT.

#### Controller e ereditarieta'

Tre controller astratti dell'engine abilitano automaticamente attributi di sicurezza e dipendenze condivise:

| Controller astratto | Attributi ereditati | Cosa fornisce |
|---|---|---|
| `EngineApiController` | `[ApiController]`, `[Authorize]` | `ILogger` condiviso; radice comune di tutti i controller engine |
| `EngineAuthController` | `[ApiController]`, `[Authorize]` | `AuthService` per la generazione del token JWT; la validazione è gestita dal middleware JWT Bearer |
| `EngineProtectedController` | `[ApiController]`, `[Authorize(Policy = RequireLoginPolicy)]` | `ILogger` condiviso, richiede API key + JWT con ruolo `Authenticated` |

Il controller concreto estende la base giusta e aggiunge solo routing (`[Route]`) e logica endpoint. Non deve ripetere `[Authorize]` ne' il wiring delle dipendenze. I controller che ereditano da `EngineAuthController` o `EngineProtectedController` vengono esposti solo quando il login JWT e' attivo. `BlobController` — che eredita da `EngineApiController` — è un esempio di controller concreto già incluso nel template.

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

Se la chiave e' troppo corta per HMAC-SHA256 (meno di 32 caratteri), il server lancia un'eccezione all'avvio. Il token frontend vive in `sessionStorage` (sopravvive al refresh, si cancella alla chiusura del tab).

### Frontend

Il frontend e' una SPA Angular 19 con tema dinamico, i18n, PWA e un sistema dichiarativo che genera rotte, navigazione e meta tag da un unico file di configurazione.

#### DSL dichiarativa e builder
Il sito si configura interamente in `frontend/src/app/site.ts` con quattro chiamate sul builder:

```typescript
siteFondamentaBuilder.setSiteConfiguration({ appName, colorTema, defaultLang, ... }); // vedi campi sotto
siteFondamentaBuilder.defineSitePages([ /* array di pagine */ ]);
siteFondamentaBuilder.configureHeaderNavigation(h => { h.addPage(...); h.addGroup(...); });
siteFondamentaBuilder.configureFooterNavigation(f => { f.addPage(...); });
```

Internamente `buildSite` lavora in tre fasi:

1. **Dichiarazione**: configurazione, pagine e navigazione con tipi `*Input` e campi opzionali
2. **Normalizzazione**: il builder deduce `kind` dalla struttura (`children` → parent, `component` → leaf, `externalUrl` → external), valida la coerenza e costruisce la mappa `PageType → path`. Ogni `PageType` deve essere unico — un duplicato (su pagine interne o esterne) lancia un errore a build time con il nome del tipo coinvolto
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

Rinomini un path → cambi una riga in `defineSitePages`, menu e link interni seguono. Rimuovi un valore → TypeScript segnala ogni riferimento rimasto.

`ContestoSito.getPath(PageType.X)` restituisce il path di una pagina per costruire link interni nel codice. Restituisce `null` se la pagina è disabilitata (`enabled: false`) o se il `PageType` non è registrato — in questo modo `null` non finisce mai silenziosamente in un `href` o in una stringa di navigazione. Usa sempre il fallback: `ContestoSito.getPath(PageType.X) ?? '/'`.

Le pagine accettano un campo opzionale `data: Record<string, any>` per passare dati arbitrari al componente tramite `route.data`. Il componente li legge con `ActivatedRoute` o tramite component input binding (abilitato di default nell'engine).

#### Navigazione header e footer
Si definisce in `site.ts` tramite builder type-safe:

```typescript
siteFondamentaBuilder.configureHeaderNavigation(h => {
    h.addPage(PageType.Impostazioni);
    h.addGroup('policies', g => {
        g.addPage(PageType.PrivacyPolicy);
        g.addPage(PageType.CookiePolicy);
    });
    h.addPage(PageType.Social);
});

siteFondamentaBuilder.configureFooterNavigation(f => {
    f.addPage(PageType.GitHub);
    f.addGroup('policies', g => { /* ... */ });
});
```

Tre metodi disponibili nei builder di navigazione:
- `addPage(PageType.X)` — voce che risolve automaticamente il path dalla mappa interna
- `addGroup('chiaveI18n', g => { ... })` — dropdown con sotto-voci; se tutti i figli sono disabilitati, il gruppo sparisce
- `addLink('chiaveI18n', '/path-o-url')` — link diretto a URL arbitrario; utile per link esterni non mappati su `PageType`

Pagine disabilitate escluse in automatico. I path non si scrivono mai a mano (tranne in `addLink`).

#### Opzioni di setSiteConfiguration
Tutti i campi di `SiteConfigInput`:

| Campo | Obbligatorio | Effetto |
|---|---|---|
| `appName` | si | Nome mostrato in navbar, titoli pagina e PWA manifest |
| `version` | no | Versione dell'app (es. `"1.2.0"`); iniettata nel meta tag `app-version` e nel manifest, letta da `VersionCheckService` per rilevare aggiornamenti (default: `"1.0.0"`) |
| `defaultLang` | si | Lingua di fallback quando la preferenza non è disponibile |
| `description` | si | Meta description globale del sito (usata come fallback per le pagine senza `description` propria) |
| `colorTema` | si | Colore hex principale; genera automaticamente contrasto, tono e variabili CSS |
| `availableLanguages` | no | Lingue tra cui l'utente può scegliere; se omesso, solo `defaultLang` |
| `showFooter` | no | Mostra/nasconde il footer (default: `true`) |
| `showHeader` | no | Mostra/nasconde la navbar (default: `true`; utile per landing page a schermo intero) |
| `fixedTopHeader` | no | Navbar appiccicata in cima allo scroll (default: `false`) |
| `smoke` | no | Effetto particellare su canvas; ometti il campo per disabilitarlo. Campi: `enable`, `color`, `opacity`, `maximumVelocity`, `particleRadius`, `density` — tutti opzionali, il builder completa i default |

#### Gestione del tema
Un colore hex in `site.ts` (`colorTema: '#131e24'`). Il `ThemeService` calcola:

- **Contrasto testo** WCAG 2.1 (nero o bianco per luminanza relativa)
- **Tono globale** `light`/`dark` propagato a Bootstrap 5 (`data-bs-theme`)
- **Colore primario** derivato (tema + nero al 40%)
- **CSS variable** `--colorTema` su `:root`
- **Meta tag** `theme-color` per browser mobile

Tutto reattivo via Angular signals. `ImgBuilderService` e `QrCodeService` leggono `colorPrimary()` e `colorPrimaryText()` come default colori, garantendo coerenza visiva e contrasto WCAG senza configurazione aggiuntiva.

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
`buildErrorRoutes()` genera una singola rotta parametrica `error/:errorCode` che accetta qualsiasi codice HTTP. I messaggi si traducono via i18n (chiavi `errore{codice}Info`, `errore{codice}Desc`) con fallback generico se la chiave non esiste. Il wildcard `**` reindirizza a `error/404`.

#### ApiService e BaseApiService
`ApiService` è l'unico punto di accesso al backend. Estende `BaseApiService`, una classe astratta che raccoglie tutta l'infrastruttura HTTP condivisa: costruzione degli header (`X-Api-Key`, `Accept-Language`, `Bearer`), metodi protetti `api_get<T>()` e `api_post<T>()`, health check e gestione errori centralizzata. `ApiService` aggiunge solo i metodi pubblici degli endpoint concreti.

Il prefisso `/api` è definito come costante privata del modulo (`apiBase`) e deve corrispondere all'attributo `[Route("api")]` del `BaseController` backend. Ogni endpoint è dichiarato nell'oggetto `API` in cima al file: per aggiungere un endpoint basta aggiungere lì il path e creare il metodo pubblico corrispondente.

Metodi già inclusi: `getProfile()`, `getSocial()`, `login()`, `getBlob(slug)` (scarica un file dal volume uploads come `Blob`) e `exportDocument(md, format)` (converte Markdown in PDF o DOCX tramite Pandoc sul backend).

#### Consenso cookie
`CookieConsentService` rileva se il consenso e' necessario (es. piu' lingue → preferenza da persistere). Se l'utente non ha accettato, le scritture su cookie vengono bloccate in silenzio. Lettura e cancellazione restano sempre consentite.

#### Build e script
`npm run build` esegue in automatico `prebuild` prima della compilazione Angular, che comprende due step in sequenza: `generate:statics` (meta tag + sitemap) e `generate:icons` (icone PWA da `favicon.png` in tutte le dimensioni). Entrambi gli script leggono da `ContestoSito`: nome app, descrizione, colore tema, lingue e path delle pagine. Per una `sitemap.xml` corretta in produzione, impostare `SITEMAP_BASE_URL` con l'URL pubblico del sito; se manca, la build usa `https://example.com` e stampa un warning.

#### Docker
Il template Docker e' progettato per essere riusabile: piu' progetti derivati possono girare sulla stessa VPS, ciascuno su una porta dedicata configurata via `.env`. Non si usano `container_name` fissi ne' porte hardcoded. I volumi dati sono isolati per progetto tramite `PROJECT_NAME`.

**Iniezione runtime delle variabili d'ambiente nel frontend**

Angular compila il bundle JavaScript a build time, quindi non può leggere variabili d'ambiente del container a runtime. La soluzione adottata: `environment.ts` usa i segnaposto letterali `__API_URL__` e `__API_KEY__`. All'avvio del container, `docker-entrypoint.sh` esegue `sed` su tutti i file `.js` del bundle e sostituisce quei segnaposto con i valori reali letti dalle variabili d'ambiente del container. Il server SSR parte solo dopo la sostituzione.

Quando `API_URL` è vuota, il server Node SSR fa da proxy su `/api/*` verso il backend interno sulla rete Docker. Quando è valorizzata, il frontend chiama direttamente quel URL (utile se backend e frontend sono su server separati).

Asset con hash nel nome cachati un anno con `immutable`; asset non hashati (i18n, legal, mapping) con `no-cache` per garantire aggiornamenti immediati al deploy; service worker e manifest gestiti separatamente.

#### Ottimizzazione immagini e asset
Il server Node SSR espone un endpoint unico `/cdn-cgi/asset?id=X` che serve qualsiasi file registrato in `assets/mapping.json`. Il comportamento dipende dal tipo del file: le immagini raster (PNG, JPG, GIF, AVIF…) vengono ridimensionate e convertite in WebP tramite Sharp con cache su disco; gli altri file (PDF, SVG, testi…) vengono serviti direttamente con `Content-Type` rilevato automaticamente dall'estensione.

La directory `assets/files/` è bloccata dal middleware: i file non sono mai raggiungibili direttamente, solo tramite ID. Questo nasconde il filesystem reale al client.

La cache immagini è effimera — si azzera ad ogni deploy, così le immagini aggiornate vengono sempre rielaborate. Le icone PWA vivono in `public/icons/` (generate a build time, non tracciate da git).

`AssetService` gestisce tutto in modo trasparente: nei componenti si usa `this.asset.getUrl('hero', 1080)` e il resto avviene lato server.

Per Blob prodotti localmente (canvas, file scaricati da API esterne), `getUrlFromBlob(blob)` restituisce `{ rawUrl, angularUrl }`: il primo è usabile in JS puro, il secondo è già sanitizzato per i template Angular. Gli URL sono tracciati internamente e revocati automaticamente al cambio pagina tramite `NavigationEnd`; si possono liberare esplicitamente con `revokeAll()`.

Le larghezze disponibili e il mapping ID→file sono configurati in `app.config.ts` e `assets/mapping.json`.

#### Controllo versione e aggiornamenti
`VersionCheckService` rileva in modo non invasivo se è disponibile una nuova versione dell'app. All'avvio legge la versione corrente dal meta tag `<meta name="app-version">` (popolato da `site.ts` tramite il campo `version`); ogni 10 minuti fa un `fetch` di `/manifest.webmanifest?cache=no-store` e confronta il campo `version`. Se differisce, mostra una dialog di conferma che propone di ricaricare la pagina; se l'utente annulla, il dialogo non viene riproposto fino al prossimo rilevamento.

Il servizio è inizializzato da `AppComponent` alla partenza dell'app e non richiede configurazione aggiuntiva. Per attivarlo è sufficiente impostare `version` in `setSiteConfiguration`.

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
`AppTitleStrategy` è l'unica sorgente per titolo e meta tag: traduce la chiave `title` della route, compone il titolo browser nel formato `"Pagina | NomeApp"` e delega a `PageMetaService` l'aggiornamento dei tag. La `description` dichiarata in `site.ts` è una chiave i18n: viene tradotta prima di essere passata al servizio, così i crawler sociali ricevono testo leggibile e non la chiave tecnica. In assenza di descrizione specifica per la pagina, si usa `ContestoSito.config.description` come fallback.

`PageMetaService` è un setter puro che aggiorna in un'unica chiamata: `description`, `og:title`, `og:description`, `og:url`, `og:image`, `twitter:title`, `twitter:description`, `twitter:image` e il tag `<link rel="canonical">`. L'URL assoluto viene letto da `DOCUMENT.URL` (in SSR riflette l'URL della richiesta corrente): questo garantisce che i crawler leggano `og:url` e canonical già corretti nell'HTML servito da Node, senza attendere l'hydration client. L'immagine di default è l'icona PWA (`/icons/icon-512x512.png`); pagine con immagine specifica possono passare un `imgId` che viene risolto tramite `/cdn-cgi/asset`.

Quando cambia lingua senza navigazione, `AppComponent` chiama `refresh()` sulla strategy per riallineare titolo e meta tag senza ricaricare la pagina.

La strategy è registrata due volte nel DI: come `TitleStrategy` (richiesto da Angular per agganciarsi al router) e come `AppTitleStrategy` tramite `useExisting`, così chi ne ha bisogno può iniettarla direttamente senza cast.

#### SSR e Prerender
Il motore include anche il wiring base per Angular SSR. Se non ti serve, puoi ignorarlo: il default pratico resta `client`. Ogni `LeafPage` in `site.ts` puo' opzionalmente specificare un campo `renderMode`:

```typescript
{ path: 'home', component: ..., renderMode: 'prerender' }  // HTML statico a build time
{ path: 'profilo', component: ..., renderMode: 'server' }  // renderizzato a runtime lato server
{ path: 'dashboard', component: ..., renderMode: 'client' } // default, solo browser
```

Le rotte non dichiarate esplicitamente restano `client`. In un progetto derivato, `server` o `prerender` vanno usati solo per pagine compatibili con quel modello di esecuzione.

**Pagine `renderMode: 'server'` e caricamento dati**

Quando una pagina viene renderizzata lato server, i dati devono essere disponibili *prima* che il componente venga costruito — quindi non possono essere caricati nel costruttore né con `ngOnInit`. Il pattern corretto usa il `resolver` dichiarato direttamente in `site.ts`:

```typescript
// In site.ts, nella definizione della pagina:
{
    path: 'profilo',
    renderMode: 'server',
    component: () => import('./pages/profilo/profilo.component').then(m => m.ProfiloComponent),
    resolve: {
        profilo: () => inject(ApiService).getProfilo(),
    },
}
```

Il componente riceve i dati tramite un `input()` con lo stesso nome del resolver — Angular li inietta automaticamente grazie a `withComponentInputBinding()`:

```typescript
export class ProfiloComponent extends PageBaseComponent {
    readonly profilo = input<Profilo>();

    readonly nomeCompleto = computed(() => this.profilo()?.nome ?? '');
}
```

Due regole da seguire sempre con SSR:
- Usa `computed()` per derivare stato dai dati del resolver — **mai `effect()`**, che crea macrotask Zone.js e puo' bloccare la stabilizzazione SSR.
- Se una pagina ha `renderMode: 'server'` ma nessun `resolve`, `SiteBuilder` emette un avviso a console al caricamento dell'app (sia browser che Node). L'avviso e' innocuo se la pagina non ha bisogno di dati dal backend, ma e' utile come promemoria.

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
`renderToCanvas` e' la funzione pura che esegue il rendering. `ImgBuilderService` e' il wrapper Angular injectable:

- `render(canvas, opts)` — usa automaticamente `colorPrimary` (sfondo) e `colorPrimaryText` (testo) dal tema attivo; contrasto WCAG garantito da `ThemeService`
- `renderWithColors(canvas, opts, fg, bg)` — colori espliciti quando il componente offre un color picker o necessita di colori specifici

`opts` non include `bgColor`/`textColor`: chi usa il service non deve preoccuparsi dei colori. La funzione pura `renderToCanvas` rimane disponibile per chi ha gia' tutti i parametri.

Funzionalita' del renderer:

- Word-wrap intelligente via `measureText()` (spezza per parola, poi per carattere se necessario)
- Centratura verticale automatica del testo
- Altezza minima proporzionale alla larghezza (aspect ratio 4:3)
- Font web-safe selezionabili (Arial, Georgia, Courier New, Verdana, Times)

Utile per banner, placeholder e immagini di condivisione social generate al volo.

#### Generatore QR code
`QrCodeService` genera QR code in formato Blob PNG o stringa SVG. E' un generatore puro: non gestisce UI, errori visivi ne' download — il chiamante usa `ShareService` e `AssetService` secondo necessita'.

**Formati supportati**
| Tipo | Campi richiesti | Campi opzionali |
|---|---|---|
| `text` | `content` | — |
| `whatsapp` | `phone` | `text` |
| `email` | `to` | `subject`, `body` |
| `wifi` | `ssid` | `password`, `encryption` (`WPA`/`WEP`/`nopass`) |
| `sepa` | `iban`, `name`, `amount` | `remittance` |

**API**
- `create(config)` — Blob PNG con colori del tema attivo (`colorPrimary` sfondo, `colorPrimaryText` moduli)
- `createWithColors(config, fg, bg)` — Blob PNG con colori espliciti
- `toSVG(config)` / `toSVGWithColors(config, fg, bg)` — varianti SVG; restituiscono `null` su SSR
- Risultati cachati per `payload + colori` — generare lo stesso QR piu' volte costa solo la prima volta

**Validazione integrata**: telefono (E.164), email e IBAN vengono validati prima della generazione; errori restituiti come `QrResponse` tipizzato con `QrError` enum.

**Pattern di utilizzo tipico**:
```typescript
const result = await this.qrCode.create({ type: 'text', content: url });
if (result.success) {
    // mostra inline
    this.qrUrl = this.asset.getUrlFromBlob(result.blob).angularUrl;
    // oppure scarica
    this.share.downloadBlob(result.blob, 'qrcode.png');
    // oppure condividi
    await this.share.shareFile(result.blob, 'qrcode.png');
}
```

#### Componente loading
`LoadingComponent` e' un wrapper standalone riusabile per qualsiasi blocco condizionato al caricamento:

```html
<app-loading [loading]="isLoading">
    <div>contenuto visibile solo quando pronto</div>
</app-loading>
```

Quando `loading = true` mostra uno spinner Bootstrap centrato; quando `false` proietta il contenuto tramite `<ng-content>`. Usato ad esempio nel footer per le sezioni profilo-dipendenti: durante il caricamento dell'API compare lo spinner, poi appaiono contatti e dati societari.

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
| `AuthService` | Singleton (condizionale) | Generazione del token JWT; la validazione è delegata al middleware JWT Bearer |

**Frontend** (tutti `providedIn: 'root'`):
| Servizio | Ruolo |
|---|---|
| `ThemeService` | Tema dinamico da colore iniziale; tutta la logica colore è esposta come metodi statici (`prefersDarkText`, `getReadableTextColor`, `mixHexColors`) |
| `TranslateService` | i18n con sistema addon |
| `TokenService` | Conserva il token JWT in memoria e sessionStorage; letto da `ApiService` per l'header `Bearer` |
| `AuthService` | Login, logout e stato sessione; delega lo storage del token a `TokenService` |
| `BaseApiService` | Classe astratta: infrastruttura HTTP condivisa (header, URL normalization, error handling, health check); estesa da `ApiService` |
| `ApiService` | Unico client HTTP verso il backend: endpoint concreti (`getProfile`, `getSocial`, `getBlob`, `exportDocument`, `login`) |
| `SpeechService` | Text-to-speech via Web Speech API: `speak(text, options?)`, `stop()`, segnali `isSpeaking` e `currentVoice`; voce e lingua seguono automaticamente `TranslateService` |
| `AssetService` | URL verso `/cdn-cgi/asset`; `getUrlFromBlob(blob)` per Blob locali con tracking e revoca automatica |
| `ShareService` | Clipboard, Web Share API e download con fallback |
| `QrCodeService` | Genera QR code in blob PNG e SVG per testo/URL, WhatsApp, email, Wi-Fi e SEPA; colori tema automatici; `create()` / `createWithColors()` / `toSVG()` / `toSVGWithColors()`; caching per payload+colori; SSR-safe |
| `ImgBuilderService` | Wrapper injectable su `renderToCanvas`: `render()` usa i colori del tema (WCAG), `renderWithColors()` per colori espliciti |
| `CookieConsentService` | Gestione consenso cookie GDPR |
| `NotificationService` | SweetAlert2 lazy: `success()`, `error()`, `loading()` / `close()`, `confirm()` → `Promise<boolean>` (opzioni icona/testi/click-esterno), `prompt()` → `Promise<string\|null>`, `toast()` (con pausa hover), `validationErrors()`, `handleApiError()` |
| `VersionCheckService` | Rileva nuove versioni dell'app ogni 10 min; propone reload via `confirm()` |
| `AppTitleStrategy` | Titoli pagina tradotti nel formato `Pagina \| NomeApp` |

**Componenti e directive riusabili**:
| Componente/Directive | Ruolo |
|---|---|
| `SocialLinkComponent` | 35+ social con icona e colore brand |
| `ContextMenuDirective` | Menu contestuale desktop (click destro) e mobile (long-press) |
| `CookieBannerComponent` | Banner GDPR con testo Markdown e placeholder dinamici |
| `BackToTopComponent` | Pulsante scroll-to-top con soglia; colori derivati automaticamente dal tema |
| `SmokeEffectComponent` | Effetto particellare su canvas configurabile da `site.ts` |
| `LoadingComponent` | Wrapper `<app-loading [loading]="bool">`: spinner Bootstrap se `true`, `<ng-content>` se `false`; standalone |
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
- `frontend/src/assets/files/` e `frontend/src/assets/mapping.json`: file statici e mapping asset (ID piatto → filename; immagini raster ottimizzate da Sharp, altri tipi serviti direttamente)

### Backend (`appsettings.json`)
| Chiave | Effetto |
|---|---|
| `Localization.DefaultLanguage` | lingua di fallback quando `Accept-Language` non corrisponde a nessuna supportata |
| `Localization.SupportedLanguages` | array di codici lingua accettati (es. `["it", "en", "fr"]`); nessuna modifica al codice C# |
| `Security.ApiKeys` | chiavi API accettate |
| `Security.CorsOrigins` | origini consentite; vuoto = aperto |
| `Security.BehindProxy` | abilita `ForwardedHeaders` dietro reverse proxy |
| `Security.Token.SecretKey` | vuoto = login e JWT disabilitati |
| `Security.Token.ExpirationSeconds` | durata del token |
| `Security.Headers` | header di sicurezza aggiunti alle risposte |

### Variabili Docker (`.env`)
| Variabile | Obbligatoria | Effetto |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | si | Identifica il progetto; Docker Compose usa questo per nominare i volumi (built-in) |
| `FRONTEND_PORT` | si | Porta del frontend esposta sull'host (produzione) |
| `BACKEND_PORT` | no | Porta del backend; lascia vuota per tenerlo interno (consigliato); valorizza solo se usi `docker-compose.backend-exposed.yml` |
| `DEV_FRONTEND_PORT` | no | Porta del frontend in sviluppo Docker (default: `4200`) |
| `DEV_BACKEND_PORT` | no | Porta del backend in sviluppo Docker (default: `5000`) |
| `BACKEND_ORIGIN` | no | Host backend per proxy Node e chiamate SSR (default: `http://backend:8080`) |
| `BACKEND_API_KEY` | no | API key iniettata dal proxy Node verso il backend (default: `frontend`) |
| `SITEMAP_BASE_URL` | no | URL pubblico canonico usato a build time per generare `sitemap.xml`; se manca usa `https://example.com` con warning |

I valori di produzione (ApiKeys, CorsOrigins, BehindProxy, Token.SecretKey) vanno in `backend/appsettings.json`, committato direttamente.

Se stai creando un progetto derivato, esegui prima `./init-project.sh nome-progetto`: lo script crea `.env` con `COMPOSE_PROJECT_NAME` gia' valorizzato. Per la lista completa vedi `.env.example`.

### Sviluppo locale senza Docker
Per lavorare senza container, avvia backend e frontend separatamente:

```bash
# Backend — Visual Studio o terminale
cd backend && dotnet run   # oppure: dotnet watch

# Frontend — dalla root del progetto
./start-frontend-dev.sh
```

Lo script `start-frontend-dev.sh` esegue `npm run dev` (`ng serve` con hot reload e proxy `/api/*` verso il backend locale).

Il `proxy.local.conf.json` reindirizza `/api/*` a `http://localhost:5000` (backend, allineato a `DEV_BACKEND_PORT`). Se cambi la porta del backend in `launchSettings.json`, aggiorna anche il target nel proxy.

Per testare SSR localmente (con server Node, senza hot reload), usa invece:
```bash
npm run dev:ssr   # build + avvia server.mjs
```

> Con questo setup testi localmente SSR, image optimization e proxy esattamente come funzionano in produzione — senza Docker.

### Script di utilita'
- `npm run generate:statics`: genera meta tag e sitemap in un unico passaggio
- `npm run generate:icons`: rigenera le icone PWA da `favicon.png`
- `npm run build`: build production completa — esegue automaticamente statics + icone via `prebuild`

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

   > Non copiare `docker-compose.override.yml`: è pensato per lo sviluppo locale e verrebbe applicato automaticamente.

3. **Configura segreti e `.env`**

   Edita `backend/appsettings.json` e imposta:
   - `Security.Token.SecretKey`: stringa random di almeno 32 caratteri
   - `Security.ApiKeys`: array con la chiave usata dal proxy Node (deve corrispondere a `BACKEND_API_KEY` in `.env`)
   - `Security.CorsOrigins`: domini del frontend in produzione
   - `Security.BehindProxy`: `true` se hai Nginx/Caddy/Traefik davanti (necessario per rate limiting per IP reale)
   - `AllowedHosts`: il tuo dominio (es. `"miosito.it;www.miosito.it"`)

4. **Configura `.env` per l'ambiente remoto**
   - `COMPOSE_PROJECT_NAME`: nome stack/volumi (es. `miosito`).
   - `FRONTEND_PORT`: porta del frontend esposta sull'host.
   - `SITEMAP_BASE_URL`: URL pubblico canonico del sito; viene letto in fase di build per generare `sitemap.xml`.

5. **Avvia con `deploy.sh`**

   Il modo consigliato per il primo avvio e per tutti i deploy successivi:
   ```bash
   ./deploy.sh
   ```
   Lo script:
   - Verifica che `.env` sia presente e corretto
   - Chiede se esporre la porta backend sull'host (salva la risposta in `.env`)
   - Sceglie il file compose corretto in base a `EXPOSE_BACKEND`
   - Avvia i container in background

   Per controllare lo stato dopo il deploy:
   ```bash
   docker compose -f docker-compose.yml ps
   docker compose -f docker-compose.yml logs -f frontend
   docker compose -f docker-compose.yml logs -f backend
   ```
   Verifica poi: homepage raggiungibile, chiamate `/api/*` funzionanti, health check backend OK.

6. **Aggiornamenti futuri (deploy successivi)**
   - Aggiorna codice/immagini.
   - Riesegui `./deploy.sh` — risponde automaticamente usando i valori già salvati in `.env`, quindi è non interattivo.
   - Per aggiornare segreti: modifica `backend/appsettings.json`, commit e riesegui `./deploy.sh` (rebuild incluso).

7. **Hardening minimo produzione**
   - Metti HTTPS davanti (Nginx/Caddy/Traefik o proxy del provider).
   - Usa API key e secret JWT robusti, non quelli di esempio.
   - Tieni backup di `.env` e dei volumi nominati.
   - La policy `restart: unless-stopped` e il log rotation (json-file, 10 MB, 3 file) sono già configurati nel compose base.

Se vuoi, puoi tenere `DOCKER_README.md` come riferimento operativo dettagliato e lasciare questa sezione nel README come guida rapida da "locale" a "server".

---

## Guide allo sviluppo

I dettagli su come aggiungere pagine, servizi, componenti ed endpoint sono nelle guide dedicate:

- **[`frontend/DEVELOPMENT.md`](frontend/DEVELOPMENT.md)** — pattern Angular: pagine, servizi, componenti, direttive, signal, SSR, i18n
- **[`backend/DEVELOPMENT.md`](backend/DEVELOPMENT.md)** — pattern ASP.NET Core: endpoint, servizi, gestione errori, database, login, configurazione

Il README rimane l'overview di cosa fa l'engine e come deployarlo; le guide coprono il come si estende.

## Licenza
Questo progetto e' rilasciato sotto licenza MIT. Vedi [`LICENSE`](LICENSE).
