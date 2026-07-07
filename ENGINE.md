# ENGINE.md

Compagno di [AGENTS.md](AGENTS.md): quello sono le ricette, questo è la **mappa dell'implementazione interna dell'Engine** che i README non citano per nome. `backend/README.md` e `frontend/README.md` documentano la **superficie consumabile** (cosa inietti, estendi, configuri); qui invece stanno i file che quella superficie la implementano — attrezzeria interna, mai un seam. Lo scopo non è invitarti a modificarli (**l'Engine resta INTOCCABILE**, la regola d'oro non cambia): è farti trovare "dov'è" e "perché è fatto così" senza dover leggere il codice a freddo. Come il resto della documentazione dell'Engine, questo file **si aggiorna dal template** al merge — non è tuo, non lo adatti al progetto.

Se un file non compare qui né nei due README, è quasi sempre perché è a scopo singolo e il nome + il commento in testa al file bastano (es. `formatter.ts`, `validation.ts`): non serve una voce dedicata per capirlo.

---

## Backend — `backend/Engine/`

Qui la copertura di `backend/README.md` è già quasi totale per sottosistema (Sicurezza, Mailer, Notifiche, Delivery, Task, Store). Due file non compaiono per **nome classe**, ma il concetto che implementano sì:

| File | Cosa fa | Dove il concetto è già spiegato |
| :--- | :--- | :--- |
| `Engine/Controllers/EngineNotificationStreamController.cs` | Endpoint `GET /notifications/stream`: apre la connessione SSE, scrive l'handshake (`connectionId`), inoltra i messaggi di `INotificationStream`, gestisce keep-alive e `Last-Event-ID` | `backend/README.md` §6 «Notifiche Realtime» |
| `Engine/Mail/MailExceptions.cs` | Le sottoclassi di `ApiException` per il mailer (`MailNotConfiguredException` 503, `MailSendException` 502, `MailInvalidAddressException` 400, `MailAttachmentTooLargeException` 413) | `backend/README.md` §2, tabella «Mappatura completa delle eccezioni» |

---

## Frontend — `frontend/src/app/core/engine/`

### Pipeline SSR (`server/`)

Il Node SSR (`server.ts`) è composto da moduli a scopo singolo, ciascuno testabile/leggibile da solo:

| File | Cosa fa | Perché è fatto così |
| :--- | :--- | :--- |
| `server-env.ts` | Sorgente unica delle variabili d'ambiente, valutata **lazy** | L'import da solo non legge nessuna env var: così il build Angular (route extraction) può importare questo modulo senza che le variabili runtime esistano ancora. La validazione delle obbligatorie avviene in `server.ts` solo all'avvio reale |
| `server-paths.ts` | Risolve le cartelle fisiche (dist browser/server, cache immagini) | La cache vive fuori da `src/assets` e isolata per progetto (hash del percorso): impedisce a `ng serve` di ricaricare la pagina a ogni thumbnail generato e a più progetti sullo stesso host di mischiare le immagini |
| `security-headers.ts` | Carica `security-headers.json` (sorgente condivisa col backend) e li applica alle risposte Node | Fallback imbottito nel codice se il file manca, così il server parte comunque protetto invece di servire senza header |
| `asset-mapping.ts` / `asset-handler.ts` | Risolvono l'ID asset dichiarato in `mapping.json` al file fisico reale; rilevano se un file è un'immagine raster ridimensionabile da Sharp | Nascondono i percorsi fisici agli utenti e distinguono i formati compatibili con resize da quelli da servire tali e quali (es. SVG) |
| `image-cache.ts` | Cache su disco delle immagini ridimensionate, con tetto di dimensione (default 500 MB, `IMAGE_CACHE_MAX_MB`) e sweep LRU periodico (ogni 6h) | Evita di rigenerare ogni resize a ogni richiesta senza lasciare che la cache cresca senza limite tra un deploy e l'altro |
| `fs-utils.ts` | `fileExists()`: verifica asincrona (`access`), non `existsSync` | Un check sincrono sospenderebbe l'event loop mentre il disco risponde; l'asincrono no |
| `preview-crypto.server.ts` | Cifra (AES-GCM) il payload di `/cdn-cgi/preview` | Solo Node (mai nel bundle browser); la chiave, in ordine di fallback, è un secret esplicito → la prima API key → `nomeApp:versione` — così il blob resta non falsificabile anche senza configurare nulla |
| `server-font-metrics.ts` + `preview-builder.ts` | Deriva le metriche dei font **realmente installati** nel container (via `fc-match` + parser TTF minimale) per costruire l'SVG dell'og:image dinamica | Le tabelle di metriche baked-in andrebbero disallineate a ogni cambio di pacchetto font nel Dockerfile; leggerle dai font reali le tiene sempre corrette |
| `routes/api-proxy.ts`, `routes/cdn-asset.ts`, `routes/og-preview.ts` | Handler Express concreti dietro `/api`, `/cdn-cgi/asset`, `/cdn-cgi/preview` | Le tre route sono già descritte a alto livello nel [README root](README.md) («Route SSR speciali»); qui c'è il "come" per chi deve toccarne il comportamento |

### Navigazione multilivello (`components/navbar`, `footer-nav*`, `nav-*`)

`navbar.component.ts`, `footer-nav.component.ts` + `footer-nav-group.component.ts` (footer, ricorsivo), `nav-dropdown.component.ts` + `nav-submenu.component.ts` (flyout desktop / accordion mobile della navbar) e l'atomo `nav-link.component.ts` sono la resa concreta della feature "Menu Multilivello" (già descritta a livello di configurazione in `site.ts`/root README): la scomposizione in più componenti serve a gestire la ricorsione dei gruppi annidati senza duplicare la logica di stato attivo/hover tra footer e navbar. `back-to-top.component.ts` è indipendente: appare dopo 300px di scroll, nessun legame col menu.

### Effetto smoke (`components/smoke-effect/smoke-effect.component.ts`)

Il componente che renderizza l'animazione di particelle. Il *contratto* (`SmokeSettings`, i default, quando si autodisattiva) è già interamente documentato in `frontend/README.md` («Effetto smoke: il contratto `SmokeSettings`») — questa riga esiste solo perché quella sezione non nomina la classe: se cerchi "chi disegna lo smoke" è questo componente, montato da `app.component.ts` (la shell, tua) che gli passa `showSmoke` già calcolato.

### Overlay del menu contestuale (`components/context-menu/`)

`context-menu-overlay.component.ts` (rendering dell'overlay) e `context-menu.models.ts` (forma di `ContextMenuOption`) sono l'implementazione dietro il selettore `[appContextMenu]` (già documentato). Overlay custom, senza dipendenza da Angular CDK.

### Direttive di rendering dichiarativo (`directives/`)

`img-render.directive.ts` e `qr-render.directive.ts` sono l'implementazione dietro `[appImgRender]`/`[appQrContent]` (selettori già documentati in `frontend/README.md`): trasformano un `<img>` nel render di un'immagine generata via `ImgBuilderService` o di un QR via `QrCodeService`.

### Interceptor errori API (`interceptors/api-error.interceptor.ts`)

Implementa il toast automatico sugli errori HTTP per le richieste **non** marcate `{ silent: true }` (pattern già documentato). È un interceptor Angular a sé — non più logica dentro `BaseApiService` — per tenere il client API puro (idioma Angular per i concern trasversali).

### Cookie interni (`services/cookie/`)

`cookie-type.ts` definisce `ConsentCategory` (Technical/Analytics/Profiling), la tassonomia dietro le voci di `COOKIE_MAP` (vedi ricetta in `AGENTS.md`). `cookie-utils.ts` è un check statico usato **in fase di build** da `siteBuilder.ts` per decidere se includere lo slot `legalPages.cookie` — non è runtime, è un dettaglio di composizione del sito.

### Connessione realtime, dettaglio interno (`services/notification-connection.ts`)

Tiene il `connectionId` corrente in un signal separato da `NotificationStreamService`: permette a `BaseApiService` di leggerlo (per l'header `X-Connection-Id`) **senza iniettare — e quindi attivare — lo stream**. Finché nessuno apre lo stream resta `null`.

### Pagine legali (`legal/legal-pages.ts`)

Definisce la forma fissa di ogni pagina legale (slot, path sotto `/policy/`, componente, `PageType`) consumata da `siteBuilder.ts` per auto-cablare le pagine dichiarate in `legalPages`. Il progetto figlio non tocca questo file: agisce sugli slot in `site.ts`.
