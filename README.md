# 🚀 Br1WebEngine

<div align="center">
  <strong>Template applicativo base per progetti Web.</strong>
</div>

<br/>

Br1WebEngine si prende in carico la parte noiosa di ogni progetto web — routing, SEO, SSR, CORS, rate limiting, JWT, gestione degli errori — così tu parti dalla logica che ti interessa e non dall'ennesimo file di configurazione da riempire a mano.

**Stack:** Angular 21 (standalone, **zoneless**) · ASP.NET Core (.NET 9) · Node 24 SSR · Docker. Il tutto guidato da un singolo file di configurazione; il resto è dettaglio.

---

## 📚 Mappa della documentazione

Un file, un mestiere. Così sai dove guardare prima di mettere mano al codice.

| Documento | A cosa serve |
| :--- | :--- |
| [QUICKSTART.md](QUICKSTART.md) | **Parti da qui se è la prima volta:** 3 comandi e sei in piedi, senza la teoria. |
| **README.md** (questo) | Panoramica, architettura, **dove mettere le mani**, avvio rapido e la **vetrina della demo**: gli esempi del template vivono qui. |
| [frontend/README.md](frontend/README.md) | **Direttive di implementazione** del frontend per i progetti figli: DSL `site.ts`, SSR, servizi (API, tema, i18n, cookie, share, QR…), directive Angular, SEO. |
| [backend/README.md](backend/README.md) | **Direttive di implementazione** del backend per i progetti figli: Engine di sicurezza, eccezioni→`ProblemDetails`, `FileContentStore`, login JWT. |
| [DOCKER_README.md](DOCKER_README.md) | Setup Docker, configurazione `global-settings(.local).json`, pubblicazione, backup dei volumi. |
| [AGENTS.md](AGENTS.md) | Regole trasversali e ricette pratiche per chi sviluppa — umano o assistente di coding. |
| [ENGINE.md](ENGINE.md) | Mappa dell'implementazione interna dell'Engine **non** citata per nome nei due README di dettaglio — dove trovarla e perché è fatta così, senza reverse engineering. |
| [CHANGELOG.md](CHANGELOG.md) | Cosa cambia nel template tra una versione e l'altra. |

---

## 🗺️ Mappa delle aree tecniche

La tabella sopra dice *in che file* cercare; questa dice *per argomento* — utile a chi arriva senza conoscere il progetto e vuole sapere subito cosa il template gli mette a disposizione, area per area.

| Area | Nel template | Approfondisci |
| :--- | :--- | :--- |
| **Integrazioni con servizi esterni** | Chiamare un'API terza (client HTTP tipizzato, config + segreti separati) e ricevere webhook (firma sul body grezzo, coda background) | [backend/README.md](backend/README.md) §8 |
| **Dati e persistenza** | `FileContentStore` (JSON in RAM, localizzato); nessun ORM/DB relazionale di default — è una scelta, il seam verso un DB reale (`IContentStore`) è già pronto | [backend/README.md](backend/README.md) §4 |
| **Cache e scalabilità multi-istanza** | `IMemoryCache` per-istanza; il seam verso un backplane distribuito (es. Redis) per notifiche/store multi-istanza è già segnalato per chi estende oltre la singola istanza | [backend/README.md](backend/README.md) §4, §6 |
| **Sicurezza** | JWT opzionale, ruoli via claim di sessione, rate limiting, CORS, header di sicurezza, XSS-hardening, segreti fuori da git | [backend/README.md](backend/README.md) §1 e «Sistema di Login e Sessioni JWT» |
| **Asset e risorse** | Immagini (resize/formati server-side) e font centralizzati; CDN abilitata via whitelisting del dominio in CSP | [frontend/README.md](frontend/README.md) — sezioni AssetService, Font |
| **Bundling frontend** | Budget di produzione (`angular.json`, già gate CI in `ng build`), whitelist CommonJS, code-splitting per pagina/SDK via `import()` dinamico | [frontend/README.md](frontend/README.md) — sezione Bundling |
| **Configurazione applicativa** | Routing via DSL `site.ts`, i18n su entrambi i lati, errori uniformi (`ProblemDetails`), logging via property ambient `Logger` | [backend/README.md](backend/README.md) §2, «Dove mettere le mani» qui sopra |
| **DevOps e deploy** | Docker Compose, pipeline CI (lint, i18n, tsc, cicli, a11y, Lighthouse, audit, gitleaks), health check | [DOCKER_README.md](DOCKER_README.md) |
| **Testing e qualità** | Gate automatici (lint/i18n/tsc/cicli/a11y/Lighthouse) in CI; unit/integration/E2E restano di ogni progetto figlio, per scelta di isolamento | «🧪 Test Suite Automatica» qui sotto |
| **Frontend specifico** | State via Signals nativi (no NgRx), Bootstrap 5 + libreria di componenti propria, SEO/JSON-LD automatico | [frontend/README.md](frontend/README.md) |
| **Manutenzione** | `npm audit` + vulnerabilità NuGet + gitleaks in CI; performance monitorata tramite gate Lighthouse | «Supply chain» qui sotto |

---

## 🧭 Approccio e Architettura

Filosofia in una riga: nascondere la complessità senza portarti via il controllo. La base è strutturata ma resta leggera — niente cattedrale di astrazioni da reggere a ogni avvio.

| Il grattacapo | Come lo chiude Br1WebEngine |
| :--- | :--- |
| Configurare N file per il routing e la SEO | Un singolo file DSL (`site.ts`) gestisce rotte, menu e meta-tag. |
| Dimenticare la sicurezza sugli endpoint | Tutti gli endpoint ereditano Rate Limiter e CORS in automatico. |
| Configurare DB relazionali per testare | `FileContentStore` usa JSON in RAM con localizzazione integrata. |
| Leak di stack trace in produzione | Middleware globale per errori `RFC 9457` Problem Details. |
| Redux boilerplate per il frontend | Uso nativo di `Signals` e `withFetch` di Angular 21 (zoneless). |

---

## 🏗️ Architettura del Sistema

Frontend e backend vivono separati, ciascuno a casa propria, ma condividono un'unica filosofia: **la noia sta chiusa nell'Engine, in vetrina ci va il Dominio**.

```text
┌──────────────────────────────────────────────────────┐
│  Frontend — Node SSR (Angular 21 + Express)          │
│  porta 3000                                          │
│  ┌──────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │ Angular SSR  │  │/api/* proxy│  │/cdn-cgi/*    │  │
│  │  (pagine)    │  │ → backend  │  │ Sharp+OGimage│  │
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

### Struttura delle cartelle

```text
backend/                Web API ASP.NET Core (.NET 9)
├── Engine/             ⚙️  Engine: sicurezza, errori, base controller, JWT — INTOCCABILE
├── Controllers/        thin controller: niente logica, delega ai Services
├── Services/           logica di business
├── Store/              IContentStore e implementazioni: il confine verso la persistenza
├── data/               "database" JSON localizzato (letto dal FileContentStore)
├── db/                 mount point del volume db-data (riservato al DB futuro)
└── uploads/            file caricati via BlobController (volume uploads-data)

frontend/src/app/       Angular 21 (standalone, zoneless)
├── core/engine/        ⚙️  Engine: DSL, SSR, servizi infrastrutturali — INTOCCABILE
├── site.ts             il DSL strutturale: pagine, rotte, menu, SEO per-pagina
├── pages/              schermate intere (estendono PageBaseComponent)
└── components/         UI riusabile ("stupida": riceve input(), emette output())
```

**Le due regole d'oro.** Nel backend erediti sempre dalle basi `Engine*`, mai da `ControllerBase` di ASP.NET: ti regalano API key, rate limiter, CORS e `ProblemDetails` senza che tu scriva una riga. Nel frontend lavori con binding dichiarativi e signal, e l'idratazione SSR resta intatta. Ciò che porta il bollo **INTOCCABILE** è l'Engine: nei figli si aggiorna da sé col merge dal template (vedi sotto).

### 🔄 Template vivo: nascita e aggiornamento dei progetti figli

Il confine **Engine (intoccabile) / Dominio (del progetto)** non è una questione di estetica: è il meccanismo che lascia ai
progetti derivati di **ricevere gli aggiornamenti dell'infrastruttura via git**, mettendo le mani sul
proprio dominio e nient'altro. Regola pratica: l'Engine non si tocca; i comportamenti si cambiano per
**configurazione** (`global-settings.local.json`, `site.ts`, sezione `Custom`) o per **estensione**
(sottoclassi dei controller `Engine*`, nuovi servizi).

**Nascita.** Un figlio è un **vero discendente git** del template: si clona questo repository, si
punta `origin` al repo del nuovo progetto e si tiene il template come secondo remote
(`git remote add template <url-del-template>`); poi `node setup.mjs "Nome Progetto"` battezza il
progetto. La storia git è il cordone ombelicale tra figlio e template — è ciò che gli porta gli aggiornamenti: conservala fin dalla clonazione.

**Aggiornamento.** Non è il `git pull` del figlio (quello parla con `origin`): è un merge dal
template — `git fetch template && git merge template/main`. Regola d'oro sui conflitti: sui path
dell'**Engine e dello scaffold vince sempre il template** (`git checkout template/main -- <path>`),
sul **dominio vince il figlio**. Sui path engine prendi la versione del template anche quando la tua compilerebbe lo stesso: è l'unico modo perché git registri l'aggiornamento come assorbito per intero e i merge successivi continuino a portarti le novità.

**Il confine in pratica — chi possiede cosa.** "Engine e scaffold" nei conflitti significa:

| Proprietà | Path | Al merge |
| :--- | :--- | :--- |
| **Engine** | `backend/Engine/`, `frontend/src/app/core/engine/`, `frontend/src/styles/engine/`, `frontend/src/assets/i18n/basic.*.json` | vince il template |
| **Scaffold** (infrastruttura e documentazione del template fuori dall'Engine) | `scripts/`, `deploy.sh`, `backup.sh`, `docker-compose*.yml`, `.github/workflows/`, `.nvmrc`, `global.json`, `setup.mjs`, `global-settings.schema.json`, `security-headers.json`*, `CHANGELOG.md`, `QUICKSTART.md`, `DOCKER_README.md`, `AGENTS.md`, `ENGINE.md`, `backend/README.md`, `frontend/README.md`, `backend/backend.csproj`, i due `Dockerfile`, `frontend/proxy*.cjs`, `frontend/tsconfig.json`, `frontend/eslint.config.mjs`, `main.ts`/`main.server.ts`, `app.config.ts`/`app.config.server.ts` | vince il template |
| **Condivisi con punti di contatto** (il template li evolve; il figlio tocca soltanto i punti indicati) | `backend/Program.cs` (soltanto il blocco "SERVIZI APPLICATIVI"), `frontend/angular.json` (assets/styles del progetto, budget, `allowedCommonJsDependencies`), `frontend/package.json` (dipendenze del progetto), `backend/Resources/*.resx` (chiavi aggiunte), `.gitignore`/`.dockerignore` (righe aggiunte) | si fondono riga per riga |
| **Dominio** (la demo riusata + il codice del progetto) | `backend/Controllers|Services|Models|Store|Validation|data`, `site.ts`, `pages/`, `components/`, `core/services` e `core/dto`, `assets/` (i18n `addon`, legal, files), `styles.scss` + `styles/app/` (gli stili del progetto, non `styles/engine/`), `public/`, `global-settings.json`, la `.sln` rinominata | vince il figlio |

\* `security-headers.json`: unica eccezione, l'override documentato nella `_nota` (vedi sopra).

> **Dominio a contratto fisso.** Alcuni file di Dominio sono **importati dall'Engine per path e nome**: il figlio ne cambia liberamente il **corpo**, ma deve preservarne **path, nome dell'export e forma** — altrimenti l'Engine non compila. Non sono "campo libero", sono punti di contatto a contratto fisso:
> - `site.ts` → `ContestoSito` (da `buildSite`), `PageType` (un oggetto `as const`, tipicamente assemblato da file di area sotto `pages/*.pages.ts`, ma l'Engine pretende solo che `site.ts` lo esporti con questo nome — la forma interna è libera), tipi `SmokeSettings`/`SitePageInput`. È il DSL: l'Engine lo legge ovunque (routing, builder, meta, tema…).
> - `pages/content.resolver.ts` → `ContentResolver` (con `loadResolved`), `ResolvedPage`, `contentLoaderResolver` — usati da `routing.ts` e `PageBaseComponent`. Aggiungi `case` allo switch, non rinominare gli export.
> - `core/services/api.service.ts` → la classe `ApiService` iniettabile (`PageBaseComponent` espone `this.api`). La estendi con metodi, non la elimini.
> - `components/shared/user-nav/` → `UserNavComponent` / selettore `app-user-nav`, montato dalla navbar dell'Engine. Personalizzi l'interno, non il selettore/export.

**Documenti.** Nel figlio sparisce un file e uno soltanto: **questo README** (è la vetrina del template, non del
prodotto). Tutto il resto della documentazione **resta e si aggiorna dal template** — al merge vince il
template, esattamente come per l'Engine: il `CHANGELOG.md` racconta al figlio cosa è cambiato nel template tra una
versione e l'altra; `backend/README.md`, `frontend/README.md` e `DOCKER_README.md` sono le
direttive di sviluppo — dicono cosa si modifica e con quali strumenti; `AGENTS.md` e `ENGINE.md`
sono rispettivamente le ricette pratiche e la mappa dell'implementazione interna dell'Engine. Non si
adattano nel figlio: la documentazione del prodotto, se serve, vive in un file a parte.

### 🧭 Dove mettere le mani

Regola generale: il **Dominio** si tocca; l'**Engine** (`backend/Engine/`, `frontend/src/app/core/engine/`) resta com'è e si aggiorna da sé col merge dal template (vedi *Template vivo*). Mettere mano al Dominio vuol dire riusarne i file demo: li svuoti e li riempi col tuo contenuto, lasciando nomi e posizioni dove sono.

**Pagine, rotte e navigazione.** Il frontend nasce da un file unico, `frontend/src/app/site.ts`: lì dichiari le pagine e l'Engine si genera da sé rotte, voci di menu, sitemap e meta-tag SEO. Nello stesso posto imposti anche la pagina di login, le pagine legali (privacy, cookie, termini) e l'aspetto della shell (navbar, footer). L'identità e l'estetica del sito (nome, versione, lingue, descrizione, **colore del tema**, effetto smoke) non abitano qui: stanno in `global-settings.json` e vengono iniettate al build. Il componente di una pagina sta in `frontend/src/app/pages/<nome>/` (estende `PageBaseComponent`); i pezzi di UI riusabili in `frontend/src/app/components/`. Ogni opzione, voce per voce, è in [frontend/README.md](frontend/README.md).

**Contenuti e testi.** I testi legali (privacy, cookie, termini) sono Markdown in `frontend/src/assets/legal/`; le traduzioni del progetto in `frontend/src/assets/i18n/addon.*.json`; l'identità del sito (dati legali, social del brand, tipo entità) in `backend/data/identity.json` (servita dall'Engine su `GET /identity`).

**Backend: API e logica.** Un nuovo endpoint è un controller in `backend/Controllers/` che eredita `EngineApiController` (pubblico) o `EngineProtectedController` (chiede il login); la logica di business va nei `backend/Services/`. Per un nuovo tipo di errore: una sottoclasse di `ApiException` più la chiave nei `Resources/*.resx`. Per cambiare lo storage: una nuova implementazione di `IContentStore`.

**Configurazione e segreti — tre file, per proprietario.**
- `global-settings.json` (**committabile, del progetto**): identità ed estetica del sito — nome e versione, lingue, descrizione, colore del tema, effetto smoke. Include la sezione `Custom` per valori liberi di progetto (feature flag, ID analytics…), leggibili da backend, SSR e frontend.
- `global-settings.local.json` (**gitignored**): pubblicazione e segreti del singolo ambiente — hostname e porte, chiavi API, origini CORS, chiave di firma JWT.
- `security-headers.json` (**del template, non toccare**): header di sicurezza fissi. "Non toccare" vale per il concetto, non in assoluto: se il progetto pretende un'estensione (es. domini extra in CSP per un servizio di mappe), l'override eccezionale si fa modificando il file e annotandolo nella `_nota` interna — e a ogni aggiornamento dal template l'override va rifatto a mano.

**Login e sessione.** La forma del payload di sessione si cambia in due posti speculari: `backend/Models/SessionInfo.cs` e `frontend/src/app/core/dto/session.dto.ts`. I cookie e le voci di Web Storage si registrano — stessa API gated dal consenso — in `frontend/src/app/core/services/cookie-registry.ts`.

> Questa è la mappa del *dove*, niente di più. Il **come** passo-passo vive nelle sezioni **"Developer Journey"** di [frontend/README.md](frontend/README.md) e [backend/README.md](backend/README.md): front-end e back-end sono disaccoppiati, ciascuno si racconta per conto suo.

### Route SSR speciali del Frontend

Il Node SSR del frontend gestisce, oltre alle pagine Angular, anche alcune route infrastrutturali:

| Route | Cosa fa |
| :--- | :--- |
| `/api/*` | Reverse proxy verso il backend (inietta l'API key lato server) |
| `/cdn-cgi/asset` | Image processing con Sharp: resize, conversione formato, cache su disco |
| `/cdn-cgi/preview` | Generazione og:image dinamica (preview OpenGraph cifrata, AES-GCM) |
| `/api/blob/:slug` | Serve (via proxy `/api`) i file caricati dall'applicazione dal volume `/app/uploads` del backend |
| `/assets/legal/*` | Serve i Markdown legali (privacy, cookie, termini) con guard anti path-traversal |
| `/assets/files/*` | **Bloccata** (404): i file sorgente degli asset si servono soltanto via `/cdn-cgi/asset` |
| `/.well-known/security.txt` | Contatto di sicurezza RFC 9116 (generato al build da `generate-statics.ts`) |

> Il Node SSR applica anche, in automatico, **compressione gzip** sulle risposte testuali — **escluso lo stream di notifiche SSE**, che resta non compresso così gli eventi arrivano subito al browser invece di restare nel buffer — e un **graceful shutdown** su SIGTERM/SIGINT (drena le connessioni prima di uscire). I file statici SEO (`sitemap.xml`, `robots.txt`, `llms.txt`, `security.txt`) sono generati al build.

---

## 💡 Funzionalità Integrate

Senza scrivere una riga di codice infrastrutturale, dalla scatola esce già tutto questo (sì, anche le cose che di norma rimandi a "dopo"):

- **SEO e social**: tag OpenGraph e JSON-LD per pagina, SSR granulare guidato da `site.ts`, più `sitemap.xml`, `robots.txt` e anteprime `og:image` dinamiche.
- **Sicurezza by-design**: protezione attiva contro Stored XSS (file isolati, markdown sanificato, JSON-LD inline escapato contro il breakout dal `<script>`), rate limiting, CORS, API key, header di sicurezza (incluso HSTS subdomains); prevenzione Host Header Injection e script di deploy fail-fast sui segreti. Errori API standardizzati in `ProblemDetails` (RFC 9457) senza leak di stack trace.
- **Pronto all'uso**: routing, navigazione, i18n, PWA, consenso cookie e pagine legali già funzionanti — si parte dritti dalla logica di dominio.
- **Menu Multilivello**: supporto nativo a navigazione ricorsiva sia nella Navbar (con flyout desktop che evita di uscire dallo schermo e accordion su mobile) sia nel Footer. Basta annidare i gruppi in `site.ts`.
- **Notifiche realtime**: canale server→client via SSE (`INotificationStream` / `NotificationStreamService`) per spingere notifiche ai client connessi — targeting per broadcast/connessione/gruppo, indipendente dal login, payload che non si ferma al testo. Dettagli in [backend](backend/README.md) e [frontend](frontend/README.md).
- **Task in background e delivery**: coda generica in-memory (`IBackgroundTaskQueue` + hosted service, scope DI per task) per il pattern "POST risponde subito `202` → lavoro lungo → notifica a fine task", con un `IDeliveryService` che di **default consegna in realtime e stop** (niente email a sorpresa se l'utente è offline) e, su richiesta con `Auto`, aggiunge il **fallback email** quando il destinatario non è connesso.
- **Integrazioni con servizi esterni**: schema pronto sia per chiamare API di terze parti (client HTTP tipizzato, URL/chiavi in configurazione, mai hardcoded) sia per ricevere webhook in ingresso (endpoint pubblico con verifica della firma sul body grezzo, elaborazione in background). Dettagli in [backend/README.md](backend/README.md).

---

## 🎬 La demo del template (la vetrina)

Tutto ciò che il template mostra "di fabbrica" è **demo**: esiste per far vedere il giro completo (UI → servizi → API → store), e il progetto figlio la **riusa, non la rottama** — tiene la struttura (file, servizi, endpoint) e ne cambia il contenuto. La chiave di lettura è semplice: ciò che non si modifica sta nell'Engine; tutto il resto sta nel template apposta perché il figlio lo faccia suo. Il catalogo degli esempi abita qui, non nei README di progetto: quelli sono direttive di implementazione e raccontano ciò che i figli ereditano e usano, niente di più.

> **Riusare o partire puliti — lo decidi al `setup`.** La cerimonia di init (`node setup.mjs "Nome"`) chiede `[s/N]`:
> - **`N` → riusi la demo** (la via descritta qui sopra): tieni struttura, file, servizi ed endpoint e ne cambi il contenuto. La demo resta un esempio vivo finché vuoi.
> - **`s` → parti pulito** (*eject*): il setup rimuove la demo (galleria Social + store/SiteService, home svuotata, `addon` azzerati, `BaseController` ridotto a vuoto, `identity.json` azzerato a scheletro), elimina **questa vetrina** e fa un commit `init <Nome>`. Resta lo scheletro Home + pagine legali, l'identità servita dall'Engine, login spento, pronto a crescere.
>
> In entrambi i casi l'**Engine resta intatto**: cambia soltanto *da dove* parte il tuo dominio — demo riusabile o foglio bianco. La demo non è un peso da subire: è il banco di prova del template (esercita ogni feature) e, finché la tieni, il tuo esempio di riferimento.

### La home (`frontend/src/app/pages/home/`)

Una pagina-vetrina che esercita i componenti e i servizi dell'Engine, sezione per sezione:

| Sezione | Cosa fa vedere |
| :--- | :--- |
| **Azioni** | Componenti autonomi di azione (copia, condivisione, sintesi vocale, download, stampa, PDF) e di contatto (mail, telefono, WhatsApp, Telegram, social) |
| **Generatori** | Anteprima Markdown live (pipe `markdown`) e generazione immagini da testo (`[appImgRender]`) con menu contestuale custom (`[appContextMenu]`) |
| **QR Code** | QR multi-formato: testo, WhatsApp, email, Wi-Fi, bonifico SEPA (`[appQrContent]`) |
| **Notifiche** | Modali alert / conferma / form di `NotificationService` |
| **Sistema** | Palette tema OKLCH a runtime, i18n, chiamata API con filtro (`GET /social`), asset resolver con resize server-side |

Due dettagli da non perdere:
- **La demo si auto-documenta:** entrando col login demo (`admin` / `Password1!`) ogni sezione mostra accanto lo snippet di codice che la implementa.
- **Idratazione incrementale dal vivo:** le sezioni sotto la piega (QR, Notifiche, Sistema) sono blocchi `@defer (hydrate on viewport)` — il pattern documentato in [frontend/README.md](frontend/README.md), qui in funzione.

### I controller demo (`backend/Controllers/`)

| Controller | Endpoint | Cosa fa vedere |
| :--- | :--- | :--- |
| `BaseController` | `GET /social[?nomi=...]`, `POST /notifications/demo/ping[?message=...]`, `POST /tasks/demo/import[?email=...]` | La galleria social demo (filtro di dominio d'esempio: se il client ha lo stream attivo — header `X-Connection-Id` — consegna anche una notifica realtime via `IDeliveryService`, canale di default), il ping del canale realtime e la demo del pattern task-lungo → notifica/email |
| *(Engine)* `EngineIdentityController` | `GET /identity` | **Non è demo:** l'Engine serve l'identità del sito (legale + social brand + tipo entità) da `data/identity.json`, sorgente unica di footer, pagine legali e SEO. Il figlio riempie solo il file (o sostituisce `IIdentityStore` via DI); file assente → risposta `null` |
| `AuthController` | `POST /auth/login` | Login demo a credenziali fisse → emissione JWT con payload di sessione |
| `ProtectedController` | `GET /ping` | Endpoint riservato: API key + JWT obbligatori |
| `BlobController` | `GET /blob/{slug}`, `POST /blob/up` | Upload/download di file sul volume persistente (è anche uno strumento di fabbrica: il contratto sta in [backend/README.md](backend/README.md)) |

Sono segnaposto i **dati demo** (`backend/data/social.json`, galleria social), i testi legali di esempio (`frontend/src/assets/legal/`) e le credenziali del login: i file restano dove sono e con lo stesso nome, il figlio ci scrive dentro i **propri** dati. L'**identità** del sito (`backend/data/identity.json`) è invece la parte non-demo: legale + social del brand + tipo entità in un solo file, servito dall'Engine su `GET /identity`. I pezzi facoltativi si lasciano **non valorizzati** e l'Engine fa il resto — senza social il footer nasconde da sé la sezione, senza identità (`identity.json` assente → `null`) footer e blocco legale spariscono del tutto. Il blocco identità del footer è la **parte legale** del sito: nei figli si adatta l'estetica e si tolgono i pezzi facoltativi (i social), non le informazioni legali.

---

## 🧪 Test Suite Automatica

Sei controlli di qualità, zero da ricordare a mano: la CI (GitHub Actions) li esegue da sé a ogni push e pull request.

| Controllo | Cosa verifica |
| :--- | :--- |
| `lint-check.sh` | Qualità del codice Angular (ESLint) |
| `i18n-check.sh` | Chiavi di traduzione mancanti o non usate |
| `tsc-check.sh` | Errori TypeScript (type safety) |
| `circular-deps-check.sh` | Dipendenze circolari tra moduli |
| `a11y-test.sh` | Conformità WCAG (accessibilità) |
| `lighthouse-test.sh` | Performance budget (Core Web Vitals) |

> Sono i controlli di **norma e qualità** che un progetto figlio deve rispettare (accessibilità, performance, traduzioni complete, niente dipendenze circolari, tipi corretti). I test unitari restano un'attività privata di ogni progetto: il template eredita ai figli questi controlli di norma e qualità, niente altro.

Dove e come girano:
- **In CI:** in automatico a ogni push e pull request (`.github/workflows/`). È il gate ufficiale.
- **On-demand, in locale:** `./scripts/test/run-all.sh` dalla root del progetto (i test live a11y/Lighthouse girano soltanto se è attivo un server da testare).

> **Nota sul deploy:** la rete di sicurezza di `deploy.sh` è semplice e mirata: il lint Angular gira dentro la build Docker (un errore blocca subito la build) e la pubblicazione (`docker compose up -d --wait`) parte soltanto se i container diventano sani (HEALTHCHECK). La suite completa resta demandata alla CI. Vedi [DOCKER_README.md](DOCKER_README.md).

### Supply chain

Oltre alla qualità del codice, la CI tiene d'occhio anche:
- **Pacchetti vulnerabili:** `npm audit` (frontend) e `dotnet list package --vulnerable` (backend) a ogni push/PR.
- **Segreti committati per sbaglio:** scansione **gitleaks** (rinforza l'architettura "segreti fuori da git").

---

## 🚀 Quick Start

Per il primo setup passo-passo (`setup.mjs` + Docker) vedi **[QUICKSTART.md](QUICKSTART.md)**. Qui sotto l'alternativa per chi sviluppa in locale senza Docker; per i riferimenti completi vai alla **Mappa della documentazione** in cima a questo file.

### Avvio Veloce in Locale

La versione Node di riferimento è dichiarata in `.nvmrc` (Node 24 LTS): con nvm basta `nvm install && nvm use`; la CI legge lo stesso file.

**Avvio Backend (.NET 9):**
```bash
cd backend
dotnet run
```
*Espone di default `/health`.*

**Avvio Frontend (Angular 21):**
```bash
cd frontend
npm install
npm run start
```
*Si connette in automatico al backend sulla porta di default tramite proxy. In alternativa `./start-frontend-dev.sh` dalla root fa `npm install` + avvio in un colpo unico (con `BACKEND_ORIGIN` già impostato per l'SSR locale).*
