# Br1WebEngine - Docker Setup

Guida operativa per eseguire Br1WebEngine con Docker. Per architettura completa, DSL frontend e personalizzazione del progetto, vedi anche [README.md](README.md).

## Modello di utilizzo

Il template Docker e' progettato per essere riusabile su piu' progetti sulla stessa VPS. Ogni progetto derivato dal template viene eseguito in una propria cartella con un proprio `global-settings.json` e una propria porta.

### Inizializzazione (una sola volta, alla nascita del progetto)

La configurazione è divisa in quattro file per proprietario (i primi tre validati da `global-settings.schema.json` per l'autocomplete):

- **`global-settings.json`** — del **progetto**, committabile: identità e aspetto (`project`, `Localization`, `site`, `Custom`).
- **`global-settings.local.json`** — **gitignored**: pubblicazione e segreti del singolo ambiente (`frontend`, `backend`, `Security`, `Mail`).
- **`security-headers.json`** — del **template**, non si tocca: header di sicurezza fissi. Il Node SSR ne verifica lo sha256 all'avvio e si rifiuta di partire se è stato modificato a mano.
- **`security-headers.override.json`** — del **progetto**, committabile: estensioni dichiarative alla CSP (nuovi domini in `connect-src`/`img-src`/`frame-src`/...), senza toccare il file del template. Vedi [frontend/README.md](frontend/README.md) §"Estendere la CSP".

`scripts/deploy.sh` fonde i primi due e monta il risultato; backend e Node SSR lo leggono. La scorciatoia `node setup.mjs "Nome Progetto"` imposta il nome nel file di progetto e crea il `.local` coi segreti generati.

### Avvio di un progetto derivato

Per il percorso guidato passo-passo vedi [QUICKSTART.md](QUICKSTART.md). Il meccanismo sotto: `./scripts/deploy.sh` legge `global-settings.json`, verifica la configurazione e avvia i container. Il file viene montato in entrambi i container in sola lettura (`/app/global-settings.json:ro`): cambiare il file e rieseguire il deploy è sufficiente per applicare la configurazione a tutti i livelli.

> Produzione vs test: `./scripts/deploy.sh` builda le immagini sulla macchina dove lo lanci, comodo per lo sviluppo locale e i test, ma sconsigliato in produzione. Per la produzione il modello consigliato è artifact-based: la CI builda le immagini a ogni tag e le pubblica su GHCR, la VPS le scarica con `./scripts/deploy-release.sh`. Niente sorgente, niente `git pull`, niente build in loco. Guida completa in [RELEASE.md](RELEASE.md).

### Esposizione dei servizi

- Ogni progetto espone il frontend su una porta host dedicata (`frontend.port`, es. `http://IP:3000`, `http://IP:3001`)
- Il backend puo' essere esposto impostando `backend.public: true` (richiede `docker-compose.backend-exposed.yml`)
- Frontend e backend comunicano sempre tramite rete Docker interna

### Esempio: due progetti sulla stessa VPS

```text
/home/deploy/progetto-a/global-settings.json   →  project.name "Progetto A"  frontend.port 3000
/home/deploy/progetto-b/global-settings.json   →  project.name "Progetto B"  frontend.port 3001
```

Risultato:
- `http://IP:3000` → progetto-a
- `http://IP:3001` → progetto-b
- `COMPOSE_PROJECT_NAME` è derivato slugificando `project.name` (`Progetto A` → `progetto-a`)
- Volumi separati: `progetto-a_uploads-data`, `progetto-b_uploads-data` (naming automatico Docker Compose)
- Nessun conflitto di container

## File Compose

- **`docker-compose.yml`** — base: servizi, build, rete, volumi.
- **`docker-compose.release.yml`** — override di **produzione**: usa immagini pre-costruite da GHCR (`image:`) invece di ricostruire da sorgente (`build:`). Lo usa `./scripts/deploy-release.sh` (vedi [RELEASE.md](RELEASE.md)).
- **`docker-compose.backend-exposed.yml`** — opzionale: espone il backend verso l'host su `BACKEND_PORT` (quando `backend.public: true`)
- **`docker-compose.public-test.yml`** — overlay per simulare un reverse proxy pubblico davanti al frontend SSR (usato dai test a11y/Lighthouse via `scripts/test/public-test.sh`). Indicizzazione lasciata attiva (il test SEO/Lighthouse misura la pagina reale); per un'anteprima non-indicizzabile avviala con `PUBLIC_TEST_NOINDEX=true`

> Lo sviluppo locale non passa da Docker: si usa lo script del frontend (Angular dev server) + Visual Studio per il backend.

## Configurazione

Due file da modificare (il terzo, `security-headers.json`, è del template). Le chiavi e i vincoli
sono documentati in `global-settings.schema.json`, quindi l'editor offre autocomplete e validazione.

> **Scorciatoia:** `node setup.mjs "Nome Progetto"` imposta il nome nel file di progetto e crea
> `global-settings.local.json` coi **segreti già generati** (SecretKey JWT + API key).
> A mano: `cp global-settings.local.example.json global-settings.local.json` poi
> `openssl rand -base64 48` (SecretKey) e `openssl rand -base64 32` (ApiKey).

Al deploy, `scripts/deploy.sh` fonde `global-settings.local.json` sopra `global-settings.json` (merge
profondo; gli array come `ApiConfig.Keys`/`SupportedLanguages` vengono sostituiti), genera
`.br1-settings.effective.json` (gitignorato) e monta quello nei container. L'intero
`global-settings.json` del progetto (`project`/`Localization`/`site`/`Custom`, senza segreti) viene
inoltre passato al build del frontend come ARG `BR1_PROJECT_JSON` e iniettato in `environment.ts`.
Da questo stesso JSON il generatore di file statici (`generate-statics.ts`) ricava lingua di default e
lingue supportate (sezione `Localization`) per SEO e `environment.ts`: non servono build-arg dedicati.

> Manca `global-settings.local.json`? Gli script di pubblicazione (`scripts/deploy.sh`,
> `scripts/deploy-release.sh`) lo creano da soli generando i segreti (`SecretKey`/`ApiConfig.Keys`/`CryptoSecret`)
> ma lasciando `frontend.hostname` vuoto di proposito: le chiavi sono boilerplate, il dominio è una
> tua scelta consapevole. Il deploy quindi si ferma finché non imposti il dominio (fail-closed:
> niente dominio ⇒ niente 421 al dominio reale), e la porta se hai altri progetti sulla stessa VPS.
> Il mailer resta spento finché non aggiungi una sezione `Mail`. Niente valori finti che aggirerebbero i
> controlli. (Nei test/CI invece si resta senza `.local`: `scripts/lib/br1-config.sh` usa una API key
> effimera in memoria, senza scrivere file.)

### `global-settings.json` — progetto (committabile)

| Chiave | Default | Descrizione |
|---|---|---|
| `project.name` | `App` | Nome dell'app; mostrato in UI/manifest e slugificato in `COMPOSE_PROJECT_NAME` |
| `project.version` | `1.0.0` | Versione dell'app: meta `app-version`, manifest, rilevamento aggiornamenti |
| `project.lastModified` | data del build | Ultima modifica contenuti (`GG/MM/AAAA`): `<lastmod>` sitemap + `og:updated_time`. Bumpala a mano |
| `Localization.DefaultLanguage` | `it` | Lingua di default: tag BCP-47 valido e **incluso in `SupportedLanguages`** |
| `Localization.SupportedLanguages` | `["it","en"]` | Lingue supportate (tag BCP-47, almeno 1 elemento; deve includere `DefaultLanguage`) |
| `site.description` | — | Descrizione per-lingua `{ it, en, … }` (SEO, footer, social); build usa la lingua default, SSR localizza |
| `site.colorTema` | — | Colore tema (hex): palette OKLCH + tono testo |
| `site.smoke` | — | Effetto particellare di sfondo (ometti/`enable:false` per disattivarlo). Sottocampi: `enable`, `color`, `opacity`, `maximumVelocity`, `particleRadius`, `density` |
| `Custom` | `{}` | Valori liberi leggibili da backend (`IConfiguration["Custom:..."]`) e Node SSR (`getBr1Settings().Custom`) |

> I flag di comportamento (`showNav`, `showFooter`, `showPanel`, `fixedTopHeader`, `showNotifications`, `panelSurface`, `isWebApp`, `onlyPlainImage`, il `showInHeader` di `loginPage`) sono struttura e vivono in `frontend/src/app/site.ts` (`shell` / `isWebApp` / `onlyPlainImage` / `loginPage`). L'icona di brand nella navbar è invece `ShellNavResolver.brandIcon` in `nav.ts`, dato risolto a runtime (vedi frontend/README.md).

### `global-settings.local.json` — pubblicazione + segreti (gitignored)

| Chiave | Default | Descrizione |
|---|---|---|
| `frontend.hostname` | `""` | Dominio pubblico senza schema. Deriva `FRONTEND_BASE_URL` e `NG_ALLOWED_HOSTS`. Senza hostname (né `NG_ALLOWED_HOSTS`) il Node SSR accetta solo gli host locali ed è **fail-closed**: in produzione il traffico reale viene rifiutato con **421 Misdirected Request**. Per più domini, imposta direttamente `NG_ALLOWED_HOSTS` (vedi sotto) |
| `frontend.port` | `3000` | Porta host del frontend |
| `backend.public` | `false` | `true` espone il backend sull'host (richiede `docker-compose.backend-exposed.yml`) |
| `backend.publicPort` | `null` | Porta host del backend, solo se `public: true` |
| `Security.ApiConfig.Keys` | — | Chiavi API del backend (header `X-Api-Key`); il frontend usa `[0]`. In prod ≥32 char |
| `Security.ApiConfig.RateLimiting.*` | vedi [backend/README.md](backend/README.md) | Soglie del rate limiter (globale, login) ed `Enabled` per disattivarlo |
| `Security.CorsOrigins` | `[]` | Origini CORS ammesse |
| `Security.BehindProxy` | `false` | `true` quando si è dietro un reverse proxy (legge `X-Forwarded-For`) |
| `Security.Token.SecretKey` | `""` | Segreto JWT (≥32 char): se valorizzato attiva il login. Vuoto = login disabilitato |
| `Security.Token.ExpirationSeconds` | `3000` | Durata dei JWT emessi (minimo 60) |
| `Mail.*` | — | Config SMTP del mailer (`Host`, `Port`, `Security`, `FromAddress`, `FromName`, `Username`, `Password`, più i tuning `TimeoutSeconds`/`MaxAttachmentBytes`/`VerifyRecipientDomain`): contiene segreti, vive qui. Si attiva come il login: con `Host` **e** `FromAddress` presenti il mailer è acceso, altrimenti resta spento e ogni invio risponde `503`. L'esempio (`global-settings.local.example.json`) include già un blocco SMTP attivo: se non usi la posta, svuotalo. Dettaglio dei campi in [backend/README.md](backend/README.md) (sezione Mailer) |
| `ErrorReporting.WebhookUrl` | `""` | URL di un webhook generico (POST JSON) a cui l'Engine segnala ogni bug vero o errore ≥500. Vuoto = spento, nessuna chiamata uscente. Nessun SDK di vendor: se punti più progetti sulla stessa VPS allo stesso webhook, il payload porta `project` per distinguerli. Dettaglio in [backend/README.md](backend/README.md) (sezione Error Reporting) |

> Header di sicurezza in `security-headers.json`. Gli header fissi rivolti al browser
> (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy, CSP) sono
> uguali per ogni progetto: vivono in `security-headers.json` (file del template, montato in
> entrambi i container e letto da backend e Node SSR). Appartiene al template, non al progetto figlio: lo riceve e lo aggiorna col merge dal template, l'unica
> eccezione è l'override documentato nella `_nota` del file (vedi il README principale). In
> `global-settings` resta solo la sicurezza del progetto: `ApiConfig`, `CorsOrigins`, `BehindProxy`, `Token`.

`BACKEND_ORIGIN` (`http://backend:8080`) resta una variabile d'ambiente del compose: è l'indirizzo Docker-interno del backend, non una scelta di configurazione utente. Stesso trattamento, direzione opposta, per `Frontend__Origin` (`http://frontend:3000`, sezione `Frontend` del backend, convenzione .NET `Frontend:Origin`): l'indirizzo Docker-interno del frontend, usato solo da `SitemapNotifier` per invalidare la cache di `/sitemap.xml` dopo una scrittura su un catalogo `dynamicParams` (dettaglio in [backend/README.md](backend/README.md)).

### Variabili d'ambiente del frontend SSR (opzionali)

Variabili lette al boot dal container Node frontend (`frontend/src/app/core/engine/server/server-env.ts`). Non stanno in `global-settings.json`: si impostano nell'ambiente del container quando servono, altrimenti valgono i default.

| Chiave | Default | Descrizione |
|---|---|---|
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Valore di Express `trust proxy`. Lista ristretta (subnet private) per evitare lo spoofing di `X-Forwarded-Host`/`X-Forwarded-For` e il bypass dell'allowlist |
| `PROXY_TIMEOUT_MS` | `30000` | Timeout (ms) delle chiamate proxy `/api/*` verso il backend |
| `PREVIEW_CRYPTO_SECRET` | `""` | Chiave AES-GCM per cifrare i payload og:image di `/cdn-cgi/preview`. Se vuota, la chiave ricade sull'**API key server-side** (`Security.ApiConfig.Keys[0]`, un segreto → i blob restano non falsificabili) e, solo in sua assenza, su `appName:version`. Impostala per disaccoppiare la firma delle anteprime dalla rotazione delle API key |
| `NG_ALLOWED_HOSTS` | — | Allowlist host SSR, lista separata da virgole. **Ha precedenza su `frontend.hostname`** (utile per multi-dominio). Se né questa né l'hostname sono valorizzati, fallback fail-closed agli host locali → gli host reali ricevono `421` |
| `IMAGE_CACHE_DIR` | `<temp di sistema>/…` | Cartella dei thumbnail di `/cdn-cgi/asset` e `/cdn-cgi/preview`. Default nella temp (isolata per progetto), quindi **effimera**: riparte fredda a ogni riavvio. Per una cache **calda tra i deploy**, monta un volume persistente e puntalo qui (dettaglio in [frontend/README.md](frontend/README.md)) |
| `IMAGE_CACHE_MAX_MB` | `500` | Cap della cache immagini su disco; oltre la soglia uno sweep LRU ogni 6 ore la riporta al 90% del cap |
| `IMAGE_JOBS_MAX` | `max(2, CPU disponibili)` | Tetto di concorrenza sui job `sharp` (decode/resize) di `/cdn-cgi/asset` e `/cdn-cgi/preview` — indipendente dal cap di dimensione sopra. Le richieste eccedenti aspettano in una coda FIFO interna (non bounded, nessun timeout): su cache fredda con molte immagini nella stessa pagina, un ritardo di caricamento silenzioso invece di un errore. Dettaglio in [frontend/README.md](frontend/README.md) |
| `SEO_NOINDEX` | `false` | Se `true` (`1`/`yes`/`on`), rende l'intero deploy **non indicizzabile**: `X-Robots-Tag: noindex, nofollow` su ogni risposta + `robots.txt` dinamico `Disallow: /`. Per staging/anteprima dietro lo stesso reverse proxy della produzione. **Lascialo spento in produzione (default).** Su un deploy si imposta come passthrough prima del comando: `export SEO_NOINDEX=true; ./scripts/deploy.sh` (stessa convenzione di `Mail__Password`). L'overlay `docker-compose.public-test.yml` lo lascia spento (così il test SEO/Lighthouse è significativo); per un'anteprima non indicizzabile avviala con `PUBLIC_TEST_NOINDEX=true` |
| `FONTS_DIR` | `/app/fonts` | Cartella in cui il server cerca il file dichiarato in `siteFonts.custom` (`frontend/src/styles/font-config.ts`) — vedi sotto. Il default coincide già col mount point Docker; da impostare solo per uno sviluppo locale con un percorso diverso |
| `SITEMAP_CACHE_TTL_MS` | `604800000` (7 giorni) | TTL della cache in-process di `/sitemap.xml` per le pagine con `dynamicParams`. Alto perché non è il meccanismo primario di aggiornamento: l'invalidazione vera arriva on-demand dal backend (`SitemapNotifier`, `POST /internal/revalidate-sitemap`) dopo una scrittura su un catalogo dinamico — questo TTL è solo il fallback se quella notifica si perde. Dettaglio in [frontend/README.md](frontend/README.md) |

### Variabili d'ambiente del backend (opzionali)

Stessa logica del frontend sopra: non stanno in `global-settings.json`, si impostano nell'ambiente del container solo quando serve, altrimenti valgono i default.

| Chiave | Default | Descrizione |
|---|---|---|
| `BLOB_WEBOPT_CACHE_MAX_MB` | `500` | Cap della `MemoryCache` in-process che tiene i blob ridimensionati/riconvertiti al volo (`GET /blob/{slug}?webopt=true`) — dedicata, separata dalla `IMemoryCache` condivisa usata per i JSON di config. Superato il tetto, l'eviction è automatica (nativa di `MemoryCache`, non uno sweep a orario come `IMAGE_CACHE_MAX_MB`). Dettaglio in [backend/README.md](backend/README.md) § `EngineBlobController` |

### Font custom (opzionale)

Metti il file font in `./fonts` (host, accanto a `global-settings.json`), poi dichiaralo in `siteFonts.custom` (`family`/`file`) in `frontend/src/styles/font-config.ts` — `docker-compose.yml` monta quella cartella in sola lettura su `/app/fonts`. `custom` assente o file mancante dalla cartella: nessun cambiamento, resta lo stack di font di sistema di oggi. Il font sostituisce sia quello del sito sia quello delle immagini Open Graph (`/cdn-cgi/preview`) — non solo il web. Per un percorso host diverso da `./fonts`: `export BR1_FONTS_DIR=/percorso/font; ./scripts/deploy.sh`.

## Sviluppo locale

Lo sviluppo non passa da Docker. Si avviano i due progetti separatamente:

```bash
# Backend (.NET 9)
cd backend && dotnet run        # oppure Visual Studio

# Frontend (Angular 21)
cd frontend && npm install && npm run start
```

Il frontend si connette al backend tramite proxy. Docker resta per la pubblicazione e per i test simili alla produzione.

## Pubblicazione (`scripts/deploy.sh`)

> In produzione il modello consigliato è artifact-based (`scripts/deploy-release.sh`: la CI builda le immagini, la VPS le scarica; vedi [RELEASE.md](RELEASE.md)). `scripts/deploy.sh` qui sotto è source-based (builda sulla macchina): ottimo per test e sviluppo locale. I due condividono preflight, guard e swap; cambia solo chi costruisce le immagini.

```bash
# Configurare global-settings.local.json con i valori del progetto, poi:
# (se manca, lo script lo crea con le chiavi generate e hostname VUOTO: imposti tu il dominio)
./scripts/deploy.sh                # pubblica frontend + backend
./scripts/deploy.sh --frontend     # solo il frontend
./scripts/deploy.sh --backend      # solo il backend
./scripts/deploy.sh --no-cache     # rebuild immagini ignorando la cache Docker (combinabile coi flag sopra)
```

In produzione:

- **Frontend** su `http://localhost:FRONTEND_PORT`
- **Backend** privato per default (per esporlo: `backend.public: true` in `global-settings.local.json`)

Frontend e backend sono disaccoppiati: puoi pubblicarli insieme o uno alla volta (anche su VPS diverse). Il backend è privato o pubblico secondo `backend.public`.

> Guard segreti (automatico): al deploy `scripts/deploy.sh` verifica che non siano rimasti i segreti segnaposto/deboli di default. Se `Security.Token.SecretKey` è ancora la chiave di sviluppo o è < 32 caratteri, o se `Security.ApiConfig.Keys` contiene `frontend` / chiavi < 32 caratteri, il deploy si ferma con un messaggio esplicito (e il comando `openssl` per generarne uno sicuro). I segreti si generano con `openssl rand -base64 48` (JWT) e `openssl rand -base64 32` (API key).

> Guard pubblicazione (automatico): due errori silenziosi tipici dietro reverse proxy, intercettati prima della build:
> - **`frontend.hostname` mancante** → il deploy si ferma. Senza hostname l'SSR è fail-closed e risponderebbe 421 al dominio reale (e sitemap/canonical/og userebbero `example.com`); insidioso perché l'healthcheck del preflight gira su `localhost` e passerebbe: il deploy sembrerebbe riuscito mentre il sito è irraggiungibile dal dominio vero.
> - **`Security.BehindProxy` non `true`** → avviso non bloccante: dietro nginx il rate limiter conterebbe tutti gli utenti come un solo IP (l'IP del proxy), condividendo lo stesso budget di 500 req/min. Impostalo a `true` se usi un proxy; ignora l'avviso se esponi il sito senza proxy.

> Checklist di pre-lancio (automatico, non bloccante): promemoria incorporati nello script invece che in un documento a parte — un file che nessuno riapre non serve a niente il giorno del deploy vero. Avvisa (senza fermarsi) se `project.name` è ancora il default `"App"`, e se `backend/data/identity.json` è ancora lo scheletro vuoto lasciato da `setup.mjs` → eject (footer, pagine legali e JSON-LD restano vuoti finché non lo compili — o è una scelta consapevole, in tal caso ignoralo). `deploy-release.sh` verifica solo `project.name`: nel modello artifact-based non c'è sorgente sulla VPS, `identity.json` non è lì da controllare.

> Password SMTP fuori dal disco: `docker-compose.yml` dichiara un passthrough `Mail__Password` (convenzione .NET: `Mail:Password`). Esportandola nell'ambiente prima del deploy (`export Mail__Password='...'; ./scripts/deploy.sh`), il backend la legge con precedenza sul JSON montato e la password non finisce mai nel file su disco. Se la variabile non è impostata vale il valore (eventuale) di `Mail.Password` nel `.local`.

Il frontend gira su Node SSR: serve l'app Angular e proxya `/api/*` al backend sulla rete Docker interna, iniettando l'API key lato server.

Come funziona `scripts/deploy.sh`, in breve:
1. **Build + preflight isolato**: costruisce le nuove immagini (incluso `npm run lint`) e le avvia in una **copia usa-e-getta su porte effimere** (`FRONTEND_PORT=0`/`BACKEND_PORT=0`: niente collisioni con la produzione), attendendo che diventino **sane** tramite gli HEALTHCHECK dei Dockerfile (`--wait`). Se la build non compila **o** non parte sana, ci si ferma qui e il sito attuale **resta intatto**.
2. **Swap**: solo se il preflight è verde, `docker compose up -d --wait` sostituisce i container di produzione (immagini riusate dalla cache, ricontrollo salute sulle porte reali). È un blue/green leggero: zero-downtime se la nuova build parte male.
3. **Porte**: se una porta è occupata da un altro progetto, `scripts/deploy.sh` lo **segnala** soltanto e prosegue (è Docker a riportare l'eventuale errore di bind). Nessun container viene fermato automaticamente.

La suite di qualità (lint, i18n, type checking, dipendenze circolari, accessibilità WCAG, Lighthouse) non è rieseguita da `scripts/deploy.sh`: gira in CI a ogni push/PR. In locale, on-demand: `./scripts/test/run-all.sh`.

## Test pubblico dietro reverse proxy

Per riprodurre in locale la catena reale `browser -> reverse proxy -> frontend SSR -> backend` usa l'overlay dedicato:

```bash
docker compose -f docker-compose.yml -f docker-compose.public-test.yml up -d --build
```

URL di test predefinito:

- `http://localhost:8088`

Cosa simula davvero:

- browser che parla con un hostname pubblico
- reverse proxy che inoltra `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` e `X-Forwarded-Port`
- frontend SSR che valida l'host autorizzato
- proxy `/api/*` del frontend verso il backend interno Docker

Smoke test utili:

```bash
curl -i http://localhost:8088/health
curl -i http://localhost:8088/
curl -i http://localhost:8088/api/health
```

Script pronto (alza lo stack dietro il proxy e lo lascia su):

```bash
bash scripts/test/public-test.sh
# poi, con lo stack ancora su:
bash scripts/test/live-test.sh http://localhost:8088
```

Per cambiare dominio/porta simulati senza toccare i file:

```bash
PUBLIC_TEST_PORT=9090 \
PUBLIC_TEST_BASE_URL=http://miosito.localhost:9090 \
PUBLIC_TEST_ALLOWED_HOSTS=miosito.localhost \
docker compose -f docker-compose.yml -f docker-compose.public-test.yml up -d --build
```

In alternativa, `public-test.sh` espone gli stessi parametri come flag (più comodo delle env var `PUBLIC_TEST_*`):

```bash
bash scripts/test/public-test.sh --public-host miosito.localhost --public-port 9090 --no-cache --down-after
```

- `--public-host` (default `localhost`) e `--public-port` (default `8088`) impostano host/porta simulati
- `--no-cache` ricostruisce le immagini da zero
- `--down-after` spegne lo stack al termine

Per verificare che il problema sia davvero l'host check SSR, si prova intenzionalmente un host non autorizzato:

```bash
curl -i http://127.0.0.1:8088/avventura/poveri-maschi -H "Host: host-sbagliato.localhost"
```

In quel caso il frontend dovrebbe loggare il rifiuto dell'host e smettere di comportarsi come se fosse una richiesta pubblica valida.

### Esporre il backend

Imposta `backend.public: true` (e `backend.publicPort`) in `global-settings.local.json`. `scripts/deploy.sh` ne deriva l'esposizione e applica l'overlay `docker-compose.backend-exposed.yml`.

Nota: la porta pubblicata controlla solo la porta sull'host. Il container backend continua ad ascoltare internamente su `8080`, quindi l'overlay `docker-compose.backend-exposed.yml` mappa `publicPort:8080`.

### Controlli all'avvio

`scripts/deploy.sh` verifica che `COMPOSE_PROJECT_NAME` e `FRONTEND_PORT` siano impostati prima di avviare Docker.
Lo script esegue anche un controllo intelligente sulle porte: legge le etichette (`com.docker.compose.project`) dei container Docker per capire se una porta occupata appartiene allo stesso progetto (che sta per essere aggiornato) o a un altro progetto, prevenendo conflitti incrociati.
Con `--no-cache` forza la ricostruzione delle immagini partendo da zero.

## Backup dei dati (`scripts/backup.sh`)

I dati che sopravvivono ai deploy vivono in due volumi Docker: `<progetto>_uploads-data` (file caricati) e `<progetto>_db-data`. Lo script `scripts/backup.sh` ne crea archivi `.tar.gz` datati con retention automatica.

> Consistenza: un `tar` a caldo del volume, non un dump. Lo script monta il volume in sola lettura e lo comprime mentre i container restano in esecuzione, senza stop, senza flush. Per `uploads-data` va bene così: gli slug sono immutabili, un file caricato non viene mai riscritto (vedi backend/README.md § BlobStore). Per `db-data` oggi non c'è nulla da rendere inconsistente (`FileContentStore`, il default del template, non ci scrive: è un mount point riservato a un DB futuro). Se il progetto migra a un database reale che scrive su quel volume, un `tar` a caldo non garantisce più una copia transazionalmente coerente: servirebbe lo strumento di backup nativo del DB (es. `pg_dump`) al posto del `tar` grezzo su quel volume specifico.

```bash
./scripts/backup.sh                  # backup in ./backups, tiene i 14 archivi più recenti (per volume)
RETENTION=30 ./scripts/backup.sh     # cambia quanti archivi tenere (è un conteggio, non giorni)
BACKUP_DIR=/mnt/dati ./scripts/backup.sh
```

Pianificalo via cron (la cartella `backups/` è gitignorata):

```bash
0 3 * * * cd /percorso/progetto && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Ripristino di un volume da un archivio (sovrascrive i dati):

```bash
docker run --rm -v <progetto>_uploads-data:/data -v "$PWD/backups":/b alpine \
  sh -c 'rm -rf /data/* && tar xzf /b/uploads-data-AAAAmmGG-HHMMSS.tar.gz -C /data'
```

## Comandi utili

```bash
# Avvia in background
docker compose up --build -d

# Ferma i servizi
docker compose down

# Ferma e rimuovi anche i volumi
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

| | Dev (locale, no Docker) | Prod (Docker) |
|---|---|---|
| Frontend | `npm run start` (Angular dev server) | Node SSR su `FRONTEND_PORT` |
| Backend | `dotnet run` / Visual Studio | ASP.NET Core Production su `8080` (interno o esposto) |
| Avvio | due processi separati | `./scripts/deploy.sh` (build locale) — in prod meglio `./deploy-release.sh` da release ([RELEASE.md](RELEASE.md)) |

## Nota pratica

Lo sviluppo quotidiano si fa con Visual Studio (backend) e Angular CLI (frontend); Docker non è obbligatorio. Docker resta utile per:

- pubblicazione: `scripts/deploy.sh` (build locale) o, consigliato in prod, release artifact-based ([RELEASE.md](RELEASE.md))
- test della configurazione container
- ambienti simili alla produzione (`scripts/test/public-test.sh`)
