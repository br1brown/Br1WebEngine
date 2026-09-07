# Br1WebEngine - Frontend (Angular 21)

> 📚 Parte della documentazione di Br1WebEngine: indice e tabella "dove metto le mani" nel [README principale](../README.md). Le sezioni "Developer Journey" qui sotto sono il come passo-passo del frontend.

Benvenuto nel frontend di Br1WebEngine: un progetto Angular con sopra un livello dichiarativo, pensato per Server-Side Rendering (SSR) e Developer Experience (DX).

Il livello di complessità tipica (routing frammentato, meta tag SEO sparsi, lazy loading) è stata centralizzata in un singolo Domain Specific Language (DSL).

---

## 🚀 Funzionalità Principali dell'Engine

### 1. `site.ts` + `pages/*.pages.ts`: Il DSL di Configurazione
Perché è utile: in Angular standard aggiungere una pagina richiede configurare il routing, aggiornare i menu e gestire manualmente la SEO.
Cosa fa l'Engine: ogni pagina si dichiara come oggetto (path, title, component, meta) in un file di area sotto `src/app/pages/*.pages.ts`, non in `site.ts`, che si limita ad assemblarle insieme a `legalPages`, shell (comportamento navbar/footer/pannello) e slot login/home (è comunque il primo file che apri: da lì risali a tutto il resto). Da quelle dichiarazioni l'Engine crea a runtime le rotte, nasconde/mostra la navbar in base a `layout.showNav`, e se la pagina ha `requiresAuth: true`, l'SSR viene spento forzando il client-side rendering.

### 2. Auto-SEO Dinamica
Basta aggiungere `description` o `ogImage` nell'oggetto pagina dentro `site.ts`. Un Resolver intercetta la navigazione e inietta prima del rendering i corretti tag Head, OpenGraph e i dati strutturati.

### 3. Signals Nativo (zoneless)
Gestione stato locale e globale tramite l'API nativa `Signals` di Angular 21. Niente NgRx, niente boilerplate eccessivo.

L'app è zoneless: non c'è `zone.js`, la change detection è guidata dai signal e dagli eventi gestiti da Angular (binding di template e `host`). Conseguenze pratiche:
- Aggiorna lo stato con i signal (`signal()`, `computed()`, `set/update`): la UI si rinfresca da sola.
- La change detection è guidata dai signal: `setInterval`/`requestAnimationFrame` non innescano cicli, quindi usa direttamente i timer del browser e aggiorna lo stato con i signal.
- Se integri una callback di una libreria esterna che muta un campo non-signal, convertila in signal (o usa un signal di appoggio) affinché la UI reagisca.

### 4. Gestione Trasparente Privacy e Accessibilità
L'Engine si occupa di iniettare meccanismi standard di base per l'Accessibilità (WCAG) e alcuni helper della shell già pronti e auto-iniettati: un banner cookie integrato che si allinea alla navigazione e un pulsante "torna su" (back-to-top) che compare dopo lo scroll. Non vanno istanziati né configurati: ci sono e basta, senza codice in più da scrivere.

### 5. Policy Pages Integrate
Le pagine legali (Privacy, Cookie, Termini, Note Legali) le costruisce l'Engine: in `site.ts` valorizzi gli slot `legalPages` (`privacy`/`cookie`/`tos`/`legal`) coi tuoi `PageType` e il builder inietta da solo il nodo `/policy/*`. Uno slot omesso = quella pagina non esiste (es. una vetrina con solo i cookie). Se il sito usa cookie, lo slot `cookie` è obbligatorio: ometterlo è un errore al build. I testi vivono in `src/assets/legal/` come Markdown localizzati (es. `privacy.it.md`, `TOS.it.md`); il `ContentResolver` li carica da filesystem in SSR e via fetch nel browser, e il `PolicyComponent` interpola i placeholder come `{{ragioneSociale}}` / `{{partitaIva}}` dall'identità del sito (`GET /identity`).

### 6. Catalogo Design System (sempre in home)
Perché è utile: chi valuta l'aspetto di un sito — un designer, un Art Director — di norma dovrebbe leggere il codice o loggarsi con le credenziali demo per capire che faccia ha il sistema: un ostacolo inutile per chi non scrive codice.
Cosa fa l'Engine: `app-design-system-gallery` (`core/engine/components/design-system-gallery/`) è un catalogo visivo dei componenti di base (colori, tipografia, bottoni, badge, alert, form) montato di serie nella home — sempre visibile, senza login. Vive nell'Engine e non in `components/shared/**` (che è Dominio, vedi «Mappa del territorio» sotto) apposta: sopravvive anche a un `setup.mjs` → "parti pulito" (eject), quando il resto della demo viene rimosso, ed è l'unica sezione della home pensata per un pubblico non-dev. Per lo stesso motivo le sue stringhe vivono in `basic.{lang}.json` (Engine, mai azzerato) invece che in `addon.{lang}.json` (Dominio, azzerato dall'eject).

---

## 🗺️ Mappa del territorio: cosa è tuo, cosa è dell'Engine

Prima di scrivere una riga, tieni a mente una sola linea di confine. Tutto ciò che vive sotto `src/app/core/engine/**` è l'Engine: lo consumi, non lo tocchi (così un domani aggiorni il motore senza rimergiare a mano le tue modifiche). Tutto il resto è del progetto figlio: è tuo e lo plasmi. La regola si riassume in una frase: se è sotto `core/engine/`, lo consumi, altrimenti è tuo.

| Area | Di chi è | Cosa ci fai |
| :--- | :--- | :--- |
| `core/engine/**` | **Engine** (intoccabile) | Servizi, direttive, componenti shell, builder, server SSR, script di build — inclusa la libreria di componenti riusabili (`core/engine/components/**`: azione, contatto, social, `app-identity-render`, `app-login-form`, `app-upload-form`, footer, `app-icon`, `app-user-nav`…). Lo consumi tramite token, signal e direttive — non lo modifichi |
| `site.ts` | Tuo | Il DSL del sito: assembla `PageType` dai file di area (`pages/*.pages.ts`), pagine, menu, shell, tema. È il primo file che apri |
| `app.component.ts` / `.html` | Tuo (la **shell**) | Monta navbar, footer, cookie banner, back-to-top e smoke, e avvia `VersionCheckService.init()`. È il posto naturale dove iniettare un servizio sempre-attivo (es. `NotificationStreamService`) |
| `components/shared/**` | Tuo (specifici del progetto) | Vuoto di serie: qui ci metti i TUOI componenti riusabili — quelli davvero legati al dominio del progetto (una card di prodotto, un widget specifico) — o un bottone/canale in più che estende una base dell'Engine (vedi sotto) |
| `core/services/**` | Tuo | `api.service.ts` (il client API che estendi con i tuoi endpoint), `auth.service.ts`, `cookie-registry.ts` (`COOKIE_MAP`) |
| `core/dto/**` | Tuo | I contratti dati (`session.dto.ts`, `auth.dto.ts`) allineati a mano ai record C# |
| `pages/**` | Tuo | Le schermate, ognuna estende `PageBaseComponent` |
| `styles/**` | Tuo (entry `styles.scss`) | Stili globali: parti da `styles.scss`, i tuoi partial in `styles/app/`. `styles/engine/` è dell'Engine e non si tocca |

Il confine non è arbitrario: `app.component.ts` (che è tuo) importa `FooterComponent` da `./core/engine/components/footer/...`, legge `ContestoSito.config.smoke` e chiama `VersionCheckService`, orchestrando cioè i pezzi dell'Engine montandoli nella shell, senza farne parte. La distinzione operativa è questa: gli oggetti sotto `core/engine/**` non si aprono per modificarli, si consumano (un `inject(...)`, una direttiva, un signal); tutto il resto è codice di progetto che adatti al tuo dominio. Quando un capitolo qui sotto dice "estendi" o "aggiungi un metodo", parla sempre di file fuori da `core/engine/**`; quando dice "consuma" o "leggi il signal", parla dell'Engine.

---

## 📜 Le Regole del Gioco (cosa impone l'Engine)

### 1. Stabilità dei Riferimenti: `PageType`
Per ogni schermata aggiungi un identificatore a `PageType`, l'identità stabile della pagina, e naviga sempre tramite quell'ID (mai l'URL), così il link resta valido anche cambiando il path. `PageType` è assemblato in `site.ts` dai file di area sotto `pages/`, uno per gruppo tematico (la demo ha `app.pages.ts` e `legal.pages.ts`): ogni area resta un file breve e indipendente, da aprire e mantenere senza scorrere le altre. Ogni area segue lo stesso pattern: un oggetto `as const` di ID stringa (prefissati per area, leggibili anche fuori da TypeScript, in query string o log) più l'array delle relative dichiarazioni pagina:
```typescript
// pages/blog.pages.ts
export const BlogPages = { List: 'blog.list', Post: 'blog.post' } as const;
export const blogPagesDecl: SitePageInput[] = [
    { path: 'blog', pageType: BlogPages.List, title: 'blogNav', component: () => import('./blog/list.component').then(m => m.ListComponent) },
];
```
```typescript
// site.ts
import { BlogPages, blogPagesDecl } from './pages/blog.pages';
export const PageType = { ...LegalPages, ...AppPages, ...BlogPages } as const;
export type PageType = (typeof PageType)[keyof typeof PageType];
// ...
pages: () => [...appPagesDecl, ...blogPagesDecl],
```
Aggiungere una nuova area è un file + una riga di spread; aggiungere una pagina in un'area esistente è un nuovo identificatore nell'oggetto dell'area più la sua dichiarazione.

### 2. Componenti Pagina vs Componenti UI
- **`pages/`**: Sono le schermate. Ereditano da `PageBaseComponent` per ottenere l'accesso rapido ad API, logger e traduttore senza iniezioni ridondanti.
- **`components/`**: Pezzetti di UI isolati. Ricevono dati tramite `@Input()`.

### 3. Manipola il DOM in modo dichiarativo (compatibile con l'idratazione)
Usa esclusivamente binding dichiarativi (`[class.hidden]="!isVisible()"`) e Template Refs: così l'accesso al DOM passa per Angular e resta valido anche in SSR.

Idratazione incrementale per le pagine lunghe: l'Engine registra già `withIncrementalHydration()` (`app.config.ts`): nelle pagine lunghe basta avvolgere le sezioni sotto la piega in un blocco `@defer (hydrate on viewport)`:

```html
@defer (hydrate on viewport) {
    <section><!-- sezione pesante sotto la piega --></section>
} @placeholder {
    <!-- scheletro Bootstrap: appare solo in navigazione client, mai in SSR -->
    <section class="card placeholder-glow" aria-hidden="true" style="min-height: 320px">
        <div class="card-body"><span class="placeholder col-6"></span></div>
    </section>
}
```

Comportamento:
- **Primo caricamento (SSR):** la sezione è renderizzata normalmente nell'HTML (contenuto e SEO invariati), ma il browser la idrata solo quando entra nel viewport: meno JavaScript eseguito all'avvio.
- **Navigazione client (cambio pagina nella SPA):** il blocco carica `on idle`, mostrando per un attimo il `@placeholder`.
- I click su una sezione non ancora idratata non vanno persi: `withEventReplay()` li riconsegna a idratazione avvenuta.

La home demo lo applica alle sezioni QR, Notifiche e Sistema, esempio vivo finché un progetto figlio non la riscrive.

Transizioni di pagina: l'Engine registra `withViewTransitions()` nel router: i cambi pagina usano la View Transitions API del browser (cross-fade) come progressive enhancement, dove i browser senza supporto navigano senza animazione, e il movimento è disattivato sotto `prefers-reduced-motion` (regola in `engine/base/_a11y.scss`). Nessuna configurazione richiesta. In più, ogni pagina che estende `PageBaseComponent` riceve un fade-in d'ingresso del contenuto (classe `.page-fade` applicata via host binding, attiva di default da `shell.pageFade`), che si somma alla cross-fade. È un gate come gli altri flag shell (col globale a `false` nessuna pagina può riattivarlo) e rispetta anch'esso `prefers-reduced-motion`.

### 4. CSS: Bootstrap First, Custom Solo Se Necessario
Il progetto usa Bootstrap 5 come sistema di design principale: per layout, tipografia, form e componenti parti sempre dalle classi Bootstrap, e tieni il CSS custom per ciò che Bootstrap non copre.

Cosa va nel template HTML (classi Bootstrap):
- Layout e spacing (`d-flex`, `align-items-center`, `mb-3`, `gap-2`, `p-4`)
- Tipografia (`fw-bold`, `text-muted`, `small`, `h4`, `lead`)
- Form (`form-control`, `form-label`, `is-invalid`, `invalid-feedback`)
- Componenti (`card`, `alert`, `btn`, `spinner-border`, `badge`, `list-group`)
- Responsive (`col-md-6`, `d-none d-lg-block`)

Gli stili sono in SCSS, e hai un solo punto di partenza: `src/styles.scss`. Le fondamenta dell'Engine (token del tema, ponte Bootstrap, layout, accessibilità: `styles/engine/base`) sono cablate dalla build (`angular.json → "styles"`) e caricate sempre: non le vedi e non puoi romperle per sbaglio. A te restano `src/styles.scss` (l'entry), `src/styles/app/` (i tuoi partial, importati con `@use 'app/...'`) e lo strato opzionale dell'Engine. (`styles/engine/` è dell'Engine e si aggiorna dal template; la scelta del font — `styles/font-config.ts` — resta tua, il catalogo dietro è in `core/engine/font-system.ts`, come già visto.)

In `styles.scss`:
- `@use 'engine/nav'`: strato opzionale dell'Engine per navbar/footer/dropdown. Vuoi una navigazione con un tuo stile grafico? Commenta questa riga e scrivi il tuo (es. in `styles/app/_nav.scss`): gli stili nav agiscono su classi globali (`.nav-link`, `.navbar .dropdown-menu`…) rese dal componente, quindi le ridipingi dai tuoi file. L'opt-out è a livello di CSS: il markup della navbar resta del componente Engine.
- I tuoi stili globali, gli override di tema/Bootstrap e le utility vanno in `styles.scss` o in partial sotto `styles/app/` importati da lì.

Riusare gli strumenti SCSS dell'Engine: grazie ai loadPaths (`angular.json → stylePreprocessorOptions.includePaths`), da qualsiasi `.scss` (globale o di componente) importi gli helper con un path stabile, senza catene `../../../`:
```scss
@use 'engine/base/lib' as lib;
.cta { background: lib.shade(var(--bs-primary), 12%); }      // scurisce un colore via color-mix
@media (max-width: #{lib.$bp-md - 0.02px}) { /* mobile */ }  // breakpoint md condiviso
```
`lib` espone solo strumenti (variabili/funzioni/mixin), nessun CSS: importarlo non duplica nulla.

Nota: `src/styles/engine/` è riservato all'Engine (tema OKLCH, ponte Bootstrap, a11y) e si aggiorna dal template, non modificarlo; i CSS di terze parti (Bootstrap, FontAwesome, SweetAlert2) stanno in `angular.json → "styles"`, non con `@import`.

Cosa va nel file `.scss` del componente (solo ciò che Bootstrap non può esprimere):
- Posizionamento fisso con `safe-area-inset` (cookie banner, back-to-top)
- Animazioni CSS (`@keyframes`, transizioni custom)
- Effetti visivi avanzati (glassmorphism con `backdrop-filter`, gradienti complessi)
- Override di tema via `color-mix()` e custom properties (`--color*`)
- Layout a griglia complesso (`grid-template-rows: 0fr → 1fr` per accordion)

z-index e ombre: solo variabili, mai letterali. `base.scss` (partial `base/_tokens.scss`) definisce la scala z-index del template (`--z-cookie-banner`, `--z-fab`, `--z-skip-link`, `--z-cdk-overlay`), incastrata nei vuoti della scala Bootstrap così i widget persistenti restano sotto offcanvas e modali (che devono coprirli). Un nuovo elemento fisso usa una di queste variabili o ne aggiunge una alla scala, così resta coerente con l'ordine di sovrapposizione di Bootstrap. Stesso principio per le ombre di elevazione: `--shadowElevated` / `--shadowElevatedHover`.

Componenti senza CSS: crea il file `.scss` di un componente solo quando ti serve qualcosa fra i casi sopra. Il footer, ad esempio, è 100% classi Bootstrap nel template e non ne ha uno.

---

## 🧩 Punti di personalizzazione (estendere l'Engine senza toccarlo)

Tutto ciò che un progetto figlio configura per fare suo il sito senza modificare l'Engine (`core/engine/**` resta intatto), raggruppato per area. Ogni paragrafo dice in breve come si attiva un seam e rimanda (vedi «…») alla sezione di dettaglio più sotto in questa pagina.

### Pagine & rotte (`pages/*.pages.ts` + `site.ts`)

Le pagine vivono nei file di area `pages/*.pages.ts` (uno per gruppo tematico, es. `app.pages.ts`): ogni area dichiara i propri ID `PageType` (stringhe prefissate, es. `app.home`) e le proprie dichiarazioni di pagina. Tutto ciò che riguarda la singola pagina va lì, non in `site.ts`. `site.ts` si limita ad assemblare le aree con uno spread e a tenere per sé la configurazione a livello di sito. In pratica:

| Vive nel file di area (`pages/*.pages.ts`) — per-pagina | Vive in `site.ts` — a livello di sito |
| :--- | :--- |
| `path`, `pageType`, `title`, `component` (lazy) | `homePage` / `loginPage` (brand link, redirect auth) |
| `requiresAuth` (guard + SSR off), `renderMode` | `legalPages` (slot Privacy/Cookie/TOS/Note legali) |
| `layout` (`showNav`/`showFooter`/`showPanel`/`fitViewport`/`showSmoke`/`pageFade` per-pagina) | `shell` (default globali di navbar/footer/pannello) |
| `description`, `otherSEO` (`ogImage`, `ogType`, `structuredData`, `noindex`) | `isWebApp`, `onlyPlainImage` |
| `children` (gruppo di menu annidato, es. le `/policy/*` dell'Engine) o `externalUrl` (link esterno) | — |
| `enabled: false` (spegne la pagina ovunque in un colpo solo: rotta, menu, sitemap, padre incluso) | `pages` — la sola riga che tocca le aree, ed è solo uno spread: `pages: () => [...appPagesDecl]` |

`children` (rotta annidata) non è `addGroup` (voce di menu annidata): sono due nidificazioni diverse, non intercambiabili. `children` in un file di area crea una vera route Angular contenitore: il nodo padre non ha `pageType` né `component` (esiste solo per il path condiviso), e i figli sono pagine reali sotto quel prefisso, ed è così che l'Engine costruisce `/policy/privacy`, `/policy/cookie`, ecc. `addGroup` (vedi «Navigazione Multilivello» sotto) invece non tocca il routing: raggruppa voci già esistenti sotto un dropdown/accordion nel menu, le pagine restano ai loro path originali. Un esempio di `children`:
```typescript
// pages/blog.pages.ts — /blog è un contenitore, /blog e /blog/:slug sono pagine reali sotto di lui
export const BlogPages = { List: 'blog.list', Post: 'blog.post' } as const;
export const blogPagesDecl: SitePageInput[] = [
  {
    path: 'blog', title: 'blogNav', // nodo contenitore: niente pageType né component qui
    children: [
      { path: '', pageType: BlogPages.List, title: 'blogListNav', component: () => import('./blog/list.component').then(m => m.ListComponent) },
      { path: ':slug', pageType: BlogPages.Post, title: 'blogPostNav', component: () => import('./blog/post.component').then(m => m.PostComponent) },
    ],
  },
];
```

I link interni puntano al `PageType`, mai al path: rinominare un path è una riga nella dichiarazione (menu, footer e link continuano a funzionare), rimuovere un ID fa segnalare a TypeScript ogni punto che ancora lo usa, e gli ID restano leggibili anche fuori dal codice: query string (`?returnPageType=…`), log, messaggi d'errore del builder.

Con più lingue configurate, ogni pagina ottiene una variante-URL per lingua (lingua default non prefissata, le altre sì: vedi «Internazionalizzazione (i18n)» → «Lingua nell'URL»). Il `path` dichiarato nel file di area può essere lo stesso segmento sotto ogni prefisso (stringa, il caso di default) oppure un segmento diverso per lingua (`{ it: 'chi-siamo', en: 'about-us' }` → `/chi-siamo` e `/en/about-us`) — una lingua del sito senza una propria chiave ricade sul segmento della lingua di default. Link interni, sitemap/hreflang e il selettore lingua in navbar seguono da soli il `PageType`, non serve altro punto da toccare. Vedi «Developer Journey», «Opzioni Avanzate di site.ts», «Navigazione Multilivello», «Vista a tutto schermo», «Pagine legali». Ricetta rapida: [AGENTS.md](../AGENTS.md#aggiungere-una-pagina).

### Dati a una pagina

Per passare qualcosa a una pagina hai quattro canali, tutti letti come `@Input()` per nome: `data` statico, parametro di rotta `:x`, query `?x=` e il resolver. Per avere il contenuto già al primo render dichiara un `contentLoader` sulla pagina (`pages/*.pages.ts`, stesso posto di `dynamicParams`) — il `ContentResolver` dell'Engine resta generico, non lo tocchi. La configurazione libera di progetto si legge con `inject(APP_CUSTOM)` (la sezione `Custom`), mentre la configurazione risolta e normalizzata del sito con `inject(SITE_CONFIG)`. Vedi «Passare Dati a una Pagina», «ContentResolver», «Configurazione di progetto (Custom)», «Token SITE_CONFIG». Ricetta rapida (tipi generati per `global-settings.json`): [AGENTS.md](../AGENTS.md#leggere-global-settingsjson-tipizzato).

### Aspetto & i18n

Il colore del brand è `colorTema`, modificabile a runtime con `ThemeService.setColorTema()`; per validare un contrasto c'è `ThemeService.calcContrastRatio()` (modello WCAG 2.1). Le stringhe del progetto e le sovrascritture vanno in `addon.{lang}.json`, che ha la precedenza su `basic` (l'engine, mai toccato); la lingua si cambia a runtime con `TranslateService.setLanguage()`. Vedi «Tema e Sistema di Colori», «Metodi Statici (SSR-Safe)», «Internazionalizzazione», «Lingua a Runtime».

### Servizi & componenti

Estendi il client API aggiungendo path e metodo pubblico in `api.service.ts` (con `{ silent: true }` quando vuoi gestire l'errore con una UI tua); abiliti le notifiche realtime con il campanellino via `shell: { showNotifications: true }`; registri un cookie o una voce di Web Storage aggiungendo una riga a `COOKIE_MAP`; adatti i DTO di sessione e login in `core/dto/` (`session.dto.ts` e `auth.dto.ts`, allineati ai record C#). Ricette rapide: [AGENTS.md](../AGENTS.md#aggiungere-un-endpoint-al-client) (endpoint), [AGENTS.md](../AGENTS.md#persistere-dati-lato-client-cookie-web-storage-consenso) (cookie/Web Storage).

Per comporre le UI riusi le direttive dichiarative (`[appPage]` per i link interni, `[appImgRender]`/`[appQrContent]` per immagini e QR generati, `[appContextMenu]` per i menu contestuali), la pipe `markdown` (sanitizzata) e i componenti pronti (`app-link-badge` e le famiglie azione/contatto). La PWA si attiva con `isWebApp`. Vedi «Aggiungere un Endpoint», «Errori Silenziosi per UI Custom», «NotificationStreamService», «Aggiungere un Nuovo Cookie», «DTO di Sessione e Login», «[appPage]», «Directive di Rendering Dichiarativo», «Componenti di Azione/Contatto».

### Bundling & build (`angular.json`)

Il peso del bundle si regola con `budgets` (soglie warning/errore, già gate di `ng build`), la whitelist `allowedCommonJsDependencies` per librerie di terze parti senza ESM, e gli array `styles`/`scripts`/`assets` per CSS/JS/file globali. Il code-splitting per pagina è già automatico (`site.ts → component: () => import(...)`); per un SDK pesante applichi lo stesso `import()` dinamico a mano, dentro il componente che lo usa. Vedi «Bundling frontend: budget, code-splitting e i confini del builder».

---

## 🛠️ Developer Journey: Aggiungere una Pagina

Per creare una nuova schermata, segui questo workflow per mantenere integro e type-safe il routing dell'Engine:

1. **Registrare l'identità:** Aggiungi un nuovo `PageType` nel file della sua area (`src/app/pages/*.pages.ts`); una nuova area è un nuovo file dello stesso pattern, assemblato in `src/app/site.ts`.
2. **Dichiarare la rotta:** Aggiungi la dichiarazione della pagina nell'array del suo file di area (path, SEO ed eventuali guardie); `site.ts` resta invariato se l'area esiste già.
3. **Creare il componente:** Crea il componente in `pages/` estendendo `PageBaseComponent` per ereditare i servizi dell'Engine (api, traduzioni, asset, notify e meta-tag automatici).
4. **Proteggere la pagina (opzionale):** Usa `requiresAuth: true` nella dichiarazione della pagina (nel suo file di area, `pages/*.pages.ts`) per demandare all'Engine il controllo auth e il redirect.
5. **Navigare in Sicurezza:** Usa la direttiva `[appPage]="PageType.MioNuovoComponente"` nell'HTML per delegare al framework il calcolo della rotta corretta.
6. **Caricare dati prima del render (opzionale):** Se la pagina necessita di dati SEO-critici pronti al primo render, dichiara un `contentLoader` sulla pagina (stesso posto di `dynamicParams`, in `pages/*.pages.ts`) — il `ContentResolver` dell'Engine resta generico, non lo tocchi.

> Nota: gli snippet di codice e i pattern implementativi (le "ricette") sono consultabili nel file `AGENTS.md` alla radice, oppure basta prendere spunto dai file della demo (es. la cartella `home`).

#### `PageBaseComponent`: cosa eredita gratis

Estendere `PageBaseComponent<T>` non dà solo l'accesso rapido ai servizi (`api`, `translate`, `asset`, `notify`): porta con sé due comportamenti automatici che non vanno riscritti nel componente figlio.

- SEO sempre allineata, senza chiamare `PageMetaService` a mano: un `effect()` interno alla base aggiorna title, description e og:image ogni volta che il contenuto risolto cambia, incluso il cambio lingua. Il tuo componente non tocca `PageMetaService`: dichiara i meta in `site.ts` / nel resolver e l'Engine li riapplica da solo.
- Ricarica reattiva alla lingua, con race-guard: nel browser la base ri-esegue il resolver a ogni cambio di `currentLang()`, così il contenuto si ri-fetcha nella nuova lingua. Un contatore di sequenza (`reqId`) scarta le risposte lente arrivate dopo una più recente, evitando che dati stantii sovrascrivano quelli nuovi a cambi lingua ravvicinati.

Gli input che la base legge per te, `pageType` e `contentByResolve`, sono `protected`: li consumi dentro il componente (es. via `pageContent()`), non li ridichiari.

Se ti serve l'URL canonico della pagina corrente (per condivisioni, link assoluti, `<link rel="canonical">` custom) chiama `this.getCurrentUrl(): string`. È un wrapper sottile che la base espone al figlio: dietro le quinte interroga `PageMetaService`, che resta `private` all'Engine: il componente ottiene "dove si è" senza dipendere dal servizio meta né poterne alterare lo stato.

---

## 🔐 Sistema di Autenticazione (JWT)

Il sistema di login è opzionale e si attiva configurando `Security.Token.SecretKey` (in `global-settings.local.json`). Sul frontend serve:

```typescript
// site.ts → tutto strutturale, sta insieme
loginPage: { page: PageType.Login, showInHeader: true },  // redirect auth + link Login in navbar
// loginPage: PageType.Login,   // forma nuda: solo redirect auth, login fuori dalla navbar
```

### Proteggere una Pagina

In `pages`, imposta `requiresAuth: true` sulla pagina da proteggere. L'Engine aggiunge automaticamente `renderMode: 'client'` (disabilita SSR per quella pagina) e attiva l'auth guard.

Cosa fa il guard quando l'utente non è loggato (`authGuard` in `core/engine/routing.ts`): se in `site.ts` è dichiarata una `loginPage`, redirige lì con i query param `returnPageType` (la pagina di partenza, per tornarci dopo il login) e `reason=auth` (la pagina di login mostra un avviso inline invece di una modale). Senza `loginPage`, resta sulla pagina corrente e mostra la modale di errore 401.

```typescript
pages: (ctx) => [
    {
        path: 'area-riservata',
        pageType: PageType.AreaRiservata,
        requiresAuth: true,
        component: () => import('./area-riservata/area-riservata.component').then(m => m.AreaRiservataComponent)
    }
],
```

> `requiresAuth` protegge la rotta, non nasconde la voce di menu. Sono due cose distinte: senza altro, un `addPage(PageType.AreaRiservata)` nel resolver di navigazione (`nav.ts`, vedi "Navigazione Multilivello" più sotto) resta visibile anche a chi non è loggato (e verrebbe rimbalzato al login/401 al click). Per nascondere la voce stessa finché non si è loggati, usa `authOnly` sul builder di navigazione.

### Leggere la Sessione in una Pagina

`AuthService` (iniettabile ovunque) espone segnali reattivi:

```typescript
readonly auth = inject(AuthService);

// Reattivo: true/false a login/logout
this.auth.isLoggedIn

// Payload di sessione tipizzato (null se non loggati)
this.auth.session() // → SessionInfo | null
this.auth.session()?.displayName
this.auth.session()?.roles
```

### DTO di Sessione e Login (di proprietà del progetto)

I contratti di autenticazione vivono fuori da `core/engine/**` (`src/app/core/dto/`), quindi sono del progetto figlio: li adatti al tuo dominio.

| DTO | File | Cos'è |
| :--- | :--- | :--- |
| `SessionInfo` | `core/dto/session.dto.ts` | Payload del claim `session` del JWT, decodificato da `AuthService`. Corrisponde al record C# `SessionInfo` (`backend/Models/SessionInfo.cs`): le due vanno tenute in sincronia **a mano** (niente codegen). |
| `LoginRequest` / `LoginResult` | `core/dto/auth.dto.ts` | Body e risposta di `POST /auth/login`. Stesso principio: allinea i campi al backend. |

Aggiungere un campo al profilo di sessione (es. `brandColor`) è quindi un'unica modifica coordinata: il campo nel record C# e lo stesso campo qui in `SessionInfo`.

### Componenti Pronti all'Uso

| Componente | Selector | Ruolo |
| :--- | :--- | :--- |
| `LoginFormComponent` | `app-login-form` | Form username/password riusabile; emette `(loggedIn)` al successo. Non naviga da solo. |
| `UserNavComponent` | `app-user-nav` | Area Login/Logout nella navbar. Il link di login appare solo con `loginPage: { page, showInHeader: true }`; il logout, da loggati, appare comunque. Gestisce il logout con modale di conferma. |
| `UploadFormComponent` | `app-upload-form` | Componente "dumb" per drag-and-drop e selezione file. Emette il `File` nativo delegando la chiamata API al componente genitore. |

### Ciclo di Vita del Token

Il token è persistito in `sessionStorage` (sopravvive all'F5, si azzera alla chiusura della scheda). `TokenService` (engine, intoccabile) avvia un timer automatico che esegue il logout allo scadere dell'`exp` del JWT. Il timer gestisce il limite JavaScript di 24 giorni tramite rescheduling ricorsivo.

> PWA e `sessionStorage`: logout silenzioso al rilancio. Su un sito con `isWebApp: true`, riaprire l'app installata dalla home screen può creare un nuovo contesto di navigazione a seconda di OS/browser (non è sempre la stessa "scheda" del punto di vista di `sessionStorage`), e l'utente si ritrova sloggato senza un'azione esplicita di logout. Non c'è oggi un meccanismo dell'Engine che lo previene: chi ha bisogno di una sessione che sopravviva al rilancio della PWA deve valutare un mezzo diverso (es. un refresh token in cookie persistente), fuori dallo scope attuale di `TokenService`.

### Gestione Errori di Login

`AuthService.login()` traduce i codici HTTP in messaggi i18n tramite `mapLoginError()` (in `auth.service.ts`):

| Codice | Chiave i18n usata | Quando accade |
| :--- | :--- | :--- |
| `401` | `loginErroreGenerico` | Credenziali errate |
| `429` | `errore429Descrizione` | Troppi tentativi — il backend limita l'endpoint di autenticazione a 5 req/min |
| `503` / `404` / `0` | `loginServizioNonDisponibile` | Servizio non raggiungibile |
| qualsiasi altro | `erroreImprevisto` | Errore non classificabile |

Il 429 è importante: senza questa mappatura esplicita, un rate-limit sul login mostrerebbe "errore imprevisto" invece di un messaggio informativo per l'utente.

---

## 🚧 Pagine di Errore

Il template include una pagina d'errore generica (`ErrorComponent`) che copre qualsiasi codice HTTP: 404, 403, 500, ecc. Un solo componente copre ogni codice: lo legge dalla rotta e risolve i testi via i18n.

### Come ci si arriva

Le rotte d'errore sono generate automaticamente (`core/engine/routing.ts`):

| Rotta | Comportamento |
| :--- | :--- |
| `**` (qualsiasi URL non riconosciuto) | redirect a `error/404` |
| `error/:errorCode` | mostra `ErrorComponent` con quel codice |
| `error` | redirect a `error/500` |
| `error/401` | redirect alla pagina di login (`loginPage`), se configurata |

Il caso `401` è speciale: un utente non autenticato non finisce su una pagina d'errore cieca ma viene mandato al login. Se nessuna pagina di login è configurata, l'`authGuard` resta sulla pagina corrente e mostra una modale di accesso negato (vedi Sistema di Autenticazione).

Per mostrare un errore programmaticamente, naviga verso la rotta:
```typescript
this.router.navigate(['/error/403']);
```

### Personalizzare i messaggi

I testi seguono il pattern di chiavi i18n in `basic.{lang}.json`:
```
errore{codice}Titolo        // es. errore404Titolo → "Pagina non trovata"
errore{codice}Descrizione   // es. errore404Descrizione → testo esteso
```
Per gestire un nuovo codice basta aggiungere le due chiavi (es. `errore402Titolo` / `errore402Descrizione`). Se mancano, la pagina ricade su messaggi generici (`erroreGenerico` + codice, `erroreImprevisto`), quindi non resta mai vuota.

### Errore di pagina vs errore di risorsa

L'Engine tiene separati due tipi di errore, con messaggi diversi di proposito:

| | Errore di **pagina** (routing) | Errore di **risorsa** (API) |
| :--- | :--- | :--- |
| Quando | L'utente naviga verso una rotta inesistente o protetta | Una chiamata API fallisce |
| Chi lo gestisce | `ErrorComponent` | `apiErrorInterceptor` → `NotificationService.handleApiError()` |
| Esempio 404 | "Pagina non trovata" | "Risorsa non trovata" |
| Esempio 403 | "Accesso vietato alla pagina" | "Non hai privilegi su questo elemento" |

Così un 404 di navigazione e un 404 di una `GET` falliscono con parole appropriate al contesto, non con lo stesso testo generico.

> Lato server: per le rotte `error/{code}` l'SSR restituisce anche lo status HTTP reale (es. `error/404` → `404`), non un `200`. Vedi Server SSR → Status Code SEO-Aware.

---

## 🔒 Consenso Cookie e Privacy (GDPR/ePrivacy)

`CookieConsentService` gestisce cookie e Web Storage con strategia "Privacy by Default": nessuna scrittura senza consenso esplicito, un'unica mappa, un'unica API (`set`/`get`/`remove`), un unico elenco in policy.

### Categorie di Consenso
- **Technical**: Strettamente necessari (sessione, consenso). Esenti per legge. Mostrati con badge "Necessari", niente switch.
- **TechnicalOptional**: Tecnici ma non necessari (es. Service Worker, widget opzionali). Richiedono consenso.
- **Analytics**: Tracciamento e statistiche. Richiedono consenso.
- **Profiling**: Pubblicità e profilazione. Richiedono consenso.

### Aggiungere voci in `COOKIE_MAP`
Registra le voci in `src/app/core/services/cookie-registry.ts` per automatizzare il consenso, il banner e la policy:

```typescript
import { ConsentCategory, type CookieConfig } from '../engine/services/cookie/cookie-type';

export const COOKIE_MAP = {
    'mioTracker': {
        category: ConsentCategory.Analytics,
        descriptionKey: 'mioTrackerDescrizioneListaCookie', 
        valueType: 'boolean', // 'string' | 'number' | 'boolean' | 'json'
    },
    '_ga': {
        category: ConsentCategory.Analytics,
        provider: 'Google Analytics',
        providerUrl: 'https://policies.google.com/privacy',
        durationKey: 'gaDurataListaCookie',
    },
    'mioSalvataggio': {
        category: ConsentCategory.Technical,
        storage: 'local', // 'local' | 'session' | omesso = cookie
        valueType: 'json',
        descriptionKey: 'mioSalvataggioDescrizioneListaCookie',
    },
    'sdkTerzaParte.telemetria': {
        category: ConsentCategory.Analytics,
        storage: 'local',
        match: 'prefix', // Rimuove tutte le chiavi che iniziano così
        provider: 'Fornitore SDK',
        providerUrl: 'https://esempio.tld/privacy',
        descriptionKey: 'sdkTelemetriaDescrizioneListaCookie',
    },
} as const satisfies Readonly<Record<string, CookieConfig>>;
```

**Uso nei componenti (tipizzato e reattivo):**
```typescript
private readonly consent = inject(CookieConsentService);

// Scrittura/Lettura/Rimozione
this.consent.set('mioTracker', true, 60 * 60 * 24); // Scrive solo se categoria accettata
const v = this.consent.get('mioTracker');           // Tipizzato (boolean | null)
this.consent.remove('mioTracker');                  // Sempre permesso

// Gating basato su Signal
effect(() => {
    if (this.consent.analyticsAccepted()) {
        this.loadAnalytics();
    }
});

// Stato Consenso e Azioni
this.consent.technicalOptionalAccepted();
this.consent.responded();
this.consent.accept();
this.consent.reject();
```

> ⚠️ **Niente storage diretto:** Regola ESLint `no-restricted-globals` blocca `localStorage`/`sessionStorage` fuori dal servizio. Tutto passa dal gate del consenso.

### Global Privacy Control (GPC)
- Rilevato da `navigator.globalPrivacyControl`.
- Se presente, Analytics e Profiling sono rifiutati automaticamente (l'utente può sovrascrivere).
- Banner mostra badge di conferma.

### Dichiarazione Cookie in Policy
I placeholder Markdown `{{cookieList}}` e `{{cookieCategories}}` generano l'informativa tabellare per categorie, unendo i cookie dell'Engine e quelli di `COOKIE_MAP`.

### Google Consent Mode v2
Se usi GA4 o Ads:
1. **`src/index.html`**: Aggiungi stub predefinito (`denied`) prima di GTM/gtag.
2. **`security-headers.json`**: Autorizza gli script Google.
3. **`cookie-registry.ts`**: Censisci `_ga` e soci.
4. **`analytics.service.ts`**: Crea un servizio che usa `effect()` per chiamare `gtag('consent', 'update', ...)` in base ai signal di `CookieConsentService`.

---

## 🎨 Tema e Sistema di Colori (OKLCH + WCAG)

Il sito ha un sistema di tema che genera 75+ variabili CSS partendo da un solo colore brand dichiarato in `site.ts`.

### Un Colore, Palette Completa

```typescript
// site.ts
buildSite({
    config: {
        colorTema: '#1f40ff',  // Un solo colore — l'engine genera tutto il resto
        // ...
    },
    // ...
});
```

Da questo colore vengono generati automaticamente:
- Varianti brand: primario, secondario (muted), testo leggibile
- Surface colors: sfondo pagina, card, hover states (light e dark)
- Semantic brand (primary/secondary): link, borders, emphasis text, subtle backgrounds per `.alert-*` e `.text-*-emphasis`
- Navbar colors: adattiva al brand (full immersive se scuro, pastello se chiaro)

I colori semantici fissi (warning, info, success, danger) non sono derivati dal brand: Bootstrap 5.3 fornisce già varianti WCAG-safe tone-adaptive nei suoi blocchi `[data-bs-theme]`. ThemeService imposta `data-bs-theme` su `<html>` in base a `prefers-color-scheme`, quindi `--bs-warning-text-emphasis` ecc. si risolvono automaticamente.

### Override opzionali (secondario, sfondo, testo, info)

`site.colorSecondary` / `site.colorBackground` / `site.colorText` / `site.colorInfo` in `global-settings.json` sostituiscono hue e chroma di una singola catena di derivazione — pipeline OKLCH/WCAG e varianti light/dark/subtle/emphasis restano quelle di sempre. Un solo hex per campo copre entrambi i toni, come `colorTema`.

- **`colorSecondary`** — secondario (badge, `.btn-secondary`). Assente: muted del brand.
- **`colorBackground`** — sfondo pagina/card/hover/superfici. Assente: derivato dal brand.
- **`colorText`** — corpo e headings. Assente: segue `colorBackground` (non il brand) — testo e sfondo restano sempre intonati senza sceglierlo esplicitamente, perché un testo scollegato dallo sfondo supera comunque WCAG (che guarda solo il contrasto, non l'accostamento) ma può stonare. Impostato: override pieno e indipendente, stesso meccanismo degli altri tre.
- **`colorInfo`** — `.text-bg-info`/`.alert-info`/`.btn-outline-info`. Unico senza fallback dal brand: assente, `--bs-info*` resta gestito per intero da Bootstrap.

warning/success/danger restano sempre fissi: significato universale (allerta/successo/errore), non personalizzabile da qui.

Un override esplicito su `colorBackground`/`colorText` produce anche una tinta più satura del caso derivato dal brand — i tetti di saturazione erano pensati per restare appena percettibili quando l'hue arrivava solo dal brand, e senza distinguere i due casi un colore scelto apposta finirebbe comunque quasi invisibile.

### Garanzia WCAG 4.5:1

Tutti i colori di testo su sfondo sono calcolati per garantire contrasto WCAG AA:
- `findCompliantColor()` regola la luminanza L in OKLCH finché non raggiunge 4.5:1
- Funziona sia in light che dark mode per i colori brand-derived
- I colori semantici fissi delegano a Bootstrap che li calibra per entrambi i toni

Primary: fill vs foreground. `colorPrimary` è scurito in OKLCH (hue e chroma preservate) finché garantisce 4.5:1 sul fondo pagina chiaro reale (`baseLt`), e alimenta i fill (`--bs-primary`: bottoni, `.bg-primary`, badge) dove il testo sopra si contrasta su `colorPrimaryText`. Quando invece il primary è usato come foreground sulla pagina (`.text-primary`, `.border-primary`), un valore tarato sul chiaro risulterebbe scuro-su-scuro in dark mode: per questo esiste la gemella `colorPrimaryDk`, schiarita in OKLCH finché garantisce 4.5:1 sul fondo scuro reale (`baseDk`). Le utility risolvono alla variante giusta via `--colorPrimaryFg`, tone-adaptive come `--colorLink`. Entrambe preservano la chroma del brand: il contrasto WCAG dipende dalla luminanza, non dalla saturazione, quindi una tinta viva resta viva senza costare accessibilità.

### Cambio Tema a Runtime

`colorTema` è un `WritableSignal`: cambiarlo aggiorna immediatamente palette, CSS vars e tutti i componenti che leggono i signal del tema.

Pattern 1: colore utente al login

Il caso più comune: l'utente ha un colore brand nel suo profilo. Impostarlo subito dopo l'autenticazione lo fa persistere su tutte le navigazioni successive.

```typescript
// Nel service/componente che gestisce il login
const theme = inject(ThemeService);

async login(credentials: Credentials) {
    const user = await this.auth.login(credentials);
    if (user.brandColor) {
        theme.setColorTema(user.brandColor);  // persiste per tutta la sessione
    }
}
```

Pattern 2: colore per singola pagina

Se una pagina ha un colore dedicato, il componente lo imposta e lo ripristina quando viene distrutto tramite `DestroyRef`.

```typescript
// Nel componente di pagina
export class CampagnaComponent {
    constructor() {
        const theme = inject(ThemeService);
        const defaultColor = inject(SITE_CONFIG).colorTema; // token del colore default

        theme.setColorTema('#e63946');

        inject(DestroyRef).onDestroy(() => theme.setColorTema(defaultColor));
    }
}
```

Precedenza e conflitti

Non esiste un meccanismo di priorità centralizzato, vince l'ultimo chiamante. La convenzione suggerita:

- Il colore utente va impostato al login e non deve essere sovrascritto da logiche di navigazione
- Il colore di pagina va sempre ripristinato in `onDestroy`
- Se un albero di pagine condivide un colore, impostarlo nel componente radice dell'albero

### Dark Mode Automatico

Reattivo a `prefers-color-scheme`: se l'utente cambia tema OS, il sito si adatta in tempo reale senza reload:
```typescript
readonly themeTone: Signal<'light' | 'dark'>; // Reattivo a prefers-color-scheme
readonly prefersReducedMotion: Signal<boolean>; // Per animazioni accessibili
```

### Leggere il tema in un componente

Quando un componente disegna su `<canvas>`, genera un'immagine o sceglie un colore inline, non hardcodare i valori: leggi i signal di `ThemeService`. Sono già WCAG-safe (calcolati per garantire 4.5:1) e reattivi, cambiano da soli al cambio di brand (`setColorTema`) o di tono OS (`prefers-color-scheme`), quindi il tuo componente resta coerente senza una riga di sincronizzazione.

```typescript
private readonly theme = inject(ThemeService);

// Brand e derivati (Signal<string>)
this.theme.colorTema();         // colore brand esatto (--colorTema)
this.theme.colorPrimary();      // brand scurito a 4.5:1 sullo sfondo pagina chiaro — per link, CTA, bottoni
this.theme.colorPrimaryText();  // '#000000' | '#ffffff' — testo leggibile su colorPrimary
this.theme.colorPrimaryRgb();   // "31, 64, 255" — tripla RGB per le rgba() di Bootstrap/CSS
this.theme.colorTemaText();     // '#000000' | '#ffffff' — testo a contrasto massimo su colorTema

// Tono e accessibilità
this.theme.themeTone();             // 'light' | 'dark' — reattivo a prefers-color-scheme
this.theme.isDarkTextPreferred();   // true se il brand corrente vuole testo scuro sopra di sé
this.theme.prefersReducedMotion();  // true → disattiva animazioni/auto-play
```

Sono signal di sola lettura usati dall'Engine stesso: `QrCodeService` e `ImgBuilderService`, ad esempio, leggono `colorPrimary()`/`colorPrimaryText()` per colorare QR e immagini in modo conforme quando non passi colori espliciti.

Pannello forzato chiaro dentro una pagina scura: se hai un riquadro che deve restare in tono chiaro a prescindere dal tema OS (es. un pannello di anteprima), bind `panelBootstrapTheme` all'attributo Bootstrap, così tutto il sottoalbero usa il subtema corretto:

```html
<div [attr.data-bs-theme]="theme.panelBootstrapTheme">
    <!-- contenuto sempre in tono chiaro se shell.panelForcedLight è true -->
</div>
```

`panelBootstrapTheme` vale `'light'` quando `shell.panelForcedLight` è attivo, altrimenti `null` (nessun forzamento).

### Metodi Statici (SSR-Safe)

`ThemeService` espone due metodi statici puri (conversione colore) usabili in Node.js/SSR senza Angular:
```typescript
const [L, C, H] = ThemeService.hexToOklch('#1f40ff'); // hex → OKLCH
const hex = ThemeService.oklchToHex(L, C, H);          // OKLCH → hex
```

Pubblico è anche il calcolo del contrasto (modello WCAG 2.1), l'unico seam con cui validare un colore di progetto a 4.5:1:
```typescript
ThemeService.calcContrastRatio(coloreA, coloreB); // → rapporto nel range [1, 21]
ThemeService.calcLuminance('#1f40ff');             // → luminanza relativa [0, 1]
ThemeService.hexToRgbTriplet('#1f40ff');           // → "31, 64, 255" per le rgba() di Bootstrap/CSS
```

Distinto da questo è il derivare automaticamente un colore conforme (link, testo muted, ecc.): quella logica (`findCompliantColor`, che regola la luminanza finché non raggiunge 4.5:1) è interna al servizio e non è parte dell'API pubblica. In sintesi: la misura del contrasto è pubblica (`calcContrastRatio`), la derivazione del colore conforme è privata.

### Anti-flash del tema (automatico)

Il tema corretto è in pagina prima che Angular si avvii: nessun lampo di tema sbagliato (FOUC) al primo caricamento. Funziona su due binari, entrambi gestiti dall'Engine senza configurazione:

- **Asset statico `public/theme-init.js`** — uno script sincrono nel `<head>` (referenziato con path **assoluto** `/theme-init.js`, perché sta prima di `<base href>`) che legge `prefers-color-scheme` e imposta subito `data-bs-theme` / `data-theme-tone` su `<html>`. Lo emette `generate-statics.ts` al build: è gitignored, quindi va materializzato lì o mancherebbe su un checkout pulito.
- **SSR per-richiesta** — `app.config.server.ts` inietta in ogni risposta i due `<meta name="theme-color">` (light/dark, dal `colorBase` della palette, per il chrome del browser e la PWA) e lo `<style id="theme-init">` con tutte le CSS vars del tema per entrambi i toni. Così la pagina server-rendered esce già coi colori giusti; `ThemeService` poi "conferma" la palette post-idratazione in `afterNextRender`.

Non c'è nulla da attivare: i due meccanismi sono parte della pipeline di build e dell'SSR.

### Font

Il catalogo (font di sistema disponibili, tipi, calcolo dello stack finale) è Engine, in [`core/engine/font-system.ts`](src/app/core/engine/font-system.ts) — INTOCCABILE. La scelta del progetto è Dominio, un unico file: [`frontend/src/styles/font-config.ts`](src/styles/font-config.ts). Sono separati apposta: un aggiornamento del catalogo dal template (nuovo font di sistema) non deve generare un conflitto di merge in un figlio che ha solo scelto un font.

```typescript
// styles/font-config.ts — l'unico file da toccare
export const siteFonts: AppFontConfig = {
    webDefault: 'System',              // chiave di WEB_FONTS (autocomplete dall'Engine)
    serverDefault: ServerFont.Liberation, // chiave di SERVER_FONTS, idem
    // custom: { family: 'Marlboro', file: 'Marlboro.woff2' },  // vedi sotto
};
```

`ThemeService`, `server.ts`, `ImgBuilderService` e `PreviewBuilder` non leggono mai `siteFonts` direttamente: leggono `resolvedFonts` (stesso file), il risultato già calcolato da `resolveFonts()` (Engine) — stack CSS pronti e la chiave per le metriche server. Nessun valore di font è hardcoded altrove.

- **Cambiare il font di sistema:** modifica `webDefault`/`serverDefault` in `siteFonts` — sono tipizzati sulle chiavi note, l'IDE le suggerisce.
- **Aggiungere un font di sistema al catalogo:** tocca `font-system.ts` (Engine) — web: una voce in `WEB_FONTS`; server: enum `ServerFont` + voce in `SERVER_FONTS` **e** installazione nel `Dockerfile`, altrimenti Sharp non lo trova e ripiega sul fallback.
- **`webDefault`/`serverDefault` restano volutamente separati**: web e server vivono in ambienti diversi (lo stack di sistema del browser non esiste nel container, i font del container non servono al browser).

### Font custom (opzionale)

Un font caricato dal cliente: metti il file in `fonts/`, la cartella accanto a `global-settings.json` alla radice del progetto, poi valorizza `custom: { family, file }` in `siteFonts` con lo stesso nome file. Sostituisce **entrambi** i default insieme (web e OG) — un solo font per il sito, mai uno sulla pagina e un altro nelle anteprime social. Reversibile: togli/commenta `custom` senza toccare quella cartella. File dichiarato ma assente: fallback silenzioso sui default di sistema, mai un riferimento rotto.

In Docker quella cartella diventa un volume (`BR1_FONTS_DIR`, dettagli in [DOCKER_README.md](../DOCKER_README.md)) — è lì, non nel codice, che il file fisico deve trovarsi in produzione.

In sviluppo locale `start-frontend-dev.sh` punta già `FONTS_DIR` a quella cartella (il default risolverebbe relativo alla cwd di Node, cioè `frontend/`, non alla radice del progetto). Lanciando `ng serve` a mano vale lo stesso avviso: senza `FONTS_DIR` impostato a mano, un font custom presente in `fonts/` non verrebbe trovato.

Nota tecnica sulle immagini OG: Sharp/librsvg risolvono i font tramite fontconfig, non tramite `@font-face` come il browser — un file presente nella cartella non è "visibile" a fontconfig da solo. Il Dockerfile e `docker-entrypoint.sh` se ne occupano già (registrano la cartella e rilanciano `fc-cache` a ogni avvio); non serve altro da parte tua.

---

## 🔔 NotificationService: Feedback all'Utente

`NotificationService` (iniettato come `this.notify` in ogni `PageBaseComponent`) gestisce tutti i popup e toast via SweetAlert2, già stilato con il tema Bootstrap del template.

| Metodo | Quando usarlo |
| :--- | :--- |
| `toast(msg, icon?)` | Notifica rapida in alto a destra (3 s, non bloccante). `icon`: `'success'` \| `'error'` \| `'info'` \| `'warning'` |
| `success(msg, onClose?)` | Popup di conferma operazione riuscita |
| `error(title, msg)` | Popup di errore con titolo esplicito |
| `confirm(title, text, opts?)` | Modale Sì/No → restituisce `Promise<boolean>` |
| `choose(title, text, opts?)` | Modale a 3 vie Sì/No/Annulla (rifiuto ≠ annullamento) → restituisce `Promise<'confirm' \| 'deny' \| 'cancel'>` |
| `prompt(title, label, ...)` | Modale con input testuale → restituisce `Promise<string \| null>` |
| `interact<T>(config)` | Modale con HTML custom, validazione e mappatura del risultato |
| `openLoading(msg?)` / `closeLoading()` | Spinner bloccante (es. durante upload) |
| `promise(work, cfg?)` | Esegue un lavoro async con spinner + toast di esito; **rilancia sempre** l'eccezione → `Promise<T>` |
| `validationErrors(title, errors)` | Popup con lista di errori di validazione |
| `handleApiError(status, problem, ...)` | Legge il `ProblemDetails` del backend e mostra il messaggio corretto; fallback automatico a i18n per i codici HTTP standard tramite le chiavi `errore{status}Titolo` / `errore{status}Descrizione` da `basic.{lang}.json` — copertura completa per: 400, 401, 403, 404, 405, 406, 408, 409, 410, 422, 429, 500, 501, 502, 503, 504 |

```typescript
// Toast di successo
this.notify.toast('Salvato con successo');

// Conferma prima di un'azione distruttiva
const ok = await this.notify.confirm('Eliminare?', 'L\'operazione è irreversibile', { icon: 'warning' });
if (!ok) return;

// Spinner durante operazione asincrona
this.notify.openLoading('Caricamento...');
await this.api.getSocial();
this.notify.closeLoading();

// Lavoro async con spinner + toast di esito (rilancia l'errore: gestiscilo tu)
const social = await this.notify.promise(this.api.getSocial(), {
    loading: 'Caricamento...', success: 'Caricato',
});

// Gestione errore API (legge ProblemDetails RFC 9457)
try { ... } catch (err) {
    this.notify.handleApiError(err.status, err.problem);
}
```

---

## 📡 NotificationStreamService: Notifiche Realtime

`NotificationStreamService` (`providedIn: 'root'`) estende per composizione il `NotificationService`: si occupa solo del trasporto realtime, apre un `EventSource` verso l'endpoint SSE dell'Engine (`/api/notifications/stream`), e per mostrare riusa ciò che `NotificationService` già espone (`toast`), senza reimplementare la UI. È il lato browser di `INotificationStream` (vedi [backend/README.md](../backend/README.md)).

Tre vincoli dello stack, rispettati by design:
- **Solo browser**: in SSR non apre nulla (niente connessioni server-side). Si attiva quando viene iniettato in un contesto browser — **non** è auto-iniettato globalmente, così un sito apre lo stream solo se gli serve. In pratica lo inietta il **campanellino**: montarlo (`shell.showNotifications: true`) apre lo stream; senza campanellino nessuna SSE parte.
- **Zoneless-safe**: ogni evento in arrivo viene scritto in un `signal`, così la change detection signal-based (l'app è zoneless, niente `zone.js`) se ne accorge.
- **Riconnessione e recovery robusti**: su un blip transitorio `EventSource` resta in `CONNECTING` e si riconnette da sé, rimandando `Last-Event-ID` → il server replaya i messaggi persi. Su un errore *terminale* (handshake fallito, content-type errato, CORS) va in `CLOSED` e non ritenta più: il servizio allora azzera lo stato, libera il riferimento e **riprova da solo dopo ~3s**, così lo stream riparte quando il backend torna su invece di restare morto per tutta la vita della scheda. A ogni (ri)apertura `loadHistory()` ri-idrata lo storico da `GET /api/notifications/history`, recuperando l'eventuale buco anche quando manca `Last-Event-ID` (es. caduta subito dopo l'handshake, che è senza id). I signal `connected()` e `connectionId()` riflettono lo stato corrente.

| Membro | Tipo | Cosa fa |
| :--- | :--- | :--- |
| `connect()` / `disconnect()` | metodo | Apre/chiude lo stream (idempotenti, no-op in SSR) |
| `connectionId()` | `Signal<string \| null>` | Id di questa connessione (primo frame SSE), `null` finché non connesso. Lo allega l'Engine in automatico come header `X-Connection-Id` su ogni chiamata `/api` (vedi sotto) — non lo passi a mano |
| `connected()` | `Signal<boolean>` | `true` mentre lo stream è aperto e l'handshake è arrivato |
| `notifications()` | `Signal<readonly StreamNotification[]>` | Storico reattivo delle notifiche ricevute (per badge / centro notifiche) |
| `unread()` | `Signal<number>` | Notifiche arrivate dal vivo non ancora viste (badge del campanellino) |
| `lastLive()` | `Signal<string>` | Testo dell'ultima notifica dal vivo, usato come regione `aria-live` |
| `on(type, handler)` / `off(type)` | metodo | Registra/rimuove la reazione per un tipo di notifica |
| `markAllRead()` | metodo | Azzera il contatore non lette (lo chiama il campanellino all'apertura del pannello) |
| `resolveText(notification)` | metodo | Risolve il testo mostrabile di una notifica (chiave i18n tradotta → `message` letterale → `type` come fallback); riusato dal campanellino |
| `clear()` | metodo | Svuota lo storico |

Notifiche non solo testuali: ogni notifica è `{ id, type, payload, timestamp }` con `payload` libero. Il `type` sceglie la reazione: senza handler registrato si ricade sul toast di default; con `on(type, ...)` fai qualsiasi cosa, un modale ricco (`notify.interact`), un'immagine, un link, o pilotare un tuo componente leggendo `notifications()`. Per il toast di default il payload usa il contratto i18n: `{ messageKey, messageParams?, icon }` (chiave tradotta lato client nella lingua corrente) oppure `{ message, icon }` per testo letterale. La risoluzione vive in un solo punto, `resolveText(notification)`, riusato anche dal campanellino.

```typescript
// In un componente sempre attivo (es. AppComponent): iniettarlo attiva lo stream.
private stream = inject(NotificationStreamService);

ngOnInit() {
    // Tipo "toast": gestito di default (notify.toast). Nessun codice necessario.

    // Tipo ricco + interattivo: notifica con azione di risposta.
    this.stream.on<{ jobId: string }>('renderReady', async n => {
        const ok = await this.notify.confirm('Render pronto', 'Vuoi salvarlo?');
        if (ok) await this.api.post(`/jobs/${n.payload!.jobId}/save`, {}); // la "risposta" è una POST
    });
}
```

Notifica mirata a chi avvia il job: `X-Connection-Id` automatico. Per notificare questa scheda a fine elaborazione il backend ha bisogno del `connectionId` della SSE. L'Engine lo allega da solo: `BaseApiService.build_api_Headers()` legge un holder inerte e condiviso (`NotificationConnection`) e, se valorizzato, aggiunge l'header `X-Connection-Id` su ogni chiamata `/api`. Tu fai la chiamata normale, niente header a mano:

```typescript
// Il connectionId viaggia da sé: l'header X-Connection-Id è già su questa POST.
await this.api.post('/upload', body);
```

L'holder è inerte di proposito: leggerlo (lato `BaseApiService`) NON inietta il `NotificationStreamService` e quindi NON apre alcuna SSE. Lo popola lo stream quando si connette e lo azzera quando cade. Finché nessuno apre lo stream (campanellino non montato) resta `null` → nessun header → il backend riceve un `connectionId` nullo e gestisce il caso (broadcast / nessun target). Lo stream resta così pigro: niente connessione SSE non richiesta, ma l'header c'è appena serve.

Le risposte sono POST, non SSE: il canale è unidirezionale (server → client), l'utente "risponde" con una normale chiamata API (`api.post`), come nell'esempio sopra. Il giro completo è notifica ricca (SSE) → azione utente → POST → eventuale esito (SSE). Un canale bidirezionale "vero" (chat, presence) richiederebbe WebSocket/SignalR, fuori scopo qui.

Campanellino in navbar e storico: `shell.showNotifications` è opt-in (default `false`): un campanellino sempre visibile ma mai alimentato è solo rumore, quindi lo attivi (`shell: { showNotifications: true }`) solo se il sito spinge davvero notizie. Quando attivo, l'Engine mostra in navbar un campanellino (`NotificationBellComponent`) con badge delle non lette e pannello dello storico, alimentato dal signal `notifications()`. La sua sola presenza attiva lo stream (il componente inietta il servizio): di default, quindi, un sito non apre alcuna connessione SSE.

Robustezza e accessibilità: la lista client è limitata (ultime 50) e deduplicata per id, così il replay SSE alla riconnessione (vedi backend) non genera doppioni e una scheda longeva non cresce all'infinito. Una notifica senza testo (payload di solo `type`, gestita da un handler custom) non scrive nella regione `aria-live` e non emette un toast vuoto: resta solo nello storico, senza far leggere stringhe tecniche allo screen reader. Lato a11y: il nome del pulsante include il conteggio non lette (`"Notifiche, 3 non lette"`), una regione `aria-live` annuncia gli arrivi dal vivo agli screen reader, `Esc` chiude il pannello e le voci sono una lista semantica. (Il pannello è una lista di sola lettura, non un menu di comandi: niente roving da tastiera in stile CDK Menu, che sarebbe la primitiva sbagliata qui.) Lo storico non è solo di sessione: a ogni (ri)apertura dello stream il servizio chiama `GET /api/notifications/history` (`loadHistory()`) e fonde i risultati per id, così il campanellino si popola anche dopo un reload, su una nuova scheda o dopo una riconnessione. Le notifiche mirate a una connessione restano effimere (fuori dallo storico server); broadcast e gruppo invece persistono: è la base su cui, col login lato server, poggerà lo storico per-utente (basta registrare un `INotificationGroupResolver`, vedi backend).

---

## 🖼️ AssetService: Immagini e File

`AssetService` (iniettato come `this.asset` in ogni `PageBaseComponent`) genera URL sicuri per le risorse multimediali.

```typescript
// URL di un asset gestito dal server (con resize on-the-fly)
// width è un tipo (`AssetWidth`) definito in core/engine/asset-config (es. 320 | 640 | 1280)
const url = this.asset.getUrl('id-immagine', 640);
// → /cdn-cgi/asset?id=id-immagine&w=640

// URL temporaneo per un Blob (es. file scaricato via api.getBlob())
const blob = await this.api.getBlob('mio-documento');
const { angularUrl } = this.asset.getUrlFromBlob(blob);
// angularUrl è un SafeUrl già sanitizzato per Angular
```

I Blob URL vengono revocati automaticamente a ogni cambio pagina, liberando la memoria da soli.

### Due pipeline immagini: `asset.getUrl(id)` vs `api.getBlobUrl(slug)`

Esistono due percorsi distinti per ottenere l'URL di un'immagine ottimizzata. Hanno comportamento simile (entrambi ridimensionano e cachano lato server) ma sorgenti diverse: scegli in base a dove vive l'immagine (vedi tabella sotto).

| | `asset.getUrl(id, width)` | `api.getBlobUrl(slug, webopt)` |
| :--- | :--- | :--- |
| Endpoint | `/cdn-cgi/asset?id=…&w=…` | `/api/blob/{slug}` |
| Identificatore | **id** dell'asset gestito | **slug** assegnato all'upload |
| Sorgente | Asset registrati in `mapping.json`, mantenuto a mano (id → nome file) | File caricati a runtime nel volume `uploads` via `uploadBlob()` |
| Usa quando | Immagini che fanno parte del progetto: hero, loghi, illustrazioni statiche | Contenuti caricati dagli utenti / dall'app dopo il deploy |

In breve: se l'immagine esiste già nel repo/build è un asset → `asset.getUrl('hero', 640)`. Se l'immagine è stata caricata a runtime ed è identificata da uno slug → `api.getBlobUrl(slug)`. Ognuno legge dalla propria sorgente: lo slug del blob dal volume `uploads`, l'id dell'asset da `mapping.json`.

Registrare un nuovo asset:
1. Copia il file immagine dentro la cartella indicata da `ASSETS_DIR` (default `src/assets/files/`, la stessa che `AssetService` serve via `/cdn-cgi/asset` — vedi `frontend/src/app/core/engine/server/asset-mapping.ts`).
2. Aggiungi una riga a `src/assets/mapping.json`: `"hero": "hero.jpg"` (chiave = id che userai in `asset.getUrl('hero')`/`appAsset="hero"`, valore = nome del file appena copiato).
3. Nessun comando da lanciare: il server SSR legge `mapping.json` a runtime e fa hot-reload alla prima richiesta se il file cambia dopo l'avvio (utile in dev, `ng serve` incluso — non serve riavviare).

### Ottimizzazione Immagini Server-Side

L'endpoint `/cdn-cgi/asset` effettua il resize lato server e cacha il risultato:

```
GET /cdn-cgi/asset?id=hero&w=640
→ Legge mapping.json (asset ID → percorso fisico)
→ Ridimensiona a 640px (se la larghezza è in whitelist, mai oltre l'originale)
→ Converte in AVIF o WebP a seconda dell'header Accept del browser
→ Caches il risultato (cache key per-formato)
→ Restituisce l'immagine ottimizzata (con Vary: Accept)
```

Larghezze supportate (whitelist `ALLOWED_WIDTHS` in `core/engine/asset-config.ts`): `125, 320, 480, 512, 640, 768, 1024, 1080, 1366, 1600, 1920`.
La whitelist è anche il tetto anti-4k (max 1920) e il limite alla cardinalità della cache: una `w` arbitraria viene rifiutata, così non si possono generare varianti illimitate.

Negoziazione formato: il server sceglie il formato dall'header `Accept`: se il browser dichiara `image/avif` riceve AVIF (compressione migliore a parità di qualità), altrimenti WebP. Il formato fa parte della cache key e la risposta porta `Vary: Accept`, così cache/CDN intermedie non servono il formato sbagliato a un client diverso. Trasparente per il client: la directive `appAsset` non cambia.
Formati non-raster (video, PDF, SVG) sono serviti senza modifica.

### Directive `appAsset` / `appAssetHref`

Invece di costruire gli URL manualmente, usa le directive dichiarative:

```html
<!-- Immagine ottimizzata (src reattivo alla width) -->
<img appAsset="hero" [appAssetWidth]="640" alt="Hero" class="img-fluid">

<!-- Link/download con href ottimizzato -->
<a [appAssetHref]="'manuale'" [appAssetWidth]="1024" download="manuale.pdf">
    Scarica manuale
</a>
```

Le directive sono type-safe: errori di applicazione su elementi sbagliati vengono rilevati a compile-time.

Immagini responsive + hint moderni (solo `<img>`): su ogni `<img appAsset>` la directive aggiunge in automatico `decoding="async"` e `loading="lazy"`. Per l'immagine LCP above-the-fold passa `[appAssetPriority]="true"` (diventa `loading="eager"` + `fetchpriority="high"`). Per servire la misura giusta per viewport/DPR (meno banda su mobile) valorizza `appAssetSizes`: la directive emette allora un `srcset` con tutte le larghezze whitelisted (`ALLOWED_WIDTHS`) + l'attributo `sizes`. È opt-in: senza `appAssetSizes` resta una sola sorgente; `appAssetWidth` (misura fissa) ha la precedenza e disattiva lo `srcset`.

```html
<!-- Responsive: il browser sceglie la larghezza in base a layout e densità schermo -->
<img appAsset="hero" appAssetSizes="100vw" [appAssetPriority]="true" alt="Hero" class="img-fluid">
<img appAsset="card" appAssetSizes="(min-width: 768px) 50vw, 100vw" alt="..." class="img-fluid">
```

Non solo `<img>` e `<a>`: `appAsset` accetta tutti i tag con `src` (`img`, `video`, `audio`, `source`, `iframe`, `embed`), mentre `appAssetHref` vale su `a` e `link` (utile per un `<link rel="preload">`). `appAssetWidth` ha senso solo per le immagini raster: il server lo ignora automaticamente per video / PDF / SVG (restituisce lo stream originale), quindi è sicuro lasciarlo non valorizzato su quei tag.

```html
<video appAsset="intro" controls></video>
<iframe appAsset="manuale" title="Manuale"></iframe>
<link rel="preload" as="image" [appAssetHref]="'hero'" [appAssetWidth]="1024">
```

> Sorgente: `appAsset` / `appAssetHref` lavorano con gli asset gestiti da `AssetService` (id in `mapping.json`). Per un file caricato a runtime usa il binding diretto sullo slug: `[src]="api.getBlobUrl(slug)"` / `[href]="api.getBlobUrl(slug)"`.

### Vista a tutto schermo: `layout.fitViewport`

Per pagine/viste a tutto schermo (mappe, giochi, dashboard) dove lo scroll spezzerebbe l'esperienza. È un flag dichiarativo per-pagina in `site.ts` (non una direttiva sul template). Tu lo dichiari, lo gestisce l'Engine: il builder (`normalizeSitePage`) risolve la coerenza dei flag di layout, lo shell rende il `<main>` full-bleed (senza container/padding/pannello) e una regola CSS (`.fit-viewport`) fa riempire al contenuto lo spazio che resta sotto la navbar, senza scroll di pagina se il contenuto ci sta.

```typescript
// site.ts
{ path: 'radar', title: 'radarTitolo', pageType: PageType.Radar,
  component: () => import('./pages/radar/radar.component').then(m => m.RadarComponent),
  layout: { fitViewport: true } }
```

Vista immersiva, per default: `fitViewport` concentra la pagina sul contenuto: l'Engine lascia in scena la sola navbar (la via d'uscita) e mette da parte pannello, smoke e footer, che in full-bleed ruberebbero spazio. Tutto resta a portata: per riavere il footer basta `layout: { fitViewport: true, showFooter: true }`. Col footer attivo il contenuto vive fra navbar e footer, quindi con footer alti regola lo spazio di conseguenza.

Lato pagina serve una cosa sola: fai crescere il root del componente con `flex-grow-1` (o `h-100`) sul suo elemento radice, così riempie l'altezza. Il resto è territorio dell'Engine: dà già `display: block` all'host di ogni pagina e, in full-bleed, costruisce la catena flex fino al viewport adattandosi da sé a navbar/footer/orientamento, layout nativo del browser, anche in SSR. Tu pensi al contenuto.

### Stampa/PDF

Ogni pagina è sempre stampabile, senza configurazione e senza bottone dedicato: i browser espongono già la stampa in modo prominente (Ctrl+P, menu, condivisione), un bottone nel template la replicherebbe soltanto, pratica ormai considerata superata. Quello che l'Engine garantisce è la resa: un `@media print` condiviso (`styles/engine/base/_print.scss`, globale, non per-pagina) ripulisce automaticamente qualunque pagina, presente e futura (anche una che il progetto figlio scrive da sé domani, es. un articolo se il figlio è una testata giornalistica):
- **Via del tutto:** navbar, i FAB fissi (`app-back-to-top`, `app-cookie-banner` — icone/pulsanti di UI, mai contenuto), lo sfondo smoke.
- **Forzato tema chiaro** (nero su bianco, a prescindere dal tema attivo — la stampa non è mai scura) su `html`/`body`, così vale anche fuori dal pannello contenuti.
- **Pannello contenuti** spogliato dell'identità "da card" (sfondo/bordo/ombra/griglia): resta solo il contenuto.
- **Footer semplificato, non nascosto:** la riga di copyright/ragione sociale è informazione legittima su un documento stampato, quindi resta — via solo l'identità estesa (indirizzo/social/orari, con l'eventuale accordion interattivo) e il menu di navigazione (link non cliccabili su carta).
- **`<details>` chiusi si aprono da soli** (es. i gruppi cookie della Cookie Policy, o un accordion FAQ in un articolo): altrimenti stamperebbero solo l'intestazione, non il contenuto (`AppComponent`, ascolta `matchMedia('print')`).

È anche il "formato alternativo" richiesto dalla Dichiarazione di Accessibilità: vedi `app-print-action` più sotto se un progetto vuole comunque un bottone di stampa puntuale su una pagina specifica (non è nel template di default, ma il building block c'è già).

### Navigazione SPA: focus e annuncio agli screen reader

Un cambio pagina qui non ricarica il documento, è il router Angular a sostituire il contenuto sotto `<router-outlet>`, quindi il browser non sposta da solo il focus né annuncia nulla, come farebbe invece con un normale link multi-pagina. Senza intervento, chi naviga da tastiera o screen reader resta "fermo" sul link appena attivato, dentro un contenuto ormai sostituito. L'Engine applica l'approccio duale raccomandato (2025/2026): `AppComponent` ascolta `NavigationEnd` (saltando il primo, quello del caricamento iniziale: lì il focus del browser va lasciato dov'è) e sposta il focus su `#main-content` (`tabindex="-1"`, programmaticamente focalizzabile senza entrare nell'ordine di tabulazione), mentre una regione `role="status" aria-live="polite"` annuncia il nuovo titolo (`PageMetaService.announcedTitle`, lo stesso testo del `<title>`), dato che il solo focus non basta perché alcune combinazioni screen reader/browser (NVDA+Firefox, VoiceOver+Safari) non lo annunciano sempre in modo affidabile. Nessuna configurazione: vale su ogni pagina, presente e futura.

---

## 🌍 Internazionalizzazione (i18n)

Le traduzioni vivono in `src/assets/i18n/` (la copia in `public/` è output di build, gitignored) in due cataloghi per lingua:

| File | Ruolo |
| :--- | :--- |
| `basic.{lang}.json` | Stringhe dell'Engine: traduzioni per le pagine di errore HTTP (`errore400Titolo`/`Descrizione` … fino al 504), azioni comuni (`clipboardCopied`, `clipboardError`, `shareError`, ecc.) e messaggi di login. **Non aggiungere qui chiavi di dominio** — quelle vanno in `addon.{lang}.json`. Aggiungere invece qui quando si modifica l'Engine stesso o si introduce una nuova notifica/comportamento globale; in quel caso la chiave va aggiunta in *tutti* i file `basic.*.json` — `i18n-check.sh` lo verifica in CI. |
| `addon.{lang}.json` | Stringhe del **progetto** — qui vanno le chiavi personalizzate. A parità di chiave **sovrascrive** `basic` (i cataloghi sono fusi con `addon` per ultimo): per cambiare il testo di una stringa dell'Engine si ridefinisce la chiave qui, senza mai toccare `basic.*.json` |

**Aggiungere una lingua:**
1. In `global-settings.json`: `"Localization.SupportedLanguages": ["it", "en", "fr"]` (codici a 2 lettere, **sottotag lingua base** — non varianti regionali come voci distinte, vedi limite sotto). Il nome nativo ("Français") lo deriva il frontend via `Intl.DisplayNames` (`LocalizationService`) — la tendina lo prende da lì, non lo scrivi tu.
2. Creare `basic.fr.json` e `addon.fr.json` in `src/assets/i18n/`.
3. `i18n-check.sh` in CI verifica che nessuna chiave sia mancante.
4. Nessun passo di routing: rotte, `hreflang` e sitemap per la nuova lingua si generano da soli al prossimo `generate:statics` (vedi «Lingua nell'URL» sotto).

Togliere una lingua: basta rimuoverla da `SupportedLanguages`. I file `basic.*.json`/`addon.*.json` della lingua tolta restano orfani, nessun controllo li guarda più, è un limite noto: cancellarli a mano per pulizia.

### Lingua nell'URL: instradamento per-lingua

Con più di una lingua configurata, ogni pagina interna ottiene un URL per lingua: la lingua di default resta non prefissata (`/chi-siamo`), le altre sono prefissate col codice lingua (`/en/chi-siamo`). Con una sola lingua configurata questo meccanismo è strutturalmente assente: zero route aggiuntive, zero costo, comportamento identico a un sito mono-lingua.

- **Nessun redirect automatico su Accept-Language.** Un URL non prefissato (`/`) serve sempre e deterministicamente la lingua di default — a chiunque, utente reale o bot. Scelta allineata alla raccomandazione ufficiale di Google (*Managing Multi-Regional and Multilingual Sites*): un redirect basato sulla lingua percepita rischia di impedire a Googlebot — che tipicamente non invia un `Accept-Language` significativo — di scoprire e indicizzare le varianti. È anche il meccanismo che rende affidabili le anteprime social (Telegram, WhatsApp, ecc.), che cachano l'anteprima per URL una volta sola. Il cambio lingua è sempre una scelta esplicita dell'utente, via selettore in navbar.
- **Navigazione interna** (`[appPage]`, switch da navbar): risolve sempre il path nella lingua corrente — `ContestoSito.getPath(type, lang)` e `getPageInfo(type, lang)` accettano un secondo parametro lingua opzionale (default: lingua di default del sito). Il `path` dichiarato in `site.ts` può essere per-lingua (`{ it: 'chi-siamo', en: 'about-us' }`, non solo lo stesso segmento sotto ogni prefisso): lo switch lingua ti porta sul path TRADOTTO della pagina corrente, non solo su un prefisso diverso — vedi «Pagine & rotte» più sopra.
- **Cambio pagina tra lingue diverse**: `PageBaseComponent` legge `route.data.lang` (iniettato dal router insieme a `pageType`) e allinea `TranslateService` — è il punto unico "URL → stato lingua", non va replicato altrove.

`hreflang`: con più lingue, ogni pagina emette `<link rel="alternate" hreflang="...">` per ciascuna variante + `x-default` (verso la lingua default), e la sitemap porta gli stessi riferimenti incrociati (`<xhtml:link>`) per URL, pratica raccomandata per siti multilingua URL-based. Con una sola lingua: nessun tag emesso, il solo `canonical` basta.

RTL e accessibilità: `TranslateService` imposta anche `<html dir="rtl|ltr">` insieme a `lang` (lista statica di codici RTL: arabo, ebraico, persiano, urdu, ecc., non `Intl.Locale.getTextInfo()`, non ancora baseline: Firefox non lo supporta). Il language picker in navbar marca ogni voce con `[attr.lang]` sul proprio codice (WCAG 3.1.2 «Language of Parts»): uno screen reader pronuncia il nome di ogni lingua nella lingua corretta, non in quella della pagina corrente.

Limiti noti:
- I codici in `SupportedLanguages` sono sottotag lingua base: `TranslateService.normalizeBcp47()` ricondurrebbe `en-US`/`en-GB` entrambi a `en`, quindi due varianti regionali della stessa lingua come voci **distinte** collidono. Una singola lingua con regione (es. solo `pt-BR`) funziona.

**Usare le traduzioni nel codice:**
```typescript
// Nel componente (this.translate è già iniettato da PageBaseComponent)
const testo = this.translate.translate('miaChiave');

// Con segnaposto posizionali
const msg = this.translate.translate('benvenuto', 'Mario'); // "Ciao {0}" → "Ciao Mario"
```

```html
<!-- Nel template con la pipe -->
{{ 'miaChiave' | translate }}
{{ 'benvenuto' | translate:'Mario' }}
```

**Aggiungere una chiave** (esempio in `addon.it.json`):
```json
{
    "titoloSezioneNotizie": "Le ultime notizie",
    "benvenuto": "Benvenuto, {0}!"
}
```

### Lingua a Runtime: Leggere e Cambiare

`TranslateService` (già iniettato come `this.translate` in ogni `PageBaseComponent`) espone l'API per leggere la lingua corrente, le lingue disponibili e cambiarla a runtime:

```typescript
readonly translate = inject(TranslateService);

// Lettura reattiva (signal)
this.translate.currentLang();      // Signal<string> — lingua attiva (es. 'it')
this.translate.availableLangs();   // Signal<readonly string[]> — lingue configurate
this.translate.defaultLang;        // string — lingua di default (proprietà, non signal)

// Cambio lingua a runtime → Promise<void> (attende il caricamento dei cataloghi)
await this.translate.setLanguage('en');
```

`setLanguage(lang)` carica i cataloghi della nuova lingua, aggiorna il signal `currentLang` e scrive `<html lang>`. Poiché aggiorna `currentLang`, ogni contenuto reattivo via `httpResource` (es. `IdentityService.identity()`) si ri-fetcha da solo con il nuovo `Accept-Language`. Il tag passato è normalizzato BCP-47 e ricondotto a una lingua supportata: un tag non riconosciuto ricade su `defaultLang`.

```typescript
// t() è alias di translate(): stessa firma, comodo per template densi
this.translate.t('miaChiave');                    // = translate('miaChiave')
```

### Normalizzazione BCP-47

L'engine normalizza internamente i tag lingua per coerenza:
```typescript
// "it-IT" e "it" sono equivalenti — entrambi caricano basic.it.json
TranslateService.normalizeBcp47('it-IT')  // → 'it'
TranslateService.normalizeBcp47('en-US')  // → 'en'
```

### Campi per-lingua: `pickLocaleText`

Per risolvere un campo a mappa `{ it, en, … }` (es. `config.description` da `global-settings.json → site.description`) sulla lingua corrente usa l'helper puro `pickLocaleText(map, lang)` (in `siteBuilder.ts`): fallback a cascata lingua richiesta → `defaultLang` → primo valore disponibile → stringa vuota, robusto a mappe parziali o assenti.

```typescript
import { pickLocaleText } from './core/engine/siteBuilder';

const testo = pickLocaleText(config.description, this.translate.currentLang());
```

### Pipe `translate` — Impura by Design

La `TranslatePipe` è dichiarata `pure: false` perché le traduzioni cambiano al cambio lingua, e una pipe pura non rileva il cambiamento di stato esterno. Angular la ri-esegue ad ogni ciclo di change detection. Se serve ottimizzare per template ad alta frequenza, usa `computed()`:

```typescript
readonly trad = computed(() => this.translate.translate('chiave'));
```

### Pipe `markdown`

Converte Markdown a HTML nel template, con sanitizzazione XSS rigorosa: l'HTML grezzo viene bloccato e gli URL non sicuri vengono neutralizzati automaticamente. Nei link sono ammessi solo gli schemi `http`/`https`/`mailto`/`tel` (bloccati `javascript:`, `data:`, `vbscript:` e i protocol-relative `//`); nelle immagini solo `http`/`https` e i data URI `data:image/` (gli altri schemi vengono scartati).
```html
<div [innerHTML]="testo | markdown"></div>
```

Supporta GitHub Flavored Markdown (tabelle, checklist, ecc.) e converte gli a-capo in `<br>`. Per convertire del Markdown fuori da un template (in TypeScript) c'è il metodo statico `MarkdownPipe.render(value)`, che applica le stesse regole di sanitizzazione:

```typescript
const html = MarkdownPipe.render('**Grassetto** e [link](https://example.com)');
```

Usata internamente da `PolicyComponent` per le pagine legali. Disponibile in qualsiasi componente per contenuto rich text.

---

## 🌐 ApiService: Chiamare il Backend

`ApiService` (iniettato come `this.api` in ogni `PageBaseComponent`) espone questi metodi:

| Metodo | Tipo di ritorno | Quando usarlo |
| :--- | :--- | :--- |
| `getSocial(nomi?)` *(demo)* | `Promise<Record<string, string>>` | Galleria social demo; `nomi` opzionale filtra (es. `['facebook','instagram']`) generando query a chiavi ripetute (`?nomi=facebook&nomi=instagram`). **Metodo dimostrativo: il `setup.mjs` lo rimuove dal progetto figlio (con l'endpoint `/social`).** |
| `getBlobUrl(slug, webopt?)` | `string` | URL relativo del file (`/api/blob/{slug}`) per `<img src>` / `<a href>` — senza download in memoria. Anche in GET passa dal proxy `/api` protetto da API key |
| `getBlob(slug)` | `Promise<Blob>` | File scaricato in memoria (anteprima locale, download forzato) |
| `uploadBlob(file)` | `Promise<{ slug }>` | Carica un file nel volume uploads (richiede JWT) |
| `login(username, password)` | `Promise<LoginResult>` | Autenticazione utente (solo se JWT abilitato) |

> L'identità del sito non sta in `ApiService`. Footer, pagine legali e SEO la leggono dalla risorsa condivisa dell'Engine `IdentityService` (`identity()` signal, `GET /identity`, una sola fetch per lingua). Vedi IdentityService.

### File Uploads (`/api/blob`)

`getBlobUrl` restituisce sempre un path relativo con prefisso `/api` (es. `/api/blob/{slug}`): il browser raggiunge il file attraverso il proxy SSR del frontend, non tramite l'URL interno del backend. Il prefisso è configurabile via `SSR_API_PREFIX` (default `/api`).

#### Quale metodo usare per mostrare un file

Per visualizzare o linkare un file che vive sul server (immagine, PDF, allegato) la risposta è una sola: `getBlobUrl(slug)`. Restituisce una stringa da mettere direttamente in `<img [src]>` / `<a [href]>`, senza scaricare nulla in memoria. È il percorso da preferire: il file viaggia come una normale GET HTTP, quindi sfrutta caching del browser e range requests.

```html
<img [src]="api.getBlobUrl(slug)" alt="...">          <!-- webopt=true di default → immagine ottimizzata -->
<a  [href]="api.getBlobUrl(slug, false)" download>Scarica originale</a>
```

`getBlob()` + `AssetService.getUrlFromBlob()` serve solo se si ha già un `Blob` in memoria e occorre un object URL temporaneo, cioè quando:
- scarichi il file per elaborarlo lato client invece di limitarti a mostrarlo;
- mostri l'anteprima locale di un file scelto dall'utente *prima* di caricarlo;
- il `Blob` è stato generato localmente (canvas, QR, immagine da testo…).

```typescript
const blob = await this.api.getBlob(slug);
const { angularUrl } = this.asset.getUrlFromBlob(blob); // SafeUrl; revocato in automatico al cambio pagina
// <img [src]="angularUrl">
```

> Regola pratica: un file che sta sul server e va solo mostrato/linkato → `getBlobUrl`. Un `Blob` già disponibile in memoria → `getUrlFromBlob`.

> Default `webopt = true`: è un flag generico che chiede al backend la versione ottimizzata per il web del file, qualunque essa sia, non è legato alle immagini per definizione. Oggi l'unica ottimizzazione implementata è quella per le immagini (lato più lungo max 1920 px, conversione in WebP), quindi i contenuti per cui non esiste ancora una pipeline (PDF, video…) vengono serviti tali e quali; ma il flag è il punto di aggancio previsto per future riduzioni lato API di altri tipi di contenuto. Per ottenere sempre il file originale, così com'è stato caricato (es. download a piena risoluzione), passa `getBlobUrl(slug, false)`.

#### Caricare un file (`uploadBlob`)

`uploadBlob(file)` carica il file e restituisce lo `slug` con cui recuperarlo in seguito (via `getBlobUrl` / `getBlob`). Si abbina a `app-upload-form`, il componente drag-and-drop riusabile:

```typescript
// <app-upload-form (fileConfirmed)="onFileConfirmed($event)" [isLoading]="isUploading()" />
async onFileConfirmed(file: File): Promise<void> {
    this.isUploading.set(true);
    try {
        const { slug } = await this.api.uploadBlob(file);
        // `slug` è l'identificativo per recuperare il file in futuro
    } finally {
        this.isUploading.set(false);
    }
}
```

> Nota: `uploadBlob` richiede JWT valido (l'utente deve essere loggato). Anche le GET (`getBlobUrl`, `getBlob`) richiedono l'API key: l'endpoint `/blob/{slug}` non è anonimo, quindi i file non sono una risorsa pubblica raggiungibile direttamente dal backend (es. da un crawler) come lo sono gli asset statici. Nel browser la chiave non va gestita: la inietta in modo trasparente il proxy SSR `/api`.

Pattern one-shot (dati statici, caricati una volta):
```typescript
ngOnInit() {
    this.api.getSocial().then(s => this.social.set(s));
}
```

Pattern reattivo (dati che si aggiornano con la lingua o lo stato): esponi un metodo che ritorna `api_resource<T>()` (vedi Aggiungere un Endpoint), poi nel template `res.value()` / `res.isLoading()`. Per l'identità del sito non serve scriverlo: c'è già `IdentityService` (risorsa condivisa dell'Engine).

### Errori Silenziosi per UI Custom

In componenti con UI d'errore propria (es. form di login), passa `{ silent: true }` per impedire la notifica automatica:

```typescript
// LoginFormComponent: gestisce l'errore internamente
await this.api.login(req, { silent: true })
    .catch(err => {
        this.errorMsg.set(err.problem?.detail ?? this.translate.translate('erroreImprevisto'));
    });
```

Senza `silent: true`, l'`apiErrorInterceptor` chiama `NotificationService.handleApiError()` automaticamente. Il client API (`BaseApiService`) resta puro: fa la chiamata e propaga un `ApiError` tipizzato; la notifica è un concern trasversale dell'interceptor.

### Aggiungere un Endpoint

La convenzione vive inline in `api.service.ts`. Tre passi:

1. **Path** — aggiungi la voce alla costante `API` in cima al file (stringa, o funzione per i path parametrici come `blob`).
2. **Metodo pubblico** — esponi un metodo dedicato che chiama l'helper protetto del `BaseApiService`: `api_get<T>()` / `api_post<T>()` per le chiamate una-tantum, `api_resource<T>()` per i dati reattivi (si ri-fetchano al cambio di signal, es. lingua).
3. **(Opzionale) `contentLoader`** — se l'endpoint alimenta una pagina al primo render, dichiaralo sulla pagina in `pages/*.pages.ts` (vedi *Developer Journey → Passo 6*).

Esempio (path parametrico + metodo che ne consuma il risultato): [AGENTS.md](../AGENTS.md#aggiungere-un-endpoint-al-client).

> Upload multipart/`FormData`: per gli endpoint che ricevono file usa `this.api_post_form<T>(path, formData)` invece di `api_post`, è quello che usa già `uploadBlob`. Non impostare `Content-Type` a mano: il browser lo aggiunge con il boundary corretto; per il resto passa per le stesse `build_api_Headers` e l'`apiErrorInterceptor`.

### `httpResource` per Componenti Sempre-On

Per i dati di un componente sempre-attivo (navbar, footer) esponi un metodo che ritorna `api_resource<T>()`: è un `httpResource` reattivo che si ri-fetcha da solo al cambio lingua (tramite segnale `Accept-Language`), così il componente mostra sempre la lingua corrente.

```typescript
// in api.service.ts
getArticoli() { return this.api_resource<Articolo[]>(API.articoli); }
// nel componente: readonly res = this.api.getArticoli();  → res.value() | res.isLoading()
```

> L'identità del sito è già un `httpResource` condiviso: `IdentityService` (Engine) la espone come `identity()` signal, una sola fetch per lingua riusata da footer, pagine legali e SEO. Non ricrearla a mano, vedi IdentityService.

---

## 🪪 IdentityService: l'identità del sito

`IdentityService` (Engine, `providedIn: 'root'`) è la sorgente unica dell'identità del sito: dati legali/anagrafici, profili social del brand, natura dell'entità (`personal`). Espone un solo signal:

```typescript
private readonly identityService = inject(IdentityService);
this.identityService.identity();  // Signal<Identity | null>
this.identityService.loading();   // Signal<boolean>
```

- **Una sola fetch condivisa.** È un `httpResource` su `GET /identity`, ri-fetchato al cambio lingua. Footer, pagine legali (placeholder `{{ragioneSociale}}`…) e `PageMetaService` (JSON-LD `sameAs`/`@type`) leggono tutti da qui: niente N chiamate sparse.
- **SSR-aware.** In SSR la risorsa è risolta prima della serializzazione, quindi i dati strutturati finiscono già nell'HTML server-rendered (la SEO non aspetta il browser).
- **Degrada da sola.** Identità non configurata (o backend irraggiungibile) → `identity()` è `null`: footer, social e JSON-LD relativi si nascondono senza errori.

I dati vivono nel backend (`data/identity.json`, servito dall'Engine): il frontend li consuma soltanto. Per renderli usa `app-identity-render` (sotto), col flag `showSocial` per le icone dei profili brand.

---

## 📤 ShareService: Copia, Condivisione, Download

`ShareService` centralizza tutte le operazioni di condivisione e download. Responsabilità unica: esegue l'operazione e ne restituisce l'esito, non mostra toast. La notifica è di chi scatena l'azione (il bottone/la pagina), così lo stesso servizio resta usabile anche in contesti silenziosi. I componenti `app-copy-action` / `app-share-action` lo fanno già per te.

```typescript
// Copia negli appunti → ritorna true/false, niente toast: lo mostra il chiamante
const ok = await this.share.copyText('testo');
this.notify.toast(this.translate.translate(ok ? 'clipboardCopied' : 'clipboardError'), ok ? 'success' : 'error');

// Condivisione nativa (Web Share API) con fallback a copy → ritorna un ShareResult
const result = await this.share.shareText('Titolo', 'Testo da condividere');
// shareResultNotice(result) mappa l'esito a un toast (o null se non serve avvisare)
const notice = shareResultNotice(result);
if (notice) this.notify.toast(this.translate.translate(notice.key), notice.type);

// Download canvas come PNG
await this.share.downloadCanvas(myCanvas, 'screenshot.png');

// Download blob generico
this.share.downloadBlob(blob, 'documento.pdf');

// Legge il testo dagli appunti (Clipboard API) → stringa, "" se non disponibile/negato
const incollato = await this.share.readText();
```

Esito (`ShareResult`): `shared` (foglio nativo) · `copied` (fallback appunti) · `downloaded` (fallback download) · `cancelled` (annullato) · `error`. L'helper puro `shareResultNotice(result)` decide il toast appropriato (o `null`); il componente lo mostra.

Fallback chain: Web Share API disponibile → usa native share; non disponibile / errore → fallback a download o copy.

---

## 🔊 Sintesi Vocale (SpeechService)

`SpeechService` fornisce lettura ad alta voce con selezione automatica della voce in base alla lingua corrente.

```typescript
// Nel componente
private speech = inject(SpeechService);

readAloud(text: string) {
    this.speech.speak(text, { rate: 1.0, pitch: 1.0 });
}
```

```html
<button (click)="readAloud(articleText)" [disabled]="speech.isSpeaking()">
    {{ speech.isSpeaking() ? 'Lettura in corso...' : 'Leggi ad alta voce' }}
</button>
```

- Voce auto-selezionata in base alla lingua corrente (si aggiorna reattivamente al cambio lingua)
- `rate`: velocità 0.1–10 (default 1); `pitch`: tono 0–2 (default 1)
- `speech.isSpeaking()`: Signal reattivo
- `speech.stop()`: interrompe immediatamente la lettura e azzera lo stato (chiamato anche da `speak()` prima di una nuova lettura, per evitare sovrapposizioni)
- `speech.currentVoice()`: `Signal<SpeechSynthesisVoice | null>` — la voce di sistema attualmente selezionata per la lingua
- SSR-safe: non disponibile server-side, degradazione silenziosa

---

## QR: Codici QR Dinamici (QrCodeService)

`QrCodeService` genera codici QR per casi d'uso comuni con colori automaticamente adattati al tema.

```typescript
// WhatsApp: link precompilato con messaggio
await this.qr.create({ type: 'whatsapp', phone: '+393331234567', text: 'Ciao!' });

// Email: mailto con subject e body
await this.qr.create({ type: 'email', to: 'info@example.com', subject: 'Demo', body: '...' });

// WiFi: WIFI auth string
await this.qr.create({ type: 'wifi', ssid: 'MyNetwork', password: 'pwd123', encryption: 'WPA' });

// SEPA: bonifico bancario
await this.qr.create({ type: 'sepa', iban: 'IT60...', name: 'Azienda', amount: 100.50 });

// Testo libero / URL
await this.qr.create({ type: 'text', content: 'https://example.com' });
```

Ritorna `{ success: true, blob: Blob }` oppure `{ success: false, error: QrError, message: string }`.

Caching: LRU cache automatica (max 32 QR), QR identici con stessi colori sono serviti dalla memoria senza ricalcolo.

Varianti utili: `toSVG(config)` restituisce il QR come stringa SVG (vettoriale, scalabile) invece del Blob PNG; `createWithColors(config, fg, bg)` genera il QR con colori espliciti invece di leggerli dal tema (`create` è infatti uno scorciatoio che passa `colorPrimaryText` / `colorPrimary`).

---

## 🖼️ ImgBuilderService: Generazione Immagini da Testo

`ImgBuilderService` genera PNG da testo usando SVG come formato intermedio. Tre modalità di layout:

```typescript
// exactInLine: nessun wrap, dimensioni guidate dal contenuto
{ renderMode: 'exactInLine' }

// wrap: larghezza fissa, altezza segue il testo
{ renderMode: 'wrap', maxWidth: 1000 }

// fixedRatio: aspetto ratio fisso, dimensioni si adattano
{ renderMode: 'fixedRatio', ratio: '16:9' }
```

```typescript
// Canvas per uso diretto (es. disegno, compositing)
const canvas = await this.img.buildCanvas('Titolo Articolo', {
    bgColor: '#1f40ff',
    textColor: '#ffffff',
    fontSize: 60,
    ratio: '16:9',
    maxWidth: 1920,
});

// Blob PNG per download o condivisione
const blob = await this.img.buildBlob('Titolo', opts);
await this.share.downloadBlob(blob, 'social.png');
```

Se non fornisci `bgColor`/`textColor`, vengono letti dai Signal del tema corrente (colori WCAG-conformi automatici).

Oltre alle opzioni di layout, puoi passare `fontFamily` (una chiave di `WEB_FONTS`, risolta nello stack CSS reale) e `lineHeight` (moltiplicatore d'interlinea, default `1.4`). Per allegare l'immagine a un `FormData`/upload c'è `buildFile(text, filename?, opts?)`, che restituisce un `File` PNG già pronto (è `buildBlob` avvolto in un `new File([...])`).

SSR-safe: il metodo statico `ImgBuilderService.buildSvg()` non tocca DOM né Angular, usabile in Node.js per generare preview server-side.

---

## 🔗 Meta Tag e Anteprima Sociale (PageMetaService)

`PageMetaService` aggiorna meta tag (title, og:, twitter:, canonical, JSON-LD) per ogni pagina. I valori di base vengono impostati automaticamente da `site.ts`; il resolver li affina con i dati della pagina.

### og:image Dinamica

In SSR viene generata automaticamente un'immagine personalizzata per la condivisione sociale:
- Asset di background (se `imgId` fornito)
- Overlay con titolo e sottotitolo
- Badge con favicon del sito

Non chiami `PageMetaService` a mano (è privato all'Engine): dichiari i meta in `site.ts` (`description`, `otherSEO`) o, per i dati derivati dal contenuto, nel `contentLoader` della pagina. L'Engine li riapplica da solo a ogni cambio pagina e di lingua.

Importante: `og:image` si aggiorna solo in SSR. I crawler non eseguono JavaScript, vedono la versione server-rendered. Le modifiche client-side all'og:image non hanno effetto sui preview di Facebook/LinkedIn/WhatsApp.

### Generazione og:image: la rotta `/cdn-cgi/preview`

L'og:image non è un file statico: l'Engine la genera al volo. Il Node SSR espone `/cdn-cgi/preview` (`server/routes/og-preview.ts`), che produce un'immagine OpenGraph/Twitter Card 1200×630 in due varianti, scelte dal payload:

- **Card testuale** — quando non c'è un'immagine di sfondo: SVG con nome app, favicon, titolo e sottotitolo sul colore brand.
- **Variante con immagine** — quando il payload porta un `id` asset: sfondo sfocato + immagine in primo piano + (salvo `onlyImage`) favicon e badge col titolo.

Il risultato viene cachato su disco (WebP) come ogni thumbnail di `/cdn-cgi/asset`.

Tu non costruisci l'URL a mano: lo controlli da `site.ts`. La pagina dichiara `otherSEO.ogImage` (l'id dell'asset di sfondo) e, a livello globale, `onlyPlainImage` decide se mostrare la sola immagine senza scritte/favicon. Per la semantica a tre stati di `ogImage` (id asset / `false` = nessuna / omesso = preview dinamica auto-generata) vedi Opzioni Avanzate di `site.ts`.

Il payload è cifrato e non falsificabile: i parametri (`title`, `subtitle`, `id`, `onlyImage`) viaggiano nel query param `?p=` come blob AES-GCM prodotto da `PreviewCrypto` (`server/preview-crypto.server.ts`): una manomissione fa fallire la decifrazione → 403. La chiave è derivata, in ordine di precedenza, da `PREVIEW_CRYPTO_SECRET` → la API key server-side (`Security.ApiKeys[0]`, segreta) → `appName:version`. Il fallback sull'API key rende i blob non forgiabili anche senza configurare un secret dedicato: senza di esso un attaccante che conosce `appName` e `version` (entrambi pubblici) potrebbe forgiare og:image arbitrarie sul dominio. L'IV è deterministico (SHA-256 del payload), quindi lo stesso payload produce sempre lo stesso URL, stabile e cacheable da browser/CDN.

### JSON-LD Strutturato (grafo Schema.org)

Schema.org viene iniettato automaticamente per ogni pagina. Migliora l'apparenza in Google Search e altri motori. L'Engine emette un grafo di entità separate, ognuna nel proprio `<script type="application/ld+json">`: blocchi distinti rendono il grafo più leggibile ai validator e permettono di aggiornare ogni entità senza sovrascrivere le altre.

| Entità | `@id` | Quando |
| :--- | :--- | :--- |
| `Organization` *(o `Person`)* | `{origin}#organization` *(o `#person`)* | Sempre — l'entità brand: nome (ragione sociale, fallback nome sito), URL e icona del sito (`logo` per Organization, `image` per Person); `sameAs` dai social; `address` (`PostalAddress` dalla sede); `contactPoint` (`ContactPoint` con telefono/email, `hoursAvailable` dagli orari, `availableLanguage` dalle lingue del sito); e — solo Organization — `legalName`/`vatID`/`taxID` da ragione sociale/P.IVA/CF; più la via di fuga `identity.extra` (proprietà schema.org arbitrarie fuse nel nodo). Il tipo dipende da `identity.personal` (default Organization); identità assente → Organization minimale |
| `WebSite` | `{origin}#website` | Sempre — collega le pagine al sito e all'organizzazione |
| `WebPage` (o tipo scelto) | `{canonical}#webpage` | Sempre — la pagina corrente, con `inLanguage`, `isPartOf`, `publisher` e `dateModified` (dal valore effettivo di `og:updated_time`) |
| `BreadcrumbList` | — | Solo quando il path non è la root (`/`) |

Ogni script è marcato con l'attributo `data-br1-jsonld` (per aggiornarli/rimuoverli in blocco) e riceve il nonce CSP della richiesta in SSR, così rispetta la Content-Security-Policy senza `unsafe-inline`.

I dati strutturati si dichiarano in un solo campo, `otherSEO.structuredData`, in tre forme (anche combinabili in una lista):
- una **stringa** → solo il `@type` della pagina (es. `'AboutPage'`, per i tipi non coperti; default `WebPage`);
- un **oggetto** `{ kind, … }` con campi parlanti (`article` / `faq` / `product` / `event`) → **senza conoscere schema.org**, tradotto dall'Engine in JSON-LD valido;
- un **array** → più entità sulla stessa pagina (es. un Article + una FAQ + un `raw`).

La traduzione vive in un unico punto (`structured-data.ts`): se domani schema.org cambia si tocca solo quello, non la config dei figli. Si impostano statici in `site.ts` o dinamici dal `contentLoader` della pagina (derivati dal contenuto, es. autore e data di un Article, con la precedenza). Per i tipi non coperti c'è la via di fuga `kind: 'raw'` (JSON-LD grezzo). I campi non impostati ricadono sui dati già esistenti (titolo, og:image, ultima modifica, Organization del sito): così anche un semplice `{ kind: 'article' }` produce un'entità completa. E senza dichiarare nulla, ogni pagina ha comunque il grafo base `Organization`+`WebSite`+`WebPage`. Per gli articoli (`kind: 'article'`) l'Engine emette anche i meta Open Graph `article:*` (`published_time`, `modified_time`, `author`, `section`, un `tag` per voce), gemelli dei dati JSON-LD, abbinali a `ogType: 'article'`. Esempi in [AGENTS.md](../AGENTS.md).

### URL Canonico e `og:locale`

Il canonical viene costruito in modo stabile per evitare contenuti duplicati e canonical divergenti tra HTML iniziale e idratazione:
- query string e hash vengono rimossi;
- in SSR l'origin è forzato a `FRONTEND_BASE_URL`, indipendentemente dagli header del reverse proxy.

Lo stesso canonical alimenta `og:url`, il tag `rel="canonical"` e gli `@id`/`url` del grafo JSON-LD, mantenendoli coerenti.

`og:locale` (e gli `og:locale:alternate` per le altre lingue) usano il formato regionale OpenGraph `lingua_REGIONE` (es. `it_IT`, `en_US`), derivato via `Intl.Locale().maximize()`. Gli alternate vengono rigenerati con remove+add a ogni cambio pagina, così funzionano correttamente anche con più di due lingue (dove `Meta.updateTag` sovrascriverebbe un solo tag). Stesso pattern remove+add usato per i tag `hreflang` (vedi «Lingua nell'URL»).

Il modello i18n è a URL per lingua (vedi «Internazionalizzazione (i18n)» → «Lingua nell'URL»): la lingua di default non è prefissata, le altre lo sono (`/en/…`). Ne discendono direttamente `hreflang`/`x-default` e un canonical già self-referenziante per lingua, dato che è l'URL stesso a portarla. Nessun header `Vary: Accept-Language` in risposta: il contenuto è funzione del path, non dell'header.

> Anteprime ricche: il `<meta name="robots">` di base include `max-image-preview:large, max-snippet:-1, max-video-preview:-1`, autorizza Google a mostrare l'anteprima immagine grande (l'OG 1200×630 generata dall'Engine) e snippet/video senza limiti nei risultati. La description di pagina, se omessa, ricade sulla `site.description` di default (localizzata) invece di restare quella della pagina precedente.

---

## 🔄 Controllo Versione e Aggiornamenti (VersionCheckService)

L'app controlla automaticamente se è disponibile una nuova versione e notifica l'utente.

### Fonti di Versione

La versione è dichiarata in `global-settings.json` (`project.version`) e distribuita in due posti tramite `generate-statics.ts` al build:
1. Meta tag `app-version` in `index.html` — baseline in memoria **e** sorgente del polling ogni 10 minuti
2. Hash NGSW — usato da SwUpdate nelle PWA installate

> Il polling legge il meta `app-version` da `index.html` (non dal manifest): `index.html` è sempre presente, anche con `isWebApp:false`, quando il manifest non viene generato né servito.

### Meccanica

Tab senza Service Worker (sempre con `isWebApp:false`): polling ogni 10 minuti che scarica `/index.html` e confronta il meta `app-version` → se cambia → dialog "Nuova versione disponibile" → hard reload attiva la nuova versione.

PWA / tab con SW attivo: il SW serve `index.html` dalla cache (versione stabile per il polling) e a decidere è SwUpdate, che emette `VERSION_READY` quando la nuova versione è scaricata → l'utente conferma → `activateUpdate()` + reload.

Prerequisito (consenso TechnicalOptional): se sul sito serve un consenso TechnicalOptional (di norma solo il caso PWA — i cookie Technical "veri" sono esenti per legge, mai a consenso) il controllo versione è disabilitato finché l'utente non lo accetta; si attiva al reload successivo. Se invece non serve alcun consenso TechnicalOptional (non-PWA) non c'è nulla da accettare e il polling parte comunque: legge solo il meta `app-version` via `fetch`, non scrive cookie. Senza questa distinzione un sito così, tipicamente con `isWebApp:false`, resterebbe senza controllo versione per sempre.

---

## ⚙️ Opzioni Avanzate di `site.ts`

Oltre a `path`, `title` e `description`, ogni dichiarazione di pagina (nei file di area `pages/*.pages.ts`, assemblati nell'array `pages` di `site.ts`) accetta:

```typescript
{
    // Forza il rendering client-side (es. per pagine protette da login)
    renderMode: 'client',  // default: 'server'

    // Nasconde parti della shell per questa pagina
    layout: {
        showNav: false,       // nasconde la navbar
        showFooter: false,    // nasconde il footer (default: mostrato, ma off se fitViewport)
        showPanel: false,     // nasconde il pannello laterale
        fitViewport: true,    // vista full-bleed immersiva: riempie il viewport; di default niente padding/pannello/smoke/footer (navbar sì)
        pageFade: false,      // spegne il fade-in d'ingresso solo su questa pagina (il globale shell.pageFade fa da gate)
    },

    // Meta tag OpenGraph aggiuntivi
    otherSEO: {
        ogImage: 'og-cover',  // ID asset (non un path). `false` = nessun og:image; omesso = preview dinamica auto-generata
        ogType: 'article',
        structuredData: { kind: 'article' },  // JSON-LD: stringa (@type), oggetto {kind,…} o lista. Vedi sezione JSON-LD
        noindex: false,       // true = pagina pubblica/SSR ma esclusa dall'indice (X-Robots-Tag + fuori sitemap). Default false
    },
}
```

A livello top di `site.ts` (oltre a `pages`) dichiari struttura e comportamento del sito. Ogni campo ha un default: dichiari solo quelli che vuoi cambiare. Il menu di header/footer è dato risolto a runtime in `nav.ts`, vedi «Navigazione Multilivello» più sotto.
```typescript
// site.ts
homePage: PageType.Home,           // pagina del brand/logo nel navbar (se omessa, il brand non è un link)
loginPage: PageType.Login,         // dove mandare gli utenti non autenticati (se omessa → /error/401)
// loginPage: { page: PageType.Login, showInHeader: true },  // forma estesa: espone anche il link Login in navbar

shell: {                           // comportamento di navbar / footer / header / pannello contenuti
    showNav: true,                 // mostra la navbar (false nasconde anche il language picker)
    showFooter: true,              // mostra il footer
    showPanel: true,               // mostra il pannello contenuti (gate: col globale off nessuna pagina può riattivarlo)
    fixedTopHeader: false,         // navbar fissa in alto allo scroll
    showBrandIconInHeader: true,   // favicon accanto al nome nel brand
    showNotifications: false,      // campanellino notifiche realtime con storico (default false, opt-in)
    panelForcedLight: true,        // pannello contenuti sempre chiaro, a prescindere dal tema OS
    pageFade: true,                // fade-in d'ingresso pagina (gate: col globale off nessuna pagina può riattivarlo)
},

isWebApp: false,                   // funzionalità PWA (Service Worker, aggiornamenti, install offline) — default false, opt-in
onlyPlainImage: false,             // anteprime social con sola immagine, senza scritte/favicon

legalPages: [ /* … */ ],           // pagine legali → vedi sotto
```

> `description` (mappa per-lingua `{ it, en, … }`), `colorTema` e l'effetto `smoke` sono estetica e vivono in `global-settings.json → site`.

I profili social del brand e la natura dell'entità sono dati d'identità: vivono in `backend/data/identity.json` (campi `social` e `personal`), serviti dall'Engine su `GET /identity` e letti dalla risorsa condivisa `IdentityService`. `social` è una lista di URL: l'Engine li emette come `sameAs` dell'entità brand nel JSON-LD, il segnale che Google usa per il Knowledge Panel, e l'icona nel footer è dedotta dall'URL (quindi più profili dello stesso social convivono). Lista vuota o identità assente → nessun `sameAs`. Se tra i profili c'è un URL Twitter/X, l'handle alimenta anche il meta `twitter:site`. (Esempio in [AGENTS.md](../AGENTS.md).)

Per un sito personale/portfolio imposta `personal: true` in `identity.json`: l'entità brand diventa `Person` invece di `Organization` (default). Cambia solo il `@type` e l'icona passa da `logo` a `image`; il nome dell'entità è la `ragioneSociale` (fallback al nome del sito). Il default è `Organization` perché è il meno penalizzante per Google: dichiarare `Person` quando si è un'azienda è peggio del contrario. Identità assente → esce comunque un grafo valido (Organization, senza sameAs).

> `isWebApp: false` rende il sito non installabile: oltre a non registrare il Service Worker (e a de-registrarlo a runtime, vedi "Service Worker e Consenso Tecnico"), `generate-statics.ts` non genera il `manifest.webmanifest` e rimuove da `index.html` i trigger di installabilità (`<link rel="manifest">`, `mobile-web-app-capable`, i meta `apple-mobile-web-app-*`); il server SSR risponde `404` al manifest. Così non compare il prompt "Aggiungi a schermata Home" (su Chrome Android il Service Worker non è più requisito di installabilità dal 2021). Con `isWebApp: true` la PWA è completa.

### Effetto smoke: il contratto `SmokeSettings`

Lo **smoke** è l'animazione di particelle di sfondo del pannello contenuti. Vive in `global-settings.json → site.smoke` (estetica, non struttura) e l'Engine lo normalizza nel contratto `SmokeSettings` (`siteBuilder.ts`), applicando i default a ogni campo omesso:

| Campo | Tipo | Default | Significato |
| :--- | :--- | :--- | :--- |
| `enable` | `boolean` | `false` | Attiva o disattiva l'effetto |
| `color` | `string` | `'#ffffff'` | Colore base delle particelle |
| `opacity` | `number` | `0.5` | Opacità complessiva |
| `maximumVelocity` | `number` | `0.5` | Velocità massima di movimento |
| `particleRadius` | `number` | `2` | Raggio medio delle particelle |
| `density` | `number` | `10` | Densità complessiva a schermo |

```jsonc
// global-settings.json → site
"smoke": {
    "enable": true,
    "color": "#1f40ff",
    "opacity": 0.4,
    "maximumVelocity": 0.6,
    "particleRadius": 2,
    "density": 12
}
```

Spento da solo quando darebbe fastidio: anche con `enable: true`, lo shell (`app.component.ts`) calcola `showSmoke` e tiene l'effetto off automaticamente quando non avrebbe senso, in `fitViewport` (vista immersiva), quando il pannello contenuti non c'è (`showPanel: false`), e quando l'utente ha richiesto `prefers-reduced-motion`. Così lo smoke compare solo dove c'è un pannello che lo ospita e l'utente non ha chiesto meno animazioni, un default rispettoso dell'accessibilità, senza configurazione.

### Pagina esterna (`externalUrl`) e on/off (`enabled`)

Oltre alle pagine interne (con `component`) e ai gruppi padre (con `children`), in `pages` puoi dichiarare due varianti utili a tenere i menu coerenti senza moltiplicare le rotte:

| Variante | Come la dichiari | Cosa fa |
| :--- | :--- | :--- |
| **Pagina esterna** | un oggetto con `externalUrl` (e `pageType`) invece di `component`/`children` | Mappa un `PageType` su un URL esterno: la voce resta referenziabile come ogni altra pagina (`addPage`, `[appPage]`), ma **non genera alcuna rotta Angular** — compare solo nei menu/footer. Esclusa dalla sitemap. |
| **Interruttore on/off** | `enabled: false` su qualsiasi pagina (interna, padre o esterna) | Disattiva la pagina in un colpo solo: la esclude da **rotte, menu e sitemap**. Su un gruppo padre spegne anche i figli; un gruppo con tutti i figli disabilitati sparisce dal menu. Default `enabled: true`. |

```typescript
pages: (ctx) => [
    // Pagina esterna: nessuna rotta, solo voce di menu verso un URL esterno
    { pageType: PageType.BlogEsterno, title: 'navBlog', externalUrl: 'https://blog.example.com' },

    // Pagina interna temporaneamente spenta: niente rotta, niente menu, niente sitemap
    { path: 'promo', pageType: PageType.Promo, title: 'Promo', enabled: false,
      component: () => import('./promo/promo.component').then(m => m.PromoComponent) },
],
```

### Navigazione Multilivello (Navbar e Footer)

Il menu di header/footer vive in `frontend/src/app/nav.ts`, un `ShellNavResolver` (tipo esportato da `core/engine/shell-nav.ts`) fornito a `SHELL_NAV_RESOLVER` in `app.config.ts`: quali destinazioni mostrare, in che ordine, con che etichetta, è un **dato**, risolvibile a runtime — anche da un'API, anche diverso per utente loggato — mentre `ContestoSito`/`buildSite()` (`site.ts`) sono build-time (Angular vuole `routes` statico al bootstrap). `ShellNavService` (Engine) lo risolve una volta sola — condiviso da navbar e footer, non un fetch a testa — prima che qualunque componente si costruisca, e lo ri-risolve ad ogni cambio lingua.

`header`/`footer` sono **callback** che ricevono un builder, non array — sincrone (`void`) per una dichiarazione statica, o `async` se dipendono da un'API (stesso builder in entrambi i casi, cambia solo se la callback aspetta qualcosa prima di chiamarlo). Il builder espone tre azioni: `addPage(PageType, { label? })` (voce singola, con etichetta custom opzionale al posto del titolo della pagina), `addLink('chiaveLabel', 'https://…')` (URL esterno — per una pagina interna usa sempre `addPage`), `addGroup('chiaveLabel', b => …)` (gruppo/dropdown), e i gruppi sono annidabili (dentro un `addGroup` ne richiami un altro):

```typescript
// nav.ts
export const navResolver: ShellNavResolver = {
    header: (nav) => {
        nav.addPage(PageType.AboutUs);
        nav.addGroup('navServizi', servizi => {
            servizi.addPage(PageType.Consulting);
            servizi.addGroup('navSviluppo', dev => {            // gruppi annidabili
                dev.addPage(PageType.WebDev);
                dev.addLink('navBlog', 'https://blog.example.com'); // link esterno
            });
        });
    },
};
```

Un resolver che dipende da un'API (es. voci per-utente): stesso builder, callback `async`, `addPage` con `params` per l'istanza concreta di una rotta parametrica (stesso meccanismo con cui il resto del sito risolve un `PageType` parametrico, vedi `dynamicParams` in AGENTS.md) e `label` per l'etichetta che preferisci invece del titolo generico della pagina:

```typescript
header: async (nav, ctx) => {
    const preferiti = await inject(ApiService).getPreferiti();
    for (const p of preferiti) {
        nav.addPage(PageType.Prodotto, { params: { slug: p.id }, label: p.nome });
    }
},
```

L'Engine elabora i gruppi in modo automatico:
- **Navbar (Desktop)**: genera un menu dropdown. Dal secondo livello in giù, genera **flyout laterali** che si espandono verso destra (o si ribaltano a sinistra in automatico se sforano il viewport).
- **Navbar (Mobile)**: converte i gruppi in **accordion indentati** che si espandono al click.
- **Footer**: genera colonne annidate visivamente strutturate per livelli di indentazione.

Limiti di profondità: se superi i 3 livelli di profondità, in fase di sviluppo riceverai un avviso di usabilità in console (`NAV_DEPTH_WARN`), e un errore bloccante se si superano i 5 livelli (`NAV_DEPTH_MAX`).

Limite di voci di primo livello (Navbar Desktop): superate le 6 voci dirette in `header` (stessa soglia dell'avviso in console per l'usabilità), la Navbar desktop raccoglie automaticamente le voci in eccesso in un dropdown finale "Altro", nessuna configurazione richiesta, l'Engine misura lo spazio disponibile a runtime (`ResizeObserver`) e sposta lì solo ciò che davvero non entra nella riga. Sotto la soglia, o su mobile (dove il menu è comunque impilato verticalmente), il comportamento non cambia.

Voci visibili solo da loggato (`authOnly`): `addPage`/`addLink`/`addGroup` accettano un terzo parametro opzionale `{ authOnly: true }`, la voce (o, su `addGroup`, l'intero gruppo coi suoi figli) compare in navbar e footer solo per utenti loggati, sparendo del tutto per visitatori e bot (nessun link verso una pagina a cui comunque non potrebbero accedere). È il complemento lato-menu di `requiresAuth` sulla pagina (vedi "Proteggere una Pagina"): quello protegge la rotta, questo nasconde la voce.

```typescript
header: (h) => {
    h.addPage(PageType.AreaRiservata, { authOnly: true }); // solo da loggato
    h.addGroup('navAdmin', g => {                          // l'intero gruppo, non solo i figli
        g.addPage(PageType.Utenti);
        g.addPage(PageType.Impostazioni);
    }, { authOnly: true });
}
```

Volutamente binario (loggato/sloggato, via `TokenService.isLoggedIn()`), non un sistema di ruoli: la navbar è pensata per restare generica, un progetto che ha bisogno di granularità per-ruolo filtra a monte (nel proprio resolver di `nav.ts`, prima che la voce venga costruita, oppure componendo il menu in base a `session<T>()`), non nell'Engine.

### Pagine legali (`legalPages`)

`legalPages` è un array: un elemento per pagina legale, tutti con lo stesso trattamento (rotta sotto `/policy/`, `PolicyComponent`, Markdown localizzato, riga nella fascia legale del footer). Non c'è distinzione fra "pagine di sistema" e pagine di progetto — nemmeno la Cookie Policy è un caso a parte qui: lo è solo `cookiePolicy`, un riferimento separato (vedi sotto).

Per le 5 pagine standard, `STANDARD_LEGAL_PAGES` (esportato da `siteBuilder.ts`) fornisce `path`/`titleKey`/`descriptionKey`/`markdownSlug` già pronti — li abbini al tuo `PageType` con lo spread:
```typescript
import { STANDARD_LEGAL_PAGES } from './core/engine/siteBuilder';

legalPages: [
    { pageType: PageType.PrivacyPolicy, ...STANDARD_LEGAL_PAGES.privacy },
    { pageType: PageType.CookiePolicy, ...STANDARD_LEGAL_PAGES.cookie },
    { pageType: PageType.TermsOfService, ...STANDARD_LEGAL_PAGES.tos },
    { pageType: PageType.LegalNotice, ...STANDARD_LEGAL_PAGES.legal },
    { pageType: PageType.AccessibilityStatement, ...STANDARD_LEGAL_PAGES.accessibility },
],
cookiePolicy: PageType.CookiePolicy,
```
- **Voce assente** → quella pagina non viene creata (es. una vetrina con i soli cookie: ometti privacy/termini/note legali/accessibilità, tieni solo la voce cookie).
- **Cookie obbligatoria**: se il sito usa cookie (PWA o cookie di progetto) `cookiePolicy` dev'essere valorizzato con il `PageType` di una voce presente in `legalPages`, altrimenti il build si ferma con un errore esplicito. Se invece la tieni comunque presente pur senza cookie attivi al momento (`hasCookiesConfigured()` falso — niente PWA, niente voci in `COOKIE_MAP`), la pagina resta costruita e raggiungibile via URL diretto, ma l'Engine la toglie da sé dalla fascia legale del footer (`siteBuilder.ts`); va replicata la stessa condizione nel proprio `headerNav` se ce l'hai anche lì (vedi `site.ts`).
- **Rimuovere una pagina**: basta togliere la voce da `legalPages` — "voce assente" sopra vale anche in cancellazione, nessun'altra modifica richiesta. Eccezione: se rimuovi proprio la pagina puntata da `cookiePolicy` senza aggiornare/svuotare anche quel campo, il build si ferma con un errore esplicito (`validatePageRefs` verifica che `cookiePolicy` risolva sempre a una pagina realmente registrata, come già faceva per `loginPage`/`homePage`) — l'unica delle 5 standard per cui una rimozione a metà non passa in silenzio.
- **Contenuto**: Markdown localizzati in `src/assets/legal/` (slug `privacy`, `cookie`, `TOS`, `legal`, `accessibility` per le 5 standard → `<slug>.<lang>.md`); il `PolicyComponent` interpola i placeholder dell'identità del sito (`{{ragioneSociale}}`, `{{partitaIva}}`, …) e `{{companyProfile}}` (blocco identità completo, come in `legal.<lang>.md`).
- **Dichiarazione di Accessibilità**: voce facoltativa come le altre (tranne quella puntata da `cookiePolicy`), nessun errore di build se la ometti. Rilevante dal 28 giugno 2025 per i siti nello scope dell'European Accessibility Act (e-commerce, o fatturato >2M€/≥10 dipendenti, microimprese escluse). Attenzione: il regime esatto dipende da chi eroga il sito, Pubblica Amministrazione (Legge 4/2004, dichiarazione + obiettivi annuali via piattaforma AGID) e soggetti privati (D.Lgs. 82/2022, "informazioni sull'accessibilità" ex Allegato IV, senza obiettivi annuali) non sono lo stesso adempimento: il Markdown demo è un template generico di trasparenza (stato di conformità, limiti noti, canale di segnalazione), non un modulo ufficiale né un testo legale pronto all'uso, verifica con un consulente legale quale regime si applica al progetto.

Override per-pagina: per gestire una policy a modo tuo (rotta dedicata, contenuto da API invece che da Markdown) dichiari tu stesso la pagina in `pages` con lo stesso `PageType`: la tua vince, l'Engine non la crea e non ne carica il `.md`. Le altre policy restano automatiche.

**Una policy in più** (es. diritto di recesso per un e-commerce, un piano di accessibilità): aggiungi una voce a `legalPages`, scrivendo tu stesso `path`/`titleKey`/`descriptionKey`/`markdownSlug` — esattamente come le 5 standard, solo senza `STANDARD_LEGAL_PAGES` a fare da scorciatoia:
```typescript
legalPages: [
    /* ... le 5 standard ... */
    { pageType: PageType.WithdrawalPolicy, path: 'recesso', titleKey: 'recessoPolicyMenu', descriptionKey: 'recessoPolicyDescrizione', markdownSlug: 'recesso' },
],
```
Non serve toccare l'Engine: stessa auto-creazione, stesso ordine nel footer (quello dell'array), stesso override per-pagina. Ricetta completa: [AGENTS.md](../AGENTS.md#aggiungere-una-policy-legale-extra-oltre-ai-5-slot-fissi).

**Nel footer, non serve aggiungerle a mano.** Il footer le rende da solo in una fascia dedicata a chiusura pagina ("small prints", stesso pattern dei footer PA/Designers Italia: link istituzionali separati dalla navigazione vera, riga compatta invece di un'altra colonna), derivata direttamente da `legalPages` — nessuna voce da aggiungere in `footerNav`. È dinamica: uno slot omesso (o una pagina rimossa da `pages`) sparisce da solo dalla fascia, senza toccare `site.ts`. `footerNav`/`headerNav` restano per la navigazione libera del progetto — mettere di nuovo le stesse pagine lì le duplicherebbe.

### Passare Dati a una Pagina: Component Input Binding

Il router è configurato con `withComponentInputBinding()` (`app.config.ts`): tutto ciò che finisce nella rotta diventa un `@Input()` della pagina, abbinato per nome, senza iniettare `ActivatedRoute`. Vuoi passare qualcosa a una pagina? Lo metti nel canale giusto e la pagina lo legge con un signal-input dello stesso nome. I canali sono quattro, da scegliere in base a dove nasce il dato:

| Canale | Da dove arriva | Quando usarlo |
| :--- | :--- | :--- |
| **`data: { … }`** (statico) | dichiarato sulla pagina, nel suo file di area (`pages/*.pages.ts`) | configurazione/variante **fissa** di quella rotta (es. la stessa pagina riusata con un flag diverso) |
| **Parametro di rotta `:x`** | segmento dinamico del `path` | id/slug che vivono nell'URL |
| **Query string `?x=`** | querystring | filtri o stato condivisibile via URL |
| **Resolver (`contentByResolve`)** | risolto **prima** che la pagina si attivi | contenuto async che l'Engine carica per la pagina |

1-3. `data` statico, parametro di rotta, query: li dichiari (o li porta l'URL) e li leggi come `input()` omonimo:

```typescript
// pages/listino.pages.ts — `data` statico (canale 1) + parametro nel path (canale 2)
{ path: 'listino/:fascia', pageType: PageType.Listino,
  component: () => import('./listino/listino.component').then(m => m.ListinoComponent),
  data: { variante: 'premium' } }
```
```typescript
// listino.component.ts — tutti letti come input, senza ActivatedRoute
readonly variante = input<string>('base');  // dal `data` statico
readonly fascia   = input<string>();         // dal parametro di rotta `:fascia`
readonly q        = input<string>();         // dalla query `?q=...`
```

> È lo stesso meccanismo della rotta d'errore dell'Engine: `error/:errorCode` → `ErrorComponent` legge `readonly errorCode = input(404, …)`.

4. Il resolver è già cablato: ogni pagina foglia ha `route.resolve = { contentByResolve: … }`, l'Engine risolve il contenuto della pagina (vedi `ContentResolver`) e lo consegna nell'input `contentByResolve`, che `PageBaseComponent` legge già per te (`input<ResolvedPage<T> | null>()`). Estendendo la base hai il contenuto risolto senza scrivere nulla; aggiungi tuoi `input()` solo per i canali 1-3.

> Chiavi riservate in `route.data`: il builder fonde il tuo `data` con chiavi che gestisce l'Engine (`pageType`, `showPanel`, `showNav`, `showFooter`, `fitViewport`, `pageDescription`, `ogImage`, più `contentByResolve` dal resolver), e le sue vincono sulle omonime nel tuo `data`. Non riusare quei nomi. `pageType` è sempre disponibile come `input.required<PageType>()` (lo legge `PageBaseComponent`). Tra i canali usa nomi distinti: a parità di nome la pagina riceve un solo valore.

`withInMemoryScrolling()` gestisce la posizione di scroll: il ritorno alla pagina precedente ripristina la posizione; i link con `#section` scrollano all'ancora.

---

## 🧩 Configurazione di progetto (`Custom`)

`global-settings.json → Custom` è uno spazio libero per la configurazione di progetto (feature flag, ID analytics, soglie): oggetti annidati arbitrari, senza toccare schema o codice infrastrutturale. È leggibile a ogni livello:

- **Backend (ASP.NET Core):** `IConfiguration["Custom:TuaChiave"]`
- **Node SSR:** `getBr1Settings().Custom`
- **Browser Angular:** `inject(APP_CUSTOM)` in qualsiasi componente o servizio, l'SSR serializza `Custom` in `TransferState` e il client la rilegge in idratazione (fallback `{}` senza SSR).

```typescript
import { APP_CUSTOM } from './core/engine/app-custom';

const custom = inject(APP_CUSTOM);
const trackingId = custom['Analytics']?.['TrackingId'] as string | undefined;
```

> `Custom` è committabile ed esposto al client: usalo per valori pubblici (feature flag, limiti, ID analytics); i segreti vivono in `global-settings.local.json`.

> ⚠️ `Custom` lato browser richiede SSR sulla rotta: `inject(APP_CUSTOM)` si popola dal `TransferState`, che esiste solo se la pagina è renderizzata dal server. Su una rotta `renderMode: 'client'` (incluse le pagine `requiresAuth`, vedi sopra) il `TransferState` non viene emesso → al caricamento diretto/refresh di quella rotta `APP_CUSTOM` è `{}`. Se una pagina deve leggere `Custom` lato client (es. un token mappa), tienila `renderMode: 'server'`: l'SSR rende solo la shell e popola il `TransferState`, mentre la logica browser resta in `afterNextRender`. Se il valore deve restare fuori dal repo, mettilo in `Custom` di `global-settings.local.json` (gitignored): il merge in dev e il file effettivo in prod lo fanno comunque arrivare.

### Token `SITE_CONFIG`: la Config Risolta del Sito

Mentre `Custom` è uno spazio libero per il progetto, `SITE_CONFIG` è il token DI che espone la `SiteConfig` finale normalizzata dall'Engine (provider in `app.config.ts`, valore `ContestoSito.config`). `inject(SITE_CONFIG)` restituisce la configurazione già risolta (default applicati, `legalPages` completo, riferimenti sanitizzati) senza ri-derivarla:

```typescript
import { SITE_CONFIG } from './core/engine/siteBuilder';

const site = inject(SITE_CONFIG);
site.appName;     // nome applicativo
site.version;     // versione canonica
site.colorTema;   // colore brand di default (usato anche da ThemeService, vedi sopra)
site.legalPages;  // LegalPageSpec[] risolte (array, una voce per pagina legale configurata)
site.homePage;    // PageType del brand (o null)
site.loginPage;   // PageType di redirect non-auth (o null)

// Flag di shell appiattiti al top-level di SiteConfig (boolean; significato di ciascuno nel
// blocco `shell` sopra): showNav, showFooter, showPanel, fixedTopHeader, showBrandIconInHeader,
// showLoginInHeader, showNotifications, panelForcedLight, pageFade
site.showNav;     // es. lettura di un singolo flag
```

---

## 📡 Configurazione SSR e Origine Frontend

### `FRONTEND_BASE_URL` per og:image

L'URL canonico del sito è dichiarato in `FRONTEND_BASE_URL` (env var: in locale la passa `scripts/deploy.sh` da `frontend.hostname`; nelle release la passa la CI dalla repository variable omonima, vedi [RELEASE.md](../RELEASE.md)). Viene usato per costruire URL assoluti di `og:image` in SSR, indipendentemente dagli header del reverse proxy (Nginx, Cloudflare):

```bash
FRONTEND_BASE_URL=https://tuodominio.it
```

Nel browser, se il token non è disponibile, si usa `document.location.origin` come fallback. Importante per deployment multi-dominio dove SSR e browser vedono origini diverse.

---

## 🔗 `[appPage]`: Navigazione Dichiarativa

La directive `PageDirective` traduce un `PageType` nel path corrispondente e lo passa a `RouterLink`, eliminando il boilerplate `[routerLink]="ContestoSito.getPath(PageType.X) ?? '/'"`.

```html
<!-- Tutti i link interni al sito usano [appPage] -->
<a [appPage]="PageType.Home"          class="nav-link">Home</a>
<a [appPage]="PageType.PrivacyPolicy" class="footer-link">Privacy</a>
<a [appPage]="PageType.Contatti"      class="btn btn-primary">Contattaci</a>
```

| Caratteristica | Dettaglio |
| :--- | :--- |
| Comportamento | Identico a `[routerLink]` — SPA navigation, keyboard, right-click "Apri in nuova scheda" |
| Fallback | Se il `PageType` non è registrato in `site.ts`, naviga verso `/` con un avviso in console (solo in dev-mode — nessun errore a runtime né a compile-time, il `PageType` è comunque valido come identificatore, manca solo la rotta). Un link che porta a casa senza motivo apparente di solito è un `PageType` dichiarato ma mai aggiunto a `pages`. |
| `href` | Bindato esplicitamente: RouterLink come `hostDirective` non aggiorna il proprio `@HostBinding` via effect → senza questo binding, l'elemento avrebbe `href=null` e cursore testo invece di cursore link |
| Tipo | `input.required<PageType>()` — errore TypeScript a compile-time se mancante |

Regola pratica: usa `[appPage]` per tutti i link interni. Per navigazione programmatica dopo operazioni asincrone (es. redirect post-login, post-form) inietta `Router` e chiama `router.navigate([ContestoSito.getPath(PageType.X) ?? '/'])`.

---

## 🖼️ Directive di Rendering Dichiarativo

### `img[appImgRender]`: Rendering Immagine Generata

Applica `ImgBuilderService` direttamente su un `<img>`. Il `src` viene aggiornato automaticamente con il data URL PNG ogni volta che la config cambia. Niente wrapper, niente classi proprie: l'elemento accetta tutti gli attributi `<img>` standard.

```html
<img [appImgRender]="imgConfig"
     (canvasChange)="canvas.set($event)"
     alt="Anteprima social"
     class="img-fluid rounded">
```

```typescript
readonly imgConfig: ImgRenderConfig = {
    text: 'Il titolo del post',
    renderMode: 'fixedRatio',
    ratio: '16:9',
    maxWidth: 1200,
    bgColor: '#1f40ff',
    textColor: '#ffffff',
    fontSize: 48,
};

// Canvas raw per pilotare download/share dall'esterno della directive
readonly canvas = signal<HTMLCanvasElement | null>(null);
```

- **Output `canvasChange`**: emette il `HTMLCanvasElement` raw per pilotare `share.downloadCanvas()` da altri rami del template
- **SSR-safe**: `src = null` server-side → il browser mostra `alt`
- **Race condition**: token monotono evita che render asincroni sovrapposti mostrino un'immagine obsoleta
- **Selector vincolato**: `img[appImgRender]` → errore TypeScript a compile-time su elementi diversi da `<img>`

### `img[appQrContent]`: Rendering QR Code

Applica `QrCodeService` direttamente su un `<img>`. Il `src` viene aggiornato automaticamente con il blob URL del QR generato.

```html
<img [appQrContent]="qrConfig"
     (blobChange)="qrBlob.set($event)"
     (errorChange)="qrError.set($event)"
     alt="QR Code WhatsApp"
     class="img-fluid">

@if (qrError()) {
    <div class="alert alert-danger">{{ qrError() }}</div>
}
<button [disabled]="!qrBlob()" (click)="downloadQr()">Scarica QR</button>
```

```typescript
readonly qrConfig: QrConfig = { type: 'whatsapp', phone: '+393331234567', text: 'Ciao!' };

readonly qrBlob  = signal<Blob | null>(null);
readonly qrError = signal<string | null>(null);

downloadQr() {
    const b = this.qrBlob();
    if (b) this.share.downloadBlob(b, 'qr-whatsapp.png');
}
```

- **Output `blobChange`**: blob raw per `share.downloadBlob()` / `share.shareText()`
- **Output `errorChange`**: messaggio localizzato (o `null` se generazione ok)
- **SSR-safe**: `src = null` server-side
- **Selector vincolato**: `img[appQrContent]` → errore TypeScript a compile-time su elementi diversi da `<img>`

---

## 🖱️ `[appContextMenu]`: Menu Contestuale

La directive `ContextMenuDirective` aggiunge un menu contestuale a qualsiasi elemento. Su desktop apre un popover sotto il cursore; su mobile/touch apre un bottom sheet a tutta larghezza.

```html
<div [appContextMenu]="menuOptions" class="item-card p-3">
    Contenuto (click destro / tieni premuto su mobile)
</div>
```

```typescript
readonly menuOptions: ContextMenuOption[] = [
    { label: 'Copia link',  icon: 'fa-solid fa-copy',        action: () => this.copyLink() },
    { label: 'Condividi',   icon: 'fa-solid fa-share-nodes',  action: () => this.shareItem() },
    { separator: true },
    { label: 'Elimina',     icon: 'fa-solid fa-trash',        action: () => this.deleteItem() },
];
```

### Interfaccia `ContextMenuOption`

| Campo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `label` | `string` | Testo della voce |
| `action` | `() => void` | Callback al click (opzionale) |
| `icon` | `string` | Classe FontAwesome (es. `'fa-solid fa-copy'`) |
| `disabled` | `boolean` | Voce disabilitata (mostrata ma non cliccabile) |
| `separator` | `boolean` | Inserisce un divisore visivo sopra questa voce |

### Comportamento Adattivo

| Input | Presentazione |
| :--- | :--- |
| Mouse destro (desktop, `pointer: fine`) | Popover contestuale alla posizione del cursore |
| Long-press 450 ms (touch/mobile, `pointer: coarse`) | Bottom sheet a tutta larghezza — ottimizzato per pollice |
| Tasto `Escape` | Chiude il menu |
| Click fuori dal menu | Chiude il menu |
| Focus | Ripristinato sull'elemento trigger alla chiusura |

La directive usa Pointer Events unificati (mouse, touch, penna). Un timer di sicurezza di 600 ms previene che il click sintetico post-long-press chiuda immediatamente il menu appena aperto.

---

## 🃏 Componenti Condivisi

### `app-loading`: Spinner Condizionale

Wrappa un blocco di contenuto e mostra uno spinner finché `loading` è `true`, poi proietta il contenuto. Evita di scrivere a mano la coppia `@if (loading()) { spinner } @else { ... }` in ogni pagina, ed è già accessibile (`role="status"`, `aria-live`, testo i18n per gli screen reader).

```html
<app-loading [loading]="isLoading()">
    <!-- mostrato solo quando isLoading() è false -->
    <app-identity-render [identity]="identity()" />
</app-loading>
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `loading` | `boolean` (required) | `true` → spinner; `false` → contenuto proiettato |

### `app-identity-render`: Dati Identità Completi

Visualizza un oggetto `Identity` con tutti i campi legali italiani. I campi `null`/`undefined` vengono omessi automaticamente (skip-empty). Identità `null` → non rende nulla.

```html
<app-identity-render [identity]="identity()" [showSocial]="true" />
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `identity` | `Identity \| null` (required) | L'identità da rendere (tipicamente `IdentityService.identity()`) |
| `showSocial` | `boolean` (default `false`) | Mostra le icone dei profili social del brand. Il footer lo attiva, le pagine legali no — i social sono dati d'identità, resi qui da un solo posto |
| `inColonna` | `boolean` (default `false`) | Impila le sezioni in colonna invece che affiancate |

Rende:
- **Contatti**: telefono, PEC, email, sede, rappresentante legale e orari di contatto (resi localizzati dagli orari strutturati: "lun–ven 09:00–17:00")
- **Dati societari**: P.IVA, Codice Fiscale, sede legale, registro imprese, REA, capitale sociale, versamento integrale, socio unico, stato di liquidazione, codice SDI
- **Social** (solo con `showSocial`): icone dei profili brand (dedotte dall'URL), col nome accanto, dall'`name` della voce social se presente, altrimenti dedotto dall'URL

Formattazione automatica:
- **Importi**: `Intl.NumberFormat` con locale mapping (`it` → `it-IT`, `en` → `en-GB`)
- **Booleani**: tradotti tramite chiavi i18n (`siAzione` / `noAzione`)
- **Indirizzo**: assembla `via civico` + `CAP città (provincia)` + `nazione`

Le etichette usano le chiavi `*Azienda` in `addon.{lang}.json`, tutte personalizzabili.

### `app-icon`: Badge Icona FontAwesome

Glifo FontAwesome in pastiglia con forma e animazione hover configurabili. Valori non riconosciuti per `shape`/`animation` ricadono silenziosamente sul default (coerce interno).

```html
<!-- Cerchio di default, nessuna animazione -->
<app-icon glyph="fa-brands fa-facebook" [color]="'#1877F2'" />

<!-- Quadrato con animazione lift al hover -->
<app-icon glyph="fa-solid fa-star" shape="square" animation="lift" />
```

| Input | Tipo | Valori | Default |
| :--- | :--- | :--- | :--- |
| `glyph` | `string` (required) | Qualsiasi classe FontAwesome | — |
| `color` | `string \| null` | Hex / CSS color, `null` = tema | `null` |
| `shape` | `string` | `'circle'` \| `'rounded'` \| `'square'` | `'circle'` |
| `animation` | `string` | `'lift'` \| `'shake'` \| `'none'` | `'none'` |

### `app-social-link`: Pulsante Social con Branding

Pulsante social con icona e colore brand corretti. Deduce il network dall'URL (regex sui social noti): basta passare il `value`, niente `type`. Per gli sconosciuti usa `fa-solid fa-link` (etichetta = hostname). Il `type` esplicito resta come override (utile alla galleria demo, dove l'URL è generico).

```html
<!-- Solo URL: icona dedotta (linkedin) — così una lista può avere più profili dello stesso social -->
<app-social-link [value]="'https://linkedin.com/company/acme'" [showLabel]="true" />
<!-- Override esplicito del tipo (opzionale) -->
<app-social-link type="facebook" [value]="fbUrl" />
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `value` | `string` (required) | URL (o handle) del profilo |
| `type` | `string` (opzionale) | Override del network; se omesso è dedotto dall'URL |
| `label` | `string` | Etichetta custom (default: nome network dedotto, o hostname) |
| `showLabel` | `boolean` | Mostra testo accanto all'icona (default: `false`) |

Network con branding integrato (30+): `facebook`, `instagram`, `twitter`, `linkedin`, `youtube`, `whatsapp`, `telegram`, `tiktok`, `spotify`, `discord`, `github`, `reddit`, `threads`, `google`, `snapchat`, `pinterest`, `tumblr`, `twitch`, `soundcloud`, `deezer`, `vimeo`, `dribbble`, `skype`, `mastodon`, `btc`, `amazon`, `airbnb`, `apple`, `android`, `yahoo`, `audible` e altri.

### `app-link-badge`: Link a Badge con Icona

Componente presentazionale di basso livello: un `<a>` (apre in nuova scheda) con icona-pastiglia (`app-icon`) e testo opzionale. È il template unico su cui poggiano le famiglie "Contatto" e "social" (`app-social-link`), che gli passano solo i dati senza logica propria. Usalo direttamente quando ti serve un link "a badge" generico fuori da quelle famiglie.

```html
<app-link-badge [href]="'https://example.com'" glyph="fa-solid fa-link" [text]="'Sito'" [showText]="true" />
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `href` | `string` (required) | URL di destinazione (apre in nuova scheda) |
| `glyph` | `string` (required) | Classe FontAwesome dell'icona |
| `color` | `string \| null` | Colore icona (`null` = tema) |
| `variant` | `'badge' \| 'button'` | `'badge'`: icona tonda + testo a fianco; `'button'`: pill button unico (default `'badge'`) |
| `text` | `string` | Testo visibile accanto all'icona |
| `showText` | `boolean` | Rende il testo (default `false`) |
| `ariaLabel` | `string` | Etichetta per `title`/`aria-label`, distinta dal testo |
| `fullWidth` | `boolean` | `true` → host `display: block` a tutta larghezza (default `false`, inline-block) |
| `layout` | `'responsive' \| 'row'` | Disposizione icona/testo: `'responsive'` (colonna su mobile, riga su sm+) o `'row'` (sempre riga) |
| `action` | `() => void \| Promise<void>` | Override opzionale: se presente, al click sostituisce la navigazione |

### Componenti di Azione

Famiglia di bottoni icon-first per operazioni asincrone su contenuto (testo, Blob, PDF). Tutti includono uno spinner automatico durante l'esecuzione e condividono questi input di base:

- `label` — chiave i18n per il testo del bottone (default predefinito per ogni componente)
- `showLabel` — `false` per sola icona (default), `true` per icona + testo
- `fullWidth` — `false` (default): l'host resta inline-block; `true`: l'host diventa `display: block` a tutta larghezza, così il bottone interno (`w-100`) riempie davvero il contenitore senza che il padre debba aggiungere CSS

La maggior parte richiede anche `action` (required), funzione sincrona o asincrona che produce il contenuto; fanno eccezione `app-pdf-action` (usa `config`) e `app-print-action` (nessun input di contenuto: stampa la pagina corrente).

```html
<!-- Solo icona (default) -->
<app-copy-action [action]="getMyText" />

<!-- A tutta larghezza (es. in una colonna stretta o un modale) -->
<app-copy-action [action]="getMyText" [showLabel]="true" [fullWidth]="true" />

<!-- Icona + etichetta -->
<app-copy-action [action]="getMyText" [showLabel]="true" />

<!-- Etichetta personalizzata -->
<app-copy-action [action]="getMyText" label="copiaRisultato" [showLabel]="true" />
```

#### `app-copy-action`
Copia il testo restituito da `action` negli appunti tramite `ShareService`. (`action` deve restituire `string | Promise<string>`.)

#### `app-share-action`
Condivide il contenuto tramite Web Share API (con fallback automatico a copia su browser non supportati). `action` può restituire `string`, `Blob` o `HTMLCanvasElement`: il componente smista da solo verso il canale corretto.

| Input aggiuntivo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `title` | `string` | Titolo passato alla Web Share API (default `''`) |
| `filename` | `string` | Nome file per la condivisione di `Blob`/Canvas |

#### `app-speech-action`
Legge il testo ad alta voce tramite `SpeechService`. Bottone toggle: in riproduzione mostra lo stato "stop" e si interrompe automaticamente alla distruzione del componente.

| Input aggiuntivo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `labelStop` | `string` | Chiave i18n per la label in stato "in riproduzione" (default `'speechStop'`) |

#### `app-download-action`
Scarica il `Blob` restituito da `action` con il nome file specificato. (`action` deve restituire `Blob | Promise<Blob>`.)

| Input aggiuntivo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `filename` | `string` (required) | Nome del file scaricato |

#### `app-pdf-action`
Apre o scarica un PDF. Usa `config` al posto di `action`: lavora direttamente sull'URL senza produrre un Blob in-memory. `openInTab: true` apre in nuova scheda; `false` forza il download via `fetch` (con fallback a `window.open` per PDF cross-origin senza CORS).

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `config` | `PdfActionConfig` (required) | `{ url: string; openInTab: boolean }` — URL del PDF e modalità di apertura |

#### `app-print-action`
Apre la finestra di stampa nativa del browser tramite `window.print()`. Non richiede `action`. Non è montato da nessuna parte nel template di default (niente bottone di stampa globale, vedi «Stampa/PDF» più sopra, che copre la resa senza bisogno di un bottone): usalo se un progetto vuole comunque un'affordance di stampa puntuale su una pagina specifica (es. una fattura, un articolo). Si auto-esclude sempre dalla propria stampa (`d-print-none` intrinseco): un bottone "stampa" non ha senso nel risultato stampato di se stesso.

#### `app-like-action`
Registra un apprezzamento tramite `action` (nessun contenuto prodotto o trasformato: segnala solo un evento). Bottone a stato piatto: una volta `liked`, il click è no-op (niente "togli mi piace") e il bottone resta attivo (`.active`, `aria-pressed="true"`).

| Input aggiuntivo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `liked` | `boolean` | Stato iniziale "già piaciuto" (default `false`) |

### Componenti di Contatto

Famiglia di link (`<a>` tag mascherati da bottoni) che permettono di contattare l'utente attraverso canali esterni senza eseguire logiche complesse in Angular, supportando l'apertura in nuove tab e la corretta indicizzazione SEO.

Tutti i componenti condividono le configurazioni standard:
- `config` (required) — oggetto con i parametri specifici del canale
- `label` — chiave i18n
- `showLabel` — `false` per sola icona (default)

```html
<app-mail-contact [config]="{ to: 'info@example.com', subject: 'Richiesta' }" [showLabel]="true" />
<app-whatsapp-contact [config]="{ phone: '+393331234567', text: 'Ciao!' }" />
```

#### `app-mail-contact`
Genera un link `mailto:` precompilato.

#### `app-phone-contact`
Genera un link `tel:` per chiamate dirette dal dialer.

#### `app-whatsapp-contact`
Genera un link `wa.me` per avviare una chat WhatsApp con testo precompilato.

#### `app-telegram-contact`
Genera un link `t.me` per avviare una chat Telegram.

### Aggiungere un componente d'azione (o di contatto)

Le due famiglie sopra poggiano su una base comune, `BaseActionComponent` (`core/engine/components/base/base-action.component.ts`, Engine), che incarna il principio dei componenti autonomi: chi usa il bottone non inietta mai un servizio, passa al massimo una funzione che produce il dato. La base centralizza la parte "sporca" una volta sola:

- gli input `label` / `showLabel` / `fullWidth` (con l'host che diventa `display: block` quando `fullWidth`);
- la traduzione della label (`displayLabel`), che ricade su `defaultLabelKey` se non passi una `label`;
- il metodo protetto `run(work)`, che gestisce il flag `loading()`, previene la doppia esecuzione (se è già in corso fa no-op), esegue il lavoro asincrono e, in caso di errore, mostra un toast `erroreImprevisto`.

Per aggiungere un tuo bottone d'azione — uno specifico del progetto, non generico abbastanza da meritare l'Engine — lo metti in `components/shared/**` (territorio tuo) e dichiari solo due cose: la chiave i18n di default e la logica dentro `run()`. Tutto il resto lo eredita dalla base dell'Engine.

```typescript
@Component({
    selector: 'app-archive-action',
    standalone: true,
    templateUrl: './archive-action.component.html',
})
export class ArchiveActionComponent extends BaseActionComponent {
    private readonly api = inject(ApiService);            // il servizio lo inietti TU, non il consumer

    readonly itemId = input.required<string>();

    // unico obbligo della base: la chiave i18n di default per label/aria-label
    protected readonly defaultLabelKey = 'archiviaAzione';

    protected onClick(): void {
        // run() pensa a loading, doppio click e toast d'errore: tu scrivi solo la logica
        void this.run(() => this.api.archive(this.itemId()));
    }
}
```

Nel template chiami `onClick()` sul bottone, leggi `displayLabel()` per il testo e `loading()` per lo spinner, esattamente come fanno `app-copy-action` o `app-pdf-action` (quest'ultimo è un buon esempio: estende la base e sovrascrive `displayLabel` per cambiare etichetta fra "apri" e "scarica"). I componenti di contatto seguono lo stesso principio ma su una base diversa, `BaseContactComponent` (`core/engine/components/base/base-contact.component.ts`, Engine): essendo link e non azioni, specializza `BaseLinkComponent` invece di gestire `run()`, e ogni canale concreto dichiara `defaultLabelKey`, `glyph`, `color` e l'`href` derivato dalla `config`.

---

## 🏗️ Script di Build: `generate-statics.ts`

Lo script sincronizza i file statici e inietta nel frontend (via `src/environments/environment.ts`) identità ed estetica del progetto: `project.name`/`project.version`, i codici lingua (`Localization`) e la sezione `site` (descrizione, tema, smoke) da `global-settings.json`. I codici lingua qui sono il seed di build (shell, fallback `pickLocaleText`, routing per-lingua); la cultura runtime (nomi nativi, giorni, formattazione) la deriva il frontend via `Intl`. La struttura e il comportamento (pagine, `shell`, `isWebApp`, `loginPage`, `legalPages`) restano in `site.ts`; il menu vive in `nav.ts`. Va eseguito ogni volta che si modifica `global-settings.json` o `site.ts` (è già nei passi `prebuild`/`prestart`; in Docker la config arriva via l'ARG `BR1_PROJECT_JSON`).

```bash
npm run generate:statics
```

### File Aggiornati

| File | Contenuto sincronizzato |
| :--- | :--- |
| `src/index.html` | `<html lang>`, `<title>`, tutti i meta OpenGraph/Twitter, favicon |
| `public/manifest.webmanifest` | `name`, `description`, `theme_color`, `background_color`, `lang`, `version` |
| `public/robots.txt` | `Allow: /` + URL sitemap. Le pagine protette **non** sono elencate (un robots.txt è pubblico e ne rivelerebbe i path): la loro non-indicizzazione è gestita a runtime dal server SSR con `X-Robots-Tag: noindex` |
| `public/llms.txt` | Indice del sito per i crawler AI (convenzione `llms.txt`): nome, descrizione, elenco pagine |
| `public/security.txt` | Contatto di sicurezza RFC 9116 (`Expires` rigenerato a ogni build); servito sul percorso canonico `/.well-known/security.txt` dal Node SSR |
| `public/theme-init.js` | Script anti-flash del tema (vedi *Tema → Anti-flash*): sincrono nel `<head>`, imposta `data-bs-theme` da `prefers-color-scheme` prima che Bootstrap carichi gli stili |
| `src/environments/environment.ts` | `defaultLang`, `availableLanguages`, `configFingerprint` — **file generato automaticamente, non modificare manualmente** |

> `sitemap.xml` NON è più generata da questo script: è un endpoint runtime (`GET /sitemap.xml`, sezione «sitemap.xml: endpoint runtime» più sotto), non un file in `public/`.

> `configFingerprint`: guardia contro un `environment.ts` non rigenerato. Uno hash (12 caratteri) delle sole sezioni identity-critiche di `global-settings.json` (`project`/`Localization`/`site`). Il Node SSR lo ricalcola al boot dal config letto a runtime e lo confronta con quello scritto nel bundle: se non coincidono stampa un warning in log, capita tipicamente lanciando `ng serve` senza passare dai pre-hook (`predev`/`prestart`), o modificando `global-settings.json` senza rilanciare `npm run generate:statics`. Non blocca l'avvio: è un segnale di dev, non un gate.

> Versionati vs solo-build: solo due output generati sono versionati come seed, `src/index.html` e `src/environments/environment.ts`, perché servono al type-check e alla build prima della prima rigenerazione (`index.html` è il documento di build, `environment.ts` è importato dal TS): lo script li tiene aggiornati e la diff si committa insieme a `global-settings.json`. Tutto ciò che finisce in `public/` (`manifest.webmanifest`, `robots.txt`, `llms.txt`, `security.txt`, `theme-init.js`, `icons/`) è solo output di build, gitignored (`public/` è ignorata per intero): viene rigenerato dal pre-hook `prebuild` e non va mai committato.

### sitemap.xml: endpoint runtime, non file statico

A differenza degli altri output di questa pagina, `sitemap.xml` non è un file generato al build: è un endpoint (`GET /sitemap.xml`, `server/routes/dynamic-sitemap.ts`), montato in `server.ts` prima dello static handler. Usa gli stessi calcoli dello script `generate-statics` (via `services/sitemap-xml.ts`, condiviso) più l'espansione delle pagine con `dynamicParams` dichiarato (campo opzionale di `LeafPageInput`, in `siteBuilder.ts`: una funzione che recupera dal backend l'albero `SlugNode[]` degli slug accettati per una rotta con `:segmenti`) — non enumerabili a build time perché il catalogo arriva da un'API. Cache in-process con TTL (default 7 giorni, env var `SITEMAP_CACHE_TTL_MS` in millisecondi): l'aggiornamento primario è la notifica on-demand dal backend (`POST /internal/revalidate-sitemap`, `SitemapNotifier`, vedi backend/README.md) dopo una scrittura su un catalogo `dynamicParams`, il TTL è solo un fallback per il caso in cui quella notifica si perda. Il consumer è quasi solo un crawler, non serve ricalcolare a ogni richiesta; richieste concorrenti durante un ricalcolo condividono la stessa promise, e se il ricalcolo fallisce ma esiste una cache scaduta si serve quella invece di un errore. `robots.txt` continua a puntare allo stesso URL (`Sitemap: <base>/sitemap.xml`), invariato.

### Icone PWA automatiche (`generate-icons.ts`)

Un secondo script, `generate-icons.ts`, deriva le icone PWA `public/icons/icon-192x192.png` e `icon-512x512.png` dall'asset `favIcon` dichiarato in `mapping.json` (ridimensiona con `sharp`, con fallback a copia se `sharp` manca). Gira in automatico negli stessi pre-hook di `generate-statics` (`prestart` / `predev` / `prebuild`), quindi non va lanciato a mano.

Il punto pratico: un solo asset, `favIcon`, alimenta tutto, favicon del sito (in `index.html`), icone dell'app installabile (PWA) e il badge sulle anteprime social generate da `/cdn-cgi/preview`. Cambi quel singolo file in `mapping.json` e si aggiornano tutti e tre.

### Variabili d'Ambiente

| Variabile | Descrizione | Fallback |
| :--- | :--- | :--- |
| `FRONTEND_BASE_URL` | URL canonico del sito (es. `https://tuodominio.it`), per gli URL assoluti `og:image` | `https://example.com` con warning |

Lingua di default e lingue supportate non sono variabili d'ambiente: lo script le ricava dalla sezione `Localization` del progetto (codici a 2 lettere). Su host/CI legge direttamente `global-settings.json`; nelle immagini Docker (dove il file non è nel build context) legge gli stessi dati da `BR1_PROJECT_JSON`, il JSON di progetto che `scripts/deploy.sh` (build locale) o la CI di release passa come build-arg. È il seed di build; i nomi nativi e i primitivi di cultura li deriva il frontend via `Intl` (`LocalizationService`).

### Esclusioni Automatiche da Sitemap e Indicizzazione

| Condizione sulla pagina | Effetto |
| :--- | :--- |
| `enabled: false` | Esclusa dalla sitemap |
| `externalUrl` presente | Esclusa dalla sitemap |
| `requiresAuth: true` | Esclusa dalla sitemap **e** marcata `noindex` dal server SSR (`X-Robots-Tag: noindex, nofollow`), senza comparire in robots.txt. Forza anche il client-render |
| `otherSEO: { noindex: true }` | Esclusa dalla sitemap **e** marcata `noindex` dal server SSR (`X-Robots-Tag: noindex, nofollow`). A differenza di `requiresAuth` la pagina resta **pubblica e SSR**: solo non indicizzabile (es. landing duplicate, thank-you) |

Le 5 pagine legali standard (privacy/cookie/termini/note legali/accessibilità, `legal/legal-pages.ts`) sono `otherSEO: { noindex: true }` di default: pagine di servizio, niente crawl budget speso su contenuti che non portano traffico. Un progetto figlio che le vuole indicizzate dichiara la pagina a mano con `otherSEO.noindex: false` (override standard, `filterManagedLegalPages`).

> Deploy non indicizzabile (staging): per un'anteprima/staging dietro lo stesso reverse proxy della produzione, imposta l'env var `SEO_NOINDEX=true` sul container Node SSR: il server emette `X-Robots-Tag: noindex, nofollow` su ogni risposta e serve un `robots.txt` dinamico `Disallow: /`. Default off → in produzione il sito resta indicizzabile. Vedi [DOCKER_README.md](../DOCKER_README.md).

### `sitemap.xml`: solo `loc` e `xhtml:link`, `<lastmod>` dove è verificabile

La sitemap emette solo `<loc>` e i blocchi `xhtml:link` (hreflang). Niente `priority`/`changefreq`: Google li ignora da anni, restano solo peso morto nel file.

Niente `<lastmod>` generico per le pagine STATICHE: una data identica su ogni URL del sito (bumpata a mano) non è un segnale che Google verifica, e comunicarla comunque rischia di far scartare il tag come inattendibile. `<lastmod>` compare solo dove è per-entità e verificabile: le pagine generate da `dynamicParams`, se il backend espone una data di modifica sul nodo FOGLIA del ramo (`SlugNode.lastModified`, YYYY-MM-DD — un nodo intermedio, es. una categoria in una rotta multi-segmento, non produce mai una entry propria). Se il nodo non la porta, `<lastmod>` viene OMESSO per quella URL invece di ricadere silenziosamente su una data generica.

### `og:updated_time`

Impostato a `project.lastModified` in `global-settings.json` (formato italiano `GG/MM/AAAA`, convertito in `YYYY-MM-DD`). La si bumpa a mano quando i contenuti cambiano davvero. Fallback alla data corrente se il campo è assente o non valido. Solo per il tag Open Graph — non alimenta più `<lastmod>` della sitemap (vedi sopra).

### `og:locale`

`og:locale` in `index.html` usa il formato regionale OpenGraph `lingua_REGIONE` (es. `it` → `it_IT`), derivato dalla `DEFAULT_LANG` via `Intl.Locale().maximize()`, coerente con il formato emesso a runtime da `PageMetaService`. Lo stesso file imposta anche `<html dir="ltr|rtl">` dalla `DEFAULT_LANG` (stessa lista statica di codici RTL usata a runtime da `TranslateService`).

---

## 📦 Bundling frontend: budget, code-splitting e i confini del builder

Il builder è `@angular/build:application` (`angular.json → architect.build.builder`): impacchetta con esbuild, ma dietro un'interfaccia dichiarativa, non c'è un `esbuild.config.*`/`webpack.config.*` da aprire ed estendere. È un confine di design, non una lacuna: le leve su cui un progetto figlio interviene stanno tutte in `angular.json`, negli stessi punti di contatto elencati nella tabella «Condivisi con punti di contatto» del [README radice](../README.md).

| Leva | Dove | Effetto |
| :--- | :--- | :--- |
| `budgets` (`configurations.production`) | `angular.json` | Soglia sul peso del bundle iniziale (`950kB` warning, `1.1MB` errore — vedi sotto per il perché di questi numeri) e per stile-per-componente (`6kB`/`10kB`). **`maximumError` è il gate anti-regressione**: solo quello fa fallire `ng build` (quindi la CI); `maximumWarning` stampa solo un avviso, il build comunque riesce |
| `allowedCommonJsDependencies` | `angular.json` | Whitelist delle dipendenze CommonJS (niente tree-shaking, altrimenti warning bloccante). Aggiungi qui una libreria di terze parti che non spedisce ESM (`qrcode` è già presente per il template) |
| `styles` / `scripts` | `angular.json` | CSS/JS globali da `node_modules` caricati prima del bundle applicativo (Bootstrap, FontAwesome, SweetAlert2 sono già qui) |
| `assets` | `angular.json` | Glob di file copiati così come sono, fuori dal bundle JS |

Budget iniziale (`950kB`): il bundle iniziale del template (senza ancora una riga di contenuto del progetto figlio) pesa ~860kB raw / ~190kB trasferiti (gzip), la cifra che conta davvero per chi visita il sito è quella trasferita, il budget di Angular CLI invece misura il peso raw. La scomposizione, dal più pesante:

| Voce | Peso raw sorgente | Nota |
| :--- | ---: | :--- |
| Bootstrap (CSS completo) | ~227kB | `bootstrap.min.css` intero, non un subset via Sass selettivo |
| Angular stesso (core/common/router/forms/platform-browser) | ~90kB gzip | Costo fisso di qualunque app Angular con questi moduli, non ottimizzabile qui |
| Font Awesome (solid + brands, classi icona) | ~72kB | Le glifi vere sono in file `.woff2` (caricati a parte, non pesano sul bundle): questo è il CSS che mappa ogni classe `.fa-*` al proprio carattere |
| SweetAlert2 (solo tema CSS) | ~5kB | Il JS della libreria è già dietro `import()` dinamico (`notification.service.ts`) → in un chunk lazy, non qui |
| Stili propri dell'Engine + CDK overlay | ~5kB | Trascurabile |

Non è un limite che cresce con le pagine del progetto figlio: quelle sono già lazy-loaded una per una (`component: () => import(...)`, vedi sotto) e non contano nel bundle iniziale, l'ho verificato costruendo sia un progetto "vuoto" sia questo template con qualche pagina in più: il numero cambia di pochi kB, non a cascata. È invece il costo fisso di includere Bootstrap e Font Awesome per intero anziché un subset: la scelta deliberata del template è di non tagliare componenti Bootstrap o icone che un progetto figlio potrebbe usare senza che l'Engine lo sappia (un sito che non usa mai `.carousel` oggi potrebbe iniziare a usarlo domani). Il budget alzato è la conseguenza onesta di quella scelta, non una toppa: se un progetto figlio arriva a `950kB` aggiungendo il proprio codice (non solo caricando il template), è il segnale reale, a quel punto ha senso alzarlo ulteriormente lì, oppure spostare quel contenuto dietro un `import()` dinamico (vedi sotto). Se invece un `ng build` pulito del template appena clonato è già vicino alla soglia, il problema è a monte, qui, non nel figlio.

Code-splitting: già automatico, segui il pattern esistente. Ogni pagina, nel suo file di area, si dichiara con `component: () => import('./.../x.component').then(m => m.XComponent)`: il router genera un chunk lazy per pagina senza altra configurazione. Per un SDK di terze parti pesante (mappe, player video, chat) applica lo stesso principio a mano, `import()` dinamico dentro il componente/servizio che lo usa, non un import statico in cima al file, così il codice entra nel bundle iniziale solo se e quando serve (e, se l'SDK scrive cookie/Web Storage, dietro il gate del consenso: vedi «Aggiungere un cookie o una voce di Web Storage», [AGENTS.md](../AGENTS.md#persistere-dati-lato-client-cookie-web-storage-consenso)).

Cosa resta fuori per scelta: chunking manuale, plugin esbuild custom o un builder alternativo (webpack, Vite) non sono seam supportati, richiederebbero sostituire `architect.build.builder`, che è scaffold del template (vince il template al merge). Se un progetto arriva davvero a un limite che budget/code-splitting/CommonJS-allowlist non risolvono, è un segnale da portare a monte (Engine), non da aggirare nel figlio.

---

## ⚙️ Server SSR: Sicurezza e Performance

### Health Check JSON

L'endpoint `/health` restituisce JSON strutturato (non una stringa generica):

```json
{ "status": "ok", "mode": "ssr", "auditPaths": ["/home", "/chi-siamo", "..."] }
```

`auditPaths` è la lista delle pagine pubbliche SSR statiche per gli audit live (nome scelto perché alimenta sia Pa11y che Lighthouse, non solo l'accessibilità). È intenzionalmente separata dalla sitemap: include le pagine `noindex`, comprese le policy legali, perché restano superficie utente da verificare con Pa11y e Lighthouse; contiene però solo la lingua di default (`Localization.DefaultLanguage`), perché le varianti-lingua di una stessa pagina condividono template e markup — cambia solo il testo tradotto — e un audit strutturale/di performance darebbe lo stesso esito in ogni lingua. Gli script la uniscono alle URL concrete di `/sitemap.xml` (anch'esse filtrate alla sola lingua di default, stesso motivo), quindi includono anche le pagine `dynamicParams` enumerate dal backend nello stack di test. Pa11y ne controlla fino a 100 (`A11Y_DYNAMIC_MAX`) e Lighthouse fino a 20 (`LIGHTHOUSE_DYNAMIC_MAX`); oltre il tetto selezionano un campione distribuito e deterministico. Pagine protette e client-only restano escluse.

### Status Code SEO-Aware

Il server imposta lo status code HTTP reale in base al path richiesto, confrontandolo con le pagine note di `site.ts`. Senza questo controllo Angular SSR risponderebbe `200` anche per le rotte che renderizzano la pagina 404 del sito (un soft 404: i crawler vedono una pagina di errore servita con esito positivo e continuano a indicizzarla).

| Path richiesto | Status HTTP restituito |
| :--- | :--- |
| Path corrispondente a una pagina dichiarata | Status originale di Angular (di norma `200`) |
| Path non corrispondente a nessuna pagina | `404 Not Found` |
| `/error/{codice}` (es. `/error/403`) | Il codice indicato (`403`) |
| `/error` | `500` |

Il body resta quello renderizzato da Angular (la pagina di errore del sito); cambia solo lo status code della risposta, così i motori di ricerca de-indicizzano correttamente gli URL inesistenti.

### Host Allowlist (HTTP 421)

Le richieste da host non autorizzati vengono rifiutate con `HTTP 421 Misdirected Request` prima di raggiungere il proxy API o l'SSR. Il controllo avviene tramite `request.hostname` dopo `app.set('trust proxy', ...)`.

```bash
NG_ALLOWED_HOSTS=tuodominio.it,www.tuodominio.it
```

Default (nessuna variabile impostata): `localhost`, `127.0.0.1`, `[::1]`, permette lo sviluppo locale senza configurazione aggiuntiva.

> Nota: `@angular/ssr` non riconosce `*` come wildcard globale (lo tratterebbe come match letterale, causando `400 Bad Request` per qualsiasi host reale). Per accettare host multipli, elencali esplicitamente separati da virgola in `NG_ALLOWED_HOSTS` (env var che ha precedenza), oppure valorizza `frontend.hostname` in `global-settings.local.json`.

### CSP Nonce Per-Request (Solo Produzione)

In produzione (`node server.mjs`), ogni risposta SSR ottiene un nonce casuale a 16 byte (base64url):
- Rimpiazza `{SCRIPT_NONCE_PLACEHOLDER}` nell'header `Content-Security-Policy`
- Angular inietta `nonce="..."` su tutti gli `<script>` inline generati in SSR
- In development (HMR attivo) viene usato `unsafe-inline` (richiesto da webpack HMR)

### Estendere la CSP (domini esterni: mappe, analytics, CDN)

La Content-Security-Policy non è hardcoded nel server: vive in [`security-headers.json`](../security-headers.json) alla radice, unica sorgente condivisa letta sia dal backend .NET sia dal Node SSR (il layer che la invia al browser, `security-headers.ts`). La default è restrittiva: `default-src 'self'`, nessun dominio esterno.

Quando integri un servizio di terze parti (tile di una mappa, analytics, font da CDN) il browser blocca le richieste finché non autorizzi il dominio nella direttiva giusta. Si modifica direttamente `security-headers.json`: è l'override eccezionale previsto dalla sua `_nota`:

| Cosa integri | Direttiva da estendere |
| :--- | :--- |
| fetch/XHR/WebSocket (API esterne, tile mappa) | `connect-src` |
| `<script>` da CDN | `script-src` (lascia intatto `{SCRIPT_NONCE_PLACEHOLDER}`) |
| Immagini da host esterni | `img-src` |
| Font da CDN (es. Google Fonts) | `font-src` (+ `style-src` per il CSS del font) |

Esempio: abilitare Mapbox:
```json
"connect-src 'self' https://api.mapbox.com https://events.mapbox.com",
"script-src 'self' {SCRIPT_NONCE_PLACEHOLDER} https://api.mapbox.com"
```

Due avvertenze: non rimuovere `{SCRIPT_NONCE_PLACEHOLDER}` da `script-src` (è ciò che l'SSR sostituisce col nonce per-request), e `security-headers.json` è un file del template, di norma si aggiorna col merge dall'upstream, e l'estensione della CSP è l'unica modifica di progetto attesa al suo interno.

### Server Fingerprinting Nascosto

`app.disable('x-powered-by')` rimuove l'header `X-Powered-By: Express` dalle risposte per rendere più difficile il fingerprinting del server.

### Trusted Proxy Headers

Il server dichiara una lista esplicita di header proxy fidati, incluso `x-forwarded-scheme` (non-standard, inviato da Nginx Proxy Manager). Senza questa configurazione, Angular SSR, ricevendo qualsiasi `X-Forwarded-*` non dichiarato, degrada silenziosamente a CSR (`index.csr.html`) invece di eseguire il rendering server-side.

### Cache Strategy per Tipo di File Statico

| Tipo di file | `Cache-Control` | Motivo |
| :--- | :--- | :--- |
| Asset con hash nel nome (JS/CSS Angular) | `public, max-age=31536000, immutable` | Il contenuto non cambia mai — l'hash nel nome garantisce unicità |
| `ngsw-worker.js`, `ngsw.json` | `no-store` | Il Service Worker deve scaricare sempre la versione più recente |
| `manifest.webmanifest` | `public, max-age=86400` | Solo con `isWebApp:true`. Con `isWebApp:false` non viene generato e il server risponde `404` (sito non installabile) |
| Traduzioni, icone, altri statici | `no-cache` | Rivalidati a ogni richiesta |
| Pagine SSR | `no-cache` | Contenuto dinamico per-request |

### Protezione Path Traversal (`/assets/legal`)

I file Markdown delle policy legali sono serviti con protezione contro path traversal:
```
GET /assets/legal/privacy.md      → OK
GET /assets/legal/../../etc/passwd → 403
GET /assets/legal/%2e%2e/secret   → 403  (anche URL-encoded)
GET /assets/legal/....//secret    → 403  (anche sequenze miste)
```
Usa `path.resolve()` + prefix check con separatore di directory (`path.sep`), più robusto di un semplice replace di `../`.

### `/assets/files` — Accesso Diretto Bloccato

```
GET /assets/files/qualsiasi-file → 404
```
I file upload devono essere richiesti tramite `/cdn-cgi/asset?id=...` per passare attraverso la pipeline di ottimizzazione, cache e controllo degli accessi.

### Streaming SSR (Zero Buffering RAM)

La risposta HTML viene inoltrata al browser senza bufferizzare in memoria:
```typescript
Readable.fromWeb(renderedResponse.body).pipe(response);
```
Il browser inizia a ricevere e parsare l'HTML prima che Angular abbia completato il rendering completo della pagina.

### Graceful Shutdown

Su `SIGTERM` / `SIGINT` (docker stop, redeploy, rollout k8s) il server smette di accettare nuove connessioni e lascia terminare quelle in volo prima di uscire (`server.close()`), con un timeout di sicurezza a 10s, nessuna richiesta troncata a metà durante un redeploy.

### Compressione gzip con eccezione SSE

Il middleware `compression` comprime di default tutte le risposte testuali (HTML SSR, JS, CSS, JSON, SVG); le immagini già compresse vengono saltate per Content-Type. La compressione vive a livello applicativo, non solo nel reverse proxy, così è garantita anche se il proxy davanti non ricomprime l'upstream.

C'è un'eccezione che il `filter` di `compression` gestisce esplicitamente: gli stream `text/event-stream` (il proxy verso `/api/notifications/stream` del campanellino) non vanno compressi. gzip bufferizza per accumulare dati prima di emettere, quindi i piccoli frame SSE non arriverebbero mai al browser in tempo reale, e il client manda comunque `Accept-Encoding: gzip`, quindi senza questa esclusione il campanellino resterebbe muto. Il filtro lascia non compresso solo l'`event-stream`; il resto usa il filtro di default. A complemento, il backend marca lo stream con `Cache-Control: no-transform` per impedire ricompressioni intermedie.

> Testare l'SSE: va verificato in un browser vero o con `curl --compressed` (che dichiara `Accept-Encoding: gzip` come il browser). Un `curl` liscio non chiede gzip e quindi non riprodurrebbe il bug della bufferizzazione, passerebbe anche con la compressione attiva, dando un falso "funziona".

### Cache Immagini su Disco (`IMAGE_CACHE_DIR`, `IMAGE_CACHE_MAX_MB`)

I thumbnail generati da `/cdn-cgi/asset` e `/cdn-cgi/preview` vengono scritti su disco per evitare di ricalcolarli a ogni richiesta. Sono dato derivato ed effimero: serviti solo dagli handler Node (l'accesso diretto a `/assets/files` è 404), mai come file statico, quindi non vivono sotto `src/assets` né nel build output.

```bash
IMAGE_CACHE_DIR=/var/cache/app-images   # default: <temp di sistema>/br1-image-cache-<hash>
IMAGE_CACHE_MAX_MB=500                   # default: 500 MB — oltre questa soglia elimina i file meno usati
```

Posizione (`IMAGE_CACHE_DIR`): senza override la cache vive in una cartella dedicata nella temp di sistema, isolata per progetto tramite un hash del percorso asset (così più siti, questo template e i suoi figli, sullo stesso host non si mischiano le immagini). Tenerla fuori da `src/assets` è ciò che evita che `ng serve` ricarichi la pagina a ogni miniatura generata in sviluppo, e che thumbnail effimeri finiscano copiati in `dist` al build. In produzione la temp è scrivibile anche col container non-root, ma è effimera: dopo un riavvio la cache parte fredda e si rigenera on-demand. Per una cache calda tra i deploy, monta un volume persistente e punta `IMAGE_CACHE_DIR` lì.

Sweep (`IMAGE_CACHE_MAX_MB`): lo sweep LRU avviene ogni 6 ore e porta la cache al 90% del cap (non al 100%) per evitare di ri-sweepare a ogni singolo thumbnail aggiunto. L'`mtime` di ogni file viene aggiornato a ogni hit, così i thumbnail realmente richiesti sopravvivono e vengono scartati solo quelli inutilizzati.

---

## Quick Start
```bash
npm install
npm run start
```
Il proxy si collegherà in automatico al backend .NET in esecuzione sulla porta di default.

> Il proxy del dev server è configurato da `proxy.local.conf.cjs` (sviluppo locale, backend su `localhost:5000`) o `proxy.docker.conf.cjs` (dev in Docker, backend sul container). Entrambi leggono la `x-api-key` dalla sorgente unica `global-settings(.local).json` tramite il modulo condiviso `proxy.api-key.cjs`.
