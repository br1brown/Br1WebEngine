# AGENTS.md

Le regole trasversali e le ricette pratiche del progetto, per chi ci sviluppa, umano o assistente di coding. Gli esempi di codice qui sotto servono soprattutto a un agente, per evitargli di scandire mezzo repo per ricavare un pattern; a un umano bastano i puntatori, il codice lo legge direttamente. Il cosa offre e dove vive per-feature sta nei README ([frontend](frontend/README.md), [backend](backend/README.md)); l'implementazione interna dell'Engine non citata per nome in quei README sta in [ENGINE.md](ENGINE.md).

> Il file si chiama proprio `AGENTS.md` e non va rinominato. Non è una scelta di stile: è un nome-convenzione cross-tool, non legato a Br1WebEngine né a un singolo strumento. Diversi coding agent (Claude Code, Codex CLI, Cursor e altri) cercano in automatico, alla radice di un repo, un file con esattamente questo nome per caricare contesto di progetto, nessuna configurazione da parte tua. Un umano lo trova comunque se linkato (come nella mappa di [README.md](README.md)); un agente lo trova da sé finché resta `AGENTS.md`, e non oltre. Rinominarlo (es. `DEVGUIDE.md`, `RECIPES.md`) non romperebbe nulla per un lettore umano, ma toglierebbe l'auto-discovery agli agenti, la proprietà per cui questo file è fatto così.

## La regola d'oro: Engine vs Dominio

- **Engine = INTOCCABILE**, si aggiorna dal template via merge: `backend/Engine/`, `frontend/src/app/core/engine/`, `frontend/src/styles/engine/`, `frontend/src/assets/i18n/basic.*.json`, `frontend/src/app/components/shared/design-systems/engine/` (i preset di design system pronti del template: li estendi con `extendDesignSystem` o li copi in un file tuo). Lo **consumi** (token, signal, direttive, classi base, preset), non lo modifichi mai.
- **Dominio = tuo**: tutto il resto. Cambi i comportamenti per **configurazione** (`global-settings(.local).json`, `site.ts`, sezione `Custom`) o per **estensione** (sottoclassi `Engine*`, nuovi servizi), mai editando l'Engine — o il prossimo merge dal template va in conflitto.
- **Risolvere un conflitto di `git merge template/main`:** sui path Engine e Scaffold vince **sempre** il template (`git checkout template/main -- <path>`); sul Dominio vince **sempre** il tuo progetto. Alcuni file di Dominio sono però **a contratto fisso** con l'Engine (path/nome export/forma non negoziabili, es. `site.ts`, `api.service.ts`) — l'elenco completo e il comando esatto sono nella sezione «Template vivo» qui sotto, § *"Dominio a contratto fisso"*: leggila prima di risolvere un conflitto su uno di quei file, non a intuito.

## Template vivo: nascita e aggiornamento dei progetti figli

Il confine tra Engine (intoccabile) e Dominio (del progetto) non è una questione di estetica: è il meccanismo che lascia ai progetti derivati ricevere gli aggiornamenti dell'infrastruttura via git, mettendo le mani sul proprio dominio e nient'altro. Regola pratica: l'Engine non si tocca; i comportamenti si cambiano per configurazione (`global-settings.json` col suo `.local`, `site.ts` col design system, sezione `Custom`) o per estensione (sottoclassi dei controller `Engine*`, nuovi servizi).

Nascita: un figlio è un discendente git del template, ma non nasce da un clone. Vive nel proprio repo, con il template aggiunto come secondo remote e innestato una volta per tutte. Da dentro il repo del progetto, anche appena inizializzato: `git remote add template <url-del-template>`, `git fetch template`, poi `git merge template/main --allow-unrelated-histories` (il flag serve a questo primo innesto e a nient'altro: da lì la storia è collegata). Poi `node setup.mjs "Nome Progetto"` battezza il progetto. Quella parentela git è il cordone ombelicale tra figlio e template, è ciò che gli porta gli aggiornamenti: va preservata, non va mai recisa con uno `--squash` né rigenerata dal bottone "Use this template" di GitHub, che riparte da un singolo Initial commit senza storia e lascia il figlio orfano (ogni futuro merge tornerebbe a pretendere `--allow-unrelated-histories` e a rifondere l'intero albero). Il repo resta pure marcato come template per la vetrina, ma la nascita è questo innesto, non quel bottone.

Aggiornamento: non è il `git pull` del figlio, che parla con `origin`, ma un merge dal template, `git fetch template && git merge template/main`. Regola d'oro sui conflitti: sui path dell'Engine e dello scaffold vince sempre il template (`git checkout template/main -- <path>`), sul dominio vince il figlio. Sui path engine conviene prendere la versione del template anche quando la tua compilerebbe lo stesso, perché è l'unico modo perché git registri l'aggiornamento come assorbito per intero e i merge successivi continuino a portare le novità.

Il confine in pratica, ovvero chi possiede cosa: ecco cosa significano "Engine e scaffold" nei conflitti.

| Proprietà | Path | Al merge |
| :--- | :--- | :--- |
| **Engine** | `backend/Engine/`, `frontend/src/app/core/engine/`, `frontend/src/styles/engine/`, `frontend/src/assets/i18n/basic.*.json`, `frontend/src/app/components/shared/design-systems/engine/` (i preset di design system pronti: si estendono con `extendDesignSystem` o si copiano in un file di progetto, non si modificano) | vince il template |
| **Scaffold** (infrastruttura e documentazione del template fuori dall'Engine) | `scripts/` (inclusi `deploy.sh`, `deploy-release.sh`, `backup.sh`), `docker-compose*.yml`, `global-settings.local.example.json`, `hosting-info.example.json`, `.github/workflows/`, `.nvmrc`, `global.json`, `setup.mjs`, `global-settings.schema.json`, `security-headers.json`, `CHANGELOG.md`, `QUICKSTART.md`, `RELEASE.md`, `DOCKER_README.md`, `AGENTS.md`, `ENGINE.md`, `backend/README.md`, `frontend/README.md`, `backend/backend.csproj`, i due `Dockerfile`, `frontend/proxy*.cjs`, `frontend/tsconfig.json`, `frontend/eslint.config.mjs`, `main.ts`/`main.server.ts`, `app.config.ts`/`app.config.server.ts` | vince il template |
| **Condivisi con punti di contatto** (il template li evolve; il figlio tocca soltanto i punti indicati) | `backend/Program.cs` (soltanto il blocco "SERVIZI APPLICATIVI"), `frontend/angular.json` (assets/styles del progetto, budget, `allowedCommonJsDependencies`), `frontend/package.json` (dipendenze del progetto), `backend/Resources/*.resx` (chiavi aggiunte), `.gitignore`/`.dockerignore` (righe aggiunte) | si fondono riga per riga |
| **Dominio** (la demo riusata + il codice del progetto) | `backend/Controllers|Services|Models|Store|Validation|data`, `backend/Properties/launchSettings.json` (porta dev locale), `site.ts`, `nav.ts`, `pages/`, `components/`, `core/services` e `core/dto`, `assets/` (i18n `addon`, legal, files), `styles.scss` + `styles/app/` (gli stili del progetto, non `styles/engine/`), `global-settings.json`, `security-headers.override.json`, la `.sln` rinominata | vince il figlio |

`security-headers.json` non ammette eccezioni: il Node SSR ne verifica lo sha256 all'avvio e si rifiuta di partire se è stato modificato a mano. L'estensione della CSP (es. domini extra per un servizio di mappe) si dichiara in `security-headers.override.json` (Dominio, riga sopra), mai nel file del template.

> Dominio a contratto fisso: alcuni file di Dominio sono importati dall'Engine per path e nome. Il figlio ne cambia liberamente il corpo, ma deve preservarne path, nome dell'export e forma, altrimenti l'Engine non compila. Non sono "campo libero", sono punti di contatto a contratto fisso:
> - `site.ts` → `ContestoSito` (da `buildSite`), `PageType` (un oggetto `as const`, tipicamente assemblato da file di area sotto `pages/*.pages.ts`, all'Engine basta che `site.ts` lo esporti con questo nome — la forma interna è libera), tipi `SmokeSettings`/`SitePageInput`. È il DSL: l'Engine lo legge ovunque (routing, builder, meta, tema…).
> - `core/services/api.service.ts` → la classe `ApiService` iniettabile (`PageBaseComponent` espone `this.api`). La estendi con metodi, non la elimini.
> - `core/services/auth.service.ts` → la classe `AuthService` iniettabile, importata per nome da tre file Engine (`core/engine/components/base/base-login-form.component.ts`, `core/engine/components/footer/footer.component.ts`, `core/engine/route-guards.ts`). `core/dto/auth.dto.ts` (`LoginRequest`) e `core/dto/session.dto.ts` (`SessionInfo`) sono i suoi contratti dati — vanno tenuti allineati ai record C#, ma path ed export non si rinominano.
> - `components/shared/user-nav/user-nav.component.ts` → `UserNavComponent` (selector `app-user-nav`), importato per path e nome da `core/engine/components/navbar/navbar.component.ts`. A differenza degli altri componenti UI in `components/shared/` (puro riuso di progetto), questo è un punto di contatto: la navbar lo istanzia direttamente, non lo consuma tramite token/DI.
> - `core/services/cookie-registry.ts` → l'export `COOKIE_MAP` e il tipo `CookieKey`, importati da `cookie-consent.service.ts`, `cookie-utils.ts`, `legal-pages.ts` e `policy.component.ts`: le voci cambiano liberamente, path e nome dell'export no.
> - `pages/error/error.component.ts` → `ErrorComponent`, caricato per path da `core/engine/routing.ts` per le rotte 404 ed errore: il corpo è tuo, path e nome no.

> Compatibilità: niente semver, un contratto esplicito invece. Il template non pubblica versioni numerate né segue semver, si distribuisce per `git merge`, non come pacchetto. La garanzia reale è duplice. La prima è l'elenco "Dominio a contratto fisso" qui sopra, cioè ciò che l'Engine promette di non rompere silenziosamente: un cambio lì, come rinominare un export o cambiare una firma, è per definizione una modifica che rompe i figli, e va sempre in `CHANGELOG.md`. La seconda è che `CHANGELOG.md` è la superficie da leggere prima di un merge grosso, non dopo un conflitto: registra ogni cambiamento con la sua motivazione, incluse le voci marcate "breaking" con l'azione che tocca al figlio. Se un merge va in conflitto fuori dai path Engine/Scaffold della tabella sopra, è quasi sempre perché il figlio ha toccato un file a contratto fisso: la soluzione è lì, non nella cronologia dei tag.

Documenti: nel figlio sparisce un file e uno soltanto, questo README, perché è la vetrina del template, non del prodotto. Tutto il resto della documentazione resta e si aggiorna dal template: al merge vince il template, esattamente come per l'Engine. Il `CHANGELOG.md` racconta al figlio cosa è cambiato nel template tra una versione e l'altra; `backend/README.md`, `frontend/README.md` e `DOCKER_README.md` sono le direttive di sviluppo e dicono cosa si modifica e con quali strumenti; `AGENTS.md` e `ENGINE.md` sono rispettivamente le ricette pratiche e la mappa dell'implementazione interna dell'Engine. Non si adattano nel figlio: la documentazione del prodotto, se serve, vive in un file a parte.

## Build, run, test

- **Frontend:** `cd frontend && npm install && npm run start` — **Backend:** `cd backend && dotnet run` (`/health` anonimo; senza `Security.ApiConfig.Keys` nel `.local`, ogni chiamata risponde `401`). Il template ha `Features.PublicLogin` acceso per la demo, che vuole la `SecretKey` nel `.local`: se il file manca, lo crea con chiavi generate il primo che parte fra `generate:statics` e il backend (solo Development), come `node setup.mjs`.
- **Tema e file generati:** `start`, `dev`, `build` e `watch` eseguono prima `npm run generate:statics`, che compila il tema (`src/styles/engine/generated/_theme.scss`) e l'elenco dei testi legali. `ng serve` lanciato a mano vuole prima `npm run generate:statics`. Il tema si compila all'avvio: dopo aver cambiato design system, `site.colorTema` o i file in `src/assets/legal/` con il dev server acceso, riavvialo.
- **Nuovo progetto figlio:** `node setup.mjs "Nome Progetto"`.
- **Qualità (gate = CI, GitHub Actions):** lint, i18n, tsc, dipendenze circolari, meccanismo dei design system (`theme-check.sh`), invarianti SiteBuilder, audit live Pa11y+Lighthouse, `npm audit`, vulnerabilità NuGet, gitleaks, CodeQL. In locale on-demand: `./scripts/test/run-all.sh`. Niente hook pre-push: non re-introdurlo. I test unitari sono privati di ogni progetto.

## Commit

Commit narrativi a tema, stile branch + squash: una questione chiusa per commit, non micro-commit.

## Ricette — frontend

#### Aggiungere una pagina
`PageType` è assemblato in `site.ts` da file di area sotto `pages/*.pages.ts` (uno per gruppo tematico, es. `app.pages.ts`). A un'area esistente basta un nuovo ID più una nuova dichiarazione nello stesso file:
```typescript
// pages/app.pages.ts (o il file dell'area giusta)
export const AppPages = { Home: 'app.home', NuovaPagina: 'app.nuovaPagina' /* … */ } as const;
export const appPagesDecl: SitePageInput[] = [
  { path: 'nuova', pageType: AppPages.NuovaPagina, title: 'Nuova',
    requiresAuth: false,                       // true → protetta (guard + redirect), SSR off
    component: () => import('./nuova/nuova.component').then(m => m.NuovaComponent) },
];
```
```typescript
// site.ts — invariato se l'area esiste già; una riga di spread per una nuova area
export const PageType = { PrivacyPolicy: 'legal.privacy', /* … */ ...AppPages } as const;
export type PageType = (typeof PageType)[keyof typeof PageType];
pages: (ctx) => [...appPagesDecl],
```
```typescript
// pages/nuova/nuova.component.ts — estende la base: this.api / translate / asset / notify già pronti
// <T> è SEMPRE obbligatorio (nessun default): <void> se la pagina non ha contenuto risolto dal
// resolver, altrimenti il tipo di quel contenuto (es. <Articolo> per una pagina che carica un articolo).
export class NuovaComponent extends PageBaseComponent<void> { }
```
```html
<a [appPage]="PageType.NuovaPagina">Vai</a>   <!-- mai URL grezzi -->
```
`path` accetta anche un segmento diverso per lingua invece della stringa (`path: { it: 'nuova', en: 'new' }`, con più lingue configurate): lo switch lingua e la sitemap/hreflang seguono in automatico, nessun altro punto da toccare. Una lingua senza una propria chiave ricade sul segmento della lingua di default.

#### ContentLoader con ApiService (withApi)
`contentLoader` viene eseguito in un Injection Context valido: puoi usare `inject()` al suo interno. Per non ripetere `const api = inject(ApiService);` a ogni rotta, si usa di solito questo helper di dominio (che `setup.mjs` ti inserisce già nel `site.ts` di base):
```typescript
export function withApi(loaderFn: (ctx: ContentLoaderContext, api: ApiService) => Promise<ContentLoaderResult>): ContentLoader {
    return (ctx) => loaderFn(ctx, inject(ApiService));
}
// Da usare così:
contentLoader: withApi(async (ctx, api) => ({ content: await api.getMioDato() })),
```

#### Pagine legali (sezione `legal` di `site.ts`)
Come `homePage`/`loginPage`: uno slot per pagina standard, valorizzato con un `PageType` del progetto (il nome è libero). È lo slot a dare il significato: rotta `/policy/*`, titolo e cartella Markdown li sa l'Engine. Il `PageType` nudo basta; la forma oggetto aggiunge `updated` (data sotto il titolo, mai scritta nel Markdown), `path` (segmento tuo, stringa o `{ lingua: segmento }`) e `markdown`. Slot assente = nessuna pagina.
```typescript
// site.ts
legal: {
  privacy: { page: PageType.PrivacyPolicy, updated: new Date('2026-09-22') },  // obbligatoria
  cookie: PageType.CookiePolicy,          // obbligatoria con voci in COOKIE_MAP o isWebApp; senza cookie la pagina non esiste
  termsOfService: { page: PageType.TermsOfService, path: { fr: 'conditions' } },
  legalNotice: { page: PageType.LegalNotice, markdown: 'note-legali' },  // testo tuo: assets/legal/note-legali.<lingua>.md
  accessibility: {
    page: PageType.AccessibilityStatement, updated: new Date('2026-09-23'),
    nonAccessibili: [{ descrizioneKey: 'accMappa', motivo: 'fuori-ambito', alternativaKey: 'accMappaAlternativa' }],
  },
  extra: [{ page: PageType.WithdrawalPolicy, path: { it: 'recesso', en: 'withdrawal' }, titleKey: 'recessoPolicyMenu',
            descriptionKey: 'recessoPolicyDescrizione', markdown: 'recesso', updated: new Date('2026-09-22') }],  // assets/legal/recesso.<lingua>.md
},
```
```text
src/assets/legal/privacy/intro/it.md      # obbligatoria, inizia con "# Titolo"
src/assets/legal/privacy/login/en.md      # parte legata a una funzione: compare se è accesa
src/assets/legal/privacy/mail/off/it.md   # facoltativa: prende il posto di mail/ a funzione spenta
```
Da sapere scrivendo codice o testi:
- Testi in Markdown puro, senza segnaposto: una cartella per pagina, una sottocartella per parte, un file per lingua. Le parti hanno il nome della funzione (`login`, `form`, `mail`, `errorReporting`, `analytics`, `profiling`, `cookiePolicy` nella privacy; `tracking` nella cookie).
- Il resto lo genera l'Engine: nella Privacy i dati di navigazione, dai fatti dell'installazione (`frontend.hostingInfo` nel `.local`, un file JSON per server, schema `core/engine/legal/hosting-info.schema.json`); nella Dichiarazione di accessibilità lo stato di conformità, da `nonAccessibili`; in coda a ogni pagina la sezione identità, da `data/identity.json`. Non riscriverli nel Markdown.
- `markdown` nello slot di una pagina standard la sostituisce con un testo tuo (es. quello del tuo legale): la pagina è quel file, senza niente di generato, salvo elenco cookie e pannello delle preferenze nella Cookie Policy. Una voce `extra` è sempre un file così, con chiavi i18n in `addon.<lang>.json` (mai `basic.<lang>.json`, quello è Engine).
- Link fra pagine legali col nome dello slot: `[Cookie Policy](policy:cookie)`. La pagina lo risolve nel percorso della lingua corrente; uno slot scritto male ferma il build.
- `generate:statics` ferma il build su nomi non previsti dentro le cartelle delle pagine, parti o lingue mancanti, `intro` o file `markdown` che non aprono con `# `, e, con la Privacy composta, su un titolare senza nome o recapito in `backend/data/identity.json`. Il resto di `assets/legal/` (altri Markdown, PDF, cartelle) è tuo. L'elenco dei file entra nel build: dopo averne aggiunto o tolto uno, riavvia il dev server.
- I fatti che alimentano i dati di navigazione (`LegalFacts`) sono **pubblici**: viaggiano nel `TransferState` di ogni pagina renderizzata dal server e su `/internal/legal-facts`, senza autenticazione. Per questo l'SSR li riduce a ciò che il testo scrive, prima di passarli: il limite di richieste è un solo numero di secondi o `null` se spento (mai "attivo: false"), la finestra dei login entra solo col login acceso, dei log applicativi restano tipo e conservazione. Se aggiungi un fatto a `computeLegalFacts`, chiediti se lo scriveresti nell'informativa: se no, non va lì.

Ordine della pagina, slot per slot, controlli e fatti dell'installazione: [frontend/README.md](frontend/README.md) «Pagine legali (`legal`)».

#### Accendere il login (pubblico o riservato)
```json
// global-settings.json — unico posto (né .local né variabili d'ambiente)
"Features": { "PublicLogin": true }   // link in navbar + parte login nella Privacy Policy; vince su Login
// "Login": true                       // riservato agli amministratori: niente link, fuori dalla Privacy Policy
```
```typescript
// site.ts
loginPage: PageType.Login,
```
Requisito: `Security.Token.SecretKey` nel `.local` (già generata da `setup.mjs`), almeno 32 byte UTF-8, senza spazi o a capo ai bordi (rifiutata, non ripulita) e diversa dal segnaposto dell'esempio. Login acceso con una chiave assente o non valida = il backend non parte e il deploy si ferma; login acceso senza `loginPage` = errore al build; login spento = nessuna pagina di login. La pagina di login sta fuori indice e fuori sitemap di serie, con login riservato o pubblico. Poi sostituisci la verifica demo in `Services/AccountService.cs` (le credenziali demo funzionano nell'ambiente Development e in nessun altro). Stesso schema per `Mail` ed `ErrorReporting`: il flag in `Features`, la configurazione nel `.local`, e configurazione senza flag = funzione spenta. `Forms` è un flag e nient'altro (accende la parte `form` della Privacy Policy).

#### Aggiungere un endpoint al client
```typescript
// core/services/api.service.ts
getArticolo(id: string): Promise<Articolo> {
  return this.api_get<Articolo>(`articolo/${encodeURIComponent(id)}`);   // { silent: true } per UI d'errore tua
}
```

#### Modulo che raccoglie dati personali (contatto, richiesta, candidatura…)
Non c'è un componente Engine per un form generico (troppo variabile da progetto a progetto: campi, validazione, endpoint): resta un componente di progetto che chiama `ApiService`, come un endpoint qualsiasi. Ciò che l'Engine offre è la parte `form` della Privacy Policy (`Features.Forms`, vedi sopra); ciò che resta al progetto, e che il Garante privacy chiede esplicitamente (informativa "in corrispondenza" della raccolta, non solo raggiungibile da un'altra pagina), è nel modulo stesso:
```html
<!-- Link diretto alla Privacy, non un URL grezzo, vicino al pulsante di invio -->
<p class="form-text">
  {{ 'formPrivacyNota' | translate }}
  <a [appPage]="PageType.PrivacyPolicy">{{ 'privacyPolicyMenu' | translate }}</a>
</p>
<label class="form-label" for="email">Email <span aria-hidden="true">*</span></label>
<input id="email" class="form-control" required />   <!-- required = campo obbligatorio, indicalo anche visivamente -->
```
Due cose, non di più: un link diretto alla Privacy Policy vicino al modulo (chiave `formPrivacyNota` in `addon.<lang>.json`, es. "Inviando il modulo accetti il trattamento dei dati descritto nella"), e i campi obbligatori marcati (asterisco o etichetta esplicita) — coerenti con `privacy/form/it.md`, che dichiara già "necessario per rispondere alla tua richiesta: senza, non possiamo darle seguito". Se il modulo raccoglie dati oltre quelli strettamente necessari a rispondere (es. una preferenza di marketing), quello è un consenso a parte, non la base giuridica "esecuzione della richiesta" del testo di serie: serve una checkbox propria, non pre-spuntata (stesso principio della newsletter, sotto).

#### Caricare file da un form (upload)
Due pezzi separati, Engine + Dominio — vedi la regola d'oro in cima al file. `UploadFormComponent` (Engine, `core/engine/components/upload-form/`) è un componente UI puro: gestisce click/drag-and-drop, validazione (`accept`, `maxSize`, `multiple`) ed emette `File[]`, mai un upload. L'upload vero — verso `POST /blob/up`, che richiede login — sta al chiamante, tramite `ApiService.uploadBlob`/`.uploadBlobs` (Dominio):
```html
<!-- gate sullo stesso pattern di login già in uso nella pagina (@if (auth.isLoggedIn())), non un avviso custom -->
@if (auth.isLoggedIn()) {
  <app-upload-form
    [multiple]="true"
    [accept]="['image/*']"
    [isLoading]="uploadLoading()"
    [externalError]="uploadError()"
    (filesConfirmed)="onFilesConfirmed($event)" />
}
```
```typescript
protected async onFilesConfirmed(files: File[]): Promise<void> {
  this.uploadLoading.set(true);
  try {
    const slugs = await this.api.uploadBlobs(files);   // sequenziale, stesso ordine di `files`
    // slugs[i] ↔ files[i].name — tieni la corrispondenza esplicita se la mostri, non gli slug nudi
  } finally {
    this.uploadLoading.set(false);
  }
}
```
`labels` (input opzionale, `UploadFormLabels`) sovrascrive i testi campo per campo — non passato, ciascuno ricade sulla chiave i18n di default. Per servire/recuperare il file caricato, vedi la ricetta backend "Caricare/servire un file" più sotto (`getBlobUrl(slug)`/`getBlob(slug)` sul client).

#### Campo di testo Markdown
Per un contenuto che poi passa da `| markdown` (descrizioni, pagine gestite da un'area riservata), `MarkdownEditorComponent` (Engine) è il campo di form: barra, colori e anteprima vengono dalla stessa pipeline che renderà il testo.
```html
<label class="form-label" for="descrizione">Descrizione</label>
<app-markdown-editor inputId="descrizione" [rows]="10" [(ngModel)]="descrizione" />
```
Funziona anche con `formControlName` e rispetta lo stato disabled. Senza `<label for>` esterna passa `ariaLabel`; `placeholder` e `rows` (default 8) sono facoltativi. `labels` (input opzionale, `MarkdownEditorLabels`: `boldPlaceholder`, `italicPlaceholder`, `linkPlaceholder`) sovrascrive i testi segnaposto campo per campo, come `labels` di `UploadFormComponent`; le etichette della barra sono chiavi `mdEditor*`, da sovrascrivere in `addon.<lang>.json`. Scorciatoie nella casella: Ctrl/Cmd+Z annulla, Ctrl/Cmd+Y o Ctrl/Cmd+Maiusc+Z ripete, Ctrl/Cmd+B grassetto, Ctrl/Cmd+I corsivo, Ctrl/Cmd+K link.

#### Persistere dati lato client (cookie, Web Storage, consenso)
Un registro (`COOKIE_MAP` in `core/services/cookie-registry.ts`), un'API, gated dal consenso: registrare una voce basta per toggle nel banner, riga in policy (mezzo/provider/durata) e pulizia alla revoca. Ricetta completa (shape della voce, campi opzionali, la variante `match: 'prefix'` per famiglie di chiavi di SDK di terza parte) in [frontend/README.md](frontend/README.md#aggiungere-voci-in-cookie_map). Qui la forma di chiamata, quella che serve scrivendo codice:
```typescript
// nel componente/service — instrada sul mezzo (cookie o Web Storage) in base a come la voce è
// registrata, tipizzato su valueType
this.consent.set('mioSalvataggio', { x: 1 });   // gated dal consenso; in SSR è no-op (Web Storage browser-only)
const v = this.consent.get('mioSalvataggio');    // → tipo da valueType | null
```
Mai `localStorage`/`sessionStorage` diretti (lo vieta una regola ESLint, eccetto `CookieConsentService`/`TokenService`): tutto passa dal gate, l'inventario in policy resta completo. Su una voce `match: 'prefix'` (famiglia di chiavi di un SDK terzo) il gating sta a te: carica l'SDK dopo il consenso della sua categoria, mai prima, altrimenti scrive le sue chiavi prima che tu riesca a pulirle.

#### Google Consent Mode v2 (obbligatorio se usi GA4/Google Ads su utenti UE/UK — non un extra opzionale)
È un requisito di Google per il traffico UE/UK: senza, un account perde remarketing e conversion modeling su quel traffico. Ricetta completa (snippet interi) in [frontend/README.md](frontend/README.md) §"Google Consent Mode v2". Qui la mappa di proprietà, perché è quella che conta per non romperla al prossimo merge:

1. `src/index.html` (**Dominio**) — stub `gtag('consent','default',{...:'denied'})` PRIMA di qualunque `gtag.js`/GTM.
2. `security-headers.override.json` (**Dominio**, radice del progetto) — whitelist CSP per i domini Google (`script-src`/`connect-src`), sotto la chiave `csp`. **Non toccare `security-headers.json`**: è Engine, il Node SSR ne verifica lo sha256 all'avvio e si rifiuta di partire se è stato modificato a mano. `security-headers.override.json` invece è un file di progetto, committabile, che il template non tocca mai: sopravvive a ogni merge senza doverlo riapplicare. Dettaglio in [frontend/README.md](frontend/README.md) §"Estendere la CSP".
3. `cookie-registry.ts` (**Dominio**) — censisci `_ga`/`_gid` ecc.: categoria `Analytics` (GA4) o `Profiling` (Ads/remarketing) — sono due consensi distinti anche per Google.
4. Un `effect()` di progetto (**Dominio**, es. `core/services/analytics.service.ts`) che chiama `gtag('consent','update', {...})` sui signal `analyticsAccepted()`/`profilingAccepted()` di `CookieConsentService` — stesso pattern di gating della ricetta sopra.

#### AI Act, newsletter e vendita online — promemoria, non feature dell'Engine
Il template non porta nessuno dei tre (niente chatbot, niente generazione IA, niente newsletter, nessun carrello): diventano rilevanti solo se il progetto figlio li aggiunge, e in quel caso portano obblighi che l'Engine non può indovinare da sé.
- **Chatbot/contenuti IA** (obbligo dal 2 agosto 2026): avviso esplicito al primo messaggio ("Stai parlando con un sistema di IA"); contenuti generati senza revisione editoriale umana → etichettatura visibile.
- **Newsletter/marketing**: l'iscrizione NON passa da `ConsentCategory`/`CookieConsentService` (quello gestisce storage/tracciamento lato browser) — serve una checkbox propria, non pre-spuntata, separata da un eventuale consenso alla profilazione degli iscritti.
- **Vendita di beni/servizi online** (Codice del Consumo, D.Lgs. 206/2005, artt. 49 e seguenti — contratti a distanza): informazioni precontrattuali (caratteristiche del bene/servizio, prezzo comprensivo di tasse, modalità di pagamento/consegna, durata del contratto) prima della conclusione dell'ordine; **diritto di recesso** di 14 giorni con relative eccezioni ed eventuale modulo tipo (Allegato I Codice del Consumo — pattern già pronto nella ricetta "Pagine legali" sopra, voce `extra` con `PageType.WithdrawalPolicy`). Il link alla piattaforma ODR (Reg. UE 524/2013) **non è più richiesto**: il Regolamento è stato abrogato dal Reg. UE 2024/3228, piattaforma dismessa dal 20 luglio 2025 — se il tuo Note Legali/TOS ce l'ha da prima di allora, va tolto, non aggiunto.

#### Leggere `global-settings.json` tipizzato
Il tipo `GlobalSettings` è generato dallo schema (sorgente unica), non scritto a mano. Dopo aver toccato `global-settings.schema.json`, rigeneralo; un typo di chiave diventa errore a `tsc`.
```bash
npm run generate:types   # → src/app/core/engine/global-settings.types.ts (committato, DO NOT MODIFY)
```
```typescript
import type { GlobalSettings } from '...engine/global-settings.types';
const s = JSON.parse(raw) as GlobalSettings;
s.Localization?.SupportedLanguages   // tipizzato; `s.Localizaton` non compila
```

#### Personalizzare il font
Catalogo e logica in `core/engine/font-system.ts` (Engine, non si tocca), scelta nel design system attivo (Dominio): è una decisione estetica come colore e pannello, non un file a parte. Un font del catalogo (`SystemFont`, 11 voci installate nel container) basta come valore diretto, nessun file da caricare:
```typescript
// components/shared/design-systems/mio.design-system.ts
import { extendDesignSystem } from '../../../core/engine/design-system-presets';
import { SystemFont } from '../../../core/engine/font-system';
import { muroDesignSystem } from './engine/muro.design-system';

export const mioDesignSystem = extendDesignSystem(muroDesignSystem, {
    font: { principale: SystemFont.Roboto },   // sostituisce web E immagini OG, stesso file per entrambi
});
```
Un font del progetto è un `CustomFontDef` **pieno**, scritto qui direttamente, mai una `string` che rimanda altrove (una stringa deve essere una voce vera di `SystemFont`):
```bash
mkdir -p fonts && cp MioFont.woff2 fonts/   # accanto a global-settings.json
```
```typescript
export const mioDesignSystem = extendDesignSystem(muroDesignSystem, {
    font: { principale: { key: 'brand', family: 'MioFont', faces: [{ file: 'MioFont.woff2', weight: 400, style: 'normal' }] } },
});
```
`validateDesignSystemPreset` rifiuta un `CustomFontDef` non valido: `faces[].file` è un nome di file nudo (niente cartelle, `..` o percorsi assoluti) con estensione `.ttf`, `.otf`, `.woff` o `.woff2`; `weight` 400 o 700; `style` `normal` o `italic`; `family` non vuota e senza `" \ ; { } < >` né a capo. Un secondo font raggiungibile da SCSS (`--fontFamily-<key>`) ma non attivo, es. per i titoli, va in `font.aggiuntivi`, mai in un campo a parte; testo e font dell'immagine OG, distinti da quelli del sito, si personalizzano con `og.testo` (es. un font titolazione tutto maiuscolo). Il font si legge all'avvio del server: un file sostituito in `fonts/` vuole un riavvio. Dettagli in [frontend/README.md](frontend/README.md), capitolo «Design system e tema» (Font, og:image), e in [DOCKER_README.md](DOCKER_README.md) §"Font custom".

#### Scegliere o personalizzare un design system (tema, colori, chrome)
Per scrivere un design system basta sapere QUALI valori impostare, non COME lavora il motore colore (OKLCH, contrasto WCAG). `global-settings.json` porta un colore di identità, `site.colorTema` (il brand); tutto il resto (tono chiaro/scuro, contenuto incorniciato in un pannello o a filo sfondo, sfondo di navbar e footer, quali pagine mostrano navbar/footer/breadcrumb, colori aggiuntivi) lo decide un **design system**, che scegli o scrivi in codice, mai nel JSON. Senza design system valgono i default dell'Engine, cioè `aria`: tono dall'OS, pannello chiaro, font di sistema.

**Il modo più rapido**: un preset pronto del template, importato da `components/shared/design-systems/engine/` (cartella Engine: la estendi o la copi, non la modifichi). Otto preset: `aria` (i default), `carta` (aria + NotoSerif), `giorno`, `notte`, `lanterna`, `ombra`, `lavagna`, `muro` (sito a superficie unica, tinta del brand); la tabella completa è in [frontend/README.md](frontend/README.md), capitolo «Design system e tema».
```typescript
// site.ts
import { muroDesignSystem } from './components/shared/design-systems/engine/muro.design-system';
buildSite({ shell: { designSystem: muroDesignSystem } });
```

**Per personalizzarne uno** (es. la palette di un cliente): `extendDesignSystem` su un preset, con una patch raggruppata per area (`tono`, `colori`, `navbar`, `font`…) che tocca i campi che ti servono: dentro un gruppo si fonde campo per campo, il resto resta quello del preset scelto, e un campo `undefined` vale "non specificato". Nessuna classe o `override` da scrivere, nessun registro per nome: è la stessa forma con cui sono scritti i preset pronti. La patch accetta anche una funzione `(risolto) => patch`; in entrambe le forme un nome di campo sbagliato o un valore fuori elenco è un errore di `tsc`.
```typescript
// components/shared/design-systems/clienteX.design-system.ts
import { extendDesignSystem, type DesignSystemFactory } from '../../../core/engine/design-system-presets';
import { muroDesignSystem } from './engine/muro.design-system';

export const clienteX: DesignSystemFactory = extendDesignSystem(muroDesignSystem, {
    colori: { palette: { bordeaux: '#5c1a2b' } },
});
```
```typescript
// site.ts
import { clienteX } from './components/shared/design-systems/clienteX.design-system';
buildSite({ shell: { designSystem: clienteX } });
```
Esempio reale, stesso pattern: `components/shared/design-systems/example.design-system.ts`.

Due regole da tenere a mente:
- **Nomi in `colori.palette`**: camelCase ASCII (`^[a-z][a-zA-Z0-9]*$`, es. `oroChiaro`); le classi escono in kebab-case (`.btn-oro-chiaro`). Nomi che collidono con classi, variabili o token di Bootstrap e dell'Engine (`sm`, `center`, `borderWidth`, `primary`…) sono rifiutati; `secondary` e `info` sostituiscono quelli di serie.
- **Ruoli di pagina**: un ruolo (`ruoloPagina.<ruolo>`) spegne e basta. Ciò che il design system risolto non accende (breadcrumb assente, smoke spento, `movimento: 'fermo'`, superfici senza pannello) nessuna pagina lo riaccende; `fitViewport` lo decide il ruolo.

Nessuno spec da scrivere: `validateDesignSystemPreset` gira a ogni resolve del design system attivo (in `buildSite` e in `generate:statics`) e rifiuta, con un messaggio in italiano, valori fuori elenco, campi sconosciuti, nomi di palette e font non validi. Il contrasto WCAG di una palette specifica non si testa qui: è contenuto che cambi a piacere, incluso quello degli 8 preset pronti. Il tema si compila in build: dopo un cambio al design system, riavvia il dev server.

Il motore colore garantisce la leggibilità (≥4.5:1 su ogni superficie) spostando la luminosità dei primi piani; quando la tinta del brand non basta ripiega su nero o bianco, e `generate:statics` lo riassume in una riga di avviso ("N ripieghi di contrasto"). C'è un caso in cui rinuncia del tutto: superfici `fusione` (o `colori.sfondo`/`vividezza` alti) con un brand a luminanza media, dove le cinque superfici di un tono collassano su un colore solo e testo, link e bottone primario finirebbero tutti bianchi o tutti neri. Lì il build si ferma con un errore che nomina brand e superfici (`paletteDegenerata` in `scripts/build/theme-scss.ts`): non è un difetto del preset, è una combinazione senza soluzione. Si risolve con un brand più chiaro o più scuro, un altro `colori.sfondo`, o superfici diverse da `fusione`.

Dettagli, ogni campo disponibile, e la distinzione fra la tinta di sfondo e testo con contrasto sempre garantito (`colori.sfondo`) e i colori "duri" di `colori.palette` (il fill è l'hex scelto anche se non si stacca dal fondo; come testo usano una variante leggibile) in [frontend/README.md](frontend/README.md), capitolo «Design system e tema».

#### Aggiungere contenuto al footer oltre i link (P.IVA, sede legale, testo libero, social)
Dentro un `addGroup` del **footer** (`nav.ts`), oltre ad `addPage`/`addLink`/`addGroup` (condivisi con l'header) hai anche `addField`/`addText`/`addSocialLink`/`addCustom` — pensati per contenuto che non è un link a una pagina.
```typescript
// nav.ts
import { FooterField } from './core/engine/footer-content';

footer: (f, ctx) => {
    f.addGroup('footerAzienda', g => {
        g.addField(FooterField.PartitaIva);      // da Identity, auto-nascosto se non valorizzato
        g.addText('footerNote', 'Iscritta al REA di Milano'); // testo libero, mai tradotto
        g.addSocialLink(ctx.identity?.social[0]?.url ?? '', 'LinkedIn'); // esplicito, mai dedotto in blocco
    });
},
```
`f.hideLegalStrip()` (a livello di `footer`, non di gruppo) spegne la fascia automatica delle pagine legali, per chi le inserisce a mano in un gruppo. Ogni voce (header e footer) accetta anche `{ itemClass: 'mia-classe' }` per uno stile puntuale. Dettaglio completo in [frontend/README.md](frontend/README.md) §"Navigazione Multilivello" → "Footer: oltre i link".

#### Feature flag / varianti di progetto via `Custom`
La sezione `Custom` di `global-settings.json` (committabile, `additionalProperties: true`, nessuno schema fisso: ci metti quello che vuoi) è il punto giusto per un flag o una variante letta da entrambi i lati senza inventare un meccanismo nuovo — utile per accendere/spegnere una sezione, testare due varianti (CRO/A-B) o passare un ID (analytics, SDK esterno). **Non è remote-config**: cambiare un valore è una modifica al file + un nuovo deploy, non un toggle a runtime. Le funzioni dell'Engine (login, mail, segnalazione errori, form) non passano da `Custom`: si accendono in `Features`.
```json
// global-settings.json — committabile, niente segreti (finisce nel bundle client)
"Custom": { "heroVariant": "B", "showPromoBanner": true, "Analytics": { "TrackingId": "G-XXXXXXX" } }
```
```typescript
// Frontend — inject(APP_CUSTOM) (root README «Configurazione e segreti», frontend/README.md)
readonly custom = inject(APP_CUSTOM);
readonly heroVariant = this.custom['heroVariant'] ?? 'A';
```
> ⚠️ `APP_CUSTOM` si popola su una rotta renderizzata dal server (TransferState dall'SSR), e su nessun'altra: su `renderMode: 'client'` (incluse le pagine `requiresAuth`) torna `{}` al caricamento diretto/refresh. Se la pagina che legge il flag deve restare client-side, passa il valore da un endpoint invece che da `APP_CUSTOM` (vedi sotto).
```csharp
// Backend — IConfiguration iniettata nel costruttore (controller/service), mai nell'Engine
public MioService(IConfiguration config) => _config = config;
if (_config.GetValue<bool>("Custom:showPromoBanner")) { /* ... */ }
```
Per un flag/variante che un CRO/SEM specialist deve poter cambiare senza toccare codice TypeScript/C#, il file è comunque lo stesso `global-settings.json`: la ricetta rimane "modifica il JSON, fai il deploy", nessuna dashboard — coerente con l'assenza di un sistema di A/B testing nel template (vedi root README, ruoli CRO/SEM).

#### SEO: escludere una pagina dall'indice
```typescript
// pages/*.pages.ts — pagina pubblica e SSR ma fuori da sitemap e indice (X-Robots-Tag: noindex).
// A differenza di requiresAuth NON forza il client-render. Default: noindex false.
{ path: 'grazie', pageType: PageType.Grazie,
  component: () => import('./grazie/grazie.component').then(m => m.GrazieComponent),
  otherSEO: { noindex: true } }
```

#### Gestire la UX di aggiornamento versione (PWA / Polling)
Di default, quando il `VersionCheckService` (che unisce SwUpdate e il polling periodico) rileva un aggiornamento, mostra un alert nativo bloccante che forza il ricaricamento.
Se un progetto figlio ha form lunghi o stato che non deve andare perso all'improvviso, puoi intercettare questo evento e mostrare un avviso non invasivo, rinviando l'aggiornamento a un momento più opportuno.
```typescript
// site.ts
export const cfg = buildSite({
    onVersionUpdateAvailable: (apply) => {
        // Salva `apply` in uno store o mostralo in una snackbar non bloccante.
        // Quando l'utente cliccherà "Aggiorna ora", chiama `apply()`.
        // `apply()` attiva il nuovo SW e fa il reload.
        toast.info("Nuova versione disponibile!", { action: () => apply() });
    }
});
```

#### Comporre l'identità da una fonte diversa dal file
Il caso base si riempie in `data/identity.json` (campi nello schema engine `Engine/Models/Identity/identity.schema.json`). Nome e un recapito del titolare restano comunque nel file: la Privacy Policy composta dall'Engine li mostra, e il build li cerca lì. Per prendere un pezzo da un DB/API si fa l'override del metodo dedicato, nient'altro: stesso tipo in ingresso e in uscita, arricchisci e ritorna. Dichiari col framework (`DayOfWeek`, `TimeOnly`, codici ISO), non stringhe magiche né nozioni di schema.org: l'Engine deriva resa e JSON-LD.

`OpeningHours` (a differenza degli altri campi di `SiteIdentity`) **non è nello schema di `identity.json`**: cambia per motivi operativi (stagione, festività) più spesso di quanto sia ragionevole legarlo a un deploy, e va sempre valorizzato qui via codice, mai a mano nel file.
```csharp
// backend/Store/AppIdentityStore.cs (di proprietà del progetto)
protected override async Task<SiteIdentity?> ComposeIdentityAsync(
    SiteIdentity? identity, string language, CancellationToken ct)
{
    identity ??= new SiteIdentity();                    // null se non c'è il file
    identity.OpeningHours =                             // lista di intervalli tipizzati
    [
        new() { Day = DayOfWeek.Tuesday,   Opens = new(9, 0), Closes = new(18, 0) },
        new() { Day = DayOfWeek.Wednesday, Opens = new(9, 0), Closes = new(13, 0) },  // pausa pranzo
        new() { Day = DayOfWeek.Wednesday, Opens = new(15, 0), Closes = new(18, 0) },
    ];
    return identity;                                     // stesso oggetto, arricchito
}
```
Stessa filosofia per gli altri "codici": `Currency` ISO 4217, `SedeLegale.Nazione` ISO 3166, lingue in `Localization`. Dichiari il codice, il framework (`CultureInfo`/`Intl`) dà nome e formato. Per una proprietà schema.org che il modello non tipizza, valorizza `identity.Extra`: fuso per ultimo nel nodo entità brand, sovrascrive i default (anche il `@type`, es. → `LocalBusiness` con `geo`/`openingHoursSpecification`); l'Engine tiene per sé `@context` e `@id`.

#### Sito di un'attività fisica (LocalBusiness)
Dichiara `businessType` (sottotipo schema.org) in `data/identity.json`: l'entità brand diventa quel `@type` con indirizzo e `openingHoursSpecification` portati sul nodo. Gli `openingHours` (già tipizzati) non cambiano; l'indirizzo è la `sedeOperativa` (fallback `sedeLegale`); la geo (opzionale per Google, basta l'indirizzo) va in `extra`. `businessType` è una stringa libera (qualsiasi sottotipo `LocalBusiness` valido), non un enum: la metti diretta, non serve `extra`, che resta per le proprietà in più (geo, priceRange…). Non è un enum perché i sottotipi sono 150+ ed evolvono, e comunque `extra` cambia anche `@type`: validità schema.org a carico tuo.
```json
{
  "businessType": "Restaurant",
  "sedeOperativa": { "via": "Via Roma", "civico": "1", "cap": "00100", "citta": "Roma", "nazione": "IT" },
  "openingHours": [ { "day": "Monday", "opens": "12:00", "closes": "23:00" } ],
  "extra": { "servesCuisine": "Italian", "priceRange": "€€" }
}
```

#### SEO: dati strutturati (JSON-LD) con campi parlanti
Dichiari `kind` + campi, l'Engine traduce in schema.org (`structured-data.ts`). `kind`: `article` | `faq` | `product` | `event` | `raw`.
```typescript
// site.ts — STATICI (es. FAQ con domande fisse)
otherSEO: { structuredData: { kind: 'faq', questions: [{ question: 'Come?', answer: 'Così.' }] } }
```
```typescript
// app.pages.ts — DINAMICI dal contenuto (hanno la precedenza sullo statico). Va nel
// `contentLoader` della pagina (stesso posto di `dynamicParams`), non nel resolver generico
// dell'Engine. `info` si fonde sopra il PageInfo statico di site.ts: usalo anche per il
// titolo/descrizione e basta, senza structuredData, se ti serve quello (es. il titolo nel tab del browser).
{
  pageType: PageType.Articolo,
  contentLoader: async (ctx) => {
    const art = await inject(ApiService).getArticolo(ctx.params['slug']);
    return {
      content: art,
      info: art && { title: art.titolo, description: art.sommario },
      structuredData: art && { kind: 'article', headline: art.titolo, author: art.autore, publishedOn: art.data },
    };
  },
}
// casi non coperti: { kind: 'raw', jsonLd: { '@type': 'Recipe', name: '…' } }
// Query param dell'URL corrente (es. ?g=...): l'hook gira in un injection context valido,
// inject(Router) e leggi router.getCurrentNavigation()?.finalUrl ?? router.parseUrl(router.url).
```

#### Overlay/modali custom (mai `position: fixed` a mano)
Un pannello fixed con z-index alto dentro un componente finisce comunque dentro lo stacking context di `main#main-content` (z-index: 1 apposta per stare sopra sfondo/effetti) e rischia di finire sotto la navbar o i suoi dropdown. Passa sempre da CDK Overlay (già importato, monta in `.cdk-overlay-container`, `z-index: var(--z-cdk-overlay)` in `_a11y.scss`) — vedi `ContextMenuDirective`/`ImageLightboxService` come riferimento. Come contenitore del pannello usa una `.card`: sfondo `--colorSurface` e bordo dal tema, niente colori da scrivere. Il `.cdk-overlay-container` sta fuori dal pannello contenuti: l'overlay prende il tono della pagina, anche se parte da un pannello di tono diverso.

## Ricette — backend

#### Aggiungere un endpoint
DTO in `Models/`, logica in `Services/`, thin controller:
```csharp
[Route("api/v1/orders")]
public class OrdersController : EngineProtectedController   // o EngineApiController (API key e basta)
{
    private readonly OrderService _orders;
    public OrdersController(OrderService orders, ILogger<OrdersController> logger)
        : base(logger) => _orders = orders;

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id, CancellationToken ct)
        => Ok(await _orders.GetAsync(id, ct));
}
```

#### Errori
Lancia, non `return BadRequest`:
```csharp
if (user is null) throw new NotFoundException("utente");   // → 404 ProblemDetails localizzato
```
Un tipo nuovo = una sottoclasse di `ApiException` (in una classe del tuo dominio) + la chiave nei `Resources/*.resx`:
```csharp
public class PaymentRequiredException : ApiException {
    public PaymentRequiredException() : base("error_payment_required", 402) { }
}
```

#### Leggere la sessione
```csharp
var session = CurrentSession<SessionInfo>();   // null se token assente/malformato (in un controller EngineProtectedController)
if (session is null) throw new UnauthorizedException();
```
Fuori da un controller (es. un servizio) resta `user.GetSession<SessionInfo>()` sul `ClaimsPrincipal` ricevuto: `CurrentSession<T>()` è zucchero sintattico per chi eredita già la base.

#### Ruoli di dominio e `[Authorize]`
`AuthController.Login` emette già un `ClaimTypes.Role` per ogni voce di `session.Roles`, e così `[Authorize(Roles = "admin")]` funziona nativamente: i ruoli li governi da `SessionInfo.Roles` (in `AccountService`), non toccando il controller. `session.Roles` resta anche leggibile via `User.GetSession<SessionInfo>()` per un enforce puntuale (`session.Roles.Contains("admin")` → `ForbiddenException`). Le due nozioni di "ruolo" sono spiegate in [backend/README.md](backend/README.md) §"Sistema di Login e Sessioni JWT".

#### Revocare una sessione (logout con effetto sul server)
Il JWT è stateless, ma l'Engine sa respingere i token emessi prima di un istante: `ISessionRevocation` (`Engine/Security/SessionRevocation.cs`). `DELETE /me/data` la chiama da sé dopo la cancellazione dell'account; per un logout che deve valere anche sul server (cambio password, "esci da tutti i dispositivi") è la stessa chiamata da un endpoint tuo:
```csharp
[Route("account")]
public class AccountController : EngineProtectedController
{
    private readonly ISessionRevocation _revocation;
    public AccountController(ISessionRevocation revocation, ILogger<AccountController> logger)
        : base(logger) => _revocation = revocation;

    [HttpPost("logout-everywhere")]
    public IActionResult LogoutEverywhere()
    {
        _revocation.Revoke(User);   // da ora ogni token di questa sessione emesso finora risponde 401
        return NoContent();
    }
}
```
Da sapere prima di contarci:
- **La chiave è il payload di sessione** (claim `session`, il tuo `SessionInfo`): deve restare deterministico per utente, solo dati identificativi, com'è già per contratto. Un timestamp o un nonce nel payload rende ogni token una sessione a sé, e la revoca coprirebbe solo il token che l'ha chiesta.
- **`loginTime` lo scrive `AuthService`**: un token emesso in altro modo, senza quel claim, viene respinto se la sua sessione è revocata.
- **Il default è in memoria, per processo** (`MemorySessionRevocation`): regge un backend solo, anche con frontend su un altro server e dietro reverse proxy, perché la revoca vive dove si validano i token. Non regge due istanze del backend dietro un bilanciatore, e un riavvio la perde (i token emessi prima tornano validi fino a `exp`, al massimo `Security.Token.ExpirationSeconds`). Oltre l'istanza singola registri la tua, come per `IIdentityStore`, riusando `SessionRevocation.SessionKey`/`LoginTime`:
```csharp
// Program.cs, blocco "── SERVIZI APPLICATIVI ──"
builder.Services.AddSingleton<ISessionRevocation, RedisSessionRevocation>();   // vince sul default (TryAddSingleton)
```
Dettagli (garanzie e limiti) in [backend/README.md](backend/README.md) §"Logout e revoca della sessione".

#### Personalizzare il rate limiting
Soglie in `Security.ApiConfig.RateLimiting` (nel `.local`, come il resto di `Security`): `Global.PermitLimit`/`WindowSeconds` per il limite generale per IP, `Login.PermitLimit`/`WindowSeconds` per `POST /auth/login`, `Enabled: false` per disattivarlo del tutto (le policy restano registrate, senza effetto — utile dietro un WAF/reverse proxy che applica già le proprie soglie). Per andare oltre i numeri (partizionare per utente invece che per IP, un algoritmo diverso, policy proprie per un endpoint di dominio), `AddTemplateSecurity` accetta un `Action<RateLimiterOptions>` opzionale invocato per ultimo — vince lui:
```csharp
// Program.cs
builder.Services.AddTemplateSecurity(security, options =>
{
    options.AddPolicy("mio-endpoint", ctx => RateLimitPartition.GetSlidingWindowLimiter(
        ctx.User.Identity?.Name ?? "anon", _ => new SlidingWindowRateLimiterOptions { /* ... */ }));
});
```
Dettagli in [backend/README.md](backend/README.md) §1.

#### Pubblicare una notifica realtime
Proprietà ambient, niente inject:
```csharp
Notifications.Publish(NotificationTarget.Connection(ConnectionId!),
    new NotificationMessage { Type = "toast",
        Payload = new { messageKey = "fatto", icon = "success" } });
```

#### Task lungo con notifica a fine lavoro (email o realtime)
```csharp
BackgroundQueue.TryEnqueue(async (services, ct) => {
    var store = services.GetRequiredService<IContentStore>();   // scope DI proprio
    await ImportAsync(store, ct);
    await services.GetRequiredService<IDeliveryService>().DeliverAsync(
        new DeliveryMessage { Target = target, Email = email, Body = "Import completato" },
        DeliveryChannel.Auto, ct);                              // Auto = realtime, fallback email se offline
});
return Accepted();                                             // 202 (503 se la coda è satura)
```

#### Sostituire un servizio dell'Engine
Vince l'ultima registrazione:
```csharp
// Program.cs, blocco "── SERVIZI APPLICATIVI ──" — es. l'identità da un DB invece che da identity.json
builder.Services.AddSingleton<IIdentityStore, DbIdentityStore>();
```

#### Esportare e cancellare i dati personali
`GET`/`DELETE /me/data` esistono già (protetti da login, export in JSON leggibile) e il punto da riempire pure: `Store/AppPersonalDataStore.cs`, l'unica `IPersonalDataStore` del sito (già registrata in `Program.cs`, non un export per controller di dominio). Aggreghi lì i tuoi store:
```csharp
// Store/AppPersonalDataStore.cs — aggiungi i tuoi store di dominio ai due metodi
public async Task<object?> ExportAsync(ClaimsPrincipal user, CancellationToken ct)
{
    var session = user.GetSession<SessionInfo>();   // la forma di SessionInfo è tua, non dell'Engine
    if (session is null) return null;
    return new { profilo = await _profili.GetAsync(session.UserId, ct) /* , acquisti = ... */ };
}
```
`EraseAsync` è il diritto all'oblio completo: cancella anche l'account (credenziali e identificativi sono dati personali), salvo i dati con obbligo legale di conservazione, da anonimizzare. La parte account è già delegata a `Services/AccountService.cs`, l'unico posto che conosce gli account, lo stesso che verifica le credenziali per `AuthController`: con account reali riempi `DeleteAccountAsync` lì. Di serie `AppPersonalDataStore` sostituisce, in un'unica transazione, l'id dell'utente nel registro `BlobOwnership` con un id `anonimo-<guid>` (uno per cancellazione), poi cancella l'account; se la cancellazione dell'account fallisce, una nuova `DELETE` la ripete. I file caricati restano, e la privacy lo dice.

Il frontend del template non chiama `/me/data`: chi lo espone nel progetto gestisce l'uscita. Dopo la `DELETE` (risposta `204`) l'Engine revoca la sessione (`ISessionRevocation`, default in memoria, sostituibile in `Program.cs`): il vecchio token risponde `401` al prossimo uso. Alla `204` il client scarta comunque il token e fa logout. Gli store tollerano un `UserId` orfano come "nessun dato". Dettagli (semantica, token) in [backend/README.md](backend/README.md) §9.

#### Chiamare un'API esterna
Outbound: URL/chiave in config, client tipizzato, errori verso l'upstream:
```csharp
// Program.cs, blocco "── SERVIZI APPLICATIVI ──"
builder.Services.Configure<PaymentProviderOptions>(builder.Configuration.GetSection("PaymentProvider"));
builder.Services.AddHttpClient<PaymentProviderService>();   // BaseUrl/ApiKey da IOptions, mai hardcoded
```
```csharp
// Services/PaymentProviderService.cs — errore upstream, non un 500 generico
if (!response.IsSuccessStatusCode) throw new BadGatewayException();   // 502; vedi anche 503/504
```
Dettagli (config `Custom`/sezione dedicata, segreto in `.local.json` o env var, timeout/gate) in [backend/README.md](backend/README.md) §8.

#### Ricevere un webhook
Inbound: firma sul body grezzo, non sul DTO. L'Engine non porta un helper di firma: ogni provider ha il suo schema (header, algoritmo, codifica), e il controllo lo scrivi nel progetto. Per un HMAC-SHA256 in esadecimale:
```csharp
[HttpPost, AllowAnonymous]   // pubblico per forza: il chiamante è il servizio terzo, non il tuo frontend
public async Task<IActionResult> Receive(CancellationToken ct) {
    var rawBody = await new StreamReader(Request.Body).ReadToEndAsync(ct);
    var hash = HMACSHA256.HashData(Encoding.UTF8.GetBytes(_secret), Encoding.UTF8.GetBytes(rawBody));
    var expected = Encoding.ASCII.GetBytes(Convert.ToHexString(hash).ToLowerInvariant());
    var received = Encoding.ASCII.GetBytes(Request.Headers["X-Signature"].ToString());   // header e formato: quelli del provider
    if (!CryptographicOperations.FixedTimeEquals(expected, received))                  // confronto a tempo costante
        throw new UnauthorizedException();                 // valida PRIMA di deserializzare
    BackgroundQueue.TryEnqueue(async (services, ct) => /* elabora fuori dal ciclo HTTP */ );
    return Ok();                                            // 200 rapido: i provider ritentano se non rispondi in fretta
}
```
Dettagli in [backend/README.md](backend/README.md) §8.

#### Mandare un'email
Diretta (blocca finché non è spedita) o accodata (torna subito, retry in background):
```csharp
// diretta — IEngineMailer iniettato nel costruttore (es. _mailer)
await _mailer.SendAsync(to: new[] { "destinatario@dominio.it" }, subject: "Oggetto",
    body: "Corpo del messaggio", isHtml: false, from: null, cc: null, bcc: null,
    attachments: null, replyTo: null);
```
```csharp
// accodata — IEmailQueue iniettato nel costruttore, non blocca la chiamata HTTP
_emailQueue.TryEnqueue(new EmailMessage(to: [...], subject: "...", body: "...", isHtml: false));
```
Serve `Features.Mail: true` in `global-settings.json` più `Mail.Host`/`FromAddress` nel `.local`; senza il flag `IsEnabled` è `false` e l'invio diretto lancia `MailNotConfiguredException` (503); flag acceso senza config = il backend non parte. Gate prima con `_mailer.IsEnabled`. Dettagli (SMTP, anti-spam, allegati) in [backend/README.md](backend/README.md) §5.

#### Farsi avvisare quando qualcosa si rompe
`ErrorReporting.WebhookUrl` in `global-settings.local.json` (vuoto = spento) più `Features.ErrorReporting: true` in `global-settings.json`: fatto questo, `ApiExceptionHandler` manda già un POST JSON al webhook per ogni bug vero o errore ≥500 — nessuna chiamata da scrivere, nessun pacchetto NuGet. Niente SDK di vendor: se ti serve un vero APM (Sentry e simili, con source map/release tracking), installi il loro SDK nel tuo progetto, questo resta il minimo "avvisami e basta".
```json
// global-settings.local.json
"ErrorReporting": { "WebhookUrl": "https://tuoendpoint.tld/webhook/errori" }
```
Il payload porta anche `project` (da `project.name`): più progetti sulla stessa VPS puntano allo **stesso** webhook e restano distinguibili. Dettagli in [backend/README.md](backend/README.md) §10.

#### Caricare/servire un file
`EngineBlobController` (Engine, `sealed`) è già pronto, nessun controller di progetto da scrivere né da estendere: `POST /blob/up` (richiede login) restituisce uno slug, `GET /blob/{slug}` lo riserve (con resize on-demand per immagini via `?webopt=true`), `PUT /blob/{slug}` (richiede login) ne sostituisce il contenuto e restituisce il NUOVO slug (l'originale resta immutabile), `DELETE /blob/{slug}` lo cancella (richiede login). L'unico punto di contatto col dominio è `FileBlobStore` (classe concreta, non interfaccia — un'interfaccia sarebbe cerimonia senza un secondo storage reale all'orizzonte): la ricetta sotto ("Sostituire un servizio dell'Engine") usa `IIdentityStore` come esempio ma vale identica qui, salvo che si estende/override invece di implementare da zero un'interfaccia.
```csharp
// Store/AppBlobStore.cs — override mirati, il resto resta il default Engine
public override long MaxUploadSizeBytes => 50 * 1024 * 1024; // 50 MB invece del default 10 MB — o calcolalo (ruolo utente, piano...)
public override Task<string> SaveAsync(Stream content, string extension, CancellationToken ct = default)
    => base.SaveAsync(content, extension, ct); // antivirus/quota prima della base
public override Task<bool> DeleteAsync(string slug, CancellationToken ct = default)
    => base.DeleteAsync(slug, ct); // qui c'è già il controllo di proprietà (BlobOwnershipRegistry, EF Core/SQLite): cancella chi ha caricato lo slug, o un admin
public override Task<string> ReplaceAsync(string oldSlug, Stream content, string extension, CancellationToken ct = default)
    => base.ReplaceAsync(oldSlug, content, extension, ct); // "modifica" = salva il nuovo poi cancella il vecchio, mai overwrite in-place
```
Dettagli (cache/ETag, difesa XSS sui content-type) in [backend/README.md](backend/README.md) §"EngineBlobController".

## Documentazione

Documenta cosa garantisce e perché, non il come riga-per-riga: il come vive nei commenti del codice, l'unica fonte che non mente ai refactor. Le ricette qui sopra sono pattern d'uso (cosa fare), non spiegazioni del motore.
