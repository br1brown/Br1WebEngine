# Br1WebEngine

[![CI](https://github.com/br1brown/Br1WebEngine/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/br1brown/Br1WebEngine/actions/workflows/ci.yml)

**Un template full-stack per costruire siti web, basato su ASP.NET Core 9 e Angular 19.**

Br1WebEngine e' un punto di partenza per siti content-driven e piccoli portali. Si usa direttamente cosi' com'e', oppure come base da cui derivare progetti con nome e identita' propri: si clona, si personalizza `site.ts` e `appsettings.json`, e si ottiene subito un sito con rotte, menu, sicurezza, tema, traduzioni e deploy gia' cablati.

---

## Indice
- [Guida Rapida](#guida-rapida)
- [Personalizzare il template](#personalizzare-il-template)
- [Cosa fa da solo](#cosa-fa-da-solo)
- [Tech Stack](#tech-stack)
- [Architettura del Progetto](#architettura-del-progetto)
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

# 2. Configura variabili d'ambiente
# Modifica .env.param: SITE_HOSTNAME, FRONTEND_PORT
# Modifica backend/appsettings.json: Token.SecretKey, ApiKeys, CorsOrigins, BehindProxy

# 3. Deploy in produzione
./deploy.sh
```

Lo script controlla la configurazione e avvia i container. Il frontend sara' disponibile sulla porta configurata in `FRONTEND_PORT`. Per lo sviluppo locale senza Docker, consulta la sezione [Configurazione](#configurazione).

---

## Personalizzare il template

### Creare un nuovo progetto

Clona il template, aggiungi i due remote e lancia lo script di setup:

```bash
git clone https://github.com/br1brown/Br1WebEngine.git NomeProgetto
cd NomeProgetto

# Rinomina il remote originale in "template" (mantieni il collegamento al padre)
git remote rename origin template

# Aggiungi il remote del tuo nuovo repo su GitHub (crealo prima su github.com)
git remote add origin https://github.com/tuoaccount/NomeProgetto.git
git push -u origin main

# Personalizza il nome del progetto
node setup.mjs "Nome Progetto"
```

Lo script aggiorna automaticamente:
- `appName` in `frontend/src/app/site.ts` — il nome visualizzato in navbar, titoli e PWA manifest
- Rinomina `App.sln` → `NomeProgetto.sln`

Al termine suggerisce i campi da toccare a mano in `site.ts`: `version`, `description`, `defaultLang` e `colorTema`.

> `package.json` e `angular.json` usano già nomi generici (`"app"`) — non richiedono modifiche.

### Ricevere aggiornamenti dal template

Con i due remote configurati, puoi aggiornare il tuo progetto ogni volta che il template evolve:

```bash
git fetch template
git merge template/main
# risolvi eventuali conflitti, poi:
git push origin main
```

I conflitti saranno solo sui file che hai personalizzato (tipicamente `site.ts`, i file i18n e le pagine). Il codice infrastrutturale del template (servizi, layout, build) si aggiorna senza toccare la tua logica applicativa.

---

## Cosa fa da solo

Br1WebEngine è costruito intorno a un principio: **se una cosa può derivarsi dalla configurazione, non va scritta a mano.** Configuri `site.ts` e `appsettings.json`, e l'engine si occupa del resto.

### Configurazione e navigazione

Modifichi un solo file di configurazione e rotte, menu, sitemap, meta tag e manifest si aggiornano da soli. Il tipo di ogni voce — pagina interna, gruppo con sotto-pagine, link esterno — si deduce dalla sua struttura: non serve dichiararlo. Ogni pagina ha un'identità stabile: se rinomini un URL tutti i link interni seguono; se rimuovi una pagina il compilatore segnala ogni riferimento rimasto. Le voci disabilitate spariscono da menu e sitemap senza intervento, i gruppi vuoti pure.

### Presentazione e rendering

Ogni pagina sceglie autonomamente il proprio layout (pannello centrale o schermo intero) e la propria strategia di rendering (lato server o solo browser). Titolo, meta description, immagini di anteprima social e JSON-LD strutturati si aggiornano automaticamente ad ogni navigazione e cambio lingua — sia nell'HTML servito ai crawler che nel browser dopo l'idratazione.

### Tema e stile

Un colore hex in configurazione genera in automatico il contrasto del testo (WCAG 2.1), il tono chiaro/scuro propagato a Bootstrap, le variabili CSS e il meta tag colore per i browser mobile. Tutti i colori dell'interfaccia derivano da quel singolo valore tramite CSS nativo — nessun calcolo lato JavaScript aggiuntivo.

### Internazionalizzazione e contenuti

Le lingue disponibili si dichiarano con tag BCP 47 validati a build time. Ogni lingua ha due file di traduzione: uno di base del template e uno di progetto che sovrascrive solo le chiavi necessarie. I contenuti legali sono file Markdown modificabili senza toccare il codice. Il Markdown viene renderizzato con protezione XSS integrata. Il consenso cookie si rileva da solo e blocca le scritture finché l'utente non accetta. I cookie del progetto si registrano in un unico file (`cookie-registry.ts`): il banner GDPR compare automaticamente per le categorie presenti, la pagina Cookie Policy si disabilita da sola quando non ci sono cookie da dichiarare, e il placeholder `{{cookieList}}` nei file Markdown si espande nella tabella dei cookie nella lingua corrente dell'utente — tutto senza configurazione aggiuntiva.

### Backend e sicurezza

Un campo vuoto in configurazione disabilita completamente il login JWT — nessun middleware, nessun overhead. Valorizzato, accende autenticazione, guard e interceptor. Tutta la pipeline di sicurezza (API key, CORS, rate limiting, security headers, gestione errori strutturata) si registra in un'unica chiamata. I controller ereditano attributi e dipendenze comuni: quello concreto aggiunge solo routing e logica. Il contratto di accesso ai dati è separato dall'implementazione — cambiare sorgente dati richiede una riga.

### Componenti pronti all'uso

Menu contestuale (click destro su desktop, long-press su mobile), 35+ piattaforme social con icona e colore brand precisi, condivisione nativa con fallback automatico su clipboard e download, generazione di immagini su canvas con word-wrap e colori dal tema, generatore QR code in cinque formati, ottimizzazione immagini on-demand con conversione WebP. Tutto senza configurazione aggiuntiva.

### Test e qualità automatici

Aggiungere una pagina o una lingua in `site.ts` aggiorna automaticamente anche la test suite — senza toccare gli script. L'audit WCAG e Lighthouse scopre le pagine da testare dallo stesso endpoint `/health` che alimenta la sitemap. Il check i18n legge le lingue dichiarate in configurazione e verifica che tutti i file di traduzione siano allineati. Un pre-commit hook blocca ogni commit che introduce violazioni di accessibilità ESLint. Cinque job CI paralleli coprono linting, type check, simmetria i18n, WCAG 2.1 AA e budget Lighthouse — ciascuno con log separati e segnalazione indipendente.

### Build e deploy

La build genera automaticamente meta tag, sitemap, icone PWA e robots.txt prima di compilare. Docker sostituisce le variabili d'ambiente nel bundle già compilato a runtime — nessun rebuild per cambiare endpoint o chiave API. L'app segnala all'utente quando è disponibile una nuova versione senza forzare il reload.

---

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

### Variabili `.env.param` (file "umano" da modificare)
| Variabile | Obbligatoria | Default | Effetto |
|---|---|---|---|
| `SITE_HOSTNAME` | si | — | Hostname pubblico del sito; usato per derivare `FRONTEND_BASE_URL` |
| `SITE_SCHEME` | no | `https` | Schema usato per derivare `FRONTEND_BASE_URL` |
| `FRONTEND_PORT` | si | — | Porta host del frontend |
| `EXPOSE_BACKEND` | no | `no` | `yes` per esporre il backend sull'host |
| `BACKEND_PORT` | no | `8080` | Porta host del backend, solo se esposto |
| `BACKEND_API_KEY` | no | `frontend` | API key iniettata dal proxy Node verso il backend |
| `COMPOSE_PROJECT_NAME` | no | derivato da `SITE_HOSTNAME` | Nome progetto Docker Compose |

Da `.env.param`, `deploy.sh` genera `.env` (consumato da Docker Compose) derivando automaticamente `FRONTEND_BASE_URL`, `NG_ALLOWED_HOSTS` e `COMPOSE_PROJECT_NAME` se assente.

I valori di produzione (ApiKeys, CorsOrigins, BehindProxy, Token.SecretKey) vanno in `backend/appsettings.json`, committato direttamente.

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
   - `.env.param` (il file "umano" da compilare)
   - `deploy.sh`

   > Non copiare `docker-compose.override.yml`: è pensato per lo sviluppo locale e verrebbe applicato automaticamente.

3. **Configura segreti e `.env`**

   Edita `backend/appsettings.json` e imposta:
   - `Security.Token.SecretKey`: stringa random di almeno 32 caratteri
   - `Security.ApiKeys`: array con la chiave usata dal proxy Node (deve corrispondere a `BACKEND_API_KEY` in `.env`)
   - `Security.CorsOrigins`: domini del frontend in produzione
   - `Security.BehindProxy`: `true` se hai Nginx/Caddy/Traefik davanti (necessario per rate limiting per IP reale)
   - `AllowedHosts`: il tuo dominio (es. `"miosito.it;www.miosito.it"`)

4. **Configura `.env.param` per l'ambiente remoto**
   - `SITE_HOSTNAME`: hostname pubblico del sito (es. `miosito.it`); da qui `deploy.sh` deriva `FRONTEND_BASE_URL` per la sitemap e `NG_ALLOWED_HOSTS` per Angular SSR.
   - `FRONTEND_PORT`: porta del frontend esposta sull'host.
   - `COMPOSE_PROJECT_NAME`: opzionale; se assente viene derivato da `SITE_HOSTNAME`.

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

---

## Guide allo sviluppo

Una volta clonato e configurato il template, le due guide spiegano come estenderlo seguendo i pattern stabiliti:

- **[`frontend/DEVELOPMENT.md`](frontend/DEVELOPMENT.md)** — aggiungere pagine, servizi, componenti, direttive; pattern SSR, signal, i18n; riferimento completo dei servizi e componenti inclusi
- **[`backend/DEVELOPMENT.md`](backend/DEVELOPMENT.md)** — aggiungere endpoint e servizi; gestione errori; sostituire lo store dati; configurare il login JWT; API esposte dal template

## Licenza
Questo progetto e' rilasciato sotto licenza MIT. Vedi [`LICENSE`](LICENSE).
