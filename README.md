# Br1WebEngine

**Un'engine personale e moderna per costruire siti web, basata su ASP.NET Core 9 e Angular 19.**

Br1WebEngine e' un template full-stack per siti content-driven e piccoli portali. L'idea e' avere una base gia' pronta in cui il frontend centralizza struttura, rotte, menu e sitemap, mentre il backend espone API, contenuti localizzati e una pipeline di sicurezza gia' cablata.

---

### Indice
- [Cosa fa da solo](#cosa-fa-da-solo)
- [Tech Stack](#tech-stack)
- [Architettura del Progetto](#architettura-del-progetto)
- [Dettagli Tecnici](#dettagli-tecnici)
- [Configurazione](#configurazione)
- [Operazioni Comuni](#operazioni-comuni)
- [Estendere l'Engine](#estendere-lengine)
- [Licenza](#licenza)

---

### Cosa fa da solo

Br1WebEngine e' costruito intorno a un principio: se una cosa puo' derivarsi dalla configurazione, non va scritta a mano.

- Modifichi [`site.ts`](#dsl-dichiarativa-e-builder) e rotte, menu, sitemap, meta tag e manifest si aggiornano da soli
- Scrivi un oggetto con `component`, `children` o `externalUrl` e il [builder deduce il tipo di pagina](#dsl-dichiarativa-e-builder) senza che tu lo dichiari
- Aggiungi un valore a [`PageType`](#enum-pagetype) e TypeScript ti guida ovunque serva usarlo; lo rimuovi e ti segnala ogni riferimento rimasto
- La [navigazione header e footer](#navigazione-header-e-footer) si costruisce con `addPage(PageType.X)`: le pagine disabilitate spariscono da sole, i gruppi vuoti pure
- Un [colore hex](#gestione-del-tema) in configurazione genera contrasto testo WCAG 2.1, tono light/dark, variabili CSS e meta tag mobile
- Due file di [traduzione per lingua](#sistema-di-traduzione-addon) (`basic` + `addon`): l'addon sovrascrive il template con un `Object.assign`, senza plugin
- [`Security.Token.SecretKey`](#login-condizionale) valorizzata accende JWT, middleware, guard e interceptor; vuota, il sistema funziona senza, senza overhead
- [`AddTemplateSecurity()`](#pipeline-di-sicurezza) registra in una riga API key, JWT condizionale, CORS, rate limiting, security headers e ProblemDetails
- Tre [controller astratti](#controller-e-ereditarieta) applicano `[Authorize]`, policy e dipendenze: il concreto aggiunge solo routing e logica
- [`IContentStore`](#content-store) definisce il contratto di accesso ai dati; [sostituire l'implementazione](#sostituire-il-content-store) richiede una riga
- [`PageBaseComponent`](#pagebasecomponent) inietta `translate`, `api`, `asset`, `notify` una volta; ogni pagina [estende e basta](#pagebasecomponent)
- Ogni pagina sceglie il [proprio layout](#pannello-e-layout) con `showPanel: false` per andare a schermo intero
- Le [pagine di errore](#pagine-di-errore) per `400`, `401`, `403`, `404`, `500`, `503` si generano da un array con `.map()`, messaggi inclusi via i18n
- L'[interceptor HTTP](#interceptor-http) aggiunge `X-Api-Key`, `Accept-Language` e `Bearer` a ogni chiamata backend, senza toccare i componenti
- Il [consenso cookie](#consenso-cookie) si rileva da solo e blocca le scritture in silenzio finche' l'utente non accetta
- [`npm run build`](#build-e-script) lancia meta tag e sitemap in automatico; le [icone PWA](#build-e-script) si rigenerano da `favicon.png`
- [Docker](#docker) esegue proxy, sostituzione env a runtime e caching hashato senza configurare nulla
- Gli [asset](#asset-mapping) si risolvono da un `mapping.json` cachato con `shareReplay`
- Un [context menu](#context-menu) con directive: click destro su desktop, long-press su mobile, posizionamento automatico e chiusura con Escape
- 35+ [social con icona e colore brand](#social-link) mappati in un componente: passi il nome, esce l'icona giusta col colore giusto
- Il [Markdown](#markdown-e-protezione-xss) viene renderizzato con protezione XSS integrata: qualsiasi HTML raw nel sorgente viene ignorato
- Le [pagine legali](#pagine-legali) sono file Markdown in `/assets/legal/`, caricati con fallback lingua, revisionabili senza toccare codice
- I [titoli pagina](#titoli-pagina) si compongono da soli: `AppTitleStrategy` traduce la chiave della route e formatta `"Pagina | NomeApp"`
- Il CSS usa [`color-mix()`](#sistema-css-con-color-mix) per derivare tutti i colori dal tema: surface, hover, bordi, testo. Il JS imposta solo `--colorTema`
- Un [servizio di condivisione](#condivisione-e-clipboard) unifica Clipboard API, Web Share API e download in un'unica interfaccia con fallback automatico
- L'[image builder](#generazione-immagini-su-canvas) genera immagini su canvas con word-wrap calcolato via `measureText()`, pronte per social sharing
- [Accessibilita'](#accessibilita) integrata: skip-link WCAG 2.4.1, `prefers-reduced-motion`, `safe-area-inset` per notch, contrasto AA su testi secondari

### Tech Stack
| Categoria | Tecnologia | Note |
|---|---|---|
| Backend | ASP.NET Core 9, C# | REST API, API key, JWT opzionale, ProblemDetails |
| Frontend | Angular 19, TypeScript, Bootstrap 5 | SPA/PWA, i18n, tema dinamico |
| Container | Docker, Docker Compose, Nginx | dev con hot reload, prod con frontend statico |
| Tooling | Node 22+, npm 10+ | script meta, sitemap e icone |

### Architettura del Progetto

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

#### Struttura rapida
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

### Dettagli Tecnici

#### API attuale
| Metodo | Path | Auth | Note |
|---|---|---|---|
| `GET` | `/api/profile` | API key | profilo aziendale localizzato |
| `GET` | `/api/social` | API key | filtro opzionale con `nomi` |
| `POST` | `/api/auth/login` | API key | placeholder, nel template risponde `valid = false` |
| `GET` | `/health` | nessuna | health check |

Le API protette stanno in `backend/Controllers/ProtectedController.cs` e diventano realmente utilizzabili solo quando configuri il JWT.

#### Controller e ereditarieta'

Tre controller astratti dell'engine abilitano automaticamente attributi di sicurezza e dipendenze condivise:

| Controller astratto | Attributi ereditati | Cosa fornisce |
|---|---|---|
| `EngineBaseController` | `[ApiController]`, `[Authorize]` | `IContentStore` e `ILogger` pronti all'uso |
| `EngineAuthController` | `[ApiController]`, `[Authorize]` | `AuthService` per generazione e validazione JWT |
| `EngineProtectedController` | `[ApiController]`, `[Authorize(Policy = RequireLoginPolicy)]` | `ILogger` condiviso, accesso solo con JWT valido |

Il controller concreto (es. `BaseController`) estende la base e aggiunge solo routing (`[Route]`) e logica endpoint. Non deve ripetere `[Authorize]` ne' il wiring delle dipendenze.

#### Pipeline di sicurezza
Registrata in `Program.cs` con `AddTemplateSecurity(...)`, attivata con `UseTemplateSecurity()`:

1. **Forwarded headers**: ricostruisce l'IP reale da `X-Forwarded-For` se `BehindProxy = true`
2. **CORS**: gestisce origini consentite e preflight `OPTIONS`
3. **Rate limiting**: `100 req/min` globali per IP, `5 req/min` su login
4. **Security headers**: aggiunge gli header configurati a ogni risposta
5. **API key**: richiede `X-Api-Key` dove previsto
6. **JWT Bearer**: si attiva solo se `Security.Token.SecretKey` e' valorizzata

Gli errori applicativi vengono normalizzati in `ProblemDetails` (RFC 9457) tramite `ApiExceptionHandler`.

#### Content store
`IContentStore` definisce il contratto (`GetProfileAsync`, `GetSocialAsync`) senza sapere dove risiedano i dati. `SiteService` dipende solo dall'interfaccia e orchestra filtri social e localizzazione profilo senza conoscere il formato di persistenza.

L'implementazione attiva (`FileContentStore`) legge da `backend/data/` e include un `LocalizedJsonDeserializer` che risolve ricorsivamente le strutture `{ "it": ..., "en": ... }`, sceglie la lingua richiesta, ripega sul fallback italiano e scarta nodi vuoti.

#### Login condizionale
Il sistema JWT si accende in base a una sola condizione: `Security.Token.SecretKey` in `appsettings.json`.

- **Chiave vuota** → `LoginEnabled = false`: nessun `AuthService` registrato, nessun middleware JWT, nessun overhead
- **Chiave valorizzata** → `LoginEnabled = true`: `AuthService` singleton, middleware JWT attivo, rotte con `requiresAuth: true` protette da guard Angular

Se la chiave e' troppo corta per HMAC-SHA256, viene espansa tramite SHA-256. Il token frontend vive in `sessionStorage` (sopravvive al refresh, si cancella alla chiusura del tab).

#### DSL dichiarativa e builder
Il sito si configura in `frontend/src/app/site.ts` attraverso una DSL a builder in tre fasi:

1. **Dichiarazione**: configurazione, pagine e navigazione con tipi `*Input` e campi opzionali
2. **Normalizzazione**: il builder deduce `kind` dalla struttura (`children` → parent, `component` → leaf, `externalUrl` → external), valida la coerenza e costruisce la mappa `PageType → path`
3. **Generazione**: produce rotte Angular, `NavLink[]` per header/footer, `getPath(PageType)` e `getSitemapPaths()`

Il risultato (`ContestoSito`) viene consumato da router, navbar, footer e script di build.

#### Enum PageType
Ogni pagina ha un valore nell'enum `PageType`. L'enum e' l'identita' stabile: path, titoli e componenti possono cambiare, il `PageType` no.

```typescript
export enum PageType {
    Home, Social, PrivacyPolicy, CookiePolicy,
    TermsOfService, LegalNotice, Impostazioni, GitHub
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
`npm run build` lancia in automatico generazione di meta tag e sitemap. Gli script leggono da `ContestoSito`: nome app, descrizione, colore tema, lingue e path delle pagine. Le icone PWA si rigenerano da `favicon.png` in tutte le dimensioni necessarie.

#### Docker
Il frontend Nginx esegue proxy verso il backend sulla rete Docker. `docker-entrypoint.sh` sostituisce `API_URL` e `API_KEY` a runtime nei bundle JavaScript. Asset hashati cachati un anno con `immutable`; service worker e manifest mai cachati.

#### Asset mapping
`AssetService` carica `mapping.json` una volta, lo mette in cache con `shareReplay`, e risolve ID in path reali o URL esterni.

#### Context menu
La directive `[appContextMenu]` aggiunge un menu contestuale personalizzato a qualsiasi elemento:

- **Desktop**: click destro, presentazione a popover posizionato al puntatore
- **Mobile**: long-press (450ms) con soglia di movimento (12px) per distinguere dallo scroll, presentazione a sheet dal basso
- **Chiusura**: click fuori, Escape, o apertura di un altro menu
- **Cleanup**: listener rimossi automaticamente alla distruzione del componente

Uso: `<div [appContextMenu]="menuOptions">...</div>`

#### Social link
`SocialLinkComponent` mappa 35+ piattaforme social con icona Font Awesome e colore brand esatto. Passi il nome del social (`type`) e l'URL (`value`), il componente risolve automaticamente icona e colore. Piattaforme non riconosciute ricevono un'icona link generica come fallback.

Piattaforme incluse: Facebook, Instagram, Twitter/X, LinkedIn, TikTok, YouTube, Twitch, Spotify, Telegram, WhatsApp, Discord, Reddit, GitHub, Mastodon, Pinterest, Snapchat, Dribbble, Vimeo, SoundCloud, e altre.

#### Markdown e protezione XSS
`MarkdownPipe` converte Markdown in HTML usando `marked` con GitHub Flavored Markdown (tabelle, checklist, a capo automatici). La protezione XSS e' integrata nel renderer: `renderer.html = () => ''` ignora completamente qualsiasi tag HTML raw nel sorgente. Utilizzabile nei template (`{{ testo | markdown }}`) e da codice (`MarkdownPipe.render(testo)`).

#### Pagine legali
Un singolo componente (`PolicyComponent`) gestisce tutte le pagine legali: privacy, cookie policy, termini di servizio e note legali. Il contenuto viene caricato da file Markdown in `/assets/legal/{tipo}.{lang}.md` con fallback all'italiano. Il `PageType` della route determina quale file caricare.

Questo separa i contenuti legali dal codice: un legale puo' revisionare e aggiornare i testi senza aprire l'IDE ne' fare deploy.

#### Titoli pagina
`AppTitleStrategy` traduce automaticamente la chiave `title` della route nella lingua corrente e compone il titolo del browser nel formato `"Pagina | NomeApp"`. Se la chiave non esiste o coincide con il nome dell'app, mostra solo il nome dell'app.

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

#### Servizi e componenti inclusi

**Backend** (`Program.cs`):
| Servizio | Lifetime | Ruolo |
|---|---|---|
| `FileContentStore` | Singleton | Legge contenuti da `backend/data/*.json` |
| `SiteService` | Scoped | Filtro social, profilo localizzato |
| `AuthService` | Singleton (condizionale) | Generazione e validazione JWT |

**Frontend** (tutti `providedIn: 'root'`):
| Servizio | Ruolo |
|---|---|
| `ThemeService` | Tema dinamico da colore iniziale |
| `TranslateService` | i18n con sistema addon |
| `AuthService` | Login, token in sessionStorage, interceptor Bearer |
| `ApiService` | HTTP client con API key e Accept-Language |
| `AssetService` | Risoluzione URL asset statici da mapping |
| `ShareService` | Clipboard, Web Share API e download con fallback |
| `CookieConsentService` | Gestione consenso cookie GDPR |
| `NotificationService` | Toast, errori e parsing ProblemDetails RFC 9457 |
| `AppTitleStrategy` | Titoli pagina tradotti nel formato `Pagina \| NomeApp` |

**Componenti e directive riusabili**:
| Componente/Directive | Ruolo |
|---|---|
| `SocialLinkComponent` | 35+ social con icona e colore brand |
| `ContextMenuDirective` | Menu contestuale desktop (click destro) e mobile (long-press) |
| `CookieBannerComponent` | Banner GDPR con testo Markdown e placeholder dinamici |
| `BackToTopComponent` | Pulsante scroll-to-top con soglia e colori tema |
| `SmokeEffectComponent` | Effetto particellare su canvas configurabile da `site.ts` |
| `MarkdownPipe` | Markdown → HTML con protezione XSS integrata |

**Dati demo** (`backend/data/`):
- `social.json`: 31 social network preconfigurati
- `irl.json`: profilo aziendale con campi localizzati it/en (ragione sociale, P.IVA, sede legale, contatti, dati societari)

---

### Configurazione

#### Contenuti gestiti da file
La maggior parte dei contenuti testuali e' gestita tramite file, aggiornabili senza ricompilare:

- `backend/data/irl.json`: dati legali del sito
- `frontend/src/assets/i18n/`: traduzioni del progetto (`addon.*.json`)
- `frontend/src/assets/legal/`: privacy, cookie policy, termini di servizio e note legali
- `frontend/src/assets/file/` e `frontend/src/assets/mapping.json`: file statici e mapping asset

#### Backend (`appsettings.json`)
| Chiave | Effetto |
|---|---|
| `Security.ApiKeys` | chiavi API accettate |
| `Security.CorsOrigins` | origini consentite; vuoto = aperto |
| `Security.BehindProxy` | abilita `ForwardedHeaders` dietro reverse proxy |
| `Security.Token.SecretKey` | vuoto = login e JWT disabilitati |
| `Security.Token.ExpirationSeconds` | durata del token |
| `Security.Headers` | header di sicurezza aggiunti alle risposte |

#### Variabili runtime del container frontend
| Variabile | Effetto |
|---|---|
| `API_URL` | vuota = stesso host con proxy Nginx; valorizzata = backend remoto |
| `API_KEY` | API key iniettata a runtime nel frontend |

Se frontend e backend girano su host separati, allineare anche `Security__CorsOrigins__*` sul backend.

#### Script di utilita'
- `npm run generate:site-meta`: genera i meta tag del sito
- `npm run generate:sitemap`: genera la sitemap a partire dalle rotte
- `npm run generate:icons`: rigenera le icone PWA da `favicon.png`
- `npm run build`: build production + meta + sitemap in automatico

---

### Operazioni Comuni

#### Aggiungere una pagina
1. Aggiungi un valore a `PageType` in `frontend/src/app/site.ts`.
2. Crea il componente sotto `frontend/src/app/pages/` estendendo `PageBaseComponent`.
3. Registra la pagina in `setSitePages(...)` con path, titolo e componente.
4. Aggiungila alla navigazione con `addPage(PageType.X)` se serve.
5. Inserisci le chiavi i18n in `addon.it.json` e `addon.en.json`.

#### Aggiungere un endpoint API
1. Scegli il controller giusto: `BaseController`, `AuthController` o `ProtectedController`.
2. Crea la logica in `backend/Services/` o in un servizio dedicato.
3. Se serve, estendi `FileContentStore` tramite `backend/Store/IContentStore.cs`.
4. Esponi la chiamata lato frontend in `frontend/src/app/core/services/api.service.ts`.

#### Abilitare il login
1. Imposta `Security.Token.SecretKey` in `appsettings.json` o via env var.
2. Implementa la validazione credenziali in `backend/Controllers/AuthController.cs`.
3. Emetti il token tramite `Auth.GenerateToken()`.

---

### Estendere l'Engine

#### Sostituire il content store
Crea una classe che implementa `IContentStore` e registrala in `Program.cs`:
```csharp
builder.Services.AddSingleton<IContentStore, MyDatabaseStore>();
```
Controller e servizi continuano a funzionare senza modifiche.

#### Aggiungere un controller protetto
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

#### Aggiungere una lingua
1. Aggiungi il codice in `availableLanguages` dentro `site.ts`.
2. Crea `basic.{lang}.json` e `addon.{lang}.json` in `frontend/src/assets/i18n/`.
3. Aggiungi la `CultureInfo` corrispondente in `Program.cs` nell'array `supported`.
4. Se i contenuti JSON in `backend/data/` hanno campi localizzati, aggiungi il ramo della nuova lingua.

#### Cambiare il tema
Modifica `colorTema` in `site.ts`. Il `ThemeService` ricalcola automaticamente contrasto, tono, colore primario e variabili CSS.

### Licenza
Questo progetto e' rilasciato sotto licenza MIT. Vedi [`LICENSE`](LICENSE).