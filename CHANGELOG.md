# Changelog

Cosa cambia nel template tra una versione e l'altra. Per un figlio: cosa aspettarsi al merge dal template.

## [Non rilasciato]

### Nuovo check CI: invarianti statiche di SiteBuilder

Un template con potenzialmente migliaia di figli eredita ogni comportamento di `siteBuilder.ts` senza rete di sicurezza propria: una regressione lì (es. un merge futuro che tocca la logica di `getAuditPaths()`) non aveva alcun modo di essere scoperta prima che un figlio la trovasse a runtime o notasse la CI più lenta.

- Nuovo `frontend/src/app/core/engine/scripts/checks/site-builder-invariants.ts` (eseguito via `tsx`, stesso pattern di `generate-statics.ts`): costruisce `ContestoSito` come farebbe l'SSR e verifica due invarianti opposte sullo stesso dato — `getAuditPaths()` deve restare alla sola lingua di default (vedi voce sotto su "Audit live"), mentre `getSitemapEntries()` deve coprire TUTTE le lingue configurate (hreflang). Nessun server necessario, gira in pochi secondi.
- Nuovo `scripts/test/site-builder-check.sh` (wrapper, stesso stile di `tsc-check.sh`/`i18n-check.sh`), aggiunto a `run-all.sh` e al job "frontend" della CI, subito dopo la generazione di `environment.ts`.
- Verificato: rotto deliberatamente `isLiveAuditEndpoint` in `siteBuilder.ts` (forzato a `true`) per confermare che il check lo intercetta (9 fallimenti riportati, uno per path in lingua non-default), poi ripristinato — torna verde.

### Lighthouse: rimossa la categoria `accessibility`, ora la copre solo Pa11y (axe-core + HTML_CodeSniffer)

Le due categorie duplicavano parzialmente la verifica di accessibilità di ogni pagina: `a11y-test.sh` (Pa11y) girava già con l'elenco puntuale delle violazioni WCAG 2.1 AA, mentre la categoria `accessibility` di Lighthouse — basata anch'essa su axe-core, un sottoinsieme delle stesse regole — restituiva solo uno score 0-100 contro una soglia (80), senza dire dove intervenire.

- `pa11y.json`: aggiunto `"runners": ["axe", "htmlcs"]` (pa11y di default usa solo `htmlcs`) — stessa copertura di regole di Lighthouse (axe-core) più HTML_CodeSniffer, con violazioni puntuali per entrambe invece di un punteggio cieco.
- `lighthouse.json`: rimossa la soglia `accessibility`.
- `lighthouse-test.sh`: rimossa `accessibility` da `--only-categories` — un audit in meno da calcolare per pagina, tempo di CI ridotto.
- `pa11y.json`: aggiunto `"levelCapWhenNeedsReview": "warning"`. Aggiungere axe ha scoperto che axe-core, quando NON riesce a determinare con certezza lo sfondo effettivo di un elemento (tipicamente per una sovrapposizione con un elemento `position: fixed` a schermo intero come lo smoke-effect decorativo del template), marca `color-contrast` come "incomplete"/`needsFurtherReview` — un "non sono sicuro, verifica a mano", non una violazione confermata. Senza questo cap, pa11y la promuove comunque a `error` in base al solo impact e blocca la CI su falsi allarmi (verificato: 3 falsi allarmi sulla home del template sparivano esattamente con questo cap, mentre restano intatti quando è una violazione VERA — vedi punto sotto). Le violazioni confermate (`needsFurtherReview: false`) restano `error` e bloccano CI come prima.
- **Trovato durante la verifica, e corretto**: axe con questo cap ha comunque trovato una violazione REALE e confermata su `/policy/accessibilita` — un link con contrasto 4.17:1 (sotto la soglia 4.5:1 AA), causato da un'interazione fra il sistema di temi e Bootstrap. Il pannello "sottotema" (`[attr.data-bs-theme]` su `.content-panel`, usato per forzare chiaro/scuro indipendentemente dal tema di pagina — vedi `app.component.html`/`theme.service.ts`) fa sì che Bootstrap ri-dichiari `--bs-link-color-rgb` al proprio valore di stock (`#0d6efd`/`13, 110, 253`), perché `theme-bridge` in `_lib.scss` sovrascriveva `--bs-link-color` (hex) ma non la variante `-rgb` che il CSS compilato di Bootstrap usa DAVVERO per il colore del testo dei link (`a { color: rgba(var(--bs-link-color-rgb), ...) }`) e per il loro hover. Fuori da un sottotema nidificato il colore restava corretto (l'inline style di `ThemeService` su `<html>` non passa da questo percorso) — il bug colpiva solo i link dentro pannelli/navbar a tema forzato, che è esattamente dove sta il link incriminato.
  - **Fix** (solo Engine, `frontend/src/app/core/engine/`, nessun cambio richiesto ai figli): `theme.service.ts` espone ora due nuove coppie di token fissi Lt/Dk — `--colorLinkRgbLt/Dk` e `--colorLinkHoverRgbLt/Dk` (stesso pattern già usato per `--colorSecondaryRgbLt/Dk`, `--colorHeadingRgbLt/Dk` ecc. — un'asimmetria che mancava solo per Link); `theme-bridge` in `_lib.scss` li ribinda su `--bs-link-color-rgb`/`--bs-link-hover-color-rgb` per ogni subtheme `[data-bs-theme]` nidificato, esattamente come già faceva per la variante hex.
  - Verificato con backend/frontend reali (build via `dotnet build`/`ng build`, avviati in locale con `dotnet run` + Node): `/policy/accessibilita` torna 0 violazioni; il colore del link resta corretto anche forzando `prefers-color-scheme: dark` sull'OS con il pannello forzato-chiaro (verificato via `getComputedStyle`, non solo visivamente).
  - Le altre due anomalie viste in un run CI reale (`aria-hidden-focus` su 3 pagine `/social-feed/*`, `color-contrast` su `#qrType` in `/che-faccio`) **non si sono ripresentute** ripetendo l'intera suite (41 pagine, backend .NET reale con tutti e 32 i social configurati) né isolando quelle pagine 3 volte di fila: coerente con l'ipotesi che fossero anch'esse `needsFurtherReview` di axe, già assorbite dal cap sopra, non bug di contenuto.

### Audit live (Pa11y/Lighthouse): solo lingua di default, `/health` rinomina `a11yPaths` → `auditPaths`

Con N lingue configurate, `a11y-test.sh`/`lighthouse-test.sh` auditavano ogni pagina UNA VOLTA PER LINGUA (es. 19 pagine statiche × 2 lingue = 38 URL): tempo di CI moltiplicato per il numero di lingue senza guadagno reale, perché le varianti-lingua di una stessa pagina condividono template/markup/componenti — cambia solo il testo tradotto, e un audit di accessibilità o performance dà lo stesso esito in ogni lingua.

- `siteBuilder.ts`: `getAuditPaths()` ora include solo le pagine nella lingua di default (`Localization.DefaultLanguage`) — filtro applicato dove le pagine SSR pubbliche vengono raccolte per l'audit (nuova condizione `isLiveAuditEndpoint`, nome scelto per riflettere che l'elenco serve a verificare endpoint pubblici in CI, non necessariamente presenti in sitemap: una policy `noindex` resta pubblica e va comunque auditata). Sitemap/SEO restano invariati: coprono tutte le lingue per l'hreflang, dominio distinto da questo.
- `discover-audit-paths.cjs`: le URL dinamiche prese da `/sitemap.xml` (pagine con `dynamicParams`, enumerate dal backend) sono filtrate allo stesso modo, leggendo `Localization.DefaultLanguage`/`SupportedLanguages` da `global-settings.json` (stessa fonte di verità di `i18n-check.sh`).
- `/health` **rinomina `a11yPaths` → `auditPaths`**: il vecchio nome sottintendeva solo l'accessibilità, ma l'elenco alimenta anche Lighthouse (performance/best-practices/SEO).
- **Breaking per chi legge `/health` direttamente** (script esterni, monitoraggio custom che leggono il campo per nome): aggiornare il riferimento da `a11yPaths` ad `auditPaths`.
- Verificato: build di produzione frontend (type-check incluso); `/health` su un'istanza locale conferma l'elenco ridotto alla sola lingua di default (nessun path con prefisso `/en/...`).

### Menu header/footer: da `site.ts` (build-time) a `nav.ts` (dato, risolto a runtime)

`headerNav`/`footerNav` vivevano dentro `buildSite()`, eseguiti una volta sola, in modo sincrono, al caricamento del modulo — insieme a `PageType`/`pageMap`/`routes`, che DEVONO restare così (Angular vuole `routes` statico al bootstrap). Ma quali voci mostrare in header/footer, in che ordine, con che etichetta, non è struttura del sito: è un dato, potenzialmente diverso per utente loggato o gestito da un pannello admin — e la forma sincrona non lasciava spazio per collegarlo a un'API.

- `SiteDefinition.headerNav`/`footerNav` **rimossi**. Il menu si dichiara ora in un nuovo file `frontend/src/app/nav.ts` (parallelo ad `app.pages.ts`), come `ShellNavResolver` (tipo esportato da nuovo `core/engine/shell-nav.ts`): stesso builder `addPage`/`addLink`/`addGroup` di prima, ma la callback può essere `async` — un progetto che vuole un menu dipendente da un'API scrive una callback che fa `await` (fetch, `inject(ApiService)` dentro la callback compreso) e usa `addPage(pageType, { params, label })` per un'etichetta libera per istanza (es. "preferiti" con lo stesso `PageType` e `:slug` diversi, un nome prodotto al posto del titolo generico della pagina). `addLink` resta per URL esterni (avviso in dev-mode se usato con un path interno).
- Nuovo `ShellNavService` (Engine, `providedIn: 'root'`): risolve `header`/`footer` UNA volta sola, condivisa da `NavbarComponent` e `FooterComponent` (prima erano due letture indipendenti della stessa `Map` precalcolata — con un resolver che può chiamare un'API, farlo due volte sarebbe stato sbagliato). Il resolver effettivo arriva da un nuovo token `SHELL_NAV_RESOLVER`, fornito da `nav.ts` in `app.config.ts` (default Engine: nessuna voce, innocuo se non fornito — stesso pattern di `LEGAL_FILE_READER`).
- Risoluzione attesa da un `provideAppInitializer` (bootstrap, sia SSR che browser) **prima** che qualunque componente si costruisca: `NavbarComponent` legge il menu anche in un field initializer sincrono (`altroDropdownIndex`), deve già essere pronto al primo render. Cambio lingua (client): ri-risolve in automatico, reattivo. `TransferState` evita il doppio fetch fra SSR e idratazione (stesso pattern di `LOCALE_CONFIG`).
- Verificato end-to-end: un resolver `async` di prova (footer coi primi 10 social presi da un vero endpoint via `inject(ApiService)`) ha funzionato al primo colpo in Docker, nessun crash, nessun doppio fetch — poi ripristinato alla dichiarazione statica di demo.
- **Breaking per ogni figlio con `headerNav`/`footerNav` in `site.ts`:** al merge, `buildSite({ headerNav: ..., footerNav: ... })` non compila più (proprietà sconosciute). Migrazione: sposta il corpo delle due callback in un nuovo `nav.ts` come `ShellNavResolver.header`/`.footer` (stessa sintassi `addPage`/`addLink`/`addGroup`, invariata), collega il resolver in `app.config.ts` con `{ provide: SHELL_NAV_RESOLVER, useValue: navResolver }`. `setup.mjs` (eject) aggiornato di conseguenza: scrive anche uno scheletro `nav.ts` vuoto.
- **Fix collaterale trovato testando in Docker**: `NavbarComponent.recomputeOverflow()` chiamava `isDesktopViewport()` (solo-browser per contratto) da un `effect()` mai guardato per SSR — prima "vinceva la gara" con la serializzazione della risposta, il ritardo del nuovo `provideAppInitializer` gli ha dato il tempo di scattare in SSR, `ReferenceError: window is not defined`, l'intero render andava in crash. Aggiunta la guardia `isPlatformBrowser` che il resto dei componenti già usava per lo stesso motivo.
- **Fix collaterale nel setup.mjs (eject)**: lo scheletro minimo generato aveva già due gap indipendenti da questa modifica, trovati testando l'eject end-to-end (build su copia scartabile): un blocco che ripuliva un `case Social` in un `content.resolver.ts` che non esiste più a quel path da una sessione precedente (spostato in Engine, rimosso), e nessuna cancellazione di `app.pages.ts`/`pages/che-faccio` — dopo l'eject, `app.pages.ts` restava con un import morto verso `./social/social.component` (cancellato), build rotta. Aggiunta anche la riscrittura di `pages/policy/legal.pages.ts` a scheletro vuoto (già presente come gap scorrelato): senza, il `PageType` ristretto del nuovo `site.ts` minimale non tornava più coi suoi `pageType` letterali.
- Verificato: build di produzione frontend (type-check incluso), lint, i18n-check e circular-deps-check puliti; `dotnet build` backend pulito; eject (`setup.mjs`) testato end-to-end su una copia scartabile del repo, build pulita fino in fondo.

### `sitemap.xml`: da file generato al build a endpoint runtime, con pagine dinamiche (`dynamicParams`)

Il builder poteva enumerare solo le pagine dichiarate staticamente in `site.ts`: una rotta parametrica con un solo `PageType`/componente per N elementi di un catalogo backend (es. `/prodotti/:slug`) non aveva mai un momento di build in cui elencare gli slug reali, e restava fuori da `sitemap.xml` — un limite architetturale noto, non solo un buco di copertura.

- `public/sitemap.xml` **non è più generato da `generate-statics.ts`**: `sitemap.xml` è ora un endpoint (`GET /sitemap.xml`, `server/routes/dynamic-sitemap.ts`), montato nel Node SSR prima dello static handler. Stessi calcoli di prima (ora in `services/sitemap-xml.ts`, condiviso) più l'espansione delle pagine con `dynamicParams` dichiarato (nuovo campo opzionale di `LeafPageInput`: una funzione che recupera dal backend l'albero `SlugNode[]` degli slug accettati per una rotta con `:segmenti`).
- Cache in-process con TTL (default 7 giorni, `SITEMAP_CACHE_TTL_MS`) invalidata on-demand dal backend: nuovo `SitemapNotifier` (Engine, backend) fa un `POST /internal/revalidate-sitemap` dopo una scrittura su un catalogo `dynamicParams` — un figlio lo richiama con `Sitemap.NotifyChangedAsync()` dai propri controller (proprietà ambient su `EngineApiController`, stesso schema di `Delivery`/`Crypto`). Spento finché `Frontend.Origin` non è configurato (nuova `FrontendOptions`, sezione `Frontend` di `global-settings.json`); `docker-compose.yml` del template la valorizza già (`Frontend__Origin=http://frontend:3000`).
- `<priority>`/`<changefreq>` **rimossi**: Google li ignora da anni, restavano solo peso morto. `<lastmod>` non fa più fallback su `project.lastModified` (una data identica su ogni URL, segnale che Google finisce per ignorare come inattendibile): ora è emesso solo dove verificabile per-entità (`SlugNode.lastModified` sul nodo foglia di una pagina dinamica) e **omesso** altrove — anche per le pagine statiche, che prima lo portavano sempre.
- **Breaking, solo se l'infrastruttura di deploy assume `sitemap.xml` come file statico**: un reverse proxy/CDN con una regola dedicata per servire `/sitemap.xml` direttamente da `public/` (bypassando il Node SSR), o una cache "immutabile" su tutto `public/**`, smette di funzionare — il file non esiste più, la richiesta va al Node SSR. Il template stesso non ha questo problema (`public/` non è mai stata esposta direttamente, sempre servita dal Node SSR), ma un figlio con un'infrastruttura di deploy personalizzata va verificato.
- Verificato: `dotnet build` backend (0 warning, 0 errori); build di produzione frontend (type-check incluso), lint, i18n-check e circular-deps-check puliti.

### `ContentResolver`: switch centralizzato sostituito da `contentLoader` per pagina

`ContentResolver.loadResolved()` era un file di Dominio "a contratto fisso": ogni pagina con dati SEO-critici al primo render richiedeva un nuovo `case` nel suo switch — un file unico che ogni figlio doveva estendere a mano, e che l'Engine importava per path/nome nonostante vivesse nel Dominio (l'unica voce di quel tipo nell'elenco "Dominio a contratto fisso").

- `contentLoader` (nuovo campo opzionale di `LeafPageInput`, stesso posto di `dynamicParams` in `pages/*.pages.ts`): ogni pagina porta la propria logica di fetch, invece di un `case` in un file condiviso.
- `ContentResolver` è ora generico (zero `PageType` conosciuti, gestisce solo le pagine legali in modo trasversale) e si è **spostato da `pages/content.resolver.ts` (Dominio) a `core/engine/pages/content.resolver.ts` (Engine)** — non è più un file di Dominio "a contratto fisso": rimosso dall'elenco in README.md.
- **Breaking per ogni figlio che ha aggiunto `case` al vecchio switch:** al merge, `pages/content.resolver.ts` del figlio confligge con la rimozione del file (o resta silenziosamente non importato da nulla, se il conflitto si risolve prendendo la versione del template). Migrazione: sposta la logica di ogni `case` in un `contentLoader` sulla rispettiva pagina in `pages/*.pages.ts` — vedi la ricetta in [AGENTS.md](AGENTS.md#aggiungere-una-pagina) e §"Developer Journey" in [frontend/README.md](frontend/README.md).
- Verificato: build di produzione frontend (type-check incluso), i18n-check e circular-deps-check puliti.

### Pagine legali standard: `noindex` di default

Le 5 pagine legali standard (privacy/cookie/termini/note legali/accessibilità) finivano nella sitemap e restavano indicizzabili come una pagina di contenuto qualunque — crawl budget speso su pagine di servizio che non portano traffico di ricerca.

- `buildPolicySection` (`legal/legal-pages.ts`) ora dichiara le pagine legali gestite dall'Engine con `otherSEO: { noindex: true }`: fuori da `sitemap.xml` e marcate `X-Robots-Tag: noindex, nofollow` a runtime, di default.
- **Breaking per i figli già live che le vogliono indicizzate** (raro, ma capita: alcuni preferiscono indicizzare la propria Privacy Policy): al merge, le 5 pagine legali standard spariscono dalla sitemap e diventano `noindex` silenziosamente. Chi le vuole indicizzate dichiara la pagina a mano in `pages` col proprio `PageType` e `otherSEO: { noindex: false }` (override standard: `filterManagedLegalPages` esclude dall'auto-gestione ogni `PageType` già dichiarato dal figlio).
- Verificato: build di produzione frontend (type-check incluso) pulita.

### `path` per-lingua in `site.ts` (URL localizzati non solo prefissati)

Con più lingue configurate, il `path` di una pagina interna era sempre lo stesso segmento sotto ogni prefisso (`/en/chi-siamo`, mai `/en/about-us`) — un limite esplicitamente documentato come "non supportato oggi" in frontend/README.md.

- `BasePageInput.path` accetta ora, oltre alla stringa (comportamento storico, resta il default), un oggetto `{ tagLingua: segmento }` (es. `{ it: 'chi-siamo', en: 'about-us' }`): un segmento diverso per lingua. Una lingua del sito senza una propria chiave ricade sul segmento della lingua di default.
- Nuovo `resolvePagePath()` (`siteBuilder.ts`), unico punto di risoluzione, usato sia da `routing.ts` (rotta Angular reale) sia da `processPages()` (menu/sitemap/hreflang): le due chiamate producono per costruzione lo stesso path per la stessa pagina+lingua.
- Link a una voce concreta di una rotta parametrica (`NavItemOptions.params`/`appPageParams`) e query string separate dal path (`NavItemOptions.queryParams`/`appPageQueryParams`) — necessari per collegare in menu/link una singola entità di una pagina con `dynamicParams` senza ricostruire il path a mano.
- Fix: i tag `<link rel="alternate" hreflang>` che l'Engine emette automaticamente su ogni pagina (`PageMetaService`) risolvevano correttamente le lingue solo per un `PageType` senza `:segmenti` — su una pagina parametrica (es. `/social-feed/instagram`) puntavano al template letterale non risolto (`/social-feed/:slug`), individuato testando `dynamicParams` end-to-end in Docker. Stesso trattamento già applicato a `[appPage]`/`NavbarComponent` (`applyPathParams` sui param di rotta correnti); la logica di merge dei param (root→foglia) è ora condivisa (`mergeRouteParams` in `routing.ts`) invece che duplicata.
- Non breaking: chi non usa la forma a oggetto non nota differenze.
- Verificato: build di produzione frontend (type-check incluso), lint, i18n-check e circular-deps-check puliti; `dotnet build` backend pulito; stack Docker Compose completo (backend+frontend) testato end-to-end con test avversativi su sitemap.xml, hreflang, pagine dinamiche `dynamicParams` e path per-lingua.

### `.text-bg-primary`/`.text-bg-secondary`: testo bianco fisso invece del brand

Bootstrap compila `.text-bg-primary`/`.text-bg-secondary` con `color: #fff !important` fisso (contrastato contro il SUO grigio di default a build-time), ignorando `--colorPrimaryText`/`--colorSecondaryText` che ThemeService calcola apposta per lo sfondo brand runtime — un commento in `_bootstrap-theme.scss` assumeva (erroneamente) che le due cose coincidessero già. Su un brand con secondary chiaro/medio il bianco fisso scende sotto AA (verificato: 2.85:1 nel catalogo Design System di un figlio).

- `.text-bg-primary`/`.text-bg-secondary` ora usano `var(--colorPrimaryText)`/`var(--colorSecondaryText)` invece del bianco fisso di Bootstrap.
- Verificato: build di produzione frontend pulita.

### Catalogo Design System in home, spostato nell'Engine (sopravvive all'eject)

La home demo esercita ogni funzionalità dell'Engine, ma resta pensata per chi legge codice: niente di consultabile da chi valuta l'aspetto di un sito (designer, Art Director) senza login né lettura del sorgente — e comunque, essendo demo Dominio, sarebbe sparito del tutto con `setup.mjs` → eject, insieme al resto.

- Nuovo `app-design-system-gallery` (`core/engine/components/design-system-gallery/`): catalogo visivo sempre presente di colori, tipografia, bottoni, badge, alert e form — nessun gate di login, a differenza delle altre sezioni della home demo.
- Vive nell'Engine e non in `components/shared/**` (che è Dominio) apposta: sopravvive all'eject, `setup.mjs` monta il componente anche nella home minimale del progetto "pulito".
- Le sue stringhe i18n vivono in `basic.{lang}.json` (Engine, mai azzerato) invece che in `addon.{lang}.json` (Dominio, azzerato dall'eject), per lo stesso motivo.
- Verificato: build di produzione frontend (type-check incluso), lint, i18n-check e circular-deps-check puliti.

### Titolo del browser non tradotto sulle pagine d'errore

Le rotte `error/:errorCode` e `**` (routing.ts) impostavano una `title` nativa di Angular (`'erroreGenerico'`), mai passata dal servizio di traduzione: il tab del browser mostrava la chiave i18n grezza invece del testo ("erroreGenerico" anziché "Pagina non trovata | AppName"), a differenza di ogni altra pagina del sito.

- Rimossa la `title` statica dalle due rotte. `ErrorComponent` ora imposta `document.title` da sé (tradotto, stesso formato `"{titolo} | {appName}"` delle altre pagine), riusando il `Title` di `@angular/platform-browser` invece della `PageMetaService` completa (le pagine d'errore sono `noindex`, non serve canonical/OG/structured data).
- Verificato: build di produzione frontend, `/error/404` (wildcard) ed `/error/500` mostrano il titolo tradotto sia in italiano che in inglese.

### Falsi positivi intermittenti nel test di accessibilità (color-contrast in concorrenza)

`a11y-test.sh` con `A11Y_CONCURRENCY` di default (3) segnalava a intermittenza un contrasto ~1.09:1 su elementi di testo della navbar (dropdown di sezione, selettore lingua) — sempre lo stesso rapporto, su una pagina diversa a ogni run, anche in configurazioni dove il colore è verificabilmente corretto.

- Non è un bug dei colori: verificato leggendo `getComputedStyle` dal vivo sugli stessi elementi, in tema chiaro e scuro, senza mai riprodurre il problema. Riproducibile solo dentro pa11y, e solo con 3+ pagine auditate in parallelo nello stesso browser Puppeteer condiviso — con concorrenza 2 il problema non si è più presentato su multiple run ripetute.
- `A11Y_CONCURRENCY` di default abbassato da 3 a 2 in `a11y-test.sh`. Aggiunto anche un piccolo `wait` (400ms) in `pa11y.json` come margine extra dopo il caricamento, indipendente dalla causa reale ma innocuo.
- Verificato: `a11y-test.sh` su 3 progetti (template + 2 figli), più run ripetuti a concorrenza 2, sempre stabile.

### Error reporting via webhook (`IErrorReportingService`)

Un bug in produzione, di norma, lo scopri solo leggendo i log a mano. Serviva un modo per farsi avvisare senza dover installare l'SDK di un vendor specifico (Sentry e simili) solo per quello.

- Nuovo `IErrorReportingService` (`Engine/ErrorReporting/`): un `POST` JSON verso un webhook a scelta (`ErrorReporting.WebhookUrl` in `global-settings.local.json`, vuoto = spento) per ogni eccezione non applicativa (un bug vero) o applicativa con status ≥500 — mai un 4xx, traffico normale. Nessun pacchetto NuGet in più: solo `HttpClient` via `IHttpClientFactory`, stesso schema del mailer.
- Chiamato già da `ApiExceptionHandler`, non a mano: accodato su `IBackgroundTaskQueue` con uno snapshot immutabile (`ErrorReport`) costruito sincronamente — mai la `HttpContext` live dentro un task in background, che Kestrel ricicla subito dopo la risposta.
- Il payload porta `project` (da `project.name`): pensato per più progetti sulla stessa VPS che condividono un solo webhook/relay, restando comunque distinguibili.
- Deliberatamente un webhook generico, non un client nativo per un vendor specifico: a differenza di SMTP, il formato di ingestione di un APM (Sentry incluso) non è uno standard — legarlo dentro l'Engine vorrebbe dire far ereditare a ogni figlio il rischio che quel vendor cambi la sua API privata. Chi vuole un vendor specifico scrive un piccolo relay di traduzione fuori dal template, riusabile su tutti i propri progetti.
- Verificato: `dotnet build` (0 warning, 0 errori).

### Checklist di pre-lancio incorporata negli script di deploy

Un documento "cosa non dimenticare prima di andare live" è utile solo se qualcuno lo riapre il giorno del deploy vero — di norma non succede. Il promemoria vive quindi dentro lo script che lancia davvero la pubblicazione, accanto ai guard sui segreti già esistenti.

- Nuova `br1_content_placeholder_warnings` (`scripts/lib/br1-config.sh`), condivisa da `deploy.sh` e `deploy-release.sh`: avvisa, senza bloccare, se `project.name` è ancora il default `"App"` o se `backend/data/identity.json` è ancora lo scheletro vuoto lasciato dall'eject. `deploy-release.sh` verifica solo `project.name`: modello artifact-based, niente sorgente sulla VPS, `identity.json` non c'è da controllare.
- Non bloccante di proposito: sono stati finali legittimi in alcuni casi (`identity.json` vuoto nasconde da solo footer e blocco legale, vedi `README.md`).
- Verificato a mano contro dati segnaposto e dati reali del repo (nessun falso positivo/negativo).

### Cookie tecnici: separati in `Technical` (sempre esenti) e `TechnicalOptional` (PWA/SW, consenso vero)

La categoria `Technical` copriva due cose diverse sotto lo stesso nome: i cookie strettamente necessari (sessione, memoria del consenso), esenti da consenso per legge (art. 122 Codice Privacy / art. 5.3 ePrivacy), **e** il Service Worker/PWA built-in, che invece va oltre il minimo necessario (installabilità/offline) ed è tecnico ma non indispensabile. Il banner mostrava comunque uno switch su "Technical" per il caso PWA: uno switch su qualcosa di dichiarato esente per legge è un'incoerenza legale, non solo terminologica.

- Nuovo valore enum `ConsentCategory.TechnicalOptional`: il Service Worker (`ngsw-worker.js` in `ENGINE_COOKIE_MAP`) e gli eventuali cookie tecnici-ma-non-indispensabili di progetto ora vivono qui, con switch esplicito nel banner — stesso trattamento di Analytics/Profiling (proprio signal, propria voce `CONSENT_KEYS`/`CONSENT_COOKIE_MAP`, propria pulizia alla revoca).
- `Technical` resta solo per ciò che è davvero strettamente necessario: mai uno switch, solo un badge informativo ("Necessari" — prima "Obbligatorio"/"Required", cambiato per riflettere che l'utente non ha scelta, non che sia un obbligo generico). `isCategoryAccepted(Technical)` ora ritorna sempre `true`, senza condizioni: prima era legato a un signal che, per come `hasTechnicalCategory` è composto (bearerToken/cookie di progetto entrano in `_cm` per vie che quel computed non copre tutte), poteva in teoria bloccare in silenzio la scrittura di un cookie Technical built-in futuro — oggi non successo solo per l'incrocio di più guardie indipendenti (`TokenService`/`ESSENTIAL_ENGINE_STORAGE_KEYS`), non per garanzia esplicita.
- Nuovo `hasTechnicalCategory()` (banner/policy: "c'è qualcosa da dichiarare in Technical?") separato da `isTechnicalOptionalNeeded()` (banner: "serve un vero consenso in TechnicalOptional?") — prima un unico `isTechnicalNeeded()` confondeva le due domande.
- **Breaking per i figli con `COOKIE_MAP` proprio:** una voce che oggi usa `ConsentCategory.Technical` ma NON è strettamente necessaria (va oltre il minimo per erogare il servizio) va spostata a `ConsentCategory.TechnicalOptional` — altrimenti finisce dichiarata come esente per legge quando non lo è. Rinominata anche la chiave i18n `consentTechnicalDescrizioneListaCookie` → `consentTechnicalOptionalDescrizioneListaCookie`.
- Verificato: `dotnet build` non tocca quest'area (frontend-only); build di produzione frontend (type-check incluso) pulita.

### Identità: `titolareDelTrattamento` (GDPR art. 4.7) e `responsabileProtezioneDati`/DPO (GDPR art. 37)

Due nuovi campi opzionali di `SiteIdentity`, entrambi `LegalRole { Nome, Email }`, resi nel footer/pagine legali dallo stesso `IdentityRenderComponent` che già rende ragione sociale/sede/rappresentante legale. Nessun fallback automatico su nessuno dei due: nella maggior parte dei siti (P.IVA singola) il titolare coincide con l'azienda stessa, già esposta da `ragioneSociale`/`contatti.email` — ripeterlo sarebbe rumore; un DPO "presunto" per chi non ne ha uno inventerebbe una carica che non esiste (la designazione è obbligatoria solo per PA/monitoraggio sistematico/dati particolari su larga scala). Assenti ⇒ nessuna riga, come già per gli altri campi opzionali dell'identità.

- Email di entrambi i ruoli validata con lo stesso `ValidEmail` (`MailAddress`) già usato per `contatti.email`/`pec` — fail-fast su un valore presente ma malformato, coerente col resto del modello identità.
- `PolicyComponent`: la Cookie Policy interpola `{{companyProfile}}` con l'identità completa (nuova sezione "Titolare del trattamento"/"Data controller" in `cookie.it.md`/`cookie.en.md`).
- Nuovo `hasIdentityContent()` (esportato da `identity-render.component.ts`): l'identità può esistere (non `null`) ma avere ogni campo vuoto — la Cookie Policy ora monta `app-identity-render` solo se c'è davvero qualcosa da mostrare, invece di riservare uno spazio vuoto.
- **Fix collaterale**: nella colonna Contatti del footer, gli orari (fino a 7 righe) sommati a email/badge allungavano quella colonna molto più delle colonne societarie/legali accanto. Spostati in una colonna a sé.
- Verificato: `dotnet build` (0 warning, 0 errori); build di produzione frontend pulita.

### Footer: pagine legali auto-derivate in una fascia "small prints", non più una voce di `footerNav`

Le pagine legali (Privacy/Cookie/TOS/Note Legali/Accessibilità) erano dichiarate a mano in `site.ts` come un `addGroup` annidato dentro `footerNav` — una colonna della griglia di navigazione, alla pari di categorie di prodotto o sezioni del sito, quando concettualmente sono un'altra cosa (small prints istituzionali, pattern già usato da footer PA/Designers Italia).

- Nuovo `BuiltSite.getLegalFooterLinks(lang)` (`siteBuilder.ts`): risolve `config.legalPages` (privacy/cookie/tos/legal/accessibility, in quest'ordine fisso) direttamente in `NavLink[]`, senza bisogno di dichiararle in `footerNav`. Uno slot omesso o una pagina rimossa da `pages` sparisce da solo dalla fascia.
- Nuovo `app-footer-link-row` (`components/footer-link-row/`): riga orizzontale compatta senza titolo, condivisa da due consumer — la nuova fascia legale in `footer.component` e i link/pagine sciolti in cima a `footerNav` (fuori da un `addGroup`), che prima occupavano una colonna intera per un solo link. `FooterNavComponent` ora separa `groups()` (colonna a sé) da `standaloneLinks()` (riga compatta).
- Nuovo `.footer-nav-groups` (`_footer.scss`): griglia fluida `auto-fit`/`minmax(160px, 240px)` al posto delle colonne Bootstrap fisse (`col-lg-2`), centrata anche con un solo gruppo — la larghezza piena lasciava un gruppo singolo sbilanciato a sinistra.
- `site.ts`/`setup.mjs` (demo + eject): rimosso il gruppo `menuPolicy` da `footerNav`, `footerNav` ora contiene solo il link libero di progetto (GitHub).
- **Breaking per i figli che personalizzano `footerNav` in `site.ts`** (file di Dominio, non toccato dal merge): chi aveva copiato lo stesso pattern (`addGroup` con le pagine legali) può rimuoverlo — le pagine legali compaiono ora comunque, nella fascia dedicata. Non è un errore lasciarlo: risulterebbe solo duplicato (una volta nella fascia automatica, una volta nella colonna di `footerNav`).
- Verificato: build di produzione frontend (type-check incluso) pulita.

### Fix: guard/resolver potevano leggere la lingua sbagliata durante la navigazione

`PageBaseComponent` allinea `TranslateService.currentLang()` alla lingua della route solo al montaggio del componente — che avviene **dopo** la fase Guard e la fase Resolve di Angular Router. Un resolver che legge `currentLang()` come fallback (`content.resolver.ts`) o un guard che ne dipende poteva quindi trovare ancora la lingua precedente durante la navigazione, non quella della route appena richiesta. `authGuard` se n'era già accorto e leggeva `route.data['lang']` invece di `currentLang()`, ma solo per sé stesso — ogni nuovo guard/resolver avrebbe dovuto reimplementare lo stesso accorgimento a mano.

- Nuovo `languageSyncGuard` (`route-guards.ts`), applicato a **ogni** route in `routing.ts` (non solo quelle protette): allinea `currentLang()` alla lingua della route (`await translate.setLanguage(lang)`) prima che qualunque guard/resolver a valle giri. Angular Router completa l'intera fase Guard prima di iniziare Resolve, quindi basta un guard qualsiasi nell'array a garantire l'ordine.
- Verificato: build di produzione frontend (type-check incluso) pulita.

### Revisione di correttezza esaustiva, per aree, su tutto il repository

Cinque revisori paralleli, ciascuno su una fetta del repo (frontend Engine, frontend Dominio/Demo, backend Engine, backend Dominio/Demo, scripts/build/config/CI), con l'istruzione di trovare solo bug reali e concreti, non di stile, e di verificare ogni doc comment sospetto con `git log -p` prima di segnalarlo. Ogni finding riportato è stato riverificato a mano contro il sorgente reale prima di applicare un fix (il pattern che aveva già smascherato la regressione di `AccountService` sopra). Sei bug reali trovati e corretti:

- **`TranslateService.setLanguage()` (frontend Engine) — race condition sul cambio lingua.** Chiamato da più punti indipendenti (mount di ogni pagina, selettore lingua nella navbar, guard di login) senza alcuna guardia di sequenza: una chiamata più vecchia poteva risolversi *dopo* una più recente e sovrascrivere `currentLang`/`<html lang>`/i cataloghi caricati con uno stato non più coerente con l'URL corrente — riproducibile con un doppio click veloce sul selettore lingua, o una navigazione rapida durante un fetch lento. Aggiunto un token di sequenza (stesso pattern di `renderToken` in `img-render.directive.ts`): la risposta di una `setLanguage()` ormai superata viene scartata invece di scrivere lo stato.
- **`BlobStore.SaveAsync(Stream, string extension, ...)` (backend Dominio) — guardia path-traversal mancante sulla scrittura.** `TryResolve` (usato da lettura/cancellazione) valida il percorso risolto contro la cartella upload; l'overload di scrittura no — costruiva `filePath` concatenando `extension` nello slug senza mai controllarlo. Con l'unico chiamante HTTP odierno (`SaveAsync(IFormFile)`, che deriva l'estensione con `Path.GetExtension`) non è sfruttabile, ma è un metodo `virtual` esplicitamente pensato per essere esteso dai progetti figli, e il doc comment della classe promette la guardia per l'intero store. Allineata la stessa validazione anche in scrittura.
- **`UploadFormComponent` (frontend Dominio) — filtro `accept` applicato solo al drag-and-drop.** `onDrop` rifiutava le estensioni non ammesse, `onFileSelected` (click) no — l'attributo HTML nativo `accept` è solo un suggerimento per il selettore del sistema operativo ("Tutti i file" lo bypassa), quindi lo stesso file scelto per click passava senza controllo mentre trascinato veniva rifiutato. Estratto un unico metodo condiviso dai due percorsi.
- **`generate-statics.ts` (build) — `SupportedLanguages: []` esplicito produceva un sito senza rotte.** Il fallback `_supportedRaw ?? [DEFAULT_LANG]` copre solo `null`/`undefined`, non un array vuoto (che lo schema JSON vieta solo sulla carta — nessuna validazione lo applica a runtime). Con `[]`, `AVAILABLE_LANGS` diventava `[]`, `routing.ts` e `siteBuilder.ts` costruiscono rotte/sitemap iterando su quell'array: zero pagine sopravvivevano (solo le route d'errore), sitemap/llms.txt restavano vuoti — un'interruzione totale e silenziosa del sito, non intercettata da `scripts/test/i18n-check.sh` perché quello script ha già un fallback equivalente ma scritto in modo indipendente (passa comunque in CI). Allineata la guardia.
- **`scripts/backup.sh` — `RETENTION=0` cancellava il backup appena creato.** `tail -n +$((RETENTION + 1))` con `RETENTION=0` diventa `tail -n +1`, che include anche l'archivio creato in quello stesso run fra i "vecchi da eliminare" — lo script terminava con zero backup su disco stampando comunque "Backup completato". Forzato un minimo di 1 con warning esplicito.
- **`Release di Produzione.yml` — input `tag` interpolato direttamente in uno step shell.** Pattern classico di script-injection nelle GitHub Actions (un'espressione `${{ }}` finisce nel testo dello script prima che bash lo esegua). Non sfruttabile oggi (`workflow_dispatch` richiede già accesso in scrittura al repo), ma passato per `env:` per coerenza con il resto del progetto.

Più due correzioni di doc comment che affermavano un comportamento diverso da quello implementato (in `EngineAuthController`: "generazione e validazione token" quando `AuthService` genera soltanto; in `IconComponent`: default documentato `lift`, default reale `none`).

Segnalato ma non corretto, in attesa di una decisione del maintainer: la pagina `/impostazioni` (autenticata) riusa `SocialComponent` come componente, ma `ContentResolver` non ha un `case` per `PageType.Impostazioni`: la pagina risolve sempre a contenuto vuoto e si renderizza come un'area completamente bianca, senza errori né messaggio. Non rompe nulla, ma non è chiaro se sia una demo minimale intenzionale o uno scaffold dimenticato a metà.

Verificato: build di produzione frontend (`scripts/test/tsc-check.sh`) e `dotnet build` backend dopo ogni batch di fix, entrambi puliti; `generate-statics.ts` rieseguito direttamente (output identico); sintassi bash e YAML validate.

### Ripristinato il fail-closed sulle credenziali demo in Production (regressione di sicurezza)

Revisione di correttezza estesa a tutto il repository (non solo al branch): il commit `587ad21` ("fix (engine) migliorie cookle e bottone", 11 luglio 2026) aveva rimosso da `AccountService.ValidateCredentialsAsync` il controllo che rifiuta le credenziali demo (`admin`/`Password1!`) quando l'ambiente è Production, lasciando però il campo `_env`, il parametro del costruttore e il commento XML ("fail-closed sulle credenziali demo in Production") tutti al loro posto, a dichiarare una protezione che non esisteva più. `_env` era diventato un campo scritto e mai più letto: il segnale che ha fatto emergere la regressione.

Impatto concreto: un progetto figlio che accende il login (valorizza `Security.Token.SecretKey`) ma dimentica di sostituire `AccountService` con la propria verifica reale, distribuito in Production, avrebbe accettato in autenticazione le credenziali demo (pubbliche, perché scritte nel sorgente di un template open-source), ottenendo un JWT valido con ruolo `admin`. Nessun altro controllo a runtime lo impediva.

Fix: ripristinato il blocco `if (_env.IsProduction() && validUsername == "admin" && validPassword == "Password1!") throw new UnauthorizedException();` con log esplicito, esattamente come prima della regressione. La condizione è sulle costanti compile-time, quindi si disattiva da sola non appena un progetto sostituisce le credenziali demo con la propria logica.

Verificato con `dotnet build` (0 warning, 0 errori).

### Revisione sicurezza + qualità del codice di questo giro (nessun fix di sicurezza necessario)

Due controlli dedicati sul diff completo del branch: una security review focalizzata su ciò che è stato introdotto (gestione GPC, rimozione cookie lingua, rimozione alias deprecati), che non ha trovato nessuna vulnerabilità ad alta confidenza, e una revisione di qualità (riuso, semplificazione, efficienza, altitudine) via 4 controlli paralleli.

- Estratto `applyGpcOptOut()` in `CookieConsentService`: la logica di opt-out GPC per Analytics e Profiling era duplicata riga per riga; ora è un metodo unico condiviso, pronto a coprire una terza categoria futura senza ricopiare il pattern.
- Altri finding emersi dai controlli riguardavano codice preesistente su `main`, non introdotto da questo branch (falso positivo da un `origin/main` locale non aggiornato durante l'analisi) — scartati come fuori scope, non applicati.

### Chiarito che Google Consent Mode v2 è obbligatorio, non un extra opzionale

I due titoli di sezione ("predisposizione, non attiva di default" in AGENTS.md, "ricetta pronta, non attiva di default" in frontend/README.md) suonavano come un miglioramento facoltativo. Il corpo del testo era già accurato (cita la scadenza del 28 marzo 2024), ma il titolo, quello che si legge per primo e spesso l'unico se si scorre veloce, no. Verificato: Consent Mode v2 è obbligatorio dal 2024, pieno enforcement nel 2026 (senza, un account perde remarketing/conversion modeling per il traffico UE/UK). Titoli riformulati in entrambi i file per dire questo fin da subito.

### Colmate le lacune emerse da una revisione junior/senior della documentazione

Fatta rileggere tutta la documentazione (root README, frontend/backend README, AGENTS.md, QUICKSTART.md, DOCKER_README.md) con due letture indipendenti (uno sviluppatore junior che deve completare un task, un architetto senior che valuta l'adozione) per trovare cosa manca o è spiegato debolmente. Ogni claim aggiunta è stata verificata contro il codice reale prima di scriverla, non dedotta.

Correzioni di accuratezza (esempi che non avrebbero compilato o punti ancora disallineati dal codice):
- QUICKSTART.md e una seconda occorrenza in `README.md` ripetevano la stessa confusione "pagine dichiarate in `site.ts`" già corretta altrove — sfuggite al giro precedente perché fuori dai file toccati allora.
- Tre snippet copiabili (`frontend/README.md` ×2, `AGENTS.md` ×1) mostravano `component: () => import('./x.component')` **senza** `.then(m => m.XComponent)` — non compila, il tipo dichiarato da `LeafPageInput.component` è `Promise<Type<...>>`, non la promise nuda del modulo.
- La ricetta "Aggiungere una pagina" in AGENTS.md aveva anche `extends PageBaseComponent { }` senza l'argomento di tipo — sempre richiesto, nessun default, ogni pagina reale del template lo valorizza (`<void>`, `<string>`, ecc.).
- `mapping.json` (asset id → file) era descritto come "generato al build": è mantenuto a mano, nessuno script lo scrive.

Lacune reali colmate (verificate leggendo il codice, non inventate):
- Come registrare un nuovo asset (`frontend/README.md`) — mancava del tutto.
- `children` (rotta annidata) vs `addGroup` (voce di menu annidata) — stesso termine "annidamento" per due meccanismi diversi, ora contrastati con un esempio.
- Rate limiter: soglie hardcoded (non configurabili da `global-settings.json`) e per-istanza (nessun backplane condiviso, stesso limite già segnalato per `IContentStore`/`INotificationStream`).
- Nessun refresh token: alla scadenza serve un nuovo login, ora dichiarato esplicitamente invece di lasciarlo dedurre dai meccanismi sparsi.
- Conseguenze concrete della rotazione di `Token.SecretKey` (logout di tutti) e `CryptoSecret` (dati già cifrati diventano illeggibili).
- Firme reali di `AccountService.ValidateCredentialsAsync`/`DeleteAccountAsync` per chi sostituisce il login demo.
- Override del limite di upload di `BlobController` — la versione precedente ipotizzava un pattern a ereditarietà (`override`/`base.Upload`) che non esiste: `Upload` vive per intero nel controller di Dominio, si cambia l'attributo e basta.
- Sintomo silenzioso di `SessionInfo`/`session.dto.ts` disallineati (campo `undefined`, nessun errore).
- PWA (`isWebApp: true`) + token in `sessionStorage`: il rilancio dell'app installata può creare un nuovo contesto di navigazione e sloggare silenziosamente l'utente.
- Osservabilità: `Logger` è `ILogger` standard, nessuna metrica/tracing cablato oltre `/health` — dichiarato invece di lasciarlo silenzioso.
- Asimmetria dei gate CI: sei controlli in CI sono tutti frontend, il backend ha solo lo scan vulnerabilità NuGet, nessun progetto di test nella solution oggi.
- `backup.sh` fa un `tar` a caldo del volume senza stop dei container: innocuo oggi (`uploads-data` ha slug immutabili, `db-data` non è ancora scritto da nessuno) ma da rivalutare se il progetto migra a un DB reale su quel volume.
- Nessuna policy di versioning formale del template (niente semver): documentato che la garanzia reale è l'elenco "Dominio a contratto fisso" + la lettura di `CHANGELOG.md` prima di un merge, non inventata una promessa che non esiste.
- Recipe mancanti in AGENTS.md (Mailer, upload/servire un file) — feature di prim'ordine nei README completi ma invisibili a chi lavora solo dalle ricette rapide.
- Pointer esplicito da AGENTS.md alla tabella "Dominio a contratto fisso" del README principale, per chi risolve un conflitto di merge partendo solo dalle ricette rapide.

### Audit documentazione: tre residui della rimozione del cookie lingua rimasti nel README

Giro di verifica dedicato: la documentazione deve fotografare lo stato attuale del codice, non alludere a comportamenti precedenti. Cercate sistematicamente frasi storiche/narrative ("in precedenza", "storicamente", ecc.) in tutti i `.md` del repo (CHANGELOG.md escluso, che è storico per natura): nessuna trovata, i giri precedenti erano già stati accurati sul registro. Trovati invece tre riferimenti rimasti disallineati dal codice in `frontend/README.md`, sfuggiti alla pulizia del cookie lingua:

- La sezione "Controllo Versione" citava ancora "multilingua"/"sito mono-lingua" come condizioni del gate sul consenso tecnico — `isTechnicalNeeded` non lo considera più da tempo.
- "Pagine legali" citava "cookie (multilingua, PWA...)" come motivo per cui lo slot `cookie` è obbligatorio — stessa condizione già rimossa da `hasCookiesConfigured`.
- "Script di Build" citava "pagina cookie" come consumatore dei codici lingua a build-time — corretto in "routing per-lingua", coerente con la correzione già fatta altrove (`generate-statics.ts`, `global-settings.types.ts`, `global-settings.schema.json`, `app.config.server.ts`).

### Chiarito ulteriormente dove vivono le pagine: `pages/*.pages.ts`, non `site.ts`

Un giro precedente aveva già corretto l'apertura dei README; restava impreciso il dettaglio: la sezione "Pagine & rotte" era ancora intitolata `(site.ts)`, e il passo 4 del Developer Journey diceva di usare `requiresAuth: true` "nella dichiarazione in `site.ts`" quando in realtà è un campo di `LeafPageInput`, dichiarato nel file di area.

- `frontend/README.md`: sezione rinominata `(pages/*.pages.ts + site.ts)`, con una tabella esplicita "cosa va dove" (path/pageType/component/requiresAuth/renderMode/layout/description/otherSEO/children/externalUrl nel file di area; homePage/loginPage/legalPages/shell/isWebApp/onlyPlainImage/headerNav/footerNav in site.ts). Corretto anche il passo 4 del Developer Journey.
- `siteBuilder.ts`: i commenti JSDoc di `BasePageInput`/`ParentPageInput`/`LeafPageInput`/`ExternalPageInput`/`SitePageInput` dicevano ancora "dichiarabile in `site.ts`" — sono il tooltip che l'IDE mostra scrivendo una pagina, quindi la fonte di confusione più autorevole di tutte. Riallineati alla convenzione reale.

### Aggiunto `aria-hidden` alle icone FontAwesome decorative rimaste scoperte

Verificate le ~56 icone FontAwesome del template: 21 erano prive di `aria-hidden="true"` pur essendo puramente decorative (sempre affiancate da testo visibile o dentro un elemento già etichettato). Metà del codice applicava già la convenzione giusta, l'altra metà se l'era persa per strada. Corrette in `upload-form`, `login-form`, `login.component`, `cookie-banner` (pulsante di riapertura) e `policy.component` (icone di categoria, in entrambe le viste). Cinque falsi positivi individuati e lasciati intatti: già coperti da un `aria-hidden` sul contenitore padre (le intestazioni di sezione in `home.component.html`) o sullo stesso tag su una riga successiva.

Nota: non si tratta di un problema del web-font come metodo di delivery (i numeri non giustificano una migrazione a SVG per un template che vuole dare accesso all'intero catalogo icone a ogni figlio: l'intero set FontAwesome pesa 508 KB come font contro 8.3 MB come SVG raw), solo disciplina incoerente nei singoli template.

### Rimossi gli alias deprecati `setCookie`/`getCookie`/`removeCookie` (breaking)

Erano tenuti solo per non rompere call-site esistenti dai tempi in cui l'API era cookie-only; oggi il template è troppo giovane per avere un vincolo di compatibilità reale da onorare, quindi via. Usa `set`/`get`/`remove` (stessa firma, instradano anche sul Web Storage).

- Migrate tutte le chiamate interne di `CookieConsentService` (costruttore, `persistConsent`) ai metodi non-deprecati.
- Ripulite le doc (`README.md`, `AGENTS.md`, commenti in `cookie-type.ts`) dai riferimenti agli alias e da un esempio ormai orfano (la persistenza lingua via SSR, rimossa in un commit precedente).
- **Fix collaterale**: rinominata la sezione `// ── Backward-compat static methods` in `ThemeService` — l'etichetta era sbagliata, quei metodi statici sono l'algoritmo di calcolo palette attivo (usato sia da `computePalette` sia dalla generazione SSR dei tag `<head>`), non compatibilità con niente. Nessuna modifica di comportamento, solo il nome della sezione.
- **Fix collaterale**: rimossi due import morti (`onNavigationEnd`, `Router`) in `cookie-banner.component.ts`, residuo di refactoring precedenti.
- **Se hai un figlio che chiama `setCookie`/`getCookie`/`removeCookie`**: al merge di questo aggiornamento, sostituiscili con `set`/`get`/`remove` — stessa firma, nessun altro cambiamento richiesto.

### Chiarita la relazione `site.ts` ↔ `pages/*.pages.ts` in apertura README

Il paragrafo di apertura ("in `site.ts` dichiari un oggetto JSON") lasciava intendere che le pagine si dichiarassero lì, quando in realtà vivono nei file di area sotto `pages/*.pages.ts` fin dall'inizio. Il corpo della documentazione lo spiegava già bene più avanti, ma la primissima impressione era fuorviante. Aggiornati il paragrafo di apertura di `frontend/README.md`, la tabella comparativa e l'albero directory in `README.md` (principale) per dire la stessa cosa fin da subito.

### Onorato automaticamente il segnale Global Privacy Control (GPC)

`CookieConsentService` legge ora `navigator.globalPrivacyControl` e, se il browser (o un'estensione) lo manda, tratta Analytics e Profiling come già rifiutati (mai i cookie Technical, che GPC non copre). Motivazione: dal 2026 California, Colorado e Connecticut riconoscono GPC come Universal Opt-Out Mechanism e ne richiedono il rispetto per legge (controlli congiunti già avviati tra i tre stati; una prima sanzione da $1.35M già comminata a settembre 2025 per averlo ignorato). Per l'UE non cambia nulla, il banner opt-in resta più severo, ma un template pensato per essere riusato non può ignorare un segnale che il browser manda gratuitamente.

- Nuovo `consent.gpcSignaled: boolean`, valutato una volta all'avvio (browser-only, sempre `false` in SSR — stesso principio di `isNeeded`).
- L'opt-out va **registrato**, non solo applicato in-memory: se l'utente non ha ancora risposto esplicitamente per Analytics/Profiling, viene scritto subito il cookie di rifiuto, altrimenti il banner riproporrebbe la stessa domanda ad ogni visita nonostante il browser stia già rispondendo "no". Una scelta manuale successiva dal banner prevale sempre.
- Il banner mostra una conferma visibile (`gpcRilevatoBannerCookie`) quando il segnale è stato onorato — richiesto dalle normative che lo trattano: non basta rispettarlo, va anche mostrato che lo è stato.
- **Fix collaterale**: `tecniciDescrizioneCategoriaCookie` citava ancora "preferenza lingua" come esempio di cookie tecnico, residuo della rimozione del cookie lingua — sostituito con "funzionalità offline/PWA".

### Rimosso il cookie di preferenza lingua e il redirect automatico su Accept-Language (breaking)

Il cookie `lang` e la guard `langRedirectGuard` (che rediregeva la primissima visita su un URL non prefissato verso la lingua del browser) sono stati rimossi. Motivazione: da tempo l'URL, non più il cookie/Accept-Language, è l'unica fonte di verità sulla lingua di una pagina; il redirect automatico sopravviveva solo per decidere se rifare quella scelta ad ogni visita su `/`. Google ("Managing Multi-Regional and Multilingual Sites") raccomanda esplicitamente di evitare redirect basati sulla lingua percepita, perché rischiano di impedire a Googlebot, che non invia un `Accept-Language` significativo, di scoprire le varianti; il W3C conferma che l'approccio URL-based è preferibile per caching/SEO. Un sito multilingua ora atterra sempre sulla lingua di default su `/`; il cambio lingua resta sempre disponibile ed esplicito dal selettore in navbar.

- `TranslateService`: rimossi `persistLanguage`, l'`effect` che salvava la lingua al consenso tecnico, e ogni dipendenza da `CookieConsentService`.
- `CookieConsentService`: rimossi `getSavedLanguage`/`setSavedLanguage`/`clearSavedLanguage` e la voce `lang` da `ENGINE_COOKIE_MAP`. La sola presenza di più lingue non rende più necessario il consenso tecnico (`isTechnicalNeeded`) né obbliga la pagina Cookie Policy (`hasCookiesConfigured`) — un sito multilingua puro, senza PWA né cookie di progetto, può ora non avere banner cookie affatto.
- `route-guards.ts`/`routing.ts`: rimossi `langRedirectGuard` e il relativo pattern anti-bot, ora inutili.
- **Se hai un figlio con più lingue**: al merge di questo aggiornamento, verifica se `legalPages.cookie` resta necessario (potrebbe non esserlo più) e se la Cookie Policy va rigenerata/aggiornata di data.

### Voci di menu visibili solo da loggato (`authOnly` su `addPage`/`addLink`/`addGroup`)

`requiresAuth: true` su una pagina protegge la rotta (redirect al login/401), ma non nascondeva la voce di menu corrispondente: un link verso un'area riservata restava visibile (e cliccabile) anche da sloggato, rimbalzando poi al login. Le due cose restano deliberatamente disaccoppiate (un link può restare sempre visibile pur protetto, o sparire senza che la pagina richieda login): l'una non implica l'altra.

- `addPage`/`addLink`/`addGroup` accettano ora un terzo parametro opzionale `{ authOnly: true }`: la voce — o, su `addGroup`, l'intero gruppo coi suoi figli — compare in navbar e footer solo per utenti loggati, sparendo del tutto per visitatori e bot. Un gruppo rimasto senza figli visibili dopo il filtro sparisce a sua volta.
- Nuovo `filterNavByAuth` (`siteBuilder.ts`), applicato a runtime in base allo stato di login: `TokenService.isLoggedIn()` nella navbar (Engine), `AuthService` nel footer (Dominio, stesso pattern già usato da `user-nav.component.ts`). In SSR e prima dell'idratazione l'utente risulta sempre sloggato — coerente con `requiresAuth`, che già esclude quelle pagine da sitemap/SSR.
- Volutamente binario (loggato/sloggato), non un sistema di ruoli: la granularità per-ruolo resta complessità di Dominio, non un seam dell'Engine.
- Demo aggiornata: `PageType.Impostazioni` (già `requiresAuth: true`) è ora anche `authOnly: true` in `site.ts`.

### Navbar: le voci di primo livello in eccesso confluiscono in un dropdown "Altro"

Oltre le 6 voci dirette in `headerNav` (soglia già segnalata da un warning in console) la navbar desktop non aveva overflow: `flex-wrap: nowrap` di Bootstrap le spingeva fuori dalla viewport, letteralmente irraggiungibili senza scroll orizzontale. Un tentativo CSS-only (`flex-wrap: wrap`) è stato scartato perché, per come il browser calcola la dimensione minima automatica di un flex-container che va a capo, faceva collassare a una voce per riga anche il caso comune (poche voci, spazio abbondante).

- La navbar misura ora la larghezza reale disponibile (`ResizeObserver` su contenitore e lista) e sposta le voci che non entrano in un dropdown finale **"Altro"** — stesso rendering di un `addGroup` dichiarato, nessuna duplicazione di template. Attivo solo oltre la soglia raccomandata (6): sotto, nessun costo aggiuntivo.
- Ricalcolato anche al cambio lingua (le label possono cambiare larghezza) e, insieme alla funzionalità sopra, al login/logout se il menu contiene voci `authOnly`.
- **Fix collaterale**: `_utilities.scss` applicava `overflow-x: hidden` al `.container-fluid` anche esattamente a 768px (il resto del progetto tratta 768px come desktop), forzando `overflow-y: auto` e tagliando qualunque dropdown che dovesse sforare in verticale a quella larghezza esatta — bug preesistente, colpiva già la voce "Policy", non solo la nuova "Altro". Corretto a `max-width: #{lib.$bp-md - 0.02px}`.

### Breakpoint desktop/mobile: sorgente unica condivisa fra SCSS e TS (`breakpoints.ts`)

Il breakpoint `768px` era hardcoded indipendentemente in due file TS (`navbar.component.ts`, `nav-submenu.component.ts`) oltre che nello SCSS: un cambio del breakpoint richiedeva ricordarsi di tre punti, con rischio di silenziosa divergenza.

- Nuovo `--bp-md` (custom property CSS, iniettata in `_base.scss` da `lib.$bp-md`) e `breakpoints.ts` → `isDesktopViewport()`, che la legge via `getComputedStyle` invece di duplicare il numero. Adottato da entrambi i punti TS che ne avevano bisogno.

### Guardia contro un `environment.ts` non rigenerato (`configFingerprint`)

`ng serve` lanciato direttamente (bypassando i pre-hook `predev`/`prestart`) o un `global-settings.json` modificato senza rilanciare la build lasciavano `environment.ts` disallineato dalla configurazione reale, senza alcun segnale: l'SSR partiva comunque, semplicemente con identità/tema/lingue stantii.

- `generate-statics.ts` scrive ora in `environment.ts` un `configFingerprint`: hash SHA1 (12 caratteri) delle sole sezioni identity-critiche di `global-settings.json` (`project`/`Localization`/`site`, mai `.local.json`). `server.ts` lo ricalcola al boot dal config letto a runtime e confronta i due valori, stampando un warning su mismatch — un segnale di dev, non un gate bloccante.
- **Effetto collaterale corretto**: `generate-statics.ts` ora fonde `global-settings.local.json` sopra il base nello stesso modo di `server-env.ts` (nuovo `settings-merge.ts`, `deepMergeSettings`, condiviso fra i due) — prima leggeva solo il file base in locale, creando un potenziale falso positivo del fingerprint per chi ha segreti che toccano anche `project`/`Localization`/`site` in `.local.json`. Il percorso Docker (`BR1_PROJECT_JSON`) resta volutamente solo-base, senza segreti.

### Dipendenze: risolte 9 vulnerabilità (Angular, sharp, body-parser)

`npm audit` segnalava CVE su 8 pacchetti `@angular/*` (bloccati su `21.2.17` nonostante versioni patchate compatibili nel range dichiarato, dove `npm audit fix` da solo non bastava e serviva `ng update`), su `body-parser` e sulla major `0.34` di `sharp`.

- Bump a `@angular/*` `^21.2.20`/`^21.2.21` (via `ng update @angular/core@21 @angular/cli@21`), `sharp` `^0.34.5` → `^0.35.3`.
- `sharp` 0.35 ha ristrutturato gli export dei tipi da namespace CJS a export ESM nominati: fix del breaking change in `routes/og-preview.ts` (`sharp.OverlayOptions` → `import { type OverlayOptions }`).
- 0 vulnerabilità rimaste in `npm audit --omit=dev` (produzione). Restano note e non applicate 5 vulnerabilità *high* nella sola catena dev `pa11y → puppeteer → extract-zip`: richiederebbero un downgrade di 3 major di `pa11y`, giudicato sproporzionato per una dipendenza di solo test.

### Budget del bundle di produzione: `850kB`/`1MB` → `950kB`/`1.1MB`

Il bundle iniziale del template (prima ancora di una riga di contenuto del progetto figlio) pesa ~860kB raw (Bootstrap + Font Awesome + Angular core + SweetAlert2 CSS, tutti già ottimizzati/lazy dove possibile), sopra il default `850kB` generato da `ng new` per un progetto Angular vuoto. Stripping/subsetting di Bootstrap o Font Awesome è stato scartato: rischioso per un template pensato per usi molto diversi fra loro, senza sapere in anticipo cosa un figlio userà davvero.

- `angular.json`: budget iniziale alzato a `950kB` (warning) / `1.1MB` (errore, l'unico che blocca `ng build`/CI). Ragionamento e scomposizione per libreria in `frontend/README.md` § Bundling.

### Fix: selettore lingua non allineato a destra senza voci di menu

`justify-content: space-between` nel container della navbar richiede esattamente due figli flex diretti; un terzo elemento rompeva l'allineamento quando `headerNav` non dichiarava alcuna voce: il selettore lingua smetteva di restare a destra su desktop. Corretto senza toccare il caso con voci di menu, verificato su 15 scenari reali (0 / 4-5 / molte voci di menu × 5 ampiezze di viewport).

### QUICKSTART: la "nascita" (remote `template` + merge) è ora il primo passo

Il flusso nascita → aggiornamento dell'Engine era descritto solo nel README (sezione Template vivo); il QUICKSTART partiva dritto da `node setup.mjs`, senza mai dire di aggiungere il remote `template`. Un progetto avviato seguendo solo il QUICKSTART nasceva quindi scollegato dal template, e il successivo `git merge template/main` non aveva con chi parlare.

- Nuovo **passo 1 "Nasci dal template"** in `QUICKSTART.md`: il progetto vive in un repo proprio, il template entra come secondo remote e lo si innesta una volta sola con `git merge template/main --allow-unrelated-histories`. Gli aggiornamenti successivi sono `git fetch template && git merge template/main` (senza flag: la storia è ormai collegata), con rimando al README per le regole di conflitto. I passi successivi sono rinumerati (battesimo → 2, file → 3, up → 4).
- **Niente `--squash`, niente clone come punto di partenza.** Lo squash reciderebbe la parentela git col template (ogni aggiornamento tornerebbe a pretendere `--allow-unrelated-histories` e una riconciliazione dell'intero albero); il `merge` normale la conserva, così `git log --first-parent` resta pulito ma gli update restano indolori.
- **README (*Template vivo → Nascita*) e `DOCKER_README.md` allineati** allo stesso modello: la nascita non è più un clone ma un innesto via remote. Aggiunto l'avviso che il bottone GitHub **"Use this template"** non va usato per far nascere un figlio — riparte da un singolo *Initial commit* senza storia e lascia il progetto orfano del template. Solo documentazione: nessun cambiamento all'Engine o allo scaffold.
### Pubblicazione artifact-based: release su GHCR (+ immagini allegate), niente `git pull` in produzione

Finora la pubblicazione era source-based: sulla VPS serviva tutto il sorgente (`git pull`) e `scripts/deploy.sh` compilava le immagini sulla macchina di produzione a ogni deploy. Ora c'è un secondo modello, consigliato per la produzione, in cui la VPS riceve un artefatto già costruito invece del codice.

- Nuovo workflow `.github/workflows/Release di Produzione.yml`: su tag `vX.Y.Z` builda le immagini `frontend`/`backend`, le pubblica su **GHCR** (`ghcr.io/<owner>/<repo>-frontend|-backend`) e crea una **GitHub Release** con allegati un *deploy bundle* (i soli file di orchestrazione) e i `.tar.gz` delle immagini. L'identità/SEO del frontend è congelata come in locale: `BR1_PROJECT_JSON` dal `global-settings.json` committato, `FRONTEND_BASE_URL` dalla repository variable omonima (il dominio, non un segreto).
- Nuovo `scripts/deploy-release.sh` + override `docker-compose.release.yml`: in produzione fa lo swap **senza compilare**. Prende le immagini in **due modi** (sceglie da solo, forzabile con `--from-ghcr`/`--from-files`): **A)** `docker compose pull` da GHCR (deploy incrementali; `docker login ghcr.io` se privato); **B)** `docker load` dei `.tar.gz` scaricati/`scp` accanto allo script (nessun registry né login — comodo per repo/registry privati). Poi lo stesso preflight isolato con healthcheck + swap di `deploy.sh`.
- Guida operativa completa in **`RELEASE.md`** (inclusi repo/registry privati, PAT, fork). `scripts/deploy.sh` (source-based) resta valido e comodo per **test e sviluppo locale**, ma è sconsigliato in produzione.
- Nessuna azione per i figli che non pubblicano via CI: continuano con `scripts/deploy.sh`. Per attivare le release: impostare la repository variable `FRONTEND_BASE_URL` e taggare.

### Script di deploy spostati in `scripts/` e `.local` creato in automatico

Per snellire la root, `deploy.sh`, `deploy-release.sh` e `backup.sh` vivono ora sotto `scripts/` (accanto a `lib/` e `test/`). Gli script risalgono da soli alla root del progetto (cercano `docker-compose.yml`), quindi funzionano sia da `scripts/` nel repo sia dal deploy bundle dove stanno accanto al compose.

- **Breaking per i figli** che invocano gli script per path: `./deploy.sh` → **`./scripts/deploy.sh`**, `./backup.sh` → **`./scripts/backup.sh`** (cron di backup compreso). La UX sulla VPS del modello release è invariata: nel bundle lo script sta alla radice, si lancia `./deploy-release.sh`.
- **Comodità:** se manca `global-settings.local.json`, `scripts/deploy.sh` e `scripts/deploy-release.sh` lo **creano generando i segreti** (`SecretKey`/`ApiKeys`/`CryptoSecret`, come `setup.mjs`) ma con **`frontend.hostname` vuoto di proposito**: le chiavi sono boilerplate, il dominio è una scelta d'ambiente. Il deploy quindi **si ferma sul guard del dominio** finché non lo imposti — così il fail-closed sui valori vuoti (niente hostname ⇒ niente 421 al dominio reale) resta valido. Nessun valore finto dell'example (che aggirerebbe i controlli); niente sezione `Mail` (mailer spento finché non la aggiungi); porta con default `3000` (cambiala per il secondo progetto sulla stessa VPS). I **test**/CI restano invariati: senza `.local`, `scripts/lib/br1-config.sh` usa una API key effimera in memoria, senza scrivere file.

### La pagina di login è `noindex` per default (l'Engine sa qual è)

La pagina puntata dallo slot `loginPage` in `site.ts` non ha motivo di finire nell'indice dei motori né nel `sitemap.xml`: su un sito a pochi account (o a singolo amministratore, il caso d'uso nativo del template) è una porta di servizio, non contenuto da promuovere. Finora però il builder la trattava come una pagina pubblica qualunque e la includeva nel sitemap: il figlio avrebbe dovuto ricordarsi di marcarla `noindex` a mano.

- Il builder ora applica `noindex` **di default** alla pagina che è target dello slot `loginPage`: fuori dal `sitemap.xml` e con `X-Robots-Tag: noindex, nofollow` a runtime (stesso meccanismo delle pagine `requiresAuth`, senza però elencare il path in `robots.txt` — che lo rivelerebbe). Resta pubblica e SSR: il login funziona come prima. Il figlio non implementa nulla.
- È un **default, non un vincolo** (tri-stato): `otherSEO.noindex` non dichiarato ⇒ decide l'Engine in base al ruolo della pagina; dichiarato ⇒ comanda il figlio. Un sito con registrazione aperta che *vuole* il login indicizzabile mette `otherSEO: { noindex: false }` sulla pagina e torna nel sitemap — come per qualunque altra pagina.
- Nessuna azione per i figli: la pagina di login demo (`app.pages.ts`) non è stata toccata — eredita il default dall'Engine perché `loginPage` la referenzia già. Chi avesse già un `noindex` esplicito sul login mantiene la propria scelta.

### Fail-fast: uno slot che punta a una pagina inesistente ora è un errore, non un warning silenzioso

Uno slot di ruolo pagina (`loginPage`, `homePage`, `legalPages.*`) valorizzato ma che punta a un `PageType` non dichiarato in `pages` (o dichiarato ma `enabled: false`) veniva prima azzerato con un `console.warn` emesso solo in dev. In produzione era completamente muto. Per `loginPage` in particolare significava che ogni pagina `requiresAuth` finiva a `/error/401` col login irraggiungibile, senza un rumore. Incoerente col resto del builder, dove `PageType`/path duplicati e cookie policy mancante già lanciano.

- `sanitizePageRefs` → `validatePageRefs`: uno slot valorizzato ma irrisolto ora **lancia** a build/avvio (`assertSlotResolved`), con un messaggio che dice quale slot, quale `PageType` e come rimediare (dichiarare la pagina o rimuovere lo slot). Vale per tutti e tre gli slot, per coerenza.
- Copre anche il caso "pagina dichiarata ma `enabled: false`": un riferimento a una pagina spenta è comunque una configurazione rotta e va segnalata, non degradata.
- Nessun impatto su demo/eject: tutti gli slot risolvono già (le pagine legali sono auto-create dalla sezione policy, quindi registrate). Un figlio che si accorge dell'errore lo risolve una volta sola, a build, invece di scoprire in produzione che il login non redirige.

### DSL: `loginPage` unifica pagina e visibilità in navbar (`showLoginInHeader` esce dallo `shell`)

`showLoginInHeader` viveva nello `shell` insieme ai flag di presentazione (`showNav`, `showBrandIconInHeader`, `showNotifications`), ma non è la stessa cosa: quelli sono grafica pura (accenderli/spegnerli non cambia cosa è la voce), mentre esporre o no il login ne cambia la natura (nascosto è login per addetti che conoscono l'URL, esposto è login per tutti) ed è privo di senso senza una `loginPage`. Raggruppato per scopo invece che per area grafica, sta con la pagina di login, non con la navbar. È l'unico slot dove flag e pagina sono davvero accoppiati (a differenza di `homePage`/`showBrandIconInHeader`, indipendenti), quindi resta l'eccezione, non un pattern da propagare.

- `loginPage` accetta ora due forme: un `PageType` nudo, oppure `{ page: PageType; showInHeader?: boolean }` (vedi `LoginPageConfig`). Il caso semplice resta una riga; chi vuole il link in navbar usa la forma estesa. Il config risolto è invariato (`loginPage: PageType` + `showLoginInHeader: boolean`): navbar e user-nav non cambiano.
- **Default di `showInHeader`: `false`** (prima `showLoginInHeader` era `true`). Configurare `loginPage` serve prima di tutto al redirect delle pagine `requiresAuth` — è routing di autenticazione, non grafica; mostrare il login in navbar è una scelta in più, opt-in. Combinato col `noindex` di default, a zero-config il login è una porta di servizio (fuori dai crawler e fuori dall'header), coerente col caso d'uso primario del template.
- Demo (`site.ts`): `loginPage: { page: PageType.Login, showInHeader: true }` — espone il login per auto-documentarsi. `setup.mjs` (eject) aggiornato di conseguenza.

Per i figli esistenti (`site.ts` è Dominio): `shell.showLoginInHeader` non esiste più (errore di compilazione al merge, voluto). Migrazione: toglilo dallo `shell` e, solo se lo volevi a `true`, passa a `loginPage: { page: PageType.X, showInHeader: true }`; se era `false` (o assente e ti andava bene) basta `loginPage: PageType.X`. Nota: il default è passato da `true` a `false`, quindi un login prima visibile per sola omissione va ora reso esplicito.

### Fix: nascondere il login dalla navbar non nasconde più anche il logout

`showLoginInHeader: false` serve a togliere il link di login dalla navbar (caso tipico: la vetrina di un professionista, dove il login è una porta di servizio per l'admin, non una voce per i visitatori). Ma login e logout erano cablati nello stesso blocco di `user-nav.component`: appena si nascondeva il login spariva anche il logout, e siccome quello è l'unico punto di logout del template (la pagina `Impostazioni` demo è un placeholder), l'admin che si loggava per aggiornare i contenuti restava senza modo di uscire dall'header.

- Login e logout sono ora su assi indipendenti in `user-nav.component`: il **link di login** (stato sloggato) obbedisce a `showLoginInHeader`; il **logout** (stato loggato) compare sempre se esiste una `loginPage`, a prescindere dal flag — chi entra deve poter uscire, e quel bottone lo vede solo l'utente loggato, mai i visitatori.
- `navbar.component.hasAuthPage` ora è `loginPage != null` (non più `&& showLoginInHeader`): il toggler mobile compare anche quando l'unica voce dell'area auth è il logout, così su mobile resta raggiungibile.
- Default demo invariato (`showLoginInHeader: true`): la demo auto-documentante continua a mostrare il link di login. Una vetrina mette `false` e ora ottiene il comportamento coerente (login nascosto ai visitatori, logout disponibile all'admin).

### Nuovo: dati personali (export + diritto all'oblio) e servizio di cifratura generico

L'export e la cancellazione dei dati personali (GDPR artt. 15/17) sono un obbligo trasversale a qualunque progetto figlio raccolga dati personali, indipendente dal dominio: stessa categoria di "sicurezza per costituzione" del cookie consent o degli header di sicurezza, non una feature che ha senso lasciare interamente al figlio come un catalogo o un carrello. Il rischio da evitare era il pattern opposto: un metodo da ripetere in ogni controller di dominio (profilo, acquisti, ...) invece di un unico punto aggregato, come già avviene per l'identità del sito.

- **`IPersonalDataStore`** (`Engine/Privacy/`): contratto con due metodi, `ExportAsync`/`EraseAsync`, entrambi su `ClaimsPrincipal` — non su un subjectId già estratto, perché l'Engine non conosce (e non deve conoscere) la forma di `SessionInfo`, che è Dominio. Default `NullPersonalDataStore` (nessun dato), sostituibile in DI con lo stesso meccanismo di `IIdentityStore` (`TryAddSingleton`, vince l'ultima registrazione).
- **`EngineDataPrivacyController`** (`Engine/Controllers/`): un solo endpoint per l'intero sito, `GET`/`DELETE /me/data`. Eredita `EngineProtectedController`: richiede login e viene escluso dalla discovery quando il login è spento, senza flag dedicato (stesso meccanismo già in campo per `AuthController`/`ProtectedController`).
- **`IEngineCrypto`/`EngineCrypto`** (`Engine/Security/`): servizio "cappello" AES-256-GCM, non specifico dell'export — esposto come property ambient `Crypto` su `EngineApiController` (stesso pattern di `Notifications`/`BackgroundQueue`/`Delivery`), non iniettato nel costruttore: `EngineCrypto` lancia se `Security.CryptoSecret` è vuota, e un'iniezione nel costruttore la costruirebbe — quindi fallirebbe — a ogni richiesta del controller, anche in un'azione che non ha nulla da cifrare. Nonce casuale a ogni chiamata (mai deterministico, a differenza del gemello frontend `PreviewCrypto`, che lo deriva apposta dal payload per URL cacheable — qui il payload è spesso sensibile). Chiave derivata da `Security.CryptoSecret` con etichetta di domain-separation fissa.
- **`Security.CryptoSecret`**: nuovo campo, volutamente separato da `Security.Token.SecretKey` — riusare la stessa chiave per firmare JWT e per cifrare dati sarebbe riuso di materiale crittografico su due scopi diversi. `setup.mjs` lo genera già alla nascita del progetto (`randomBytes(32)`, come `Security.ApiKeys`), indipendentemente dal login; `deploy.sh` lo verifica come le altre chiavi prima di pubblicare.
- **`EngineProtectedController.CurrentSession<T>()`**: comodità per rileggere il payload di sessione senza ricordare la fonte (`User.GetSession<T>()`), stesso spirito di `CurrentLanguage` per la lingua. Resta generico: l'Engine non fissa la forma di `SessionInfo`. `ProtectedController.Ping()` (demo) aggiornato a titolo di esempio.
- **Semantica di `EraseAsync` fissata (solo doc, nessun cambio di codice)**: l'oblio include l'account stesso — credenziali e identificativi sono dati personali, un account superstite identificherebbe ancora la persona — salvo i dati con obbligo legale di conservazione, da scollegare/anonimizzare; il bottone "cancella il mio account" di una pagina profilo è `DELETE /me/data`, non un endpoint a parte, e non esiste (volutamente) un `IAccountService` dell'Engine: l'Engine non conosce la forma degli account, l'aggregazione sta nell'unica `IPersonalDataStore` del figlio. Documentato anche il caveat post-cancellazione: il JWT è stateless e resta valido fino a scadenza dopo il `204` → il frontend scarta il token (logout locale) e gli store trattano un `UserId` orfano come "nessun dato", non come errore; un'eventuale revoca server-side è un futuro seam dell'Engine.
- **`AccountService` + `AppPersonalDataStore` (Dominio, non Engine)**: la ricetta "implementa la tua `IPersonalDataStore`" diventa codice vivo del template. `Services/AccountService.cs` è l'unico posto del progetto che conosce gli account degli utenti: la verifica credenziali demo (hardcoded, fail-closed in Production) si trasferisce lì da `AuthController` — che ora delega e resta il punto HTTP — e la cancellazione account per l'oblio vive nello stesso file. `Store/AppPersonalDataStore.cs` (gemello di `AppIdentityStore`: vince sul default vuoto via DI) risponde dietro `GET`/`DELETE /me/data` e delega la parte account ad `AccountService`; oggi non ha dati propri (export `null`, comportamento invariato), ma il cablaggio privacy→account è già nella direzione giusta. Niente contratto engine-side di proposito: le firme parlano `SessionInfo` (Dominio), i confini contrattuali restano `EngineAuthController` e `IPersonalDataStore`. Entrambi registrati solo con `LoginEnabled`. Per i figli esistenti: `AuthController` e `Program.cs` sono Dominio (vince il figlio al merge) — un login già sostituito non viene toccato; il pattern si adotta per scelta.

Per i figli esistenti: `Security.CryptoSecret` va aggiunta a mano in `global-settings.local.json` (`openssl rand -base64 32`) solo se/quando si implementa davvero `IPersonalDataStore`. Con lo store di default (`NullPersonalDataStore`, nessun dato) `GET /me/data` risponde `{}` (`data` a `null`, omesso dalle opzioni JSON globali) senza mai risolvere `IEngineCrypto`: un figlio con login già attivo che fa il merge di questa versione non vede l'endpoint fallire per una chiave che, finché non implementa l'export, non gli serve.

### `PageType`: da enum unico a oggetto assemblato per aree (scala oltre le poche pagine della demo)

Un enum piatto in `site.ts` regge bene le poche pagine della demo, ma un progetto figlio che arriva a decine o centinaia di pagine si ritrova a scorrere e mantenere in ordine un unico blocco sempre più lungo, segnalato da un caso reale (100+ pagine su domini diversi). Valutate le alternative (namespace/sotto-enum annidati, enum multipli fusi in unione): entrambe rompono il tipo piatto unico che `getPath`/`addPage`/`[appPage]` si aspettano, e i secondi collidono anche silenziosamente, perché gli enum numerici ripartono tutti da 0 e finiscono per condividere la stessa chiave nella `Map` interna del builder.

- `PageType` è ora un oggetto `as const` di ID stringa (es. `'app.home'`), assemblato in `site.ts` per spread da più file — uno per area tematica sotto `pages/*.pages.ts` (la demo: `app.pages.ts`, `legal.pages.ts`). A poche pagine il pattern costa un file in più e nient'altro; a molte, ogni area si apre e si mantiene per conto suo. Stesse garanzie dell'enum (refactor-safe, TypeScript segnala ogni uso di un ID rimosso) — cambia solo il costrutto.
- Contratto fisso invariato: l'Engine importa `PageType` da `site.ts` per path e nome (vedi README § «Dominio a contratto fisso»), non per come è dichiarato — un enum, un oggetto o un re-export sono equivalenti dal suo punto di vista. Nessuna modifica alle firme dell'Engine.
- Il legale (`pages/legal.pages.ts`) ora porta anche `legalUpdated` (le date di "ultimo aggiornamento", prima hardcoded in `policy.component.ts`): tutto ciò che un figlio compila per il legale — ID, slot, date — vive in un solo file.
- `siteBuilder.ts` e la direttiva `[appPage]` avvisano ora in dev-mode quando uno slot (`loginPage`/`homePage`/`legalPages.*`), una voce di navigazione (`addPage`) o un link (`[appPage]`) puntano a un `PageType` non registrato — prima l'esito era silenzioso (slot azzerato, voce di menu scomparsa, link a `/`) e con un ID numerico il messaggio non sarebbe stato comunque leggibile.
- `setup.mjs` (eject) genera lo stesso pattern nel `site.ts` minimale, restando coerente con la demo.

Per i figli esistenti: `site.ts` è Dominio (vince il figlio al merge), quindi un enum numerico già in uso continua a funzionare invariato: la migrazione è per scelta, non forzata dal merge.

### Doc: tre snippet duplicati fra README e AGENTS.md, disallineati per drift

Controllati tutti i punti dove AGENTS.md e i README (frontend/backend) trattano lo stesso argomento, non per titolo di sezione ma per contenuto reale, per capire dove la separazione "README = cosa offre / AGENTS.md = ricetta pronta" (già dichiarata in apertura di AGENTS.md) fosse rispettata e dove no. La maggioranza dei casi era già corretta (es. "Aggiungere una pagina" e "JSON-LD" nel README frontend rimandano già ad AGENTS.md senza ripetere codice) o legittimamente complementare (tutorial esteso in un file, ricetta compatta nell'altro, non lo stesso testo due volte). Tre punti erano invece codice pressoché identico ripetuto in entrambi i file, senza alcun rimando fra loro, a rischio di andare fuori sincrono al primo refactor toccato da un lato solo:

- **`frontend/README.md` §"Aggiungere un Endpoint"** (ApiService): duplicava l'esempio `getArticolo`/`api_get` già in AGENTS.md. Ora rimanda lì, mantenendo i tre passi concettuali e la nota su `FormData` (uniche a questo file).
- **`AGENTS.md` §"Persistere dati lato client"**: la mappa `COOKIE_MAP` completa (con la variante `match: 'prefix'`) è coperta in modo più esteso nel README frontend — condensato a match del pattern già usato dalla ricetta gemella "Google Consent Mode v2" (solo la forma di chiamata `consent.set/get`, rimando al README per la struttura della voce).
- **`backend/README.md` §"Leggere la Sessione"**: aveva lo stesso codice di AGENTS.md ma, a differenza delle sezioni vicine ("Notifiche Realtime", "Task in Background"), mancava il rimando "Ricetta rapida" che quelle già usano — aggiunto per coerenza interna al file.

### `a11y-test.sh`: pagine auditate in parallelo (con un limite), Lighthouse resta seriale apposta

Valutato se applicare la parallelizzazione anche dentro i singoli script, non solo fra loro a livello di job CI. Risposta diversa per i due strumenti, verificata separatamente:

- **pa11y (`a11y-test.sh`): sì.** Misura struttura/DOM (axe-core/HTML_CodeSniffer), non tempi — la contesa di risorse fra pagine concorrenti rallenta ma non falsa l'esito. È anche il pattern che pa11y stesso documenta per il proprio tooling CI. Il browser persistente introdotto in precedenza ora audita le pagine con un **pool a concorrenza limitata** (nuovo `A11Y_CONCURRENCY`, default 3): abbastanza per un guadagno reale senza esaurire la memoria del runner aprendo troppe tab Puppeteer insieme. Ogni pagina bufferizza il proprio output e lo stampa tutto insieme, in ordine originale, a fine corsa — leggibile anche se le pagine finiscono in un ordine diverso da quello di partenza. Verificato in locale (8 pagine, backend/SSR reali): ~17.6s seriale → ~11.7s con concorrenza 3, stesso esito; verificato anche che i conteggi di fallimento restano esatti sotto concorrenza (3 pagine irraggiungibili in parallelo → 3 fallimenti contati, non un numero sballato da una race condition).
- **Lighthouse (`lighthouse-test.sh`): no.** È la guidance ufficiale del team Lighthouse: gli audit di performance misurano condizioni reali (`--throttling-method=provided`, già in uso qui), quindi Chrome in concorrenza sulla stessa macchina si contende CPU/rete e si falsano a vicenda i punteggi — non un rischio teorico, sconsigliato esplicitamente da Google. Parallelizzare lì reintrodurrebbe silenziosamente la flakiness appena eliminata (punteggi sbagliati anziché errori). Resta seriale.

### CI: accessibilità e Lighthouse non si bloccano più a vicenda nel job "Test live"

I due audit erano step sequenziali senza `continue-on-error`: se l'audit di accessibilità falliva, quello Lighthouse non partiva nemmeno: un push con un problema di accessibilità E uno di performance li segnalava uno alla volta, a colpi di push-e-riattendi (~7 minuti a giro) invece che in un solo run.

- Entrambi gli step ora hanno `continue-on-error: true` (girano sempre fino in fondo, indipendenti l'uno dall'altro) e un `id`. Un nuovo step finale "Esito test live" (`if: always()`) rilegge esplicitamente `steps.a11y.outcome` / `steps.lighthouse.outcome` e fa fallire il job se anche uno solo dei due non è `success` — `continue-on-error` a livello di step farebbe risultare lo step (e di riflesso il job, se non controllato) sempre verde anche a script fallito, quindi va riletto a mano, non lasciato al default.
- Notare per il futuro: GitHub ha introdotto step realmente paralleli in-job (`background`/`wait`/`parallel`, changelog 25 giugno 2026) che risparmierebbero anche il tempo — ma a due settimane dal rilascio la semantica di propagazione del fallimento non è ancora documentata nell'annuncio stesso: prematuro adottarla su una CI di template ereditata da ogni progetto figlio. Il pattern `continue-on-error` + `outcome` resta quello stabile, verificato.

### `backup.sh`: immagine Alpine pinnata (non più `:latest` implicito)

Il container effimero usato per comprimere i volumi (`docker run --rm ... alpine tar czf ...`) usava `alpine` senza tag, che Docker risolve in `:latest`. `backup.sh` è pensato per girare da cron ogni notte, senza controllo umano: una breaking change silenziosa nell'immagine `latest` romperebbe i backup senza che nessuno se ne accorga fino al giorno del ripristino, il momento peggiore possibile per scoprirlo. Pinnato a `alpine:3.22` (major.minor, non una patch esatta: riceve comunque gli aggiornamenti di sicurezza sullo stesso tag, verificato attivo su Docker Hub). Allineato anche l'esempio di ripristino nell'header dello script.

### CI: Lighthouse riusa un solo Chrome per tutte le pagine, invece di un avvio a testa

`lighthouse-test.sh` lanciava un Chrome a freddo per ogni pagina scoperta da `/health` (uno per URL, avviato e distrutto ogni volta). Con poche pagine costava solo tempo; ma la pressione su CPU/memoria del runner CI, già condiviso coi container backend/frontend sotto test, sale a ogni riavvio, terreno tipico per `NO_NAVSTART`/`NO_FCP` (la trace di performance viene registrata prima che Chrome sia davvero pronto a navigare): il rischio di flake cresce con ogni pagina aggiunta al sito, non solo con l'ultima.

- **Chrome persistente:** un solo processo headless avviato all'inizio dello script (porta di debug remota su una porta libera, verificata pronta via polling su `/json/version`), riusato per tutte le pagine passando `--port` a Lighthouse invece di `--chrome-flags` — il pattern che Lighthouse stesso raccomanda per audit multi-URL. Se `CHROME_PATH` non è risolto (bundled/npx) si ricade sul comportamento precedente, un avvio per pagina.
- **Retry mirato sui soli errori transitori:** `NO_NAVSTART`, `NO_FCP`, `NO_LCP`, `PAGE_HUNG`, `TARGET_CRASHED`, `PROTOCOL_TIMEOUT` e simili (sintomi di timing/risorse, non di una pagina rotta) vengono ritentati una volta prima di dichiarare fallimento. Errori deterministici (`DNS_FAILURE`, `INVALID_URL`, `ERRORED_DOCUMENT_REQUEST` — una 404 vera) restano fail-fast, senza retry sprecato: verificato che una pagina inesistente fallisce ancora al primo tentativo.
- **Verificato in locale** (server SSR reale + backend .NET reale, tutte le 8 pagine demo): stesso esito del comportamento precedente ma con un solo avvio Chrome invece di 8.

### CI: stesso trattamento per `a11y-test.sh` (pa11y) — un solo browser, non uno a pagina

Stesso pattern del punto sopra, stessa causa: la CLI pa11y invocata una volta a pagina apriva e chiudeva un intero Chromium ad ogni URL. L'API JS di pa11y espone per questo un'opzione `browser`: passandole un'istanza Puppeteer già avviata, pa11y apre solo una nuova tab per pagina invece di un intero processo, il pattern che pa11y stesso documenta per testare più URL in sequenza.

- Lo script ora genera un piccolo runner Node temporaneo (`frontend/.a11y-run-*.cjs`, autopulito a fine corsa) che lancia Puppeteer una volta sola e vi passa ogni pagina; l'output resta identico (stesso reporter `cli` di pa11y, stesso formato "OK/ERR" del resto della suite).
- **Fallback invariato:** se `pa11y` non è un pacchetto locale (npm ci non eseguito, si scarica al volo via `npx`) resta il vecchio comportamento CLI-per-pagina — percorso già degradato, non quello raccomandato.
- **Verificato in locale**, stessi 8 path: nessuna violazione, un solo avvio Chromium invece di 8; verificato anche il percorso di errore (pagina irraggiungibile → fallimento corretto, conteggio esatto) e quello di successo.

### Pulizia `.gitignore`: due pattern morti, mai stati corretti

Trovati controllando dove i due script sopra scrivono davvero i loro file temporanei: `frontend/lh-report.json` non ha mai corrisposto a nulla (il report è sempre stato nominato con PID, `lh-report-$$.json`, e scritto dalla working directory dello script, root del repo in CI, non `frontend/`) e `frontend/ssr-server*.log` non ha zero riferimenti in tutto il repo, nessuno script lo produce. Corretti in `lh-report-*.json` (radice, glob sul PID) e rimossa la voce morta.

### Navigazione SPA: focus e annuncio agli screen reader ad ogni cambio pagina

Un cambio pagina in una SPA non ricarica il documento: il browser non sposta da solo il focus né annuncia nulla, come farebbe con un normale link multi-pagina. Chi naviga da tastiera o screen reader restava "fermo" sul link appena attivato, dentro un contenuto ormai sostituito. Nessuna configurazione: vale su ogni pagina, presente e futura.

- **Approccio duale (best practice 2025/2026):** `AppComponent` ascolta `Router.events` (`NavigationEnd`, saltando il **primo** — il caricamento iniziale, dove il focus va lasciato dov'è il browser lo mette di default) e sposta il focus su `#main-content` (nuovo `tabindex="-1"`, programmaticamente focalizzabile senza entrare nell'ordine di tabulazione a schermo). In parallelo, una regione `role="status" aria-live="polite"` annuncia il nuovo titolo.
- **`PageMetaService.announcedTitle`:** nuovo signal, valorizzato dentro `setPageMeta()` con lo stesso testo già scritto nel `<title>` del browser — nessuna logica duplicata, un solo punto di verità per il titolo di pagina.
- **Perché entrambi:** il solo focus non basta — alcune combinazioni screen reader/browser (NVDA+Firefox, VoiceOver+Safari) non annunciano sempre in modo affidabile l'elemento appena focalizzato; la regione live è il backup.
- **Cambio lingua non innesca il focus:** `setLanguage()` non naviga (nessun `NavigationEnd`), quindi non sposta mai il focus — solo `announcedTitle` si aggiorna (il titolo tradotto viene comunque annunciato, utile di per sé).
- Verificato con Playwright (server SSR reale + backend .NET reale): caricamento iniziale non ruba il focus, navigazioni SPA successive (via `routerLink`, non full-reload) spostano correttamente il focus su `#main-content` e la regione live rispecchia il nuovo `document.title`.

### Quinta pagina legale: Dichiarazione di Accessibilità

`legalPages` supporta ora uno slot `accessibility`, sullo stesso identico meccanismo di `privacy`/`cookie`/`tos`/`legal`: nessuna pagina nuova da costruire a mano, stesso `PolicyComponent`, stessa interpolazione identità.

- **Rilevanza normativa:** dal 28 giugno 2025 l'European Accessibility Act (Direttiva UE 2019/882) riguarda anche i siti privati nello scope (e-commerce, fatturato >2M€ o ≥10 dipendenti; microimprese escluse) — ma con un adempimento diverso da quello della Pubblica Amministrazione. La PA resta sulla Legge 4/2004 (dichiarazione + obiettivi annuali via piattaforma AGID entro il 31 marzo); i privati seguono invece il D.Lgs. 82/2022 ("informazioni sull'accessibilità" ex Allegato IV, senza obiettivi annuali). Il Markdown demo copre il primo modello (più adatto a una pagina pubblica di trasparenza); quale regime si applica esattamente va verificato con un consulente legale.
- **`LegalPagesConfig`/`ResolvedLegalPages`:** nuovo campo opzionale `accessibility?: PageType | null` — slot facoltativo come `privacy`/`tos`/`legal` (nessun errore di build se omesso, a differenza di `cookie`).
- **`legal-pages.ts`:** nuova voce nel registry (`path: 'accessibilita'`, `markdownSlug: 'accessibility'`) — routing, sitemap, SEO e menu si cablano da soli, stesso meccanismo generico delle altre quattro.
- **Markdown demo generico** (`assets/legal/accessibility.{it,en}.md`): stato di conformità (WCAG 2.1 AA, lo standard già verificato in CI da `pa11y`), contenuti non accessibili, come è stata redatta, segnalazioni/procedura di attuazione — un template da compilare, non un modulo ufficiale né un testo legale pronto all'uso.
- **Demo e skeleton "eject" aggiornati in coppia** (`site.ts` e `MINIMAL_SITE_TS` in `setup.mjs`): stesso `PageType.AccessibilityStatement`, stesso posizionamento nel menu (`menuPolicy`, accanto a Privacy/Cookie).

### Ogni pagina sempre stampabile — resa pulita, niente bottone

Ogni pagina, presente e futura (anche una che il progetto figlio scrive da sé domani, es. un articolo, se il figlio è una testata giornalistica), stampa bene senza che nessuno debba configurarlo, e senza un bottone di stampa nel template: i browser espongono già la stampa in modo prominente (Ctrl+P, menu, condivisione), un bottone dedicato la replicherebbe soltanto: pratica ormai considerata superata (i redesign recenti tendono a toglierlo, tenendo solo il CSS di stampa). Un `@media print` condiviso e globale (`styles/engine/base/_print.scss`, non per-pagina, non un flag DSL, nessuna configurazione possibile, quindi nessuna svista possibile) ripulisce automaticamente qualunque pagina:

- **Via del tutto:** navbar, i FAB fissi (`app-back-to-top`, `app-cookie-banner` — pura UI, mai contenuto), lo sfondo smoke.
- **Forzato tema chiaro su `html`/`body`** (nero su bianco, `color-scheme: light`) a prescindere dal tema attivo — non solo su `.content-panel`, così copre anche le pagine senza pannello o full-bleed.
- **Pannello contenuti** spogliato dell'identità "da card" (sfondo/bordo/ombra/raggio/griglia): resta solo il contenuto.
- **Footer semplificato, non nascosto:** la riga di copyright/ragione sociale è informazione legittima su un documento stampato, quindi resta — via solo l'identità estesa (indirizzo/social/orari con l'eventuale accordion) e il menu di navigazione (link non cliccabili su carta).
- **`<details>` chiusi si aprono per la stampa** (i gruppi cookie della Cookie Policy, o qualunque `<details>` in un Markdown di progetto): un `<details>` chiuso non stampa il suo contenuto per comportamento nativo, corretto a schermo ma sbagliato sul "formato alternativo" — chi lo stampa deve vedere l'elenco completo, non intestazioni collassate senza modo di espanderle su carta. `AppComponent` ascolta `matchMedia('print')` (non `beforeprint`/`afterprint`: più affidabile in Safari) e riapre solo i `<details>` che erano chiusi, richiudendo solo quelli appena finita la stampa — uno che l'utente aveva già aperto a mano resta aperto anche dopo.

È anche il "formato alternativo" richiesto dalla Dichiarazione di Accessibilità. `app-print-action` (il componente azione, non montato di default da nessuna parte) resta disponibile per un'affordance di stampa puntuale su una pagina specifica, se un progetto la vuole: si auto-esclude sempre dalla propria stampa (`d-print-none` intrinseco).

- **Specificità CSS, non ovvio:** `app-navbar` applica `d-block` come host class; l'utility Bootstrap `.d-block{display:block!important}` ha specificità di classe (0,1,0), più alta del solo selettore di tag (0,0,1) — a parità di `!important` un semplice `app-navbar{display:none!important}` **perde**. Selettore composito `app-navbar.d-block` per pareggiare e vincere. Verificato con screenshot/PDF Playwright in `media: 'print'`, anche partendo da tema scuro (bug silenzioso: nessun errore, navbar/sfondo scuro restavano visibili in stampa finché non trovato così).
- **Verificato oltre la Cookie Policy** (pagine temporanee di stress-test, non committate): tutte e 5 le pagine legali in tema chiaro/scuro; `fitViewport:true` (niente `.content-panel`, navbar comunque nascosta in stampa); `showPanel:false`; 3 categorie cookie simultanee (tutte si aprono/richiudono correttamente); banner cookie non ancora risposto (resta escluso dalla stampa a prescindere dallo stato del consenso). Nessun bug emerso.

### Validazione: un unico modulo condiviso, e valuta/orari/telefono in fail-fast

- **Modulo `Validation` condiviso (frontend):** le regole prima sparse (validatori inline di `QrCodeService`, strip del telefono in `ContactUrl`) vivono ora in `core/engine/services/validation.ts` — un solo posto per `phone` (charset + numero singolo + forma dialabile `toDial` + `isE164` stretto), `email`, `url`, `iban`. Lo usano i builder di link (`ContactUrl`) e il generatore QR (`QrCodeService`); nessuna regex duplicata resta nel frontend. **Telefono, Opzione A:** la regola base accetta anche i nazionali (`06/1234567`); l'E.164 stretto (`isE164`) è un controllo *in più* solo dove serve un numero internazionale (WhatsApp/`wa.me`).
- **Contratto mirror-ato col backend:** `Validation.phone` rispecchia `ValidPhone`, `email`/`url` rispecchiano `MailAddress`/`Uri` dell'identità. Il backend valida alla fonte (fail-fast), il frontend riusa la stessa forma — due implementazioni di un'unica regola, una per tier (C# non condivide codice con TS).
- **Valuta validata ISO 4217:** `currency` era il gemello non validato di `nazione` — un codice sbagliato (`"Euro"`) veniva reso in EUR **in silenzio** (fallback nel `try/catch` di `formatCurrency`). Ora validata allo store con `RegionInfo.ISOCurrencySymbol` (insieme ISO 4217 dal framework, nessuna lista a mano): assente → EUR di default, presente ma invalida → errore. Il frontend formatta fidandosi (catch solo difensivo).
- **Orari, giorno fuori range:** il `JsonStringEnumConverter` accettava le stringhe numeriche (`"8"`) senza validare il range → `Enum.IsDefined` ora coglie un giorno inesistente.
- **`Intl.DateTimeFormat` dei nomi giorno:** aggiunta la guardia mancante (try/catch con fallback al locale di default) — era l'unica chiamata `Intl` su locale-da-config senza difesa.

### Cookie Policy: elenco a livelli, dichiarazione standard, gestione in-pagina

La pagina Cookie Policy passa da un elenco piatto (una card per voce, ingestibile oltre le ~200 voci) a un riepilogo a livelli allineato agli standard di settore (Cookiebot/OneTrust/CookieYes).

- **Elenco riepilogo-first:** le voci sono raggruppate per categoria in pannelli collassabili (`<details>` nativo, niente JS: come il banner), chiusi di default. L'header del gruppo fonde nome, conteggio e descrizione della categoria — spariscono i "quadrati" `{{cookieCategories}}` dal markdown demo (il token resta supportato). I nomi lunghi vanno a capo (`word-break`); l'elenco regge da 320px in su (stress-test su viewport/zoom/lingua).
- **Dichiarazione standard per voce:** oltre a nome/categoria/mezzo/descrizione, ora **Provider** (omesso = prima parte; valorizzato = terzo, con `providerUrl` opzionale → nome cliccabile alla sua policy) e **Durata** (dal mezzo, o `durationKey`, o default "1 anno" = Max-Age di `set()`). Nuovi campi opzionali `provider`/`providerUrl`/`durationKey` in `CookieConfig`.
- **Gestione consenso in pagina:** nuovo input `panelMode` sul cookie-banner → rende gli stessi controlli (toggle + accetta/rifiuta/salva) come blocco in-flusso, organico, in fondo alla Cookie Policy — per ri-gestire il consenso senza riaprire il banner. Mostrato **solo dopo** aver risposto (pre-consenso ci pensa il banner: niente due UI insieme).
- **"Come controllare i cookie":** sezione con le guide ufficiali dei browser (Edge/Chrome/Safari/Firefox/Opera), localizzate per lingua (Apple pretende il locale pieno, gli altri no — verificato sul campo).
- **"Ultimo aggiornamento":** data per pagina legale (dizionario per `PageType` nella PolicyComponent, hardcoded a mano), resa con `<time>` semantico e formattata per lingua via `Intl`.
- **A11y:** verificato con pa11y (WCAG 2.1 AA) su cookie/privacy/termini, anche coi gruppi espansi: nessuna violazione.

### Cookie banner: barra fissa full-width, pari peso Accetta/Rifiuta, consenso 180gg

Allineamento allo standard di settore 2026 (bottom-bar non modale, tre azioni a pari peso) e alle Linee guida del Garante Privacy.

- **Layout:** da card fluttuante centrata (max-width 1080px, radius 1.5rem) a barra fissa full-width agganciata ai tre bordi, come la maggior parte dei siti — niente più raggio, ombra verso l'alto per il distacco visivo dal contenuto.
- **Pari peso Accetta/Rifiuta:** i due bottoni condividono ora lo stesso stile `outline-secondary` — un "Accetta" pieno/verde contro un "Rifiuta" in outline è il dark pattern esplicitamente vietato dalla guidance EDPB sui banner cookie (pari prominenza visiva, non solo dimensione). "Salva scelte" resta evidenziato: non è un'alternativa accetta/rifiuta, conferma qualunque combinazione di toggle.
- **Memoria del consenso a 180 giorni** (`CookieConsentService.CONSENT_MAX_AGE_SECONDS`), non più 1 anno: oltre questa soglia il Garante richiede di riproporre il banner. `durationKey` dedicato in `CONSENT_COOKIE_MAP` così la Cookie Policy dichiara "6 mesi" invece di ereditare il default "1 anno".
- **ARIA:** `role="alert"` (implicitamente assertive) sostituito da `role="region"` + `aria-label` sul banner principale — non è un'interruzione urgente ma un landmark non modale, coerente con WCAG 2.2/ARIA per i consent banner.
- **Nuovo in `frontend/README.md`:** ricetta pronta (non attiva di default) per Google Consent Mode v2 — obbligatorio da marzo 2024 per chi usa GA4/Google Ads in UE. Quattro punti nel Dominio (stub di default in `index.html`, whitelisting CSP in `security-headers.json`, censimento in `cookie-registry.ts`, `effect()` di aggiornamento reattivo): l'Engine resta provider-agnostico, la ricetta si applica solo il giorno in cui Google viene davvero attivato.

### Consenso: censire una famiglia di chiavi Web Storage (`match: 'prefix'`)

- **Nuovo campo `match` in `CookieConfig`** (`'exact'` default | `'prefix'`): una **singola** voce del `COOKIE_MAP` può rappresentare un'intera **famiglia di chiavi** che condividono un prefisso. Serve per gli SDK di terza parte che scrivono più chiavi con **suffisso dinamico** (tipicamente derivato dal token/sessione, es. `sdk.telemetria:<hash>`, `sdk.telemetria.uuid:<hash>`) e che non si possono censire una a una.
- **Pulizia per prefisso alla revoca:** con `match: 'prefix'` la voce, quando la sua categoria è rifiutata, rimuove **tutte** le chiavi dello Storage che iniziano per la chiave della voce (prima si poteva togliere solo la chiave esatta, che con suffisso dinamico non matchava mai). Vale solo per il Web Storage (`storage: 'local' | 'session'`). Le **chiavi essenziali del motore** (`consent_log`, `bearerToken`) sono sempre saltate dalla scansione — un prefisso troppo largo non può cancellare la prova del consenso o la sessione.
- **Voce di sola-dichiarazione:** su una voce `prefix`, `set()` è un **no-op** (le chiavi reali le scrive l'SDK, non l'app): esiste per **elencare** la famiglia in policy e **pulirla** alla revoca. Il gating a monte resta a carico del progetto (caricare l'SDK solo dopo il consenso della sua categoria).
- **Generico, non legato a un fornitore:** l'Engine non conosce lo specifico SDK; il prefisso, il provider e la categoria li dichiara il figlio nel proprio `COOKIE_MAP`.

### Identità del sito centralizzata nell'Engine

L'identità del sito, dati legali/anagrafici, profili social del brand, natura dell'entità, è ora un sottosistema dell'Engine, sorgente unica per footer, pagine legali e SEO (JSON-LD).

- **Backend:** nuovo `IIdentityStore` (default `FileIdentityStore`, `AddTemplateIdentity`) + endpoint Engine `GET /identity`, che legge `data/identity.json`. Modello `SiteIdentity` (ex `UniversalLegalModel`), con `Social` (profili brand) e `Personal` (tipo entità). File assente → risposta `null`, niente errore.
- **Dato:** `data/irl.json` → **`data/identity.json`** (validato dallo schema engine `Engine/Models/Identity/identity.schema.json` via `$schema`). I social del brand vivono qui, non più in `global-settings.json`.
- **Frontend:** nuovo `IdentityService` (Engine, risorsa condivisa `identity()`, una fetch per lingua). `page-meta.service` deriva `sameAs`/`@type`/`twitter:site` dall'identità (runtime, risolta in SSR). Rimossi `site.social` e `site.personal` da `global-settings.json` / `SiteConfig` / `environment`.
- **Componente:** `app-profile-render` → **`app-identity-render`**, con input `[identity]` e flag `[showSocial]` (footer sì, pagine legali no).
- **Demo separata:** la galleria social (`GET /social`, `social.json`, pagina Social, `IContentStore`/`SiteService`) resta una demo a sé; il `setup.mjs` (eject) la brucia per intero, mentre l'identità sopravvive (il figlio riempie solo `identity.json`).

### Identità: orari strutturati, social URL-driven, JSON-LD compliant

- **Orari come lista di intervalli tipizzati:** `openingHours` in `SiteIdentity` è `List<OpeningHoursInterval>` — ogni voce `{ Day: DayOfWeek, Opens/Closes: TimeOnly }`. Chi sviluppa dichiara **col framework** (`DayOfWeek.Tuesday`, `TimeOnly`), senza stringhe magiche né conoscere schema.org; i cast li fa l'Engine (converter: sul filo è `{ day:"Tuesday", opens:"09:00", closes:"18:00" }`). Più voci sullo stesso giorno = più fasce (pausa pranzo). Il frontend **deriva** sia la resa leggibile (fonde i giorni con orari identici, "lun–ven 09:00–18:00") sia le `OpeningHoursSpecification` (`ContactPoint.hoursAvailable`) — dove `DayOfWeek` è già il nome `schema.org/Tuesday`, via la mappa scritta a mano. Sostituisce il vecchio testo libero `metadatiAggiuntivi.orariContatto`.
- **Social come lista di URL, con nome opzionale per il footer:** `SiteIdentity.Social` è una lista dove ogni voce è un URL (stringa nuda) **oppure** `{ url, name }`. Il `name` (anche localizzato `{it,en}`) è l'etichetta resa **solo nel footer** accanto all'icona — utile per distinguere più profili dello stesso social (es. "Instagram — sede IT" / "— sede EN"); icona (regex sull'URL) e `sameAs` JSON-LD usano solo l'URL. Il nome auto-dedotto usa il casing ufficiale (LinkedIn/WhatsApp/YouTube). Il `type` del componente resta override opzionale.
- **Entità brand JSON-LD più ricca:** aggiunti `address` (`PostalAddress` dalla sede) e `contactPoint` (`ContactPoint` con telefono/email + `hoursAvailable` + `availableLanguage` dalle lingue del sito) all'`Organization`/`Person`. Per l'`Organization` anche `legalName`/`vatID`/`taxID` da ragione sociale/P.IVA/CF (dati già presenti, ora emessi).
- **Valuta dichiarata, non dedotta:** nuovo `currency` (ISO 4217) in `SiteIdentity`; il capitale sociale si formatta con quella valuta nella lingua corrente (via `Intl`), togliendo l'EUR hardcoded. È il pattern "dichiara il fatto, deriva la forma" — l'identità (paese/valuta) è un fatto, il locale del visitatore decide solo il formato.
- **Composizione da più fonti:** `FileIdentityStore` ora ha l'hook `protected virtual ComposeIdentityAsync` (passthrough), e il template registra `Store/AppIdentityStore.cs` (**di proprietà del progetto**) dove il figlio fonde l'identità da fonti diverse dal file (DB/API) senza riscrivere la lettura.
- **Via di fuga JSON-LD (`extra`):** nuovo `Extra` (`Dictionary<string,object>`) in `SiteIdentity`, fuso nel nodo entità brand del JSON-LD. Permette qualsiasi proprietà schema.org non tipizzata (geo, foundingDate, campi di LocalBusiness…) senza toccare modello né adapter. È fuso **per ultimo**, quindi sovrascrive i default dell'Engine — incluso il `@type` (es. → `LocalBusiness`); restano riservati all'Engine solo `@context` e `@id` (perni del grafo). La validità schema.org è a carico del progetto.
- **Attività locale (`businessType` + `sedeOperativa`):** dichiarando `businessType` (sottotipo schema.org, es. `Restaurant`/`Store`/`LocalBusiness`) l'entità brand del JSON-LD diventa quel tipo invece di `Organization`, con `address` (dalla `sedeOperativa`, fallback `sedeLegale`) e `openingHoursSpecification` portati **sul nodo** — i segnali per le attività locali di Google. Gli orari, già tipizzati, restano invariati: per un'attività vanno sul nodo, altrove restano in `contactPoint.hoursAvailable`. La geo (lat/long) è opzionale per Google e si aggiunge via `extra`.
- **Rappresentante legale tipizzato:** `rappresentanteLegale` è un campo noto di `SiteIdentity` (anche localizzato), non più pescato da `metadatiAggiuntivi` per chiave magica (un typo lo faceva sparire). `metadatiAggiuntivi` resta sul modello ma **non è più reso** dall'identità: il render mostra solo dati noti/tipizzati.
- **Fix:** i badge booleani passano a `bg-*-subtle`/`text-*-emphasis` (WCAG-safe sul tema, risolve un contrasto 2.89:1).

### Localizzazione: codici dichiarati, cultura derivata via Intl (tutto front-end)

I codici lingua sono una dichiarazione semplice (2 lettere) in `global-settings.json` → `Localization`: sorgente unica, consumata in modo indipendente dalle due parti. Il backend li arricchisce nelle culture .NET tipizzate per i suoi usi (`UseRequestLocalization`, messaggi d'errore localizzati); il frontend deriva cultura e formattazione via `Intl` (ECMA-402/CLDR), senza chiamare il backend.

- **`LocalizationService` (frontend) è interamente client, via `Intl`.** Dai codici in config (`availableLangs`) deriva: locale corrente, formattazione (`formatter`: date, numeri, valuta, `regionName`), nomi giorno abbreviati (`Intl.DateTimeFormat`) e nomi nativi delle lingue (`Intl.DisplayNames`). Niente round-trip, sempre corretto (offline incluso), disaccoppiato da come il backend gestisce la propria cultura. `EngineCultures` (backend) resta per `UseRequestLocalization`.
- **`formatter` come facciata unica.** La formattazione culture-aware passa da `localization.formatter.*` (date/valuta/numeri/regioni): `Intl` è nascosto dietro, cambiare motore non tocca i chiamanti. `app-identity-render` non duplica più `Intl.NumberFormat`/`DisplayNames` né mappa `it→it-IT` a mano.
- **Selettore lingua:** mostra i **nomi nativi** ("Italiano"/"English") derivati via `Intl.DisplayNames`, non il codice in maiuscolo.
- **`Localization` in `global-settings.json` resta** la sorgente dei codici (letta anche dai consumatori sincroni a module-load: pagina cookie multilingua, fallback `pickLocaleText`, `RequestLocalization` backend).
- **Paese come codice ISO, nome dal framework:** `sedeLegale.nazione` passa da testo libero a **codice ISO 3166-1 alpha-2** (`"IT"`). Il footer ne deriva il nome localizzato con `Intl.DisplayNames` (il gemello JS di `RegionInfo`, come `Intl.NumberFormat` per la valuta); il JSON-LD `addressCountry` usa il codice (forma preferita da schema.org/Google). Il codice è **validato allo store con `RegionInfo`**: assente ⇒ omesso, presente ma non un codice ISO valido ⇒ **errore** (niente più tolleranza sul testo libero: `"Italia"` non è un codice). *Migrazione figlio: `"nazione": "Italia"` → `"nazione": "IT"`.*

### Lettura di global-settings.json tipizzata

- **Tipo `GlobalSettings` generato dallo schema:** la lettura del config nel frontend (`generate-statics`, `server-env`) passa da accesso a chiavi-stringa (`s['Localization']`) al tipo `GlobalSettings` **generato da `global-settings.schema.json`** (`json-schema-to-typescript`, `npm run generate:types`). Lo schema resta la **sorgente unica** (niente interfaccia scritta a mano: via il `Br1Json` partial); un typo di chiave è errore a `tsc`. Il tipo è un seed committato (lo schema non è nel build context Docker del frontend), rigenerato a mano quando cambia lo schema.

### Sicurezza: JSON-LD a prova di breakout, identità tollerante

- **JSON-LD XSS-safe:** gli script `application/ld+json` escapano `<`/`>`/`&` in `\uXXXX`, così nessun valore (identità, structured data di pagina, `extra`, dati da CMS/DB) può chiudere il `<script>` e iniettare markup. Vale per tutti i nodi del grafo; i parser decodificano gli escape, il dato resta valido.
- **Identità validata con le primitive del framework, non con regex a mano — e in fail-fast:** gli URL social via `Uri.TryCreate` (assoluto http/https; fuori `javascript:`/relativi/garbage), le **email/PEC** via `System.Net.Mail.MailAddress`, la **nazione** via `RegionInfo` (ISO 3166-1 alpha-2), gli **orari** tipizzati `TimeOnly` **+ giorno controllato in range** (`Enum.IsDefined`: un `"day":"8"` numerico fuori range, che il `JsonStringEnumConverter` accetterebbe senza validare, ora è errore). Il **telefono** è validato come **numero singolo**, sanificato alla fonte: nel footer diventa un link `tel:` cliccabile (non può puntare a due numeri) **e** un testo visibile. Due controlli: (1) l'intera stringa ammette **solo** cifre e separatori visivi (`^[+\d\s/().-]+$`) — niente lettere/testo/markup, che verrebbero conservati e resi; (2) ridotta a cifre + `+` (la forma con cui `ContactUrl.phone` costruisce l'href) dev'essere un unico numero E.164-plausibile (un solo `+` iniziale, 6–15 cifre). Così **spazi, `/`, trattini e parentesi in un numero solo restano validi** (`06/1234567`, `+39 06 1234 567` — che il vecchio `PhoneAttribute` rifiutava a torto), mentre **due numeri** (`06 111 / 06 222 333`), un secondo `+` o **caratteri estranei** vengono colti. Difesa a più strati: anche il footer sanifica (href ridotto alle sole cifre + sanitizer Angular sul `[href]`, testo escapato in interpolazione — nessun sink `innerHTML`), ma il dato entra già pulito. Principio: **l'identità è tutta opzionale, ma un dato *presente* deve essere valido.** Un campo assente resta assente (footer/JSON-LD omettono quel pezzo); un campo **presente ma malformato non viene più scartato in silenzio: lancia** — `identity.json` è config committata, un valore sbagliato è un errore da correggere, non da inghiottire. L'eccezione risale a `GET /identity` (500 loggato) e il **sito resta su**: il frontend legge l'identità come assente e footer/JSON-LD si nascondono da sé (stesso esito del file mancante, ma l'errore è rumoroso invece che invisibile). File `identity.json` **assente** ⇒ `null`, nessun errore (un sito senza identità è legittimo). Il frontend tiene comunque le sue guardie (`isHm` sugli orari) per il caso degradato. `extra` resta l'unico canale per dati off-schema.
- **`twitter:site` da parsing `URL`, non regex:** l'handle Twitter/X per `twitter:site` si estrae con la primitiva `URL` (host esatto + handle dal path), più robusta della vecchia regex sul testo dell'URL.

Migrazione per un figlio: rinomina `backend/data/irl.json` in `identity.json`, sposta dentro i profili social del brand (`"social": [ … ]`, lista di URL) e l'eventuale `"personal": true`; rimuovi `site.social`/`site.personal` da `global-settings.json`. La sezione `Localization` di `global-settings.json` resta (codici a 2 lettere): il backend la arricchisce nelle culture tipizzate per i suoi usi, il frontend deriva la cultura via `Intl`, niente da migrare lì.
