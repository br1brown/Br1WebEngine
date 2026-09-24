# Br1WebEngine - Frontend (Angular 21)

> 📚 Parte della documentazione di Br1WebEngine: indice e tabella "dove metto le mani" nel [README principale](../README.md). Le sezioni "Developer Journey" qui sotto sono il come passo-passo del frontend.

Benvenuto nel frontend di Br1WebEngine: un progetto Angular con sopra un livello dichiarativo, pensato per Server-Side Rendering (SSR) e Developer Experience (DX).

La complessità tipica (routing frammentato, meta tag SEO sparsi, lazy loading) è raccolta in un singolo Domain Specific Language (DSL).

---

## 🚀 Funzionalità Principali dell'Engine

### 1. `site.ts` + `pages/*.pages.ts`: Il DSL di Configurazione
Perché è utile: in Angular standard aggiungere una pagina vuol dire configurare il routing, aggiornare i menu e gestire a mano la SEO.
Cosa fa l'Engine: ogni pagina si dichiara come oggetto (path, title, component, meta) in un file di area sotto `src/app/pages/*.pages.ts`, non in `site.ts`, che assembla le aree insieme alla sezione `legal`, alla shell (design system attivo, notifiche) e agli slot login/home (è comunque il primo file da guardare: da lì si risale a tutto il resto). Da quelle dichiarazioni l'Engine genera a runtime le rotte, mostra o nasconde navbar/footer/pannello in base al `layout.role` della pagina e al design system attivo (`shell.designSystem`), e con `requiresAuth: true` spegne l'SSR della pagina e la rende lato client.

### 2. Auto-SEO Dinamica
Basta aggiungere `description` o `otherSEO` alla dichiarazione della pagina. Un resolver intercetta il cambio pagina e inietta prima del rendering i tag Head, OpenGraph e i dati strutturati.

### 3. Signals Nativo (zoneless)
Gestione dello stato locale e globale con l'API nativa `Signals` di Angular 21. Niente NgRx, niente boilerplate.

L'app è zoneless: non c'è `zone.js`, la change detection è guidata dai signal e dagli eventi gestiti da Angular (binding di template e `host`). Conseguenze pratiche:
- Aggiorna lo stato con i signal (`signal()`, `computed()`, `set/update`): la UI si rinfresca da sé.
- `setInterval`/`requestAnimationFrame` non innescano cicli: usa i timer del browser e aggiorna lo stato con i signal.
- Una callback di una libreria esterna che muta un campo non-signal va convertita in signal (o appoggiata a un signal), altrimenti la UI non reagisce.

### 4. Gestione Trasparente Privacy e Accessibilità
L'Engine inietta i meccanismi di base per l'Accessibilità (WCAG) e alcuni helper della shell già montati: un banner cookie integrato e un pulsante "torna su" (back-to-top) che compare dopo lo scroll. Non vanno istanziati né configurati.

### 5. Policy Pages Integrate
Le pagine legali le costruisce l'Engine sotto `/policy/*`, dagli slot della sezione `legal` di `site.ts` (uno per pagina standard, valorizzato con un `PageType` del progetto): Privacy obbligatoria, Cookie Policy obbligatoria se il sito usa cookie o PWA, le altre se il loro slot è valorizzato. I testi vivono in `src/assets/legal/<pagina>/` come Markdown localizzati a pezzi (`intro`, parti legate a `Features` e a `COOKIE_MAP`, `outro`); il `PolicyComponent` li mette in fila e chiude con la sezione dell'identità del sito (`GET /identity`). Dettaglio in «Pagine legali (`legal`)».

### 6. Catalogo Design System (sempre in home)
Perché è utile: chi valuta l'aspetto di un sito (un designer, un Art Director) di norma dovrebbe leggere il codice o entrare con le credenziali demo per capire che faccia ha il sistema.
Cosa fa l'Engine: `app-style-guide` (`core/engine/components/style-guide/`) è un catalogo visivo dei componenti di base (colori, tipografia, bottoni, badge, alert, form) montato nella home, visibile senza login. Mostra l'estetica corrente, cioè il risultato del design system attivo (§«Design system e tema»), e non è un design system. Vive nell'Engine e non in `components/shared/**` (Dominio, vedi «Mappa del territorio»): sopravvive a un `setup.mjs` → "parti pulito" (eject), quando il resto della demo sparisce, ed è la sezione della home pensata per un pubblico non-dev. Per lo stesso motivo le sue stringhe stanno in `basic.{lang}.json` (Engine, mai azzerato) e non in `addon.{lang}.json` (Dominio, azzerato dall'eject).

---

## 🗺️ Mappa del territorio: cosa è tuo, cosa è dell'Engine

Prima di scrivere una riga, tieni a mente una linea di confine. Ciò che vive sotto `src/app/core/engine/**` è l'Engine: lo consumi, non lo tocchi (così il motore si aggiorna dal template senza rimergiare a mano le tue modifiche). Il resto è del progetto figlio, con tre eccezioni: i preset condivisi di design system (`components/shared/design-systems/engine/`), gli stili `styles/engine/` e i cataloghi i18n `assets/i18n/basic.*.json`.

| Area | Di chi è | Cosa ci fai |
| :--- | :--- | :--- |
| `core/engine/**` | **Engine** (intoccabile) | Servizi, direttive, componenti shell, builder, server SSR, script di build, inclusa la libreria di componenti riusabili (`core/engine/components/**`: azione, contatto, social, `app-login-form`, `app-upload-form`, `app-markdown-editor`, footer, `app-icon`…). Lo consumi tramite token, signal e direttive, senza modificarlo. `app-user-nav` non è qui: è Dominio a contratto fisso, vedi riga sotto |
| `components/shared/design-systems/engine/` | **Engine** (al merge vince il template) | Gli 8 preset condivisi di design system, pronti all'uso: si estendono con `extendDesignSystem` o si copiano in un file di progetto, senza modificarli (vedi «Preset di Design System: scegliere ed estendere») |
| `site.ts` | Tuo | Il DSL del sito: assembla `PageType` dai file di area (`pages/*.pages.ts`), pagine, shell, design system attivo. È il primo file da guardare |
| `nav.ts` | Tuo | Le voci di menu (navbar/footer), risolte a runtime da `ShellNavService` (Engine) tramite l'injection token `SHELL_NAV_RESOLVER`: lo implementi tu, l'Engine lo consuma |
| `app.component.ts` / `.html` | Tuo (la **shell**) | Monta navbar, footer, cookie banner, back-to-top e smoke, e avvia `VersionCheckService.init()`. È il posto naturale per iniettare un servizio sempre attivo (es. `NotificationStreamService`) |
| `components/shared/**` (tranne `design-systems/engine/`) | Tuo | I TUOI componenti riusabili, legati al dominio del progetto (una card di prodotto, un widget specifico), o un bottone/canale in più che estende una base dell'Engine. Esempi vivi: `login-form/` estende `BaseLoginFormComponent` (Engine) con uno username visibile, vedi «Personalizzare il Login»; `user-nav/` è Dominio a contratto fisso (`navbar.component.ts` lo importa per path e nome, il corpo è libero), vedi «Componenti Pronti all'Uso»; `design-systems/example.design-system.ts` estende il preset `muro` con `extendDesignSystem` e una palette propria, vedi «Preset di Design System: scegliere ed estendere» |
| `core/services/**` | Tuo | `api.service.ts` (il client API che estendi con i tuoi endpoint), `auth.service.ts`, `cookie-registry.ts` (`COOKIE_MAP`) |
| `core/dto/**` | Tuo | I contratti dati (`session.dto.ts`, `auth.dto.ts`) allineati a mano ai record C# |
| `pages/**` | Tuo | Le schermate, ognuna estende `PageBaseComponent` |
| `styles/**` | Tuo (entry `styles.scss`) | Stili globali: parti da `styles.scss`, i tuoi partial in `styles/app/`. `styles/engine/` è dell'Engine e non si tocca |

`frontend/public/` non compare in tabella: è output di build (gitignored), rigenerato da `generate:statics` e dal build, mai scritto a mano.

Il confine non è arbitrario: `app.component.ts` (tuo) importa `FooterComponent` da `./core/engine/components/footer/...`, legge `ContestoSito.config.aspetto.smoke` e chiama `VersionCheckService`, cioè orchestra i pezzi dell'Engine montandoli nella shell, senza farne parte. Gli oggetti sotto `core/engine/**` non si modificano, si consumano (un `inject(...)`, una direttiva, un signal); il resto è codice di progetto da adattare al dominio. Quando un capitolo qui sotto dice "estendi" o "aggiungi un metodo", parla di file fuori da `core/engine/**`; quando dice "consuma" o "leggi il signal", parla dell'Engine.

---

## 📜 Le Regole del Gioco (cosa impone l'Engine)

### 1. Stabilità dei Riferimenti: `PageType`
Per ogni schermata aggiungi un identificatore a `PageType`, l'identità stabile della pagina, e usa sempre quell'ID nei link (mai l'URL), così il link resta valido anche cambiando il path. `PageType` è assemblato in `site.ts` dai file di area sotto `pages/`, uno per gruppo tematico (la demo ha `app.pages.ts`; gli ID delle pagine legali stanno direttamente in `site.ts`): ogni area resta un file breve e indipendente. Ogni area segue lo stesso pattern: un oggetto `as const` di ID stringa (prefissati per area, leggibili anche fuori da TypeScript, in query string o log) più l'array delle relative dichiarazioni pagina:
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
export const PageType = { PrivacyPolicy: 'legal.privacy', /* … */ ...AppPages, ...BlogPages } as const;
export type PageType = (typeof PageType)[keyof typeof PageType];
// ...
pages: () => [...appPagesDecl, ...blogPagesDecl],
```
Una nuova area è un file più una riga di spread; una pagina in un'area esistente è un nuovo identificatore nell'oggetto dell'area più la sua dichiarazione.

### 2. Componenti Pagina vs Componenti UI
- **`pages/`**: le schermate. Ereditano da `PageBaseComponent` per avere API, logger e traduttore senza iniezioni ridondanti.
- **`components/`**: pezzi di UI isolati. Ricevono dati tramite input.

### 3. Manipola il DOM in modo dichiarativo (compatibile con l'idratazione)
Usa binding dichiarativi (`[class.hidden]="!isVisible()"`) e Template Refs: l'accesso al DOM passa per Angular e resta valido anche in SSR.

Idratazione incrementale per le pagine lunghe: l'Engine registra già `withIncrementalHydration()` (`app.config.ts`); nelle pagine lunghe basta avvolgere le sezioni sotto la piega in un blocco `@defer (hydrate on viewport)`:

```html
@defer (hydrate on viewport) {
    <section><!-- sezione pesante sotto la piega --></section>
} @placeholder {
    <!-- scheletro Bootstrap: appare nella navigazione client, mai in SSR -->
    <section class="card placeholder-glow" aria-hidden="true" style="min-height: 320px">
        <div class="card-body"><span class="placeholder col-6"></span></div>
    </section>
}
```

Comportamento:
- **Primo caricamento (SSR):** la sezione è nell'HTML (contenuto e SEO invariati), ma il browser la idrata quando entra nel viewport: meno JavaScript eseguito all'avvio.
- **Cambio pagina lato client (SPA):** il blocco carica `on idle`, mostrando per un attimo il `@placeholder`.
- I click su una sezione non ancora idratata non vanno persi: `withEventReplay()` li riconsegna a idratazione avvenuta.

La home demo lo applica alle sezioni QR, Notifiche e Sistema.

Transizioni di pagina: i cambi pagina usano la View Transitions API del browser (`withViewTransitions()` nel router) come progressive enhancement: dissolvenza incrociata, con le parti uguali fra le due pagine (navbar, sfondo) ferme. Ogni pagina che estende `PageBaseComponent` riceve anche un fade-in d'ingresso del contenuto (`.page-fade`). Entrambe le decide il design system con `movimento` (§«Chrome del sito»): `'fermo'` le spegne tutte e due, e nessun ruolo di pagina riaccende il fade. Sotto `prefers-reduced-motion` non c'è animazione (`engine/base/_a11y.scss`); i browser senza supporto cambiano pagina senza transizione.

### 4. CSS: Bootstrap First, Custom Se Necessario
Il progetto usa Bootstrap 5.3 come sistema di design principale: per layout, tipografia, form e componenti parti dalle classi Bootstrap, e tieni il CSS custom per ciò che Bootstrap non copre.

Cosa va nel template HTML (classi Bootstrap):
- Layout e spacing (`d-flex`, `align-items-center`, `mb-3`, `gap-2`, `p-4`)
- Tipografia (`fw-bold`, `text-muted`, `small`, `h4`, `lead`)
- Form (`form-control`, `form-label`, `is-invalid`, `invalid-feedback`)
- Componenti (`card`, `alert`, `btn`, `spinner-border`, `badge`, `list-group`)
- Responsive (`col-md-6`, `d-none d-lg-block`)

Gli stili sono in SCSS, con un punto di partenza: `src/styles.scss`. Le fondamenta dell'Engine (Bootstrap compilato coi colori del design system, token, layout, accessibilità: `styles/engine/bootstrap.scss` e `styles/engine/base`) sono cablate dalla build (`angular.json → "styles"`) e caricate in ogni caso: non compaiono in `styles.scss` e non si rompono per sbaglio. A te restano `src/styles.scss` (l'entry), `src/styles/app/` (i tuoi partial, importati con `@use 'app/...'`) e lo strato opzionale dell'Engine. La scelta del font è del design system attivo (§«Font: `SystemFont` + `font.aggiuntivi`»).

In `styles.scss`:
- `@use 'engine/nav'`: strato opzionale dell'Engine per navbar/footer/dropdown. Per un menu con un tuo stile grafico, commenta questa riga e scrivi il tuo (es. in `styles/app/_nav.scss`): gli stili nav agiscono su classi globali (`.nav-link`, `.navbar .dropdown-menu`…) rese dal componente, e si ridipingono dai tuoi file. L'opt-out è a livello di CSS: il markup della navbar resta del componente Engine.
- I tuoi stili globali, gli override e le utility vanno in `styles.scss` o in partial sotto `styles/app/` importati da lì.

Riusare gli strumenti SCSS dell'Engine: grazie ai loadPaths (`angular.json → stylePreprocessorOptions.includePaths`), da qualsiasi `.scss` (globale o di componente) importi gli helper con un path stabile, senza catene `../../../`:
```scss
@use 'engine/base/lib' as lib;
@media (max-width: #{lib.$bp-md - 0.02px}) { /* mobile */ }  // breakpoint md condiviso
```
`lib` espone strumenti Sass (`$bp-md`, la funzione `required()`), nessun CSS: importarlo non duplica nulla. Per i colori nei tuoi stili usi classi e variabili di Bootstrap (§«Usare il tema nel codice»).

Nota: `src/styles/engine/` è riservato all'Engine e si aggiorna dal template, non modificarlo; i CSS di terze parti (FontAwesome, SweetAlert2) stanno in `angular.json → "styles"`, non con `@import`.

Cosa va nel file `.scss` del componente (ciò che Bootstrap non esprime):
- Posizionamento fisso con `safe-area-inset` (cookie banner, back-to-top)
- Animazioni CSS (`@keyframes`, transizioni custom)
- Effetti visivi avanzati (glassmorphism con `backdrop-filter`, gradienti complessi)
- Varianti di colore via `color-mix()` sulle variabili del tema (`--bs-*`, `--color*`)
- Layout a griglia complesso (`grid-template-rows: 0fr → 1fr` per accordion)

z-index e ombre: variabili, mai letterali. `base/_tokens.scss` definisce la scala z-index del template (`--z-cookie-banner`, `--z-fab`, `--z-skip-link`, `--z-cdk-overlay`), incastrata nei vuoti della scala Bootstrap così i widget persistenti restano sotto offcanvas e modali (che devono coprirli). Un nuovo elemento fisso usa una di queste variabili o ne aggiunge una alla scala, e resta coerente con l'ordine di sovrapposizione di Bootstrap. Stesso principio per le ombre di elevazione: `--shadowElevated` / `--shadowElevatedHover` (dal campo `elevazione` del design system).

Componenti senza CSS: il file `.scss` di un componente nasce quando serve qualcosa fra i casi sopra. Il footer, ad esempio, è fatto di classi Bootstrap nel template e non ne ha uno.

---

## 🧩 Punti di personalizzazione (estendere l'Engine senza toccarlo)

Ciò che un progetto figlio configura per fare suo il sito senza modificare l'Engine (`core/engine/**` resta intatto), raggruppato per area. Ogni paragrafo dice in breve come si attiva un seam e rimanda (vedi «…») alla sezione di dettaglio in questa pagina.

### Pagine & rotte (`pages/*.pages.ts` + `site.ts`)

Le pagine vivono nei file di area `pages/*.pages.ts` (uno per gruppo tematico, es. `app.pages.ts`): ogni area dichiara i propri ID `PageType` (stringhe prefissate, es. `app.home`) e le proprie dichiarazioni di pagina. Ciò che riguarda la singola pagina va lì, non in `site.ts`, che assembla le aree con uno spread e tiene la configurazione a livello di sito:

| Vive nel file di area (`pages/*.pages.ts`), per pagina | Vive in `site.ts`, a livello di sito |
| :--- | :--- |
| `path`, `pageType`, `title`, `component` (lazy) | `homePage` / `loginPage` (brand link, redirect auth) |
| `requiresAuth` (guard + SSR off), `renderMode` | `legal` (quali pagine legali esistono) |
| `layout` (il `role`: CHE COSA è la pagina) | `shell`: `designSystem` (tono, colori, navbar/footer/pannello e il comportamento per ruolo via `ruoloPagina`) e `showNotifications` |
| `description`, `otherSEO` (`ogImage`, `ogType`, `structuredData`, `noindex`) | `isWebApp` (l'og:image senza scritte è `og.soloSfondo` del design system, vedi «og:image generata») |
| `children` (gruppo di menu annidato, es. le `/policy/*` dell'Engine) o `externalUrl` (link esterno) | — |
| `enabled: false` (spegne la pagina ovunque in un colpo: rotta, menu, sitemap, padre incluso) | `pages`, la riga che tocca le aree, fatta di spread: `pages: () => [...appPagesDecl]` |

`children` (rotta annidata) non è `addGroup` (voce di menu annidata): sono due nidificazioni diverse, non intercambiabili. `children` in un file di area genera una vera route Angular contenitore: il nodo padre non ha `pageType` né `component` (esiste per il path condiviso), e i figli sono pagine reali sotto quel prefisso; così l'Engine costruisce `/policy/privacy`, `/policy/cookie`, ecc. `addGroup` (vedi «Navigazione Multilivello») invece non tocca il routing: raggruppa voci già esistenti sotto un dropdown/accordion nel menu, e le pagine restano ai loro path. Un esempio di `children`:
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

I link interni puntano al `PageType`, mai al path: rinominare un path è una riga nella dichiarazione (menu, footer e link continuano a funzionare), rimuovere un ID fa segnalare a TypeScript ogni punto che lo usa ancora, e gli ID restano leggibili anche fuori dal codice: query string (`?returnPageType=…`), log, messaggi d'errore del builder.

Con più lingue configurate, ogni pagina ha una variante-URL per lingua (lingua default non prefissata, le altre sì: vedi «Internazionalizzazione (i18n)» → «Lingua nell'URL»). Il `path` dichiarato nel file di area è lo stesso segmento sotto ogni prefisso (stringa, il caso di default) oppure un segmento diverso per lingua (`{ it: 'chi-siamo', en: 'about-us' }` → `/chi-siamo` e `/en/about-us`); una lingua del sito senza una propria chiave ricade sul segmento della lingua di default. Link interni, sitemap/hreflang e il selettore lingua in navbar seguono da sé il `PageType`, nessun altro punto da toccare. Vedi «Developer Journey», «Opzioni Avanzate di `site.ts`», «Navigazione Multilivello», «Ruoli di Pagina (`layout.role`)», «Pagine legali (`legal`)». Ricetta rapida: [AGENTS.md](../AGENTS.md#aggiungere-una-pagina).

### Dati a una pagina

Per passare qualcosa a una pagina ci sono quattro canali, tutti letti come input per nome: `data` statico, parametro di rotta `:x`, query `?x=` e il resolver. Per avere il contenuto già al primo render dichiara un `contentLoader` sulla pagina (`pages/*.pages.ts`, stesso posto di `dynamicParams`): il `ContentResolver` dell'Engine resta generico, non lo tocchi. La configurazione libera di progetto si legge con `inject(APP_CUSTOM)` (la sezione `Custom`), la configurazione risolta del sito con `inject(SITE_CONFIG)`. Vedi «Passare Dati a una Pagina», «Configurazione di progetto (`Custom`)», «Usare il tema nel codice» (per `SITE_CONFIG`). Ricetta rapida (tipi generati per `global-settings.json`): [AGENTS.md](../AGENTS.md#leggere-global-settingsjson-tipizzato).

### Aspetto & i18n

Il colore del brand è `colorTema` (`site.colorTema` in `global-settings.json`); il resto dell'aspetto lo decide il design system attivo (`shell.designSystem`), compilato nel CSS in build. Per validare un contrasto c'è `AppearanceService.calcContrastRatio()` (modello WCAG 2.1). Le stringhe del progetto e le sovrascritture vanno in `addon.{lang}.json`, che ha la precedenza su `basic` (Engine, mai toccato); la lingua si cambia a runtime con `TranslateService.setLanguage()`. Vedi «Design system e tema», «Usare il tema nel codice», «Internazionalizzazione (i18n)», «Lingua a Runtime».

### Servizi & componenti

Estendi il client API aggiungendo path e metodo pubblico in `api.service.ts` (con `{ silent: true }` per gestire l'errore con una UI tua); accendi le notifiche realtime con il campanellino via `shell: { showNotifications: true }`; registri un cookie o una voce di Web Storage aggiungendo una riga a `COOKIE_MAP`; adatti i DTO di sessione e login in `core/dto/` (`session.dto.ts` e `auth.dto.ts`, allineati ai record C#). Ricette rapide: [AGENTS.md](../AGENTS.md#aggiungere-un-endpoint-al-client) (endpoint), [AGENTS.md](../AGENTS.md#persistere-dati-lato-client-cookie-web-storage-consenso) (cookie/Web Storage).

Per comporre le UI riusi le direttive dichiarative (`[appPage]` per i link interni, `[appImgRender]`/`[appQrContent]` per immagini e QR generati, `[appContextMenu]` per i menu contestuali), la pipe `markdown` (sanitizzata), l'editor `app-markdown-editor` e i componenti pronti (`app-link-badge` e le famiglie azione/contatto). La PWA si attiva con `isWebApp`. Vedi «Aggiungere un Endpoint», «Errori Silenziosi per UI Custom», «NotificationStreamService», «Aggiungere voci in `COOKIE_MAP`», «DTO di Sessione e Login», «`[appPage]`», «Directive di Rendering Dichiarativo», «Editor Markdown», «Componenti di Azione», «Componenti di Contatto».

### Bundling & build (`angular.json`)

Il peso del bundle si regola con `budgets` (soglie warning/errore, già gate di `ng build`), la whitelist `allowedCommonJsDependencies` per librerie di terze parti senza ESM, e gli array `styles`/`scripts`/`assets` per CSS/JS/file globali. Il code-splitting per pagina è automatico (`component: () => import(...)`); per un SDK pesante applichi lo stesso `import()` dinamico a mano, dentro il componente che lo usa. Vedi «Bundling frontend: budget, code-splitting e i confini del builder».

---

## 🛠️ Developer Journey: Aggiungere una Pagina

Per una nuova schermata, segui questo workflow per mantenere integro e type-safe il routing dell'Engine:

1. **Registrare l'identità:** aggiungi un nuovo `PageType` nel file della sua area (`src/app/pages/*.pages.ts`); una nuova area è un nuovo file dello stesso pattern, assemblato in `src/app/site.ts`.
2. **Dichiarare la rotta:** aggiungi la dichiarazione della pagina nell'array del suo file di area (path, SEO ed eventuali guardie); `site.ts` resta invariato se l'area esiste già.
3. **Scrivere il componente:** il componente in `pages/` estende `PageBaseComponent` per ereditare i servizi dell'Engine (api, traduzioni, asset, notify e meta-tag automatici).
4. **Proteggere la pagina (opzionale):** `requiresAuth: true` nella dichiarazione della pagina (nel suo file di area) demanda all'Engine il controllo auth e il redirect.
5. **Linkare in sicurezza:** la direttiva `[appPage]="PageType.MioNuovoComponente"` nell'HTML delega al framework il calcolo della rotta.
6. **Caricare dati prima del render (opzionale):** per dati SEO-critici pronti al primo render, dichiara un `contentLoader` sulla pagina (stesso posto di `dynamicParams`, in `pages/*.pages.ts`): il `ContentResolver` dell'Engine resta generico, non lo tocchi.

> Gli snippet di codice e i pattern implementativi (le "ricette") sono in `AGENTS.md` alla radice.

#### `PageBaseComponent`: cosa eredita gratis

Estendere `PageBaseComponent<T>` dà l'accesso rapido ai servizi (`api`, `translate`, `asset`, `notify`) e due comportamenti automatici che non vanno riscritti nel componente figlio.

- SEO allineata, senza chiamare `PageMetaService` a mano: un `effect()` interno alla base aggiorna title, description e og:image a ogni cambio del contenuto risolto, incluso il cambio lingua. I meta si dichiarano nella pagina e nel `contentLoader`; l'Engine li riapplica da sé.
- Un solo caricamento per pagina: il contenuto arriva dal resolver del router (`contentByResolve`) in SSR, all'idratazione e a ogni navigazione. Il cambio lingua naviga alla rotta dell'altra lingua e il cambio di un parametro fa rieseguire il resolver: nessun ricaricamento a parte nel componente. Le GET fatte in SSR passano al browser col transfer cache di `HttpClient`, i testi legali letti da disco con `TransferState`: all'idratazione non si riscaricano.

Gli input che la base legge per te (`pageType`, `lang`, `contentByResolve`) sono `protected`: li consumi dentro il componente (es. via `pageContent()`), non li ridichiari.

Per l'URL canonico della pagina corrente (condivisioni, link assoluti, `<link rel="canonical">` custom) chiama `this.getCurrentUrl(): string`. È un wrapper che la base espone al figlio: interroga `PageMetaService`, che resta `private` all'Engine, e il componente ottiene "dove si è" senza dipendere dal servizio meta né poterne alterare lo stato.

---

## 🔐 Sistema di Autenticazione (JWT)

Il login è opzionale e si accende in `Features` di `global-settings.json` (letto a compilazione e scritto in `environment.features`), con `Security.Token.SecretKey` (`global-settings.local.json`) come requisito:
- `Features.Login`: login riservato agli amministratori. La pagina esiste ma non è linkata in navbar, e la Privacy Policy non ne parla.
- `Features.PublicLogin`: login pubblico, con link in navbar e parte `login` nella Privacy Policy. Vince su `Login`, che non serve accendere.
- Entrambi spenti: lo slot `loginPage` vale come assente e la pagina di login non viene generata, anche con la chiave presente.
- Login acceso senza `loginPage` in `site.ts` = errore al build. `Features` va scritto esattamente come da schema (chiavi note, valori `true`/`false`, mai nel `.local`): altrimenti il build si ferma.

La pagina di login è `noindex` e fuori dalla sitemap di default; `otherSEO: { noindex: false }` sulla sua dichiarazione la riporta nell'indice.

Sul frontend serve:

```typescript
// site.ts → quale pagina è il login (redirect auth); se esiste e se è in navbar lo decide Features
loginPage: PageType.Login,
```

### Proteggere una Pagina

In `pages`, imposta `requiresAuth: true` sulla pagina da proteggere. L'Engine aggiunge `renderMode: 'client'` (niente SSR per quella pagina) e attiva l'auth guard.

Cosa fa il guard con un utente non loggato (`authGuard` in `core/engine/route-guards.ts`): se in `site.ts` c'è una `loginPage`, redirige lì con i query param `returnPageType` (la pagina di partenza, per tornarci dopo il login) e `reason=auth` (la pagina di login mostra un avviso inline invece di una modale). Senza `loginPage`, resta sulla pagina corrente e mostra la modale di errore 401.

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

> `requiresAuth` protegge la rotta, non nasconde la voce di menu. Sono due cose distinte: un `addPage(PageType.AreaRiservata)` nel resolver del menu (`nav.ts`, vedi «Navigazione Multilivello») resta visibile anche a chi non è loggato (che al click finisce al login/401). Per nascondere la voce finché non si è loggati, usa `authOnly` sul builder del menu.

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

I contratti di autenticazione vivono fuori da `core/engine/**` (`src/app/core/dto/`) e sono del progetto figlio: li adatti al tuo dominio.

| DTO | File | Cos'è |
| :--- | :--- | :--- |
| `SessionInfo` | `core/dto/session.dto.ts` | Payload del claim `session` del JWT, decodificato da `AuthService`. Corrisponde al record C# `SessionInfo` (`backend/Models/SessionInfo.cs`): i due vanno tenuti in sincronia **a mano** (niente codegen). |
| `LoginRequest` / `LoginResult` | `core/dto/auth.dto.ts` | Body e risposta di `POST /auth/login`. Stesso principio: allinea i campi al backend. |

Aggiungere un campo al profilo di sessione (es. `brandColor`) è un'unica modifica coordinata: il campo nel record C# e lo stesso campo qui in `SessionInfo`.

### Componenti Pronti all'Uso

| Componente | Selector | Ruolo |
| :--- | :--- | :--- |
| `LoginFormComponent` (Engine, `core/engine/components/login-form/`) | `app-login-form` | Form riusabile (username fisso e nascosto, campo password); emette `(loggedIn)` al successo. Non cambia pagina da sé. |
| `UserNavComponent` (**Dominio a contratto fisso**, `components/shared/user-nav/`) | `app-user-nav` | Area Login/Logout nella navbar. Il link di login compare con `Features.PublicLogin`; il logout, da loggati, compare in ogni caso. Gestisce il logout con modale di conferma. `navbar.component.ts` (Engine) lo importa per path e nome fisso: template e comportamento sono liberi, path/classe/selector no. Vedi «Dominio a contratto fisso» nel README radice. |
| `UploadFormComponent` | `app-upload-form` | Componente "dumb" per drag-and-drop e selezione file (anche multipla via `[multiple]`). Emette `File[]` nativi e lascia la chiamata API al componente genitore. |
| `MarkdownEditorComponent` (Engine, `core/engine/components/markdown-editor/`) | `app-markdown-editor` | Campo di form per contenuti resi da `MarkdownPipe`: barra con scorciatoie, scrittura colorata dallo stesso lexer, anteprima reale. Dettaglio in «Editor Markdown». |

### Personalizzare il Login: `BaseLoginFormComponent`

`LoginFormComponent` (Engine) non è un blocco monolitico: la logica (form, validazione, chiamata a `AuthService.login`, mappatura dell'errore, output `loggedIn`) vive in `BaseLoginFormComponent` (`core/engine/components/base/`, un `@Directive()` astratto, stesso pattern di `BaseActionComponent`/`BaseContactComponent`). `LoginFormComponent` la estende e aggiunge il proprio template.

Un figlio che vuole un markup diverso (campi in più, layout diverso, username visibile invece che fisso a `'admin'`) non tocca l'Engine: scrive un proprio componente in `components/shared/` che estende `BaseLoginFormComponent` e dichiara il suo template; submit, validazione ed errori restano centralizzati e continuano ad aggiornarsi dal template. La demo ne contiene un esempio (sostituiscilo): `components/shared/login-form/` mostra lo username digitabile, e `pages/login/login.component.ts` lo consuma al posto della versione Engine, con lo stesso selector `app-login-form`, così il passaggio dall'uno all'altro è un cambio di import:

```typescript
// components/shared/login-form/login-form.component.ts
import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';
import { BaseLoginFormComponent } from '../../../core/engine/components/base/base-login-form.component';

@Component({
    selector: 'app-login-form',
    imports: [ReactiveFormsModule, TranslatePipe],
    templateUrl: './login-form.component.html', // il tuo markup, i tuoi campi
})
export class LoginFormComponent extends BaseLoginFormComponent {}
```

Per cambiare anche la logica (un altro endpoint, un campo aggiuntivo nel form, una validazione diversa) non estendere: il `@Directive()` non è `sealed`, ma a quel punto conviene un componente di Dominio autonomo che non estende nulla. La base serve a chi vuole un markup diverso a parità di comportamento.

### Ciclo di Vita del Token

Il token sta in `sessionStorage` (sopravvive all'F5, si azzera alla chiusura della scheda). `TokenService` (Engine, intoccabile) avvia un timer che esegue il logout allo scadere dell'`exp` del JWT, e gestisce il limite JavaScript di 24 giorni con un rescheduling ricorsivo.

> PWA e `sessionStorage`: logout silenzioso al rilancio. Su un sito con `isWebApp: true`, riaprire l'app installata dalla home screen, a seconda di OS e browser, parte in un nuovo contesto del browser (per `sessionStorage` non è la stessa "scheda"), e l'utente si ritrova sloggato senza un logout esplicito. L'Engine non ha un meccanismo che lo impedisce: una sessione che sopravviva al rilancio della PWA vuole un mezzo diverso (es. un refresh token in cookie persistente), fuori dallo scope di `TokenService`.

### Gestione Errori di Login

`AuthService.login()` traduce i codici HTTP in messaggi i18n tramite `mapLoginError()` (in `auth.service.ts`):

| Codice | Chiave i18n usata | Quando accade |
| :--- | :--- | :--- |
| `401` | `loginErroreGenerico` | Credenziali errate |
| `429` | `errore429Descrizione` | Troppi tentativi: il backend limita l'endpoint di autenticazione (`RateLimiting.Login`) |
| `503` / `404` / `0` | `loginServizioNonDisponibile` | Servizio non raggiungibile |
| qualsiasi altro | `erroreImprevisto` | Errore non classificabile |

Senza la mappatura esplicita del 429, un rate-limit sul login mostrerebbe "errore imprevisto" invece di un messaggio informativo.

---

## 🚧 Pagine di Errore

Il template include una pagina d'errore generica (`ErrorComponent`) per qualsiasi codice HTTP: 404, 403, 500, ecc. Un componente copre ogni codice: lo legge dalla rotta e risolve i testi via i18n. Il suo aspetto (navbar, footer, pannello) lo decide il ruolo `'error'` del design system attivo (§«Ruoli di Pagina (`layout.role`)»).

### Come ci si arriva

Le rotte d'errore sono generate dall'Engine (`core/engine/routing.ts`):

| Rotta | Comportamento |
| :--- | :--- |
| `**` (qualsiasi URL non riconosciuto) | redirect a `error/404` |
| `error/:errorCode` | mostra `ErrorComponent` con quel codice |
| `error` | redirect a `error/500` |
| `error/401` | redirect alla pagina di login (`loginPage`), se configurata |

Il caso `401` è speciale: un utente non autenticato non finisce su una pagina d'errore cieca ma sul login. Senza pagina di login configurata, l'`authGuard` resta sulla pagina corrente e mostra una modale di accesso negato (vedi «Sistema di Autenticazione (JWT)»).

Per mostrare un errore da codice, porta il router sulla rotta:
```typescript
this.router.navigate(['/error/403']);
```

### Personalizzare i messaggi

I testi seguono il pattern di chiavi i18n in `basic.{lang}.json`:
```
errore{codice}Titolo        // es. errore404Titolo → "Pagina non trovata"
errore{codice}Descrizione   // es. errore404Descrizione → testo esteso
```
Un nuovo codice vuole le due chiavi (es. `errore402Titolo` / `errore402Descrizione`, in `addon.{lang}.json`). Se mancano, la pagina ricade su messaggi generici (`erroreGenerico` + codice, `erroreImprevisto`) e non resta mai vuota.

### Errore di pagina vs errore di risorsa

L'Engine tiene separati due tipi di errore, con messaggi diversi di proposito:

| | Errore di **pagina** (routing) | Errore di **risorsa** (API) |
| :--- | :--- | :--- |
| Quando | L'utente va su una rotta inesistente o protetta | Una chiamata API fallisce |
| Chi lo gestisce | `ErrorComponent` | `apiErrorInterceptor` → `NotificationService.handleApiError()` |
| Esempio 404 | "Pagina non trovata" | "Risorsa non trovata" |
| Esempio 403 | "Accesso vietato alla pagina" | "Non hai privilegi su questo elemento" |

Un 404 di pagina e un 404 di una `GET` falliscono con parole adatte al contesto, non con lo stesso testo generico.

> Lato server: per le rotte `error/{code}` l'SSR restituisce anche lo status HTTP reale (es. `error/404` → `404`), non un `200`. Vedi «Server SSR: Sicurezza e Performance» → «Status Code SEO-Aware».

---

## 🔒 Consenso Cookie e Privacy (GDPR/ePrivacy)

`CookieConsentService` gestisce cookie e Web Storage con strategia "Privacy by Default": nessuna scrittura senza consenso esplicito, un'unica mappa, un'unica API (`set`/`get`/`remove`), un unico elenco in policy.

### Categorie di Consenso
- **Technical**: strettamente necessari (sessione, consenso). Esenti per legge. Mostrati con badge "Necessari", niente switch.
- **TechnicalOptional**: tecnici ma non necessari (es. Service Worker, widget opzionali). Vogliono il consenso.
- **Analytics**: tracciamento e statistiche. Vogliono il consenso.
- **Profiling**: pubblicità e profilazione. Vogliono il consenso.

Nel banner Rifiuta, Accetta e Salva scelte hanno pari evidenza (tutti `btn-primary`, come chiedono le Linee guida cookie del Garante del 10/06/2021). La X di chiusura equivale a Rifiuta tutto, e il testo del banner (`introBannerCookie`) lo dice. Ogni switch, compreso quello dei tecnici facoltativi, parte spento (CGUE, Planet49). La scelta resta valida 180 giorni: il Garante non consente di riproporre il banner prima di sei mesi. `consent_log` è l'ultima scelta salvata sul dispositivo, non un registro con valore probatorio.

### Aggiungere voci in `COOKIE_MAP`
Registra le voci in `src/app/core/services/cookie-registry.ts` per automatizzare consenso, banner e policy:

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

Una voce Analytics o Profiling accende anche la parte omonima della Privacy Policy e la parte `tracking` della Cookie Policy (vedi «Pagine legali (`legal`)»): il testo relativo va scritto in ogni lingua, o il build si ferma.

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

> ⚠️ **Niente storage diretto:** la regola ESLint `no-restricted-globals` blocca `localStorage`/`sessionStorage` fuori dal servizio. Ogni scrittura passa dal gate del consenso.

### Global Privacy Control (GPC)
- Rilevato da `navigator.globalPrivacyControl`.
- Con il segnale presente, Analytics e Profiling partono rifiutati; i tecnici non sono toccati, e una scelta già salvata dall'utente resta com'è.
- L'avviso nel banner compare per le categorie che il segnale tiene spente e nomina quelle presenti nel sito (chiavi `gpcRilevatoAnalyticsBannerCookie`, `gpcRilevatoProfilazioneBannerCookie`, `gpcRilevatoBannerCookie` per entrambe).

### Dichiarazione Cookie in Policy
La Cookie Policy mostra, dopo la sua `intro` (dopo il testo, con uno slot `markdown`), l'elenco per categorie che unisce i cookie dell'Engine (`consent_log`, e `bearerToken` quando il login è acceso, anche riservato) e quelli di `COOKIE_MAP`. Le parti di testo legate a una funzione (`login`, `form`, `analytics`…) sono in «Pagine legali (`legal`)».

### Google Consent Mode v2
Con GA4 o Ads:
1. **`src/index.html`**: aggiungi lo stub predefinito (`denied`) prima di GTM/gtag.
2. **`security-headers.override.json`**: autorizza gli script Google (vedi «Estendere la CSP»; non toccare `security-headers.json`).
3. **`cookie-registry.ts`**: censisci `_ga` e soci.
4. **`analytics.service.ts`**: un servizio di progetto con un `effect()` che chiama `gtag('consent', 'update', ...)` in base ai signal di `CookieConsentService`.

---

## 🎨 Design system e tema

Perché esiste: in un progetto Angular+Bootstrap i colori, le ombre, la presenza di navbar e footer e il font finiscono sparsi fra variabili Sass, CSS di componente e flag di pagina, e ogni ritocco rischia un contrasto illeggibile o una pagina incoerente con le altre. Qui l'aspetto del sito sta in due punti: un colore di brand in `global-settings.json` e un **design system** in `site.ts`, una funzione TypeScript che raccoglie ogni decisione estetica. L'Engine ne ricava il CSS in build, con il contrasto WCAG garantito, e nessun colore si scrive a mano nei componenti.

### Modello: un colore, un design system, CSS compilato

```json
// global-settings.json — l'unico colore d'identità
"site": { "colorTema": "#1f40ff" }
```
```typescript
// site.ts — il resto dell'aspetto
buildSite({ shell: { designSystem: demoDesignSystem } });
```

`npm run generate:statics` calcola la palette da `colorTema` e dal design system attivo (`AppearanceService.computePalette`, con gli override di `siteOverrides()`) e la scrive in `src/styles/engine/generated/_theme.scss`, soltanto dati Sass e gitignored. `src/styles/engine/bootstrap.scss` compila Bootstrap 5.3 da sorgente con quei valori, e `angular.json` carica quel file. Bootstrap è fissato a `~5.3.x` perché la compilazione da sorgente dipende dai nomi interni di Bootstrap.

La divisione dei compiti:
- **L'Engine calcola gli input** che Bootstrap si aspetta già validi, per tono chiaro e scuro: primary (fill e testo), secondario, link, testo, titoli, testo secondario, superfici (pagina, card, hover, muted, tertiary), bordo, navbar. Ognuno è tarato WCAG sulle superfici reali del tono.
- **Bootstrap deriva il resto** con le sue funzioni: varianti subtle/emphasis, hover/active dei bottoni (percentuali fisse 12/16/18/22%, un filo più morbide dei default di Bootstrap), testo sopra i fill (`color-contrast`), anelli di focus, stati attivi (checkbox, switch, range, dropdown, pills, paginazione, progress), tabelle, link.

A runtime non si scrive CSS di colore: il tono lo porta l'attributo `data-bs-theme` (§«Tono»). warning, success e danger restano quelli di Bootstrap, con le sue varianti chiare e scure: il loro significato è universale e nessun design system li cambia.

> Il tema si compila all'avvio. Con `ng serve` acceso, cambiare il design system o `colorTema` non aggiorna i colori: riavvia `npm run dev` (o rilancia `npm run generate:statics`). `AppearanceService`, che serve QR e og:image, vede subito la palette nuova, il CSS no.

### Preset di Design System: scegliere ed estendere

`shell.designSystem` riceve un `DesignSystemFactory` importato, una funzione `() => DesignSystemPreset`: nessun nome di registro, nessuna stringa. Senza design system valgono i default dell'Engine, gli stessi di `aria` (tono dall'OS, pannello chiaro, font di sistema).

Ogni design system, condiviso o di progetto, si scrive con `extendDesignSystem(base, patch)`:
- `base` è `emptyDesignSystem` (nessun campo), un preset condiviso o un altro design system;
- `patch` è un oggetto raggruppato per area (`tono`, `colori`, `navbar`…) oppure una funzione `(risolto) => patch` che riceve la base già risolta;
- dentro un gruppo la patch si fonde campo per campo con la base, anche in `colori.palette` e in ogni ruolo di `ruoloPagina`; `undefined` vale "non specificato" e lascia il valore della base; `font.aggiuntivi` (un array) sostituisce quello della base; una voce di palette ereditata resta, non si toglie.

```typescript
// components/shared/design-systems/clienteX.design-system.ts
import { extendDesignSystem, type DesignSystemFactory } from '../../../core/engine/design-system-presets';
import { muroDesignSystem } from './engine/muro.design-system';

export const clienteX: DesignSystemFactory = extendDesignSystem(muroDesignSystem, {
    colori: { palette: { bordeaux: '#d17a94', oro: '#a97d3f' } },
});
```
```typescript
// site.ts
import { clienteX } from './components/shared/design-systems/clienteX.design-system';
buildSite({ shell: { designSystem: clienteX } });
```
`clienteX` eredita da `muro` tono, superfici, navbar e font, e cambia la palette.

Contratto:
- **Tipi.** Un nome di campo sbagliato o un valore fuori elenco è un errore di `tsc`, con la patch-oggetto come con la patch-funzione (radice, gruppi, ruoli).
- **Validazione.** `validateDesignSystemPreset` gira a ogni risoluzione (in `buildSite` e in `generate:statics`) e ferma tutto con un messaggio in italiano su: valore fuori elenco (con l'elenco ammesso), booleano che non è booleano, `og.testo` che non è una funzione, `smoke.opacity` non finita o fuori da 0–1, campo sconosciuto (radice, gruppo, ruolo), `ruoloPagina.naked`, nome di palette non ammesso (§«Colori»), font non valido (§«Font: `SystemFont` + `font.aggiuntivi`»), hex non validi. Un design system nuovo non vuole uno spec dedicato: la struttura la garantisce questa validazione, e il contrasto di una palette specifica è contenuto che il progetto cambia a piacere.

**Gli 8 preset condivisi** (`components/shared/design-systems/engine/`, Engine: al merge vince il template) sono pappa pronta: si estendono con `extendDesignSystem`, o si copiano in un file di progetto in `components/shared/design-systems/` per farne un design system tuo. Non si modificano sul posto.

| Preset | Export | `tono.forza` | `tono.pannello` | Altro | Font |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Aria | `ariaDesignSystem` | segue l'OS | `'light'` (default) | nessun campo: i default dell'Engine | di sistema, non self-hosted |
| Carta | `cartaDesignSystem` | segue l'OS | `'light'` | — | `NotoSerif` |
| Lavagna | `lavagnaDesignSystem` | segue l'OS | `'dark'` | — | `LiberationMono` |
| Giorno | `giornoDesignSystem` | `'light'` | `'auto'` (default con `forza`) | — | `Roboto` |
| Notte | `notteDesignSystem` | `'dark'` | `'auto'` (default con `forza`) | — | `Roboto` |
| Lanterna | `lanternaDesignSystem` | `'dark'` | `'light'` | — | `DejaVu` |
| Ombra | `ombraDesignSystem` | `'light'` | `'dark'` | — | `DejaVu` |
| Muro | `muroDesignSystem` | `'dark'` | `'auto'` (default con `forza`) | `colori.superfici: 'fusione'` (il brand è lo sfondo, nessun pannello), `navbar.superficie: 'body'` | `LiberationSerif` |

Ogni file porta nel nome il preset (`engine/muro.design-system.ts`). La combinazione "segue l'OS + pannello del tono del sito" non ha un preset: è `tono: { pannello: 'auto' }`.

Esempi di progetto, da sostituire: `demo.design-system.ts` (il design system della demo: `carta` più navbar fissa, breadcrumb, smoke e il ruolo custom `vetrina`) e `example.design-system.ts` (`muro` più una palette `bordeaux`/`oro`).

### Mappa delle leve

Ogni campo è facoltativo; il default è quello che vale senza design system. Ogni leva è una scelta nominata, mai un numero grezzo: la traduzione in valori CSS resta dentro l'Engine ([ENGINE.md](../ENGINE.md)).

| Campo | Valori | Default | Effetto |
| :--- | :--- | :--- | :--- |
| `tono.forza` | `'light'` / `'dark'` | assente: segue l'OS | Fissa l'intero sito su un tono (§«Tono») |
| `tono.pannello` | `'light'` / `'dark'` / `'auto'` | `'light'`; `'auto'` con `tono.forza` | Tono del pannello contenuti; `'auto'` = quello del sito |
| `colori.superfici` | `'foglio'` / `'distinte'` / `'tenue'` / `'tenue-flottante'` / `'fusione'` | `'foglio'` | Quanto le superfici prendono il colore del brand, e se c'è il pannello (§«Colori») |
| `colori.sfondo` | hex | assente: dal brand | Tinta di sfondi e testo al posto del brand, contrasto garantito |
| `colori.palette` | `Record<nome, hex>` | `{}` | `secondary`/`info` sostituiscono quelli di Bootstrap, ogni altro nome aggiunge un colore |
| `movimento` | `'fermo'` / `'scatto'` / `'svelto'` / `'morbido'` | `'svelto'` | Transizione fra pagine, fade d'ingresso, animazioni di comparsa, alone dei toggle attivi |
| `elevazione` | `'piatta'` / `'sospesa'` / `'flottante'` | `'sospesa'` | Ombra di dropdown, menu contestuale, cookie banner e FAB; raggio d'angolo di dropdown e menu contestuale |
| `navbar.show` | `boolean` | `true` | `false`: nessuna navbar, su nessuna pagina |
| `navbar.fissa` | `boolean` | `false` | Navbar fissa allo scroll |
| `navbar.superficie` | `'brand'` / `'body'` | `'brand'` | Sfondo di navbar e footer: immersivo di brand o uguale alla pagina |
| `navbar.icona` | `boolean` | `true` | Icona di brand in navbar |
| `footer.show` | `boolean` | `true` | `false`: nessun footer, su nessuna pagina |
| `breadcrumb.show` | `boolean` | `false` | Breadcrumb sulle pagine (mai sulla home) |
| `breadcrumb.stile` | `'traccia'` / `'freccia'` / `'punto'` | `'traccia'` | Separatore `/`, `›`, `·` |
| `breadcrumb.maxVoci` | intero ≥ 3 o `'none'` | `4` | Oltre la soglia il percorso diventa "Home … penultimo ultimo" |
| `fab.tornaSuSoglia` | `'pronta'` / `'standard'` / `'tardiva'` | `'standard'` | Scroll (150/300/600px) oltre cui compare "torna su" |
| `fab.cookie` | `'discreto'` / `'standard'` | `'discreto'` | Dimensione del bottone che riporta il banner cookie |
| `larghezza` | `'colonna'` / `'ampio'` / `'pieno'` | `'ampio'` | Larghezza della colonna di pannello e breadcrumb |
| `badgeNotifiche` | `'numero'` / `'puntino'` | `'numero'` | Badge delle notifiche non lette: conteggio o indicatore |
| `lightboxArrotondato` | `boolean` | `true` | Angoli arrotondati sull'immagine ingrandita |
| `smoke` | `{ enable, color, opacity?, intensita? }` | spento | Effetto di particelle di sfondo (§«Effetto smoke») |
| `font.principale` | `SystemFont` o `CustomFontDef` | font di sistema | Font del sito, web e og:image (§«Font: `SystemFont` + `font.aggiuntivi`») |
| `font.aggiuntivi` | `FontChoice[]` | `[]` | Font serviti e raggiungibili da SCSS, non attivi |
| `og.soloSfondo` | `boolean` | `false` | og:image senza titolo e icona (§«og:image generata») |
| `og.testo` | `(input) => { title, subtitle, font? }` | assente | Testo e font riservati all'og:image |
| `ruoloPagina` | `Record<ruolo, SpecRuoloPagina>` | `{}` | Comportamento per ruolo di pagina (§«Ruoli di Pagina (`layout.role`)») |

Ciò che il design system risolto (default compresi) lascia spento resta spento su ogni pagina: un ruolo di pagina spegne, non riaccende.

### Tono

`tono.forza` è l'aderenza al tema del browser.
- **Assente**: il sito segue `prefers-color-scheme`. `theme-init.js` imposta `data-bs-theme` su `<html>` prima del primo paint, `AppearanceService` lo aggiorna senza reload se la preferenza cambia, e l'SSR scrive un tono iniziale (quello che il brand suggerisce, perché la preferenza OS non arriva al server) più due `<meta name="theme-color">`, chiaro e scuro.
- **`'light'` / `'dark'`**: il sito resta su quel tono in ogni fase (SSR, `theme-init.js`, runtime, nessun listener `matchMedia`) con un unico `<meta name="theme-color">`. Serve a un design a contrasto fisso, studiato per una combinazione precisa, che un OS di tono opposto romperebbe.

`tono.pannello` decide il tono del pannello contenuti (`.content-panel`), indipendente dal resto della pagina: `'light'` di default (un foglio leggibile a ogni luce), `'auto'` quando c'è `tono.forza` (sito uniforme senza dichiararlo). `'auto'` significa "il tono del sito". Un valore esplicito vince anche con `tono.forza`: un pannello chiaro in un sito scuro (`lanterna`) o viceversa (`ombra`) è una composizione voluta.

Dark mode: il CSS è compilato per `[data-bs-theme="light"]` e `[data-bs-theme="dark"]`, e cambiare tono cambia l'attributo e basta. I token sono emessi dentro quei due selettori, così un sottoalbero col proprio `data-bs-theme` (il pannello chiaro in una pagina scura) riceve i valori del suo tono, compresi l'anello di focus, le immagini di spunta/radio/switch e il cursore del range. La navbar non ha un proprio `data-bs-theme`: segue la pagina.

Gli overlay CDK (menu contestuale, lightbox, dropdown montati in `.cdk-overlay-container`) stanno fuori dal pannello e prendono il tono della pagina, non quello del pannello da cui partono.

### Colori

Il gruppo `colori` ha tre campi.

**`colori.superfici`** decide insieme quanto le superfici si avvicinano al colore del brand (la vividezza) e se c'è il pannello contenuti. Le due scelte sono legate: ogni valore è una combinazione sensata, e quella senza senso (tinta piena con un foglio sopra) non è rappresentabile.

| Valore | Vividezza | Pannello |
| :--- | :--- | :--- |
| `'foglio'` (default) | neutra, appena tinta | sì: il contenuto su un foglio sopra la superficie |
| `'distinte'` | neutra | no: il contenuto sta sulla superficie |
| `'tenue'` | a metà verso il brand | no |
| `'tenue-flottante'` | a metà verso il brand | sì: il foglio galleggia su una superficie già colorata |
| `'fusione'` | il colore del brand | no, mai: un foglio di qualunque tono annullerebbe la fusione |

Con `'distinte'`, `'tenue'` e `'fusione'` il pannello manca su tutte le pagine, qualunque ruolo. Il sito "a tinta piena" (il brand come sfondo, navbar e footer compresi, senza pannello) è il preset `muro`.

**`colori.sfondo`** (hex) sostituisce il brand come tinta di sfondi e testo: genera l'intera famiglia di superfici (base, card, hover, muted, tertiary, nei due toni), e il testo la segue. Il contrasto resta garantito.

**`colori.palette`** aggiunge colori con nome. `secondary` e `info` sostituiscono quelli di Bootstrap; ogni altro nome aggiunge un colore. Senza `secondary` il secondario è il muted del brand (calcolato con garanzia WCAG); senza `info` resta quello di Bootstrap. Il fill di un colore di palette è l'hex esatto in entrambi i toni; come testo si usa una variante resa leggibile.

```typescript
export const clienteY = extendDesignSystem(cartaDesignSystem, {
    colori: {
        sfondo: '#1b2a3a',
        palette: { secondary: '#6b7a8f', bordeaux: '#5c1a2b', oroChiaro: '#d9b86c' },
    },
});
```

Ogni nome produce i token `--color<Nome>` / `--color<Nome>Text` (il nome in PascalCase: `oroChiaro` → `--colorOroChiaro`) e, col nome in kebab-case (`oro-chiaro`), le classi `.btn-`, `.btn-outline-`, `.text-bg-`, `.bg-`, `.text-`, `.border-`, `.link-`, `.alert-`, `.list-group-item-`, `.bg-<nome>-subtle`, `.text-<nome>-emphasis`, `.border-<nome>-subtle`:
```html
<button class="btn btn-bordeaux">Prenota</button>
<div class="alert alert-oro-chiaro">Offerta del mese</div>
```

Nomi ammessi: camelCase ASCII, `^[a-z][a-zA-Z0-9]*$` (`oro`, `oroChiaro`, `blu2`). La validazione rifiuta anche:
- i colori di tema di Bootstrap tranne `secondary` e `info`, e i nomi della mappa `$colors` (`blue`, `grayDark`…);
- un nome il cui primo segmento kebab è già usato da Bootstrap dopo `.btn-`, `.text-`, `.bg-`, `.border-`, `.link-`, `.alert-` e simili (`sm`, `lg`, `center`, `top`, `bgPrimary`, `outlinePrimary`…);
- i suffissi `-rgb`, `-subtle`, `-emphasis` (`oroSubtle`);
- un nome che genererebbe una variabile `--bs-*` esistente (`borderWidth`, `focusRingColor`, `fontSansSerif`…);
- un nome che coincide, senza distinzione di maiuscole, con uno dei 22 token del tema (`navBg`, `surfaceText`…);
- due voci che producono la stessa classe o lo stesso token.

**Garanzie di contrasto (WCAG 2.1).**
- Testo, titoli, link, testo secondario e primary come testo (`--colorPrimaryFg`) sono tarati su tutte le superfici del tono: base, card, hover, muted, tertiary, con obiettivo 4.8:1; quando la tinta del brand non ci arriva su superfici vicine alla luminanza media, il ripiego è nero o bianco e la garanzia scende a 4.5:1 (AA). Il bordo delle superfici regge ≥3:1 su tutte. Sono le superfici dell'Engine, non i `bg-*-subtle` di Bootstrap: `text-muted`/`text-body-secondary` sopra un `bg-primary-subtle` scende sotto AA (nel template 3,8:1), lì il testo va in `text-primary-emphasis`, che Bootstrap deriva proprio per quel fondo. Se le superfici richieste dal design system (`colori.superfici`, `colori.sfondo`, `vividezza`) collassano su un colore solo, la palette è degenerata (testo, link e fill del primario tutti su nero o bianco) e `generate:statics` si ferma con un errore che nomina brand e superfici; gli altri ripieghi sono riassunti in una riga di avviso del build.
- Se le superfici sono così vivide che nessun colore reggerebbe su tutte, lo scarto fra di loro si riduce da sé fino a farle coincidere: la leggibilità vince sulla separazione.
- La variante emphasis di ogni colore di tema (`.text-*-emphasis`, testo degli alert) regge 4.5:1 sul proprio subtle e sulle cinque superfici; se le funzioni di Bootstrap non bastano si passa a nero o bianco, e se neanche quello basta la build emette un `@warn` con colore e tono.
- Ogni tono ha una polarità reale: con superfici vivide il tono scuro di un brand chiaro ha un fondo chiaro, e si usano le derivazioni per fondo chiaro, compresi il bordo traslucido (cornice del pannello, dropdown, modali) e l'hover dei link.
- Il primary come fill (`$primary`, bottoni, `.bg-primary`) regge 4.5:1 sulla pagina chiara; nel tono scuro si schiarisce quanto basta per staccarsi dal fondo. Come testo vale `--colorPrimaryFg`.
- Testo sopra un fill (bottoni, badge, `--color<Nome>Text`): nero o bianco, scelto da Bootstrap con `color-contrast` (soglia 4.5:1).
- success/info/warning/danger di serie come testo usano la variante emphasis (il ciano di serie di `.text-info` sul bianco farebbe 1.6:1).
- Stampa: testo, titoli, pannello e card escono neri su bianco qualunque sia il tono a schermo, link compresi; colori d'accento e bordi restano quelli del tono.

Limiti:
- Il fill di una voce di `colori.palette` è l'hex scelto, senza verifica: se non si stacca dal fondo è una scelta visibile di chi l'ha scritta. Con superfici vivide un accento simile al brand sparisce: verificalo con `AppearanceService.calcContrastRatio`.
- `.border-success/-info/-warning/-danger` restano il colore pieno di Bootstrap (un bordo non è testo, nessun contrasto garantito); primary, secondary e i colori di palette sui bordi usano la variante leggibile.
- Il testo della navbar è tarato sullo sfondo della navbar, ≥4.5:1 (con un brand scuro è bianco; il margine 4.8 non è garantito, e in dev un avviso lo segnala). Il bordo della navbar è decorativo, senza contrasto garantito.
- `bg-*-subtle`, `border-*-subtle` e `text-*-emphasis` sono una terna per colore: accoppiarne di colori diversi esce dalla garanzia.

### Chrome del sito: navbar, footer, breadcrumb, movimento

**Navbar e footer.** `navbar.show: false` e `footer.show: false` li tolgono da ogni pagina. `navbar.fissa` fissa la navbar allo scroll. `navbar.superficie` decide lo sfondo di entrambi: `'brand'` è una superficie immersiva ricavata da `colorTema` (il brand pieno se è scuro, un pastello se è chiaro; nel tono scuro un quasi-nero tinto), riconoscibile a colpo d'occhio; `'body'` usa gli stessi valori dello sfondo pagina, senza cesura fra chrome e contenuto (serve ai design system a superficie unica come `muro`). `navbar.icona: false` toglie l'icona di brand; QUALE icona mostrare lo decide `brandIcon` in `nav.ts` (vedi «Navigazione Multilivello»).

**Breadcrumb.** Spento di default. Con `breadcrumb.show: true` compare su ogni pagina tranne la home, e un ruolo lo toglie dove non serve. `breadcrumb.stile` sceglie il separatore, `breadcrumb.maxVoci` la soglia oltre cui il percorso si accorcia. Il percorso e il suo override (`resolveBreadcrumb`) sono in «`app-breadcrumb`».

**Movimento.** Un asse per ogni gesto animato: transizione fra pagine (dissolvenza incrociata, View Transitions), fade d'ingresso della pagina, animazioni di comparsa (dropdown, lightbox, menu), alone dei toggle attivi.

| `movimento` | Pagina / comparsa | Alone |
| :--- | :--- | :--- |
| `'fermo'` | spente (0s), fade e transizioni spenti anche nei ruoli | spento |
| `'scatto'` | 0.15s / 0.1s | lieve |
| `'svelto'` (default) | 0.25s / 0.15s | lieve |
| `'morbido'` | 0.45s / 0.28s | marcato |

`prefers-reduced-motion` è rispettato a prescindere dal valore.

**Elevazione, larghezza, FAB.** `elevazione` dà l'ombra a dropdown, menu contestuale, cookie banner e FAB, e il raggio d'angolo a dropdown e menu contestuale (i FAB restano tondi). `larghezza` è la colonna di pannello e breadcrumb; senza pannello il contenuto occupa l'intera riga. `fab.tornaSuSoglia` sposta la comparsa di "torna su"; `fab.cookie` dimensiona il bottone che riporta il banner cookie, a sinistra, dal lato opposto a "torna su". `badgeNotifiche` e `lightboxArrotondato` completano la chrome.

```typescript
export const istituzionale = extendDesignSystem(cartaDesignSystem, {
    navbar: { fissa: true },
    movimento: 'fermo',
    breadcrumb: { show: true, stile: 'freccia' },
    elevazione: 'piatta',
});
```

### Ruoli di Pagina (`layout.role`)

Una pagina dichiara CHE COSA è (`layout: { role }`), mai COME appare: navbar, footer, pannello, breadcrumb, smoke, fade, icona di brand e vista a tutto schermo li decide il design system attivo, per ruolo, in `ruoloPagina` (`SpecRuoloPagina`: `showNav`, `showFooter`, `showPanel`, `showBreadcrumb`, `showBrandIcon`, `showSmoke`, `pageFade`, `fitViewport`). Nessuno di questi campi esiste sulla singola pagina: per un layout diverso si cambia ruolo o si registra un ruolo nuovo.

**Regola.** Un ruolo spegne, non accende. Conta il design system risolto, default compresi: se il design system non accende una cosa, nessuna pagina la mostra. Un campo che il ruolo non nomina segue il design system.

| Campo del ruolo | Acceso soltanto se il design system risolto ha… |
| :--- | :--- |
| `showNav` | `navbar.show` (default `true`) |
| `showFooter` | `footer.show` (default `true`) |
| `showBreadcrumb` | `breadcrumb.show: true` (default `false`) |
| `showBrandIcon` | `navbar.icona` (default `true`) |
| `pageFade` | `movimento` diverso da `'fermo'` |
| `showPanel` | `colori.superfici` con pannello (`'foglio'`, `'tenue-flottante'`) |
| `showSmoke` | `smoke.enable: true` |
| `fitViewport` | nessun vincolo: lo decide il ruolo |

**Ruoli di serie.**

| Ruolo | Uso | Default dell'Engine |
| :--- | :--- | :--- |
| `'default'` | pagina di contenuto (il ruolo di una pagina senza `layout`) | i default globali del design system |
| `'legal'` | testo lungo: l'Engine lo assegna alle pagine legali generate | niente smoke (`LEGAL_CHROME_DEFAULT`), sovrascrivibile in `ruoloPagina.legal` |
| `'error'` | le rotte di errore (`routing.ts`), fuori dalla DSL delle pagine | niente pannello (`ERROR_CHROME_DEFAULT`), sovrascrivibile in `ruoloPagina.error` |
| `'naked'` | pagina nuda (landing, embed) | niente navbar, footer, pannello, breadcrumb né smoke; il fade segue `movimento`. Fisso: `ruoloPagina.naked` è un errore di validazione |

**Ruoli custom.** Un progetto registra un ruolo scrivendone la chiave in `ruoloPagina`, nella patch di `extendDesignSystem`; da lì `layout.role: '<nome>'` è valido in qualunque pagina. `PageRole` accetta qualunque stringa (con l'autocomplete sui quattro di serie): il controllo lo fa `buildSite()` al boot, che si ferma con un errore leggibile su un ruolo né di serie né registrato (conta la chiave propria: `'toString'` non è un ruolo). Un ruolo custom non eredita i default di `'error'` o `'legal'`: i campi che non nomina seguono i default globali. Per partire da uno di quei default, componilo (`ERROR_CHROME_DEFAULT` e `LEGAL_CHROME_DEFAULT` sono esportati da `design-system-presets.ts`).

```typescript
// design system di progetto
export const mioDesign = extendDesignSystem(cartaDesignSystem, {
    breadcrumb: { show: true },
    ruoloPagina: {
        legal: { showBreadcrumb: false },     // niente breadcrumb sulle policy
        mappa: { fitViewport: true },          // ruolo custom per una vista a tutto schermo
    },
});
```
```typescript
// pages/*.pages.ts — la pagina dichiara cosa è, non come appare
{ path: 'chi-siamo', pageType: PageType.About, component: () => import('./about.component').then(m => m.AboutComponent) },               // 'default'
{ path: 'landing', pageType: PageType.Landing, layout: { role: 'naked' }, component: () => import('./landing.component').then(m => m.LandingComponent) },
{ path: 'mappa', pageType: PageType.Mappa, layout: { role: 'mappa' }, component: () => import('./mappa.component').then(m => m.MappaComponent) },
```

#### Vista a tutto schermo: `fitViewport`

Per viste in cui lo scroll di pagina spezzerebbe l'esperienza (mappe, giochi, dashboard). Un ruolo con `fitViewport: true` rende il `<main>` full-bleed: niente container, padding, pannello, breadcrumb né footer, e niente smoke salvo un `showSmoke: true` nel ruolo, e una regola CSS (`.fit-viewport`) fa riempire al contenuto lo spazio sotto la navbar, senza scroll se il contenuto ci sta. La navbar resta, se il ruolo e il design system la tengono. Vale per tutte le pagine di quel ruolo: per una pagina isolata registra un ruolo custom dedicato, come `mappa` sopra.

Lato pagina serve una cosa: l'elemento radice del componente cresce con `flex-grow-1` (o `h-100`). L'Engine dà già `display: block` all'host di ogni pagina e, in full-bleed, costruisce la catena flex fino al viewport adattandosi a navbar, footer e orientamento, anche in SSR.

### Font: `SystemFont` + `font.aggiuntivi`

**`font.principale`** è il font dell'intero sito, corpo e titoli, web e og:image: una voce di `SystemFont` oppure un `CustomFontDef` scritto per intero lì dove si sceglie. Assente: il font di sistema del visitatore, senza self-hosting. Una stringa deve essere una voce vera di `SystemFont`.

`SystemFont` è un catalogo di 11 font installati nel container (`FONT_PACKAGES` in `frontend/Dockerfile`): Roboto, Noto, NotoSerif, Liberation, LiberationSerif, LiberationMono, DejaVu, DejaVuSerif, DejaVuMono, OpenSans, JetBrainsMono. Sono self-hosted: il browser riceve i file reali via `@font-face` dall'endpoint `/cdn-cgi/font/:key/:index` (`server/routes/system-font.ts`), e il rendering server delle og:image usa lo stesso file (`PreviewBuilder`, risolto per nome via fontconfig). La build Docker lo verifica: `scripts/checks/system-fonts-installed.ts` controlla che ogni faccia di ogni `SystemFont` esista su disco e che la `family` dichiarata combaci col nome letto da fontconfig (`fc-scan` e `fc-match`), e un disallineamento ferma il build.

**`font.aggiuntivi`** è un array di `FontChoice` (voci di `SystemFont` o `CustomFontDef`) serviti e raggiungibili da SCSS con `--fontFamily-<key>`, senza diventare il font del sito; estendendo un design system l'array sostituisce quello della base. Il font attivo si legge con `var(--fontFamily)`. Un font diverso sui titoli non è un campo: si registra in `font.aggiuntivi` e si scrive la regola CSS nel progetto.

```typescript
// components/shared/design-systems/con-titoli.design-system.ts (import di extendDesignSystem e cartaDesignSystem come in clienteX)
import { SystemFont } from '../../../core/engine/font-system';

export const conTitoli = extendDesignSystem(cartaDesignSystem, {
    font: {
        principale: { key: 'brand', family: 'MiaFontBrand', faces: [{ file: 'MiaFontBrand.woff2', weight: 400, style: 'normal' }] },
        aggiuntivi: [SystemFont.Roboto],   // --fontFamily-Roboto per lo SCSS di progetto
    },
});
```
```scss
// styles/app/_brand.scss
h1, h2, h3, h4, h5, h6, .h1, .h2, .h3, .h4, .h5, .h6 { font-family: var(--fontFamily-Roboto); }
```

**`CustomFontDef`**, in `font.principale` o in `font.aggiuntivi`:
- `key`: `[a-zA-Z0-9_-]+`, diversa da ogni voce di `SystemFont`, non ripetuta dentro `font.aggiuntivi`;
- `family`: non vuota, senza `"`, `\`, `;`, `{`, `}`, `<`, `>` né a capo;
- `faces`: almeno una; `file` è il nome di un file (niente cartelle, `/`, `\` o `..`) con estensione `.ttf`, `.otf`, `.woff` o `.woff2`; `weight` 400 o 700; `style` `'normal'` o `'italic'`. Di solito basta la regular: il browser sintetizza bold e italic mancanti.

**Dove stanno i file custom.** Nella cartella `fonts/` accanto a `global-settings.json`, alla radice del progetto, senza passare dal mapping degli asset.
- In produzione la cartella è un volume Docker (`BR1_FONTS_DIR`, vedi [DOCKER_README.md](../DOCKER_README.md)); il container la registra in fontconfig e rilancia `fc-cache` a ogni avvio.
- In sviluppo `start-frontend-dev.sh` (alla radice) punta `FONTS_DIR` a quella cartella. Lanciando `npm run dev` o `ng serve` direttamente, `FONTS_DIR` va impostata a mano, altrimenti il server la cerca in `frontend/fonts`.
- In dev su Windows i font di sistema (`/cdn-cgi/font/<Nome>/…`) rispondono 404: sono installati nel container, non sulla macchina di sviluppo.
- Metriche e nome interno di un font si leggono una volta per processo: dopo aver sostituito un file in `fonts/`, riavvia il server.

La `family` di un `CustomFontDef` lato web è un'etichetta che `@font-face` lega all'URL del file. Lato server fontconfig indicizza il nome interno del file: `custom-font-detect.ts` lo legge via `fc-scan` e lo usa per le og:image, così la `family` dichiarata non deve indovinarlo.

I consumer (`AppearanceService`, `server.ts`, `ImgBuilderService`, `PreviewBuilder`) leggono `ContestoSito.config.fonts`, il risultato di `resolveFonts()`, mai il design system direttamente.

### Effetto smoke

Un'animazione di particelle dietro il pannello contenuti, puramente decorativa, spenta di default.

```typescript
smoke: { enable: true, color: '#1f40ff', opacity: 0.4, intensita: 'bruma' },
```

- `color`: hex a 3, 6 o 8 cifre (alpha ammesso). `opacity`: numero finito fra 0 e 1 (default 0.5).
- `intensita`, al posto dei parametri grezzi della simulazione:

| `intensita` | Resa |
| :--- | :--- |
| `'pulviscolo'` (default) | puntini piccoli, lenti, radi |
| `'bruma'` | macchie medie, deriva moderata |
| `'nebbia'` | macchie grandi e dense |

Senza `smoke.enable: true` lo smoke non compare su nessuna pagina. Con l'effetto acceso, un ruolo che non nomina `showSmoke` lo mostra dove c'è il pannello e la vista non è full-bleed; il ruolo `'legal'` lo spegne di default, `'naked'` sempre. Con `prefers-reduced-motion` l'effetto non parte. In `aspetto.smoke` l'effetto arriva già risolto in numeri (`SmokeSettings`).

### og:image generata

Perché esiste: un'anteprima social disegnata a mano per ogni pagina non scala, e un'immagine unica per tutto il sito non dice nulla della pagina condivisa. L'Engine genera l'og:image di ogni pagina in SSR, con il titolo della pagina, i colori e il font del sito. La pagina la dichiara con `otherSEO.ogImage` (vedi «`OgImageRef`: asset statico o blob dinamico»); qui c'è come viene disegnata.

**Generazione.** Il Node SSR espone `/cdn-cgi/preview` (`server/routes/og-preview.ts`), che produce un'immagine 1200×630 in due varianti scelte dal payload, con safe-zone di 80px, favicon in alto a sinistra e testo nei due terzi superiori:
- **card testuale**, senza immagine di sfondo: favicon (senza nome app accanto: i social lo mostrano già), titolo grande a sinistra, sottotitolo opzionale su una riga con ellissi. Lo sfondo è il colore di brand nudo (`colorTema`), non toccato da palette o superfici; il testo è nero o bianco, quello col contrasto migliore (`ImgBuilderService.getReadableTextColor`);
- **con immagine**, quando il payload porta un asset: sfondo sfocato, immagine in primo piano e (salvo `og.soloSfondo`) favicon e badge con titolo e sottotitolo.

Il risultato si cacha su disco (WebP) come le miniature di `/cdn-cgi/asset`. I parametri (`title`, `subtitle`, `id`, `plain`) viaggiano nel query param `?p=` come blob AES-GCM di `PreviewCrypto` (`server/preview-crypto.server.ts`): una manomissione fa fallire la decifrazione, 403. La chiave deriva, in ordine, da `PREVIEW_CRYPTO_SECRET`, dalla API key server-side (`Security.ApiConfig.Keys[0]`) e infine da `appName:version`, pubblici entrambi: senza segreto né API key i blob sono forgiabili, e il server lo segnala nel log. L'IV è deterministico (SHA-256 del payload): lo stesso payload dà lo stesso URL, stabile e cacheable.

**Misura del testo.** Per andare a capo e dimensionare il badge, le larghezze dei caratteri si leggono dal font che disegna il testo, compreso quello di `og.testo`: ogni font di sistema e ogni font custom del catalogo, in TTF, OTF, WOFF e WOFF2 (cmap formato 4 o 12), per ASCII, Latin-1, Latin Extended-A e `– — ‘ ’ ‚ “ ” „ • … €`.
- Il testo si misura e si disegna in NFC. I caratteri invisibili contano zero (zero-width, marcatori di direzione, BOM, selettori di variante, accenti combinanti isolati); un carattere fuori tabella conta come la sua lettera base (`ǎ` come `a`), altrimenti un em pieno: nel dubbio la stima eccede, e il testo va a capo invece di uscire dal badge.
- Grassetto: con una faccia 700 in `faces` si usa il rapporto reale; senza (o con il file assente) si stima il grassetto sintetico di fontconfig; se l'unica faccia è già 700 il fattore è 1. Il regular si misura dalla faccia più vicina a 400 in stile normale, qualunque sia l'ordine di `faces` (`closestFace()` in `font-system.ts`).
- Senza font di sistema installati (dev fuori dal container, Windows) o con un font illeggibile valgono tabelle integrate, ASCII; il resto segue la regola della stima in eccesso. Un font custom illeggibile si misura come Liberation. All'avvio il log dice quale font ripiega (una riga informativa se non c'è nessun font di sistema, un warn per ogni font che ripiega, un warn col motivo per un file custom corrotto). La decompressione WOFF/WOFF2 ha un tetto di 32 MB.

**`og.soloSfondo`**: `true` mostra l'immagine di sfondo intatta, senza titolo né favicon.

#### `og.testo`: testo e font riservati all'og:image

Una funzione che riceve `{ title, subtitle, font }` (il font attivo già risolto) e restituisce `{ title, subtitle, font? }` riservati all'og:image: `<title>`, SEO e screen reader restano sul testo reale, e il resto del sito sul suo font. Serve a un font di titolazione tutto maiuscolo o con un set di glifi ridotto. Assente: titolo e sottotitolo così come sono, nel font del sito.

Il `font` restituito deve essere una voce di `SystemFont` o un font custom del catalogo (`font.principale` o `font.aggiuntivi`, riconosciuto per `key`); un valore diverso si ignora (resta il font del sito) con un avviso nel log, una volta per processo per ogni valore distinto.

```typescript
// import { type CustomFontDef } from '../../../core/engine/font-system';
const titolazione: CustomFontDef = { key: 'titolazione', family: 'MiaTitolazione', faces: [{ file: 'MiaTitolazione.woff2', weight: 400, style: 'normal' }] };

export const editoriale = extendDesignSystem(cartaDesignSystem, {
    font: { aggiuntivi: [titolazione] },
    og: { testo: ({ title, subtitle }) => ({ title: title.toUpperCase(), subtitle, font: titolazione }) },
});
```

### Usare il tema nel codice

**Nomi negli stili**, in quest'ordine:
1. **Classi di Bootstrap**: `.btn-primary`, `.text-secondary`, `.bg-body-tertiary`, `.alert-info`, `.border-primary`, `.link-<nome>`… Portano già i colori del design system nel tono in cui stanno.
2. **Variabili di Bootstrap `--bs-*`**, per un componente tuo: `--bs-body-bg`, `--bs-body-color`, `--bs-emphasis-color`, `--bs-secondary-color`, `--bs-secondary-bg`, `--bs-tertiary-bg`, `--bs-border-color`, `--bs-border-color-translucent`, `--bs-link-color`, `--bs-primary` / `--bs-primary-rgb`, `--bs-primary-bg-subtle`, `--bs-primary-text-emphasis` e le stesse per ogni colore di tema, `--bs-focus-ring-color`.
3. **Token dell'Engine `--color*`**, per i ruoli che Bootstrap non ha, un valore per tono:

| Token | Cos'è |
| :--- | :--- |
| `--colorSurface` / `--colorSurfaceHover` | Sfondo di card e pannello / hover degli elementi interattivi |
| `--colorNavBg` / `--colorNavText` / `--colorNavBorder` | Navbar e footer |
| `--colorTema` / `--colorTemaText` | Il brand esatto e il testo leggibile sopra (`.theme-bg`) |
| `--colorPrimaryFg` | Il primary come testo (obiettivo 4.8:1, garantito 4.5:1 su ogni superficie); il fill è `--bs-primary` |
| `--colorPrimaryText` / `--colorSecondaryText` | Nero o bianco sopra il fill |
| `--colorInfo` / `--colorInfoText` | Emessi in ogni caso: l'`info` di `colori.palette`, o quello di Bootstrap (`#0dcaf0`) |
| `--color<Nome>` / `--color<Nome>Text` | Un colore di `colori.palette` e il testo sopra |
| `--colorBase`, `--colorSurfaceBorder`, `--colorSurfaceText`, `--colorHeading`, `--colorMutedBg`, `--colorSubtleBg`, `--colorMutedText`, `--colorLink`, `--colorPrimary`, `--colorSecondary` | Alias dei corrispettivi `--bs-*` |
| `--focusRingColor` | Colore dell'anello di focus (il link del tono) |

```scss
.cta-speciale {
    background: var(--colorBordeaux);
    color: var(--colorBordeauxText); /* nero o bianco, leggibile */
}
```

- Ogni colore di tema (primary, secondary, ogni voce di `colori.palette`) ha per tono un **fill** (bottoni pieni, badge, `.bg-*`, `.text-bg-*`) e una **variante da testo** leggibile su ogni superficie (`.text-*`, `.border-*`, `.link-*`, testo dei `.btn-outline-*`). Con `info` in palette, `.btn-outline-info` usa la variante da testo come `.text-info`.
- I link hanno il colore link del tono anche dentro il pannello.
- `--tone-<colore>-*` e `--tone-form-*` sono meccanismo interno per tono: non usarli.
- `.card` ha sfondo `--colorSurface` e bordo del tema: è il contenitore giusto per overlay e pannelli propri (vedi «Overlay/modali custom» in [AGENTS.md](../AGENTS.md)). SweetAlert2 prende i colori dal tema (`--swal2-*` in `_bootstrap-theme.scss`, ritoccabili negli stili di progetto).
- Il pannello contenuti prende i colori dal suo `data-bs-theme` (da `tono.pannello`): sfondo `--colorSurface`, cornice `--bs-border-color-translucent`. `.panel-light` / `.panel-dark` sono agganci per stili tuoi, senza colori propri.
- `engine/base/lib` (Sass) offre `$bp-md` e la funzione `required()`.

**`AppearanceService`**, per chi disegna fuori dal CSS (canvas, QR, immagini, manifest): gli stessi colori da cui è compilato il CSS.

```typescript
private readonly theme = inject(AppearanceService);

this.theme.colorTema();          // brand esatto (--colorTema)
this.theme.colorTemaText();      // '#000000' | '#ffffff' sopra colorTema (= --colorTemaText)
this.theme.colorPrimary();       // primary, fill del tono chiaro (4.5:1 sulla pagina chiara)
this.theme.colorPrimaryText();   // testo sopra colorPrimary (= --colorPrimaryText, tono chiaro)
this.theme.colorSecondary();     // secondario, tono chiaro
this.theme.colorSecondaryText(); // testo sopra colorSecondary (= --colorSecondaryText, tono chiaro)
this.theme.themeTone();          // 'light' | 'dark', reattivo a prefers-color-scheme
this.theme.panelTone;            // tono.pannello, o null con 'auto'
```

`QrCodeService` e `ImgBuilderService` leggono `colorPrimary()`/`colorPrimaryText()` per colorare QR e immagini quando non ricevono colori espliciti.

Un riquadro che deve restare sul tono del pannello, a prescindere dalla pagina, lega `panelTone` all'attributo di Bootstrap:
```html
<div [attr.data-bs-theme]="theme.panelTone">
    <!-- contenuto sul tono di tono.pannello -->
</div>
```

Metodi statici puri, usabili anche in Node.js/SSR senza Angular:
```typescript
AppearanceService.calcContrastRatio(coloreA, coloreB); // rapporto WCAG 2.1, [1, 21]
AppearanceService.calcLuminance('#1f40ff');             // luminanza relativa, [0, 1]
AppearanceService.getReadableTextColor('#1f40ff');      // '#000000' | '#ffffff', contrasto migliore
AppearanceService.getFillTextColor('#1f40ff');          // come color-contrast() di Bootstrap
AppearanceService.hexToOklch('#1f40ff');                // [L, C, H]
AppearanceService.oklchToHex(L, C, H);                  // hex
AppearanceService.computePalette(colorTema, overrides); // palette completa (computePaletteCached con cache)
```
`getFillTextColor` segue l'algoritmo di `color-contrast()`: bianco se regge 4.5:1, altrimenti nero se regge 4.5:1, altrimenti il migliore dei due. La misura del contrasto è pubblica; la derivazione di un colore conforme resta interna al servizio. `siteOverrides(cfg)` è l'unica fonte degli override del design system per client, SSR, og:image e build.

**`SITE_CONFIG` e `aspetto`.** `inject(SITE_CONFIG)` (provider in `app.config.ts`, valore `ContestoSito.config`) restituisce la `SiteConfig` già risolta. Il design system arriva in `aspetto` (tipo `Aspetto`, prodotto da `risolviAspetto()` in `design-system-presets.ts`): stessi gruppi e nomi del design system, con ogni default applicato. Restano facoltativi quattro campi, la cui assenza è una scelta: `tono.forza`, `colori.sfondo`, `font.principale`, `og.testo`. `aspetto.smoke` è già in numeri; `ruoloPagina` non c'è (i ruoli arrivano risolti nelle rotte).

```typescript
import { SITE_CONFIG } from './core/engine/siteBuilder';

const site = inject(SITE_CONFIG);
site.aspetto.navbar.fissa;          // boolean
site.aspetto.tono.pannello;         // 'light' | 'dark' | 'auto'
site.aspetto.colori.palette;        // secondary/info e i colori in più
// valori derivati
site.aspetto.pannello;              // c'è il pannello (da colori.superfici)
site.aspetto.transizioni;           // tutto tranne movimento 'fermo'
site.aspetto.pulsazione;            // 'assente' | 'lieve' | 'marcata' (da movimento)
site.aspetto.colori.vividezza;      // 0 | 0.5 | 1 (da colori.superfici)
// fuori da aspetto
site.appName; site.version; site.colorTema;
site.fonts;                         // font risolto: stack web/server, @font-face, --fontFamily-<key>
site.legalPages;                    // le pagine legali che l'Engine genera
site.cookiePolicy;                  // PageType della Cookie Policy, o null
site.homePage; site.loginPage;      // loginPage null con il login spento in Features
site.showNotifications; site.showLoginInHeader;
```

### Anti-flash e build

Il tono giusto è in pagina prima che Angular parta, senza lampi al primo caricamento:
- **`theme-init.js`**: script sincrono nel `<head>`, referenziato con path assoluto `/theme-init.js` perché precede `<base href>`. Imposta `data-bs-theme` su `<html>` dalla preferenza OS, o dal tono forzato. Lo scrive `generate:statics` in `public/` (output di build).
- **SSR**: `app.config.server.ts` scrive il tono iniziale su `<html>` e i `<meta name="theme-color">` (dal colore di base della palette, per la barra del browser e la PWA). I colori di entrambi i toni sono già nel CSS compilato.

`npm run generate:statics` è il pre-hook di `start`, `start:docker`, `dev`, `build` e `watch` (il Dockerfile passa da `npm run build`), e genera `_theme.scss` insieme agli altri statici (vedi «Script di Build: `generate-statics.ts`»). `ng serve` lanciato a mano su un checkout pulito non trova `_theme.scss`: l'errore di Sass mostra la riga dell'import, che indica `npm run generate:statics`. Una chiave mancante in `_theme.scss` ferma la compilazione con un errore esplicito (`lib.required`), mai un ripiego silenzioso sul blu di Bootstrap. Gli script di test (`tsc-check.sh`, `theme-check.sh`) eseguono `generate:statics` da sé; in CI la generazione precede lint, tipi e test.

---

## 🔔 NotificationService: Feedback all'Utente

`NotificationService` (iniettato come `this.notify` in ogni `PageBaseComponent`) gestisce popup e toast via SweetAlert2, coi colori del tema (le `--swal2-*` in `_bootstrap-theme.scss` puntano ai token `--color*`). Per ritoccarli basta ridichiarare le `--swal2-*` negli stili del progetto.

| Metodo | Quando usarlo |
| :--- | :--- |
| `toast(msg, icon?)` | Notifica rapida in alto a destra (3 s, non bloccante). `icon`: `'success'` \| `'error'` \| `'info'` \| `'warning'` |
| `success(msg, onClose?)` | Popup di conferma operazione riuscita |
| `error(title, msg)` | Popup di errore con titolo esplicito |
| `confirm(title, text, opts?)` | Modale Sì/No → restituisce `Promise<boolean>` |
| `choose(title, text, opts?)` | Modale a 3 vie Sì/No/Annulla (rifiuto ≠ annullamento) → restituisce `Promise<'confirm' \| 'deny' \| 'cancel'>` |
| `prompt(title, label, ...)` | Modale con input testuale → restituisce `Promise<string \| null>` |
| `openLoading(msg?)` / `closeLoading()` | Spinner bloccante (es. durante un upload) |
| `promise(work, cfg?)` | Esegue un lavoro async con spinner + toast di esito; **rilancia in ogni caso** l'eccezione → `Promise<T>` |
| `validationErrors(title, errors)` | Popup con lista di errori di validazione |
| `handleApiError(status, problem, ...)` | Legge il `ProblemDetails` del backend e mostra il messaggio corretto; per i codici HTTP standard ricade sulle chiavi i18n `errore{status}Titolo` / `errore{status}Descrizione` di `basic.{lang}.json`, presenti per 400, 401, 403, 404, 405, 406, 408, 409, 410, 422, 429, 500, 501, 502, 503, 504 |

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

`NotificationStreamService` (`providedIn: 'root'`) estende per composizione il `NotificationService`: si occupa del trasporto realtime (un `EventSource` verso l'endpoint SSE dell'Engine, `/api/notifications/stream`) e per mostrare riusa ciò che `NotificationService` espone già (`toast`), senza reimplementare la UI. È il lato browser di `INotificationStream` (vedi [backend/README.md](../backend/README.md)).

Tre vincoli dello stack, rispettati by design:
- **Browser e basta**: in SSR non si connette. Si attiva quando viene iniettato in un contesto browser e **non** è auto-iniettato globalmente, così un sito avvia lo stream se gli serve. In pratica lo inietta il **campanellino**: montarlo (`shell.showNotifications: true`) avvia lo stream; senza campanellino nessuna SSE parte.
- **Zoneless-safe**: ogni evento in arrivo finisce in un `signal`, e la change detection signal-based (l'app è zoneless) se ne accorge.
- **Riconnessione e recovery**: su un blip transitorio `EventSource` resta in `CONNECTING` e si riconnette da sé, rimandando `Last-Event-ID`, e il server rimanda i messaggi persi. Su un errore *terminale* (handshake fallito, content-type errato, CORS) va in `CLOSED` e non ritenta: il servizio azzera lo stato, libera il riferimento e **riprova da sé dopo ~3s**, così lo stream riparte quando il backend torna su invece di restare morto per tutta la vita della scheda. A ogni (ri)connessione `loadHistory()` ricarica lo storico da `GET /api/notifications/history`, recuperando l'eventuale buco anche senza `Last-Event-ID` (es. caduta subito dopo l'handshake, che è senza id). I signal `connected()` e `connectionId()` riflettono lo stato corrente.

| Membro | Tipo | Cosa fa |
| :--- | :--- | :--- |
| `connect()` / `disconnect()` | metodo | Avvia/chiude lo stream (idempotenti, no-op in SSR) |
| `connectionId()` | `Signal<string \| null>` | Id di questa connessione (primo frame SSE), `null` finché non connesso. L'Engine lo allega da sé come header `X-Connection-Id` su ogni chiamata `/api` (vedi sotto) |
| `connected()` | `Signal<boolean>` | `true` mentre lo stream è attivo e l'handshake è arrivato |
| `notifications()` | `Signal<readonly StreamNotification[]>` | Storico reattivo delle notifiche ricevute (per badge / centro notifiche) |
| `unread()` | `Signal<number>` | Notifiche arrivate dal vivo non ancora viste (badge del campanellino) |
| `lastLive()` | `Signal<string>` | Testo dell'ultima notifica dal vivo, usato come regione `aria-live` |
| `on(type, handler)` / `off(type)` | metodo | Registra/rimuove la reazione per un tipo di notifica |
| `markAllRead()` | metodo | Azzera il contatore non lette (lo chiama il campanellino quando mostra il pannello) |
| `resolveText(notification)` | metodo | Risolve il testo mostrabile di una notifica (chiave i18n tradotta → `message` letterale → `type` come fallback); riusato dal campanellino |
| `clear()` | metodo | Svuota lo storico |

Notifiche non soltanto testuali: ogni notifica è `{ id, type, payload, timestamp }` con `payload` libero. Il `type` sceglie la reazione: senza handler registrato si ricade sul toast di default; con `on(type, ...)` la reazione è libera: un modale ricco (`notify.interact`), un'immagine, un link, un tuo componente pilotato da `notifications()`. Per il toast di default il payload segue il contratto i18n: `{ messageKey, messageParams?, icon }` (chiave tradotta lato client nella lingua corrente) oppure `{ message, icon }` per testo letterale. La risoluzione vive in un punto, `resolveText(notification)`, riusato anche dal campanellino.

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

Notifica mirata a chi avvia il job: `X-Connection-Id` automatico. Per notificare questa scheda a fine elaborazione il backend vuole il `connectionId` della SSE, e l'Engine lo allega da sé: `BaseApiService.build_api_Headers()` legge un holder inerte e condiviso (`NotificationConnection`) e, se valorizzato, aggiunge l'header `X-Connection-Id` su ogni chiamata `/api`. La chiamata resta quella normale, niente header a mano:

```typescript
// Il connectionId viaggia da sé: l'header X-Connection-Id è già su questa POST.
await this.api.post('/upload', body);
```

L'holder è inerte di proposito: leggerlo (lato `BaseApiService`) NON inietta il `NotificationStreamService` e non avvia alcuna SSE. Lo popola lo stream quando si connette e lo azzera quando cade. Finché nessuno avvia lo stream (campanellino non montato) resta `null`: nessun header, e il backend riceve un `connectionId` nullo e gestisce il caso (broadcast / nessun target). Lo stream resta pigro: nessuna connessione SSE non voluta, ma l'header c'è appena serve.

Le risposte sono POST, non SSE: il canale è unidirezionale (server → client), e l'utente "risponde" con una normale chiamata API (`api.post`), come nell'esempio sopra. Il giro completo è notifica ricca (SSE) → azione utente → POST → eventuale esito (SSE). Un canale bidirezionale (chat, presence) vorrebbe WebSocket/SignalR, fuori scopo qui.

Campanellino in navbar e storico: `shell.showNotifications` è opt-in (default `false`): un campanellino visibile ma mai alimentato è rumore, e si attiva (`shell: { showNotifications: true }`) quando il sito spinge notizie. Acceso, l'Engine mostra in navbar un campanellino (`NotificationBellComponent`) con badge delle non lette (`badgeNotifiche` del design system: conteggio o puntino) e pannello dello storico, alimentato dal signal `notifications()`. La sua presenza attiva lo stream (il componente inietta il servizio): di default un sito non avvia alcuna connessione SSE.

Robustezza e accessibilità: la lista client è limitata (ultime 50) e deduplicata per id, così il replay SSE alla riconnessione (vedi backend) non genera doppioni e una scheda longeva non cresce all'infinito. Una notifica senza testo (payload di `type` e basta, gestita da un handler custom) non scrive nella regione `aria-live` e non emette un toast vuoto: resta nello storico, senza far leggere stringhe tecniche allo screen reader. Lato a11y: il nome del pulsante include il conteggio non lette (`"Notifiche, 3 non lette"`), una regione `aria-live` annuncia gli arrivi dal vivo, `Esc` chiude il pannello e le voci sono una lista semantica. (Il pannello è una lista in lettura, non un menu di comandi: niente roving da tastiera in stile CDK Menu, la primitiva sbagliata qui.) Lo storico sopravvive alla sessione: a ogni (ri)connessione dello stream il servizio chiama `GET /api/notifications/history` (`loadHistory()`) e fonde i risultati per id, così il campanellino si popola anche dopo un reload, su una nuova scheda o dopo una riconnessione. Le notifiche mirate a una connessione restano effimere (fuori dallo storico server); broadcast e gruppo persistono, ed è la base per uno storico per utente col login lato server (basta registrare un `INotificationGroupResolver`, vedi backend).

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

I Blob URL vengono revocati a ogni cambio pagina, e la memoria si libera da sé.

### Due pipeline immagini: `asset.getUrl(id)` vs `api.getBlobUrl(slug)`

Due percorsi distinti portano all'URL di un'immagine ottimizzata. Si comportano in modo simile (entrambi ridimensionano e cachano lato server) ma hanno sorgenti diverse: scegli in base a dove vive l'immagine.

| | `asset.getUrl(id, width)` | `api.getBlobUrl(slug, webopt)` |
| :--- | :--- | :--- |
| Endpoint | `/cdn-cgi/asset?id=…&w=…` | `/api/blob/{slug}` |
| Identificatore | **id** dell'asset gestito | **slug** assegnato all'upload |
| Sorgente | Asset registrati in `mapping.json`, mantenuto a mano (id → nome file) | File caricati a runtime nel volume `uploads` via `uploadBlob()` |
| Quando | Immagini che fanno parte del progetto: hero, loghi, illustrazioni statiche | Contenuti caricati dagli utenti / dall'app dopo il deploy |

In breve: un'immagine già nel repo/build è un asset → `asset.getUrl('hero', 640)`. Un'immagine caricata a runtime e identificata da uno slug → `api.getBlobUrl(slug)`. Ognuno legge dalla propria sorgente: lo slug del blob dal volume `uploads`, l'id dell'asset da `mapping.json`.

Registrare un nuovo asset:
1. Copia il file immagine nella cartella indicata da `ASSETS_DIR` (default `src/assets/files/`, la stessa che `AssetService` serve via `/cdn-cgi/asset`, vedi `frontend/src/app/core/engine/server/asset-mapping.ts`).
2. Aggiungi una riga a `src/assets/mapping.json`: `"hero": "hero.jpg"` (chiave = id da usare in `asset.getUrl('hero')`/`appAsset="hero"`, valore = nome del file appena copiato).
3. Nessun comando da lanciare: il server SSR legge `mapping.json` a runtime e lo ricarica alla prima occorrenza utile se il file cambia dopo l'avvio (vale anche in `ng serve`, senza riavvio).

### Ottimizzazione Immagini Server-Side

L'endpoint `/cdn-cgi/asset` ridimensiona lato server e cacha il risultato:

```
GET /cdn-cgi/asset?id=hero&w=640
→ Legge mapping.json (asset ID → percorso fisico)
→ Ridimensiona a 640px (se la larghezza è in whitelist, mai oltre l'originale)
→ Converte in AVIF o WebP a seconda dell'header Accept del browser
→ Caches il risultato (cache key per-formato)
→ Restituisce l'immagine ottimizzata (con Vary: Accept)
```

Larghezze supportate (whitelist `ALLOWED_WIDTHS` in `core/engine/asset-config.ts`): `125, 320, 480, 512, 640, 768, 1024, 1080, 1366, 1600, 1920`.
La whitelist è anche il tetto anti-4k (max 1920) e il limite alla cardinalità della cache: una `w` arbitraria viene rifiutata, e le varianti non crescono senza limite.

Negoziazione formato: il server sceglie il formato dall'header `Accept`: un browser che dichiara `image/avif` riceve AVIF (compressione migliore a parità di qualità), gli altri WebP. Il formato fa parte della cache key e la risposta porta `Vary: Accept`, così cache/CDN intermedie non servono il formato sbagliato a un client diverso. Trasparente per il client: la directive `appAsset` non cambia.
Formati non-raster (video, PDF, SVG) sono serviti senza modifica.

### Directive `appAsset` / `appAssetHref`

Invece di costruire gli URL a mano, usa le directive dichiarative:

```html
<!-- Immagine ottimizzata (src reattivo alla width) -->
<img appAsset="hero" [appAssetWidth]="640" alt="Hero" class="img-fluid">

<!-- Link/download con href ottimizzato -->
<a [appAssetHref]="'manuale'" [appAssetWidth]="1024" download="manuale.pdf">
    Scarica manuale
</a>
```

Le directive sono type-safe: applicarle all'elemento sbagliato è un errore a compile-time.

Immagini responsive + hint moderni (per `<img>`): su ogni `<img appAsset>` la directive aggiunge `decoding="async"` e `loading="lazy"`. Per l'immagine LCP above-the-fold passa `[appAssetPriority]="true"` (diventa `loading="eager"` + `fetchpriority="high"`). Per servire la misura giusta per viewport/DPR (meno banda su mobile) valorizza `appAssetSizes`: la directive emette allora un `srcset` con tutte le larghezze della whitelist (`ALLOWED_WIDTHS`) + l'attributo `sizes`. È opt-in: senza `appAssetSizes` resta una sorgente; `appAssetWidth` (misura fissa) ha la precedenza e disattiva lo `srcset`.

```html
<!-- Responsive: il browser sceglie la larghezza in base a layout e densità schermo -->
<img appAsset="hero" appAssetSizes="100vw" [appAssetPriority]="true" alt="Hero" class="img-fluid">
<img appAsset="card" appAssetSizes="(min-width: 768px) 50vw, 100vw" alt="..." class="img-fluid">
```

Non soltanto `<img>` e `<a>`: `appAsset` accetta i tag con `src` (`img`, `video`, `audio`, `source`, `iframe`, `embed`), mentre `appAssetHref` vale su `a` e `link` (utile per un `<link rel="preload">`). `appAssetWidth` ha senso per le immagini raster: il server lo ignora per video / PDF / SVG (restituisce lo stream originale), e lasciarlo non valorizzato su quei tag è sicuro.

```html
<video appAsset="intro" controls></video>
<iframe appAsset="manuale" title="Manuale"></iframe>
<link rel="preload" as="image" [appAssetHref]="'hero'" [appAssetWidth]="1024">
```

> Sorgente: `appAsset` / `appAssetHref` lavorano con gli asset gestiti da `AssetService` (id in `mapping.json`). Per un file caricato a runtime usa il binding diretto sullo slug: `[src]="api.getBlobUrl(slug)"` / `[href]="api.getBlobUrl(slug)"`.

Lightbox su `<img appAsset>`: `[appAssetLightbox]="true"` mostra l'immagine ingrandita in un overlay (CDK Overlay, dialog ARIA-compliant, chiusura su Escape/backdrop/focus-trap) invece di portarci sopra la pagina o una nuova tab. Angoli arrotondati o no li decide `lightboxArrotondato` del design system.

```html
<img appAsset="galleria-1" appAssetWidth="640" [appAssetLightbox]="true" alt="...">
```

Per un'immagine non gestita da `AssetService` (es. un `Blob` locale, canvas/anteprima) usa `LightboxDirective` (`[appLightbox]`): l'opt-in è la presenza del `Blob`, niente flag booleano separato.

```html
<img [src]="anteprimaUrl()" [appLightbox]="anteprimaBlob()" alt="Anteprima">
```

Risoluzione dell'immagine ingrandita: `ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1]` (1920px), qualunque sia la `appAssetWidth` della miniatura che ha attivato il lightbox; un `Blob` locale è già alla sua risoluzione, senza traffico aggiuntivo. Per un asset (non un `Blob`) l'ingrandimento è in ogni caso un secondo scaricamento, mai un riuso della miniatura.

Attivazione da codice: `ImageLightboxService` (il servizio dietro entrambe le direttive) è iniettabile, con `open(source: LightboxSource, alt: string, returnFocusTo: HTMLElement)`, per un trigger diverso dall'`<img>` stesso (es. un bottone sovrapposto a un'immagine decorativa, `alt="" aria-hidden`, che non deve essere l'unica affordance accessibile per l'ingrandimento).

### Stampa/PDF

Ogni pagina è stampabile senza configurazione e senza bottone dedicato: i browser espongono già la stampa (Ctrl+P, menu, condivisione). L'Engine garantisce la resa: un `@media print` condiviso (`styles/engine/base/_print.scss`, globale) ripulisce qualunque pagina, presente e futura:
- **Via del tutto:** navbar, i FAB fissi (`app-back-to-top`, `app-cookie-banner`: icone e pulsanti di UI, mai contenuto), lo sfondo smoke.
- **Nero su bianco:** testo, titoli, pannello e card, link compresi, qualunque sia il tono a schermo (la stampa non è mai scura); colori d'accento e bordi restano quelli del tono.
- **Pannello contenuti** senza l'identità "da card" (sfondo/bordo/ombra/griglia): resta il contenuto.
- **Footer semplificato, non nascosto:** la riga di copyright/ragione sociale è un'informazione legittima su un documento stampato e resta; via l'identità estesa (indirizzo/social/orari, con l'eventuale accordion) e il menu (link non cliccabili su carta).
- **I `<details>` chiusi si espandono da sé** (es. i gruppi cookie della Cookie Policy, o un accordion FAQ in un articolo): altrimenti stamperebbero l'intestazione e basta (`AppComponent`, ascolta `matchMedia('print')`).

È anche il "formato alternativo" chiesto dalla Dichiarazione di Accessibilità. Per un bottone di stampa puntuale su una pagina specifica c'è `app-print-action` (vedi «Componenti di Azione»).

### Navigazione SPA: focus e annuncio agli screen reader

Un cambio pagina non ricarica il documento: è il router Angular a sostituire il contenuto sotto `<router-outlet>`, e il browser non sposta il focus né annuncia nulla, come farebbe con un normale link multi-pagina. Senza intervento, chi usa tastiera o screen reader resta "fermo" sul link appena attivato, dentro un contenuto ormai sostituito. L'Engine applica l'approccio duale raccomandato: `AppComponent` ascolta `NavigationEnd` (saltando il primo, quello del caricamento iniziale, dove il focus del browser va lasciato dov'è) e sposta il focus su `#main-content` (`tabindex="-1"`, focalizzabile da codice senza entrare nell'ordine di tabulazione), mentre una regione `role="status" aria-live="polite"` annuncia il nuovo titolo (`PageMetaService.announcedTitle`, lo stesso testo del `<title>`): il focus da sé non basta, perché alcune combinazioni screen reader/browser (NVDA+Firefox, VoiceOver+Safari) non lo annunciano in modo affidabile. Nessuna configurazione: vale su ogni pagina.

---

## 🌍 Internazionalizzazione (i18n)

Le traduzioni vivono in `src/assets/i18n/` (la copia in `public/` è output di build, gitignored) in due cataloghi per lingua:

| File | Ruolo |
| :--- | :--- |
| `basic.{lang}.json` | Stringhe dell'Engine: pagine di errore HTTP (`errore400Titolo`/`Descrizione` … fino al 504), azioni comuni (`clipboardCopied`, `clipboardError`, `shareError`, ecc.), login, editor Markdown (`mdEditor*`), testi generati delle pagine legali (`nav*`, `acc*`). È Engine: **non si modifica** nel progetto; una chiave nuova qui nasce con una modifica dell'Engine stesso, in *tutti* i file `basic.*.json` (`i18n-check.sh` lo verifica in CI). |
| `addon.{lang}.json` | Stringhe del **progetto**: qui vanno le chiavi personalizzate. A parità di chiave **sovrascrive** `basic` (i cataloghi sono fusi con `addon` per ultimo): il testo di una stringa dell'Engine si cambia ridefinendo la chiave qui, senza toccare `basic.*.json` |

**Aggiungere una lingua:**
1. In `global-settings.json`: `"Localization.SupportedLanguages": ["it", "en", "fr"]` (codici a 2 lettere, **sottotag lingua base**, non varianti regionali come voci distinte, vedi limite sotto). Il nome nativo ("Français") lo deriva il frontend via `Intl.DisplayNames` (`LocalizationService`), e la tendina lo prende da lì.
2. Aggiungi `basic.fr.json` e `addon.fr.json` in `src/assets/i18n/`. Il template porta i `basic` delle sue lingue (`it`, `en`) e non tocca quello di una lingua in più, che scrivi e mantieni tu: quando un merge aggiunge chiavi Engine, `i18n-check.sh` elenca quelle che mancano in `basic.fr.json`. Senza catalogo per la lingua l'intera pagina ricade sulla lingua di default, testi legali generati compresi.
3. Aggiungi `fr.md` in ogni cartella di testo legale (`src/assets/legal/<pagina>/<parte>/`) e `<markdown>.fr.md` per ogni pagina con `markdown`: il build si ferma se ne manca uno (vedi «Pagine legali (`legal`)»). Nei path legali una lingua senza chiave usa il segmento inglese.
4. `i18n-check.sh` in CI verifica che nessuna chiave manchi.
5. Nessun passo di routing: rotte, `hreflang` e sitemap per la nuova lingua si generano al prossimo `generate:statics` (vedi «Lingua nell'URL»).

Togliere una lingua: basta rimuoverla da `SupportedLanguages`. I file `basic.*.json`/`addon.*.json` della lingua tolta restano orfani e nessun controllo li guarda (limite noto): cancellali a mano.

### Lingua nell'URL: instradamento per-lingua

Con più di una lingua configurata, ogni pagina interna ha un URL per lingua: la lingua di default resta non prefissata (`/chi-siamo`), le altre hanno il prefisso del codice lingua (`/en/chi-siamo`). Con una lingua configurata il meccanismo è assente: zero route aggiuntive, zero costo, comportamento identico a un sito mono-lingua.

- **Nessun redirect automatico su Accept-Language.** Un URL non prefissato (`/`) serve in ogni caso la lingua di default, a chiunque, utente o bot. Scelta allineata alla raccomandazione di Google (*Managing Multi-Regional and Multilingual Sites*): un redirect basato sulla lingua percepita rischia di impedire a Googlebot, che di norma non invia un `Accept-Language` significativo, di scoprire e indicizzare le varianti. È anche ciò che rende affidabili le anteprime social (Telegram, WhatsApp, ecc.), che cachano l'anteprima per URL una volta. Il cambio lingua è una scelta esplicita dell'utente, dal selettore in navbar.
- **Link interni** (`[appPage]`, switch da navbar): risolvono il path nella lingua corrente; `ContestoSito.getPath(type, lang)` e `getPageInfo(type, lang)` accettano un secondo parametro lingua opzionale (default: lingua di default del sito). Il `path` dichiarato è anche per-lingua (`{ it: 'chi-siamo', en: 'about-us' }`): lo switch lingua porta sul path TRADOTTO della pagina corrente (vedi «Pagine & rotte»).
- **Cambio pagina tra lingue diverse**: `PageBaseComponent` legge `route.data.lang` (iniettato dal router insieme a `pageType`) e allinea `TranslateService`: è il punto unico "URL → stato lingua", non va replicato altrove.
- **Pagine legali**: `/policy/<segmento>` col prefisso lingua (`/en/policy/...`) e un segmento per lingua (vedi «Pagine legali (`legal`)»).

`hreflang`: con più lingue, ogni pagina emette `<link rel="alternate" hreflang="...">` per ciascuna variante + `x-default` (verso la lingua default), e la sitemap porta gli stessi riferimenti incrociati (`<xhtml:link>`) per URL, pratica raccomandata per siti multilingua URL-based. Con una lingua: nessun tag emesso, basta il `canonical`.

RTL e accessibilità: `TranslateService` imposta `<html dir="rtl|ltr">` insieme a `lang` (lista statica di codici RTL: arabo, ebraico, persiano, urdu, ecc.; `Intl.Locale.getTextInfo()` non è baseline, Firefox non lo supporta). Il language picker in navbar marca ogni voce con `[attr.lang]` sul proprio codice (WCAG 3.1.2 «Language of Parts»): uno screen reader pronuncia il nome di ogni lingua nella lingua corretta.

Limiti noti:
- I codici in `SupportedLanguages` sono sottotag lingua base: `TranslateService.normalizeBcp47()` riconduce `en-US`/`en-GB` entrambi a `en`, e due varianti regionali della stessa lingua come voci **distinte** collidono. Una singola lingua con regione (es. `pt-BR` e basta) funziona.

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

`setLanguage(lang)` carica i cataloghi della nuova lingua, aggiorna il signal `currentLang` e scrive `<html lang>`. Aggiornando `currentLang`, ogni contenuto reattivo via `httpResource` (es. `IdentityService.identity()`) si ri-fetcha da sé con il nuovo `Accept-Language`. Il tag passato è normalizzato BCP-47 e ricondotto a una lingua supportata: un tag non riconosciuto ricade su `defaultLang`.

```typescript
// t() è alias di translate(): stessa firma, comodo per template densi
this.translate.t('miaChiave');                    // = translate('miaChiave')
```

### Normalizzazione BCP-47

L'Engine normalizza internamente i tag lingua:
```typescript
// "it-IT" e "it" sono equivalenti — entrambi caricano basic.it.json
TranslateService.normalizeBcp47('it-IT')  // → 'it'
TranslateService.normalizeBcp47('en-US')  // → 'en'
```

### Campi per-lingua: `pickLocaleText`

Per risolvere un campo a mappa `{ it, en, … }` (es. `config.description` da `global-settings.json → site.description`) sulla lingua corrente c'è l'helper puro `pickLocaleText(map, lang)` (in `siteBuilder.ts`): fallback a cascata lingua voluta → `defaultLang` → primo valore disponibile → stringa vuota, robusto a mappe parziali o assenti.

```typescript
import { pickLocaleText } from './core/engine/siteBuilder';

const testo = pickLocaleText(config.description, this.translate.currentLang());
```

### Pipe `translate` — Impura by Design

La `TranslatePipe` è dichiarata `pure: false` perché le traduzioni cambiano al cambio lingua, e una pipe pura non rileva il cambiamento di stato esterno: Angular la ri-esegue a ogni ciclo di change detection. Per ottimizzare template ad alta frequenza, usa `computed()`:

```typescript
readonly trad = computed(() => this.translate.translate('chiave'));
```

### Pipe `markdown`

Converte Markdown in HTML nel template, con sanitizzazione XSS rigorosa: l'HTML grezzo è bloccato e gli URL non sicuri neutralizzati. Nei link sono ammessi gli schemi `http`/`https`/`mailto`/`tel` (bloccati `javascript:`, `data:`, `vbscript:` e i protocol-relative `//`); nelle immagini `http`/`https` e i data URI `data:image/` (gli altri schemi vengono scartati).
```html
<div [innerHTML]="testo | markdown"></div>
```

Supporta GitHub Flavored Markdown (tabelle, checklist, ecc.) e converte gli a-capo in `<br>`. Fuori da un template (in TypeScript) c'è il metodo statico `MarkdownPipe.render(value)`, con le stesse regole di sanitizzazione; `MarkdownPipe.lex(value)` restituisce i token dello stesso lexer (lo usa l'editor per colorare la scrittura):

```typescript
const html = MarkdownPipe.render('**Grassetto** e [link](https://example.com)');
```

La usano `PolicyComponent` per le pagine legali e `app-markdown-editor` per l'anteprima (vedi «Editor Markdown»); vale in qualsiasi componente per contenuto rich text.

---

## 🌐 ApiService: Chiamare il Backend

`ApiService` (iniettato come `this.api` in ogni `PageBaseComponent`) espone questi metodi:

| Metodo | Tipo di ritorno | Quando usarlo |
| :--- | :--- | :--- |
| `getSocial(nomi?)` *(demo)* | `Promise<Record<string, string>>` | Galleria social demo; `nomi` opzionale filtra (es. `['facebook','instagram']`) con query a chiavi ripetute (`?nomi=facebook&nomi=instagram`). **Esempio: il `setup.mjs` lo rimuove dal progetto figlio (con l'endpoint `/social`).** |
| `getBlobUrl(slug, webopt?)` | `string` | URL relativo del file (`/api/blob/{slug}`) per `<img src>` / `<a href>`, senza download in memoria. Anche in GET passa dal proxy `/api` protetto da API key |
| `getBlob(slug)` | `Promise<Blob>` | File scaricato in memoria (anteprima locale, download forzato) |
| `uploadBlob(file)` | `Promise<{ slug }>` | Carica un file nel volume uploads (vuole il JWT) |
| `uploadBlobs(files)` | `Promise<string[]>` | Carica più file in sequenza, stesso ordine di `files`; un fallimento a metà propaga l'errore senza rollback dei file già caricati |
| `login(username, password)` | `Promise<LoginResult>` | Autenticazione utente (con il login acceso in `Features`) |

> L'identità del sito non sta in `ApiService`. Footer, pagine legali e SEO la leggono dalla risorsa condivisa dell'Engine `IdentityService` (`identity()` signal, `GET /identity`, una fetch per lingua). Vedi «IdentityService».

### File Uploads (`/api/blob`)

`getBlobUrl` restituisce un path relativo con prefisso `/api` (es. `/api/blob/{slug}`): il browser raggiunge il file attraverso il proxy SSR del frontend, non l'URL interno del backend. Il prefisso è configurabile via `SSR_API_PREFIX` (default `/api`).

Le immagini caricate passano dal backend, che ne toglie i metadati di posizione (EXIF GPS, XMP, IPTC, dati in coda) senza ricodificarle, e rifiuta con un 400 un JPEG, PNG o WebP malformato: dettaglio in [backend/README.md](../backend/README.md).

#### Quale metodo usare per mostrare un file

Per mostrare o linkare un file che vive sul server (immagine, PDF, allegato) la risposta è `getBlobUrl(slug)`. Restituisce una stringa da mettere in `<img [src]>` / `<a [href]>`, senza scaricare nulla in memoria. È il percorso da preferire: il file viaggia come una normale GET HTTP, con caching del browser e range.

```html
<img [src]="api.getBlobUrl(slug)" alt="...">          <!-- webopt=true di default → immagine ottimizzata -->
<a  [href]="api.getBlobUrl(slug, false)" download>Scarica originale</a>
```

`getBlob()` + `AssetService.getUrlFromBlob()` serve quando c'è già un `Blob` in memoria e occorre un object URL temporaneo, cioè quando:
- scarichi il file per elaborarlo lato client invece di mostrarlo e basta;
- mostri l'anteprima locale di un file scelto dall'utente *prima* di caricarlo;
- il `Blob` è generato localmente (canvas, QR, immagine da testo…).

```typescript
const blob = await this.api.getBlob(slug);
const { angularUrl } = this.asset.getUrlFromBlob(blob); // SafeUrl; revocato in automatico al cambio pagina
// <img [src]="angularUrl">
```

> Regola pratica: un file che sta sul server e va mostrato/linkato → `getBlobUrl`. Un `Blob` già in memoria → `getUrlFromBlob`.

> Default `webopt = true`: chiede al backend la versione ottimizzata per il web del file, qualunque essa sia, un flag non legato alle immagini per definizione. L'ottimizzazione implementata è quella per le immagini (lato più lungo max 1920 px, conversione in WebP); i contenuti senza una pipeline (PDF, video…) sono serviti tali e quali, e il flag resta il punto di aggancio per altri tipi. Per il file originale, così com'è stato caricato (es. download a piena risoluzione), passa `getBlobUrl(slug, false)`.

#### Caricare uno o più file (`uploadBlob`/`uploadBlobs`)

`uploadBlob(file)` carica un file e restituisce lo `slug` con cui recuperarlo in seguito (via `getBlobUrl` / `getBlob`). Si abbina a `app-upload-form`, il componente drag-and-drop riusabile, che emette `File[]` (`filesConfirmed`) anche fuori da `[multiple]`:

```typescript
// <app-upload-form (filesConfirmed)="onFilesConfirmed($event)" [isLoading]="isUploading()" />
async onFilesConfirmed([file]: File[]): Promise<void> {
    this.isUploading.set(true);
    try {
        const { slug } = await this.api.uploadBlob(file);
        // `slug` è l'identificativo per recuperare il file in futuro
    } finally {
        this.isUploading.set(false);
    }
}
```

Con `[multiple]="true"` sul componente, usa `uploadBlobs(files)`: carica in sequenza (l'endpoint accetta un `IFormFile` alla volta) e restituisce gli slug nello stesso ordine di `files`.

```typescript
// <app-upload-form [multiple]="true" (filesConfirmed)="onFilesConfirmed($event)" [isLoading]="isUploading()" />
async onFilesConfirmed(files: File[]): Promise<void> {
    this.isUploading.set(true);
    try {
        const slugs = await this.api.uploadBlobs(files);
        // slugs[i] ↔ files[i].name — tieni la corrispondenza esplicita se la mostri, non solo gli slug
    } finally {
        this.isUploading.set(false);
    }
}
```

`labels` (`input<UploadFormLabels>`, opzionale) sovrascrive i testi del form campo per campo (dropzone, bottone, errori); un campo non passato ricade sulla chiave i18n di default: un wording diverso dal generico del sito senza toccare i cataloghi i18n.

> Nota: `uploadBlob`/`uploadBlobs` vogliono un JWT valido (utente loggato). Anche le GET (`getBlobUrl`, `getBlob`) passano dall'API key: l'endpoint `/blob/{slug}` non è anonimo, e i file non sono una risorsa pubblica raggiungibile dal backend in modo diretto (es. da un crawler) come gli asset statici. Nel browser la chiave non va gestita: la inietta il proxy SSR `/api`.

Pattern one-shot (dati statici, caricati una volta):
```typescript
ngOnInit() {
    this.api.getSocial().then(s => this.social.set(s));
}
```

Pattern reattivo (dati che si aggiornano con la lingua o lo stato): esponi un metodo che ritorna `api_resource<T>()` (vedi «Aggiungere un Endpoint»), poi nel template `res.value()` / `res.isLoading()`. Per l'identità del sito c'è già `IdentityService` (risorsa condivisa dell'Engine).

### Errori Silenziosi per UI Custom

In componenti con UI d'errore propria (es. form di login), passa `{ silent: true }` per impedire la notifica automatica:

```typescript
// LoginFormComponent: gestisce l'errore internamente
await this.api.login(req, { silent: true })
    .catch(err => {
        this.errorMsg.set(err.problem?.detail ?? this.translate.translate('erroreImprevisto'));
    });
```

Senza `silent: true`, l'`apiErrorInterceptor` chiama `NotificationService.handleApiError()`. Il client API (`BaseApiService`) resta puro: fa la chiamata e propaga un `ApiError` tipizzato; la notifica è un concern trasversale dell'interceptor.

### Aggiungere un Endpoint

La convenzione vive inline in `api.service.ts`. Tre passi:

1. **Path**: aggiungi la voce alla costante `API` in cima al file (stringa, o funzione per i path parametrici come `blob`).
2. **Metodo pubblico**: esponi un metodo dedicato che chiama l'helper protetto del `BaseApiService`: `api_get<T>()` / `api_post<T>()` per le chiamate una-tantum, `api_resource<T>()` per i dati reattivi (si ri-fetchano al cambio di signal, es. lingua).
3. **(Opzionale) `contentLoader`**: se l'endpoint alimenta una pagina al primo render, dichiaralo sulla pagina in `pages/*.pages.ts` (vedi «Developer Journey», passo 6).

Esempio (path parametrico + metodo che ne consuma il risultato): [AGENTS.md](../AGENTS.md#aggiungere-un-endpoint-al-client).

> Upload multipart/`FormData`: per gli endpoint che ricevono file usa `this.api_post_form<T>(path, formData)` invece di `api_post`, come fa già `uploadBlob`. Non impostare `Content-Type` a mano: il browser lo aggiunge con il boundary corretto; per il resto passa dalle stesse `build_api_Headers` e dall'`apiErrorInterceptor`.

### `httpResource` per Componenti Sempre-On

Per i dati di un componente sempre attivo (navbar, footer) esponi un metodo che ritorna `api_resource<T>()`: è un `httpResource` reattivo che si ri-fetcha da sé al cambio lingua (tramite il segnale `Accept-Language`), e il componente mostra la lingua corrente.

```typescript
// in api.service.ts
getArticoli() { return this.api_resource<Articolo[]>(API.articoli); }
// nel componente: readonly res = this.api.getArticoli();  → res.value() | res.isLoading()
```

> L'identità del sito è già un `httpResource` condiviso: `IdentityService` (Engine) la espone come `identity()` signal, una fetch per lingua riusata da footer, pagine legali e SEO. Non va ricreata a mano, vedi «IdentityService».

---

## 🪪 IdentityService: l'identità del sito

`IdentityService` (Engine, `providedIn: 'root'`) è la sorgente unica dell'identità del sito: dati legali/anagrafici, profili social del brand, natura dell'entità (`personal`). Espone un signal:

```typescript
private readonly identityService = inject(IdentityService);
this.identityService.identity();  // Signal<Identity | null>
this.identityService.loading();   // Signal<boolean>
```

- **Una fetch condivisa.** È un `httpResource` su `GET /identity`, ri-fetchato al cambio lingua. Footer, pagine legali (sezione titolare/gestore) e `PageMetaService` (JSON-LD `sameAs`/`@type`) leggono tutti da qui: niente N chiamate sparse.
- **SSR-aware.** In SSR la risorsa è risolta prima della serializzazione, e i dati strutturati finiscono già nell'HTML server-rendered (la SEO non aspetta il browser).
- **Degrada da sé.** Identità non configurata (o backend irraggiungibile) → `identity()` è `null`: footer, social e JSON-LD relativi si nascondono senza errori, e la sezione identità delle pagine legali non compare.

I dati vivono nel backend (`data/identity.json`, servito dall'Engine): il frontend li consuma e basta. Nel footer si compongono con `addField`/`addSocialLink` di `nav.ts`; fuori dal footer `resolveFooterFields(campi, identity, deps)` (`footer-content.ts`) dà le stesse voci, pronte per un `@for`.

---

## 📤 ShareService: Copia, Condivisione, Download

`ShareService` centralizza le operazioni di condivisione e download. Responsabilità unica: esegue l'operazione e ne restituisce l'esito, senza toast. La notifica è di chi scatena l'azione (il bottone/la pagina), e lo stesso servizio resta usabile in contesti silenziosi. I componenti `app-copy-action` / `app-share-action` lo fanno già per te.

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

Catena di fallback: Web Share API disponibile → condivisione nativa; non disponibile / errore → download o copia.

---

## 🔊 Sintesi Vocale (SpeechService)

`SpeechService` legge ad alta voce, con la voce scelta in base alla lingua corrente.

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

- Voce scelta in base alla lingua corrente (si aggiorna al cambio lingua)
- `rate`: velocità 0.1–10 (default 1); `pitch`: tono 0–2 (default 1)
- `speech.isSpeaking()`: Signal reattivo
- `speech.stop()`: interrompe la lettura e azzera lo stato (lo chiama anche `speak()` prima di una nuova lettura, per evitare sovrapposizioni)
- `speech.currentVoice()`: `Signal<SpeechSynthesisVoice | null>`, la voce di sistema selezionata per la lingua
- SSR-safe: non disponibile server-side, degrada in silenzio

---

## QR: Codici QR Dinamici (QrCodeService)

`QrCodeService` genera codici QR per i casi d'uso comuni, con colori presi dal tema.

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

Caching: cache LRU (max 32 QR), QR identici con gli stessi colori escono dalla memoria senza ricalcolo.

Varianti utili: `toSVG(config)` restituisce il QR come stringa SVG (vettoriale, scalabile) invece del Blob PNG; `createWithColors(config, fg, bg)` genera il QR con colori espliciti invece di leggerli dal tema (`create` è la scorciatoia che passa `colorPrimaryText` / `colorPrimary`).

---

## 🖼️ ImgBuilderService: Generazione Immagini da Testo

`ImgBuilderService` genera PNG da testo (o da testo sovrapposto a un'immagine) con SVG come formato intermedio. Un punto d'ingresso per formato di output (`buildCanvas`/`buildBlob`/`buildFile`), che riceve uno `spec` con `style` a scegliere l'implementazione.

**`style: 'plain'`**: testo su sfondo pieno, senza immagine di base. Tre modalità di layout:

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
const canvas = await this.img.buildCanvas({
    style: 'plain',
    text: 'Titolo Articolo',
    opts: { bgColor: '#1f40ff', textColor: '#ffffff', fontSize: 60, ratio: '16:9', maxWidth: 1920 },
});

// Blob PNG per download o condivisione
const blob = await this.img.buildBlob({ style: 'plain', text: 'Titolo', opts });
await this.share.downloadBlob(blob, 'social.png');
```

Senza `bgColor`/`textColor` i colori vengono dai signal del tema corrente (WCAG-conformi). Oltre alle opzioni di layout ci sono `fontFamily` (una voce di `SystemFont`, risolta nello stack CSS reale; default: il font del sito, `font.principale`) e `lineHeight` (moltiplicatore d'interlinea, default `1.4`).

**`style: 'pill'`**: badge/chip di testo ancorato a un angolo sopra un'immagine esistente (`imageSrc`, URL o `Blob`): `pillOpts.text`/`subtitle`, `corner`, `margin`. **`style: 'caption'`**: fascia scrim (in alto/al centro/in basso) con titolo e sottotitolo sopra un'immagine: `captionOpts.text`/`subtitle`/`position`. Entrambe troncano con ellissi oltre `maxLines` (3 e 4 di default).

**`style: 'fittedCaption'`**: come `'caption'`, per un testo non noto a priori (es. generato) quando l'ellissi non è accettabile: calcola da sé l'altezza perché `text`/`subtitle` entrino per intero, mai troncati. A differenza di `'caption'` non sovrappone il testo all'immagine: compone due zone indipendenti, immagine sopra e fascia testo sotto, con una dissolvenza fra le due (mai una riga netta). L'immagine è **nitida e a piena larghezza, mai sfocata**: se la sua altezza naturale supera `captionOpts.maxImageRatio` (frazione della larghezza canvas, default `0.6`) viene ritagliata dal basso, mai zoomata sui lati né deformata. `imgOpts` qui accetta `width`/`backdropColor` (niente `background`/`foreground`/`fit`: `fittedCaption` mostra l'immagine in un modo).

```typescript
const canvas = await this.img.buildCanvas({
    style: 'fittedCaption',
    imageSrc: this.asset.getUrl('generator.mio-generatore.og'),
    captionOpts: { text: risultatoGenerato, subtitle: `Dal ${nomeGeneratore} | ${ContestoSito.config.appName}` },
    imgOpts: { width: 1200 },
});
```

Per allegare l'immagine a un `FormData`/upload c'è `buildFile(spec, filename?)`, che restituisce un `File` PNG pronto (è `buildBlob` avvolto in un `new File([...])`).

SSR-safe: il metodo statico `ImgBuilderService.buildSvg()` non tocca DOM né Angular, ed è usabile in Node.js per le preview server-side.

Due limiti impliciti, nessuno dei due segnalato al chiamante:
- **Clamp dimensionale silenzioso**: canvas finale fra 125 e 8000 px per lato (`DIMENSIONE_MIN_PX`/`DIMENSIONE_MAX_PX`). Un testo lunghissimo o un `ratio` estremo oltre il tetto viene riportato al valore massimo/minimo senza errore né warning: un layout inatteso, non un'eccezione.
- **`crossOrigin` sugli URL assoluti http(s)**: un `imageSrc` remoto senza header CORS rende il canvas "tainted", e `buildBlob()`/`buildFile()` (via `canvas.toBlob`) risolvono a `null`, indistinguibile da un fallimento SSR generico, senza un errore dedicato nella firma dei metodi. Un asset servito da `AssetService`/blob dell'Engine (stessa origin) non ha questo problema.

---

## 🔗 Meta Tag e Anteprima Sociale (PageMetaService)

`PageMetaService` aggiorna i meta tag (title, og:, twitter:, canonical, JSON-LD) per ogni pagina. I valori di base vengono dalle dichiarazioni delle pagine; il resolver li affina con i dati della pagina.

### og:image della pagina

Non si chiama `PageMetaService` a mano (è privato all'Engine): i meta si dichiarano sulla pagina (`description`, `otherSEO`) o, per i dati derivati dal contenuto, nel `contentLoader`, e l'Engine li riapplica da sé a ogni cambio pagina e lingua. `otherSEO.ogImage` ha tre stati: un `OgImageRef` (sfondo dell'immagine generata), `false` (nessuna og:image), omesso (anteprima generata dal titolo della pagina).

L'og:image esiste in SSR: i crawler non eseguono JavaScript e vedono la versione server-rendered, e una modifica client-side non ha effetto sulle anteprime di Facebook/LinkedIn/WhatsApp. Come viene disegnata (varianti, colori, font, misura del testo, `og.soloSfondo`, `og.testo`) è in «Design system e tema» → «og:image generata».

### `OgImageRef`: asset statico o blob dinamico

`otherSEO.ogImage` (e l'`ogImage` del `PageInfo` restituito da un `contentLoader`) accetta un `OgImageRef`, `{ id: string }` oppure `{ blobGuid: string }` (con entrambi valorizzati vince `blobGuid`), o `false`:

- **`{ id }`**: asset statico risolto da `mapping.json`, come ogni altro `appAsset`. Disponibile a build time.
- **`{ blobGuid }`**: contenuto caricato a runtime (upload via `EngineBlobController`/`AppBlobStore`) che porta la propria immagine di anteprima, senza registrare nulla in `mapping.json`. Il Node SSR risolve l'URL con la convenzione di default `blob/{guid}?webopt=true`; un figlio con un endpoint blob diverso la sovrascrive con `resolveBlobImageUrl: (guid: string) => string` in `site.ts`: l'Engine non assume la forma dell'URL.

Costo di `{ blobGuid }` rispetto a `{ id }`: `{ id }` risolve a un path su disco già nel bundle, senza rete. `{ blobGuid }` vuole un fetch HTTP del Node SSR verso il backend per i byte dell'immagine (a ogni cache-miss), con un secondo fetch di fallback verso la variante non ottimizzata (`webopt` raw) se il primo fallisce e non c'è un `resolveBlobImageUrl` custom, di norma perché l'originale supera il tetto di decodifica di `?webopt=true` (40 megapixel, vedi [backend/README.md](../backend/README.md) §"EngineBlobController"). In quel caso `/cdn-cgi/preview` decodifica e ridimensiona con `sharp` l'immagine a piena risoluzione due volte nello stesso processo SSR (sfondo sfocato + primo piano nitido): per un'immagine grandissima è un costo di CPU/memoria per singola anteprima da tenere presente prima di esporre `{ blobGuid }` su contenuto degli utenti senza un limite di risoluzione a monte.

### JSON-LD Strutturato (grafo Schema.org)

Schema.org viene iniettato per ogni pagina e migliora l'aspetto nei risultati di Google e degli altri motori. L'Engine emette un grafo di entità separate, ognuna nel proprio `<script type="application/ld+json">`: blocchi distinti rendono il grafo più leggibile ai validator e aggiornano ogni entità senza sovrascrivere le altre.

| Entità | `@id` | Quando |
| :--- | :--- | :--- |
| `Organization` *(o `Person`, o il `businessType` di un'attività)* | `{origin}#organization` *(o `#person`)* | In ogni pagina: l'entità brand, con nome (ragione sociale, fallback nome sito), URL e icona del sito (`logo` per Organization, `image` per Person); `sameAs` dai social; `address` (`PostalAddress` dalla sede) e `contactPoint` (`ContactPoint` con telefono/email) se abilitati per campo in `site.ts` (`jsonld`, sotto; i dati restano visibili nel footer e nelle pagine legali a prescindere da questi flag); `hoursAvailable`/`availableLanguage` se disponibili; e, per Organization, `legalName` (da ragione sociale, la stessa stringa di `name`) e `vatID`/`taxID` da P.IVA/CF se `jsonld.partitaIva`/`.codiceFiscale`; più la via di fuga `identity.extra` (proprietà schema.org arbitrarie fuse nel nodo). Il tipo dipende da `identity.personal` e `identity.businessType` (default Organization); identità assente → Organization minimale |
| `WebSite` | `{origin}#website` | In ogni pagina: collega le pagine al sito e all'organizzazione |
| `WebPage` (o tipo scelto) | `{canonical}#webpage` | In ogni pagina: la pagina corrente, con `inLanguage`, `isPartOf`, `publisher` e `dateModified` (dal valore effettivo di `og:updated_time`) |
| `BreadcrumbList` | — | Quando il path non è la root (`/`) |

Ogni script porta l'attributo `data-br1-jsonld` (per aggiornarli/rimuoverli in blocco) e riceve il nonce CSP della risposta in SSR, così rispetta la Content-Security-Policy senza `unsafe-inline`.

**`jsonld` (`site.ts`, `{ email, telefono, indirizzo, partitaIva, codiceFiscale }`, default `false`, tranne `partitaIva` default `true`)**: quali dati facoltativi di `identity` finiscono nel nodo brand del JSON-LD, con gli stessi nomi dei campi di `identity.json`/`identity.dto.ts` (`email`/`telefono` nel `ContactPoint`, `indirizzo` nella `PostalAddress` da sede legale/operativa, `partitaIva`/`codiceFiscale` come `vatID`/`taxID`, per Organization/attività). Un flag per campo, non un interruttore unico, perché il profilo di rischio è diverso: `partitaIva` è un identificativo numerico, verificabile in pubblico su VIES/camera di commercio, senza dati personali codificati, e per questo ha default `true` (Google la raccomanda). `codiceFiscale` resta `false`: per una società coincide spesso con la P.IVA, ma per una ditta individuale è il codice fiscale della persona fisica (codifica data e luogo di nascita), e il motore non distingue i due casi (entrambi `personal: false`). `legalName` non è in lista: con `identity.ragioneSociale` valorizzata esce identica in `name`, e un flag non nasconderebbe nulla. `sameAs` (i social) nemmeno: sono URL già pubblicati (compaiono nel footer) e Google li indica come il segnale principale per il Knowledge Panel.

Nessuna di queste proprietà è "Required" per Google (la [guida su Organization](https://developers.google.com/search/docs/appearance/structured-data/organization) le marca tutte "Recommended"): la scelta di quali rendere un flag esplicito segue il profilo di rischio, non lo schema.

Un JSON-LD pubblico è testo strutturato, fatto per essere estratto in automatico, dai motori di ricerca (rich result "chiama ora", scheda indirizzo) come dai bot di scraping e spam, che lo preferiscono proprio perché costa meno da parsare di un dato nel footer. Per questo i default sono spenti: un sito personale (`identity.personal: true`) non ha motivo di esporre un dato personale in quel formato. Footer e pagine legali mostrano i campi di `identity` valorizzati **a prescindere** da questi flag, che riguardano il JSON-LD. Attivali uno per uno per un sito vetrina con dati pubblici dedicati: un'attività fisica vuole l'indirizzo per il local SEO e tiene spenti mail e telefono:
```ts
buildSite({
    // ...
    jsonld: { indirizzo: true, partitaIva: true, telefono: false, email: false, codiceFiscale: false },
});
```

I dati strutturati della pagina si dichiarano in un campo, `otherSEO.structuredData`, in tre forme (combinabili in una lista):
- una **stringa** → il `@type` della pagina (es. `'AboutPage'`, per i tipi non coperti; default `WebPage`);
- un **oggetto** `{ kind, … }` con campi parlanti (`article` / `faq` / `product` / `event`) → **senza conoscere schema.org**, tradotto dall'Engine in JSON-LD valido;
- un **array** → più entità sulla stessa pagina (es. un Article + una FAQ + un `raw`).

La traduzione vive in un punto (`structured-data.ts`): se schema.org cambia si tocca quello, non la config dei figli. Si impostano statici nella dichiarazione della pagina o dinamici dal `contentLoader` (derivati dal contenuto, es. autore e data di un Article, con la precedenza). Per i tipi non coperti c'è la via di fuga `kind: 'raw'` (JSON-LD grezzo). I campi non impostati ricadono sui dati esistenti (titolo, og:image, ultima modifica, Organization del sito): anche un semplice `{ kind: 'article' }` produce un'entità completa, e senza dichiarare nulla ogni pagina ha il grafo base `Organization`+`WebSite`+`WebPage`. Per gli articoli (`kind: 'article'`) l'Engine emette anche i meta Open Graph `article:*` (`published_time`, `modified_time`, `author`, `section`, un `tag` per voce), gemelli dei dati JSON-LD, da abbinare a `ogType: 'article'`. Esempi in [AGENTS.md](../AGENTS.md).

### URL Canonico e `og:locale`

Il canonical è costruito in modo stabile, per evitare contenuti duplicati e canonical divergenti fra HTML iniziale e idratazione:
- query string e hash vengono rimossi;
- in SSR l'origin è `FRONTEND_BASE_URL`, qualunque siano gli header del reverse proxy.

Lo stesso canonical alimenta `og:url`, il tag `rel="canonical"` e gli `@id`/`url` del grafo JSON-LD, e li tiene coerenti.

`og:locale` (e gli `og:locale:alternate` per le altre lingue) usano il formato regionale OpenGraph `lingua_REGIONE` (es. `it_IT`, `en_US`), derivato via `Intl.Locale().maximize()`. Gli alternate si rigenerano con remove+add a ogni cambio pagina, e funzionano anche con più di due lingue (dove `Meta.updateTag` sovrascriverebbe un tag). Stesso pattern remove+add per i tag `hreflang` (vedi «Lingua nell'URL»).

Il modello i18n è a URL per lingua (vedi «Internazionalizzazione (i18n)» → «Lingua nell'URL»): la lingua di default non è prefissata, le altre sì (`/en/…`). Ne discendono `hreflang`/`x-default` e un canonical self-referenziante per lingua, perché è l'URL a portarla. Nessun header `Vary: Accept-Language` in risposta: il contenuto dipende dal path, non dall'header.

> Anteprime ricche: il `<meta name="robots">` di base include `max-image-preview:large, max-snippet:-1, max-video-preview:-1`, e autorizza Google a mostrare l'anteprima immagine grande (l'OG 1200×630 generata dall'Engine) e snippet/video senza limiti nei risultati. La description di pagina, se omessa, ricade sulla `site.description` di default (localizzata) invece di restare quella della pagina precedente.

### Formattazione del Titolo Pagina (`<title>`)
Il tag `<title>` (e `og:title`) segue di default il formato `Titolo Pagina | Nome App` (o `Titolo Pagina` e basta se uguale al nome app). Lo schema si cambia con `formatBrowserTitle` in `site.ts` (es. per invertire l'ordine o cambiare il separatore: `` formatBrowserTitle: (pageTitle, appName) => `${pageTitle} — ${appName}` ``).

---

## 🔄 Controllo Versione e Aggiornamenti (VersionCheckService)

L'app controlla se c'è una nuova versione e lo notifica all'utente.

### Fonti di Versione

La versione è dichiarata in `global-settings.json` (`project.version`) e distribuita in due posti da `generate-statics.ts` al build:
1. Meta tag `app-version` in `index.html`: baseline in memoria **e** sorgente del polling ogni 10 minuti
2. Hash NGSW: usato da SwUpdate nelle PWA installate

> Il polling legge il meta `app-version` da `index.html` (non dal manifest): `index.html` c'è in ogni caso, anche con `isWebApp:false`, quando il manifest non viene generato né servito.

### Meccanica

Tab senza Service Worker (con `isWebApp:false`, in ogni caso): polling a intervalli (default 10 minuti, configurabile con `versionCheckIntervalMs` in `site.ts`) che scarica `/index.html` e confronta il meta `app-version` → se cambia → notifica → un hard reload attiva la nuova versione.

PWA / tab con SW attivo: il SW serve `index.html` dalla cache (versione stabile per il polling) e decide SwUpdate, che emette `VERSION_READY` quando la nuova versione è scaricata → l'utente conferma → `activateUpdate()` + reload.

#### Personalizzare la UX di Aggiornamento
Di default la notifica è un `window.confirm` bloccante seguito da un ricaricamento forzato (`window.location.reload()`), che interromperebbe un utente a metà di un form lungo o di una partita.
In `site.ts` `onVersionUpdateAvailable(apply: () => void)` devia questo comportamento: l'Engine consegna la callback `apply` (che incapsula attivazione SW e ricaricamento) e **il progetto decide come e quando** invocarla (es. una snackbar non bloccante "Aggiorna ora"). Se l'hook fallisce, interviene il dialog di default, e l'aggiornamento non va perso. Esempi d'uso in `AGENTS.md`.

Prerequisito (consenso TechnicalOptional): se il sito ha un consenso TechnicalOptional (di norma il caso PWA; i cookie Technical necessari sono esenti per legge, mai a consenso) il controllo versione resta spento finché l'utente non lo accetta, e parte dal reload successivo. Senza consenso TechnicalOptional (non-PWA) non c'è nulla da accettare e il polling parte in ogni caso: legge il meta `app-version` via `fetch`, senza scrivere cookie. Senza questa distinzione un sito con `isWebApp:false` resterebbe senza controllo versione per sempre.

---

## 📊 Core Web Vitals (WebVitalsService)

L'app misura le Core Web Vitals reali (LCP, INP, CLS, più FCP/TTFB) di chi visita il sito: l'esperienza effettiva, non un audit sintetico come Lighthouse in CI.

Deliberatamente senza destinazione di default: l'Engine raccoglie, non decide dove mandare i dati (un endpoint proprio, GA4, un altro RUM), che è una scelta di progetto. Zero chiamate di rete aggiunte: `metrics()` è un signal da osservare con un `effect()` (di norma in `app.component.ts`, accanto a `VersionCheckService`) e spedire dove preferisci:

```typescript
constructor() {
    effect(() => {
        const m = inject(WebVitalsService).metrics();
        if (m.length) this.api.post('metrics/vitals', m.at(-1));
    });
}
```

In sviluppo (`isDevMode()`) le metriche finiscono anche in console (`[web-vitals] LCP 1240 good`) per un riscontro immediato senza collegare nulla.

---

## 🚨 Error Tracking (ClientErrorReportingService)

Con `Features.ErrorReporting` acceso, `app.config.ts` registra `ClientErrorReportingService` come `ErrorHandler` globale: ogni eccezione JavaScript non gestita nel browser va al backend (`POST diagnostics/ui-fault`), che la accoda allo stesso `IErrorReportingService` (webhook generico, sezione `ErrorReporting` in `global-settings.local.json`) dei bug lato API: un canale di allerta per l'intera applicazione. Con il flag spento il servizio non è registrato e il browser non invia nulla; con il flag acceso serve `WebhookUrl`, altrimenti il backend non parte. Il flag accende anche la parte `errorReporting` della Privacy Policy.

Copertura: gli errori che Angular già traccia (template, `effect`, `HttpClient`) e, per un'app **zoneless** come questa, dove un `ErrorHandler` non vedrebbe da sé ciò che accade fuori da Angular, anche quelli fuori contesto (un `setTimeout` nudo, un listener DOM aggiunto a mano, uno script di terze parti), coperti con `window.addEventListener('error'/'unhandledrejection', ...)`.

Spento in sviluppo (`isDevMode()`): un errore mentre iteri in locale finisce in console (mai silenziato) ma nessuna chiamata di rete parte.

Nessun throttling né deduplica: un errore che si ripete (loop, script di terze parti) genera una `POST` per occorrenza, ognuna inoltrata al webhook senza limite di frequenza; vedi [backend/README.md](../backend/README.md) §10 per il dettaglio (comune col lato server) e la sua interazione con `BackgroundQueue`.

---

## ⚙️ Opzioni Avanzate di `site.ts`

Oltre a `path`, `title` e `description`, ogni dichiarazione di pagina (nei file di area `pages/*.pages.ts`, assemblati nell'array `pages` di `site.ts`) accetta:

```typescript
{
    // Forza il rendering client-side (es. per pagine protette da login)
    renderMode: 'client',  // default: 'server'

    // Che cosa è questa pagina; come appare lo decide il design system per ruolo
    // (vedi «Ruoli di Pagina (`layout.role`)»)
    layout: {
        role: 'legal',        // 'default' | 'legal' | 'error' | 'naked' | un ruolo registrato in ruoloPagina. Default: 'default'
    },

    // Meta tag OpenGraph aggiuntivi
    otherSEO: {
        ogImage: { id: 'og-cover' },  // OgImageRef: { id } asset statico o { blobGuid } contenuto dinamico. `false` = nessun og:image; omesso = anteprima generata
        ogType: 'article',
        structuredData: { kind: 'article' },  // JSON-LD: stringa (@type), oggetto {kind,…} o lista. Vedi «JSON-LD Strutturato»
        noindex: false,       // true = pagina pubblica/SSR ma esclusa dall'indice (X-Robots-Tag + fuori sitemap). Default false
    },
}
```

A livello top di `site.ts` (oltre a `pages`) si dichiarano struttura e comportamento del sito. Ogni campo ha un default: si dichiarano quelli da cambiare. Il menu di header/footer è un dato risolto a runtime in `nav.ts`, vedi «Navigazione Multilivello».
```typescript
// site.ts
homePage: PageType.Home,           // pagina del brand/logo nella navbar (se omessa, il brand non è un link)
loginPage: PageType.Login,         // dove mandare gli utenti non autenticati (se omessa: resta sulla pagina con la modale 401); esistenza e link in navbar da Features

shell: {
    designSystem: demoDesignSystem, // DesignSystemFactory importato: tono, colori, navbar/footer/pannello, ruoli, font, og (vedi «Design system e tema»)
    showNotifications: false,       // campanellino notifiche realtime con storico (default false, opt-in): una funzione del sito, non estetica
},

isWebApp: false,                   // funzionalità PWA (Service Worker, aggiornamenti, install offline), default false, opt-in

legal: { /* … */ },                // pagine legali → vedi «Pagine legali (`legal`)»
jsonld: { /* … */ },               // dati di identity esposti nel JSON-LD → vedi «JSON-LD Strutturato»
formatBrowserTitle: (pageTitle, appName) => `${pageTitle} | ${appName}`,
resolveBreadcrumb: (type, ctx) => null,          // vedi «`app-breadcrumb`»
resolveBlobImageUrl: (guid) => `blob/${guid}?webopt=true`,   // vedi «`OgImageRef`»
versionCheckIntervalMs: 10 * 60 * 1000,
onVersionUpdateAvailable: (apply) => { /* … */ },           // vedi «Controllo Versione e Aggiornamenti»
```

> `description` (mappa per-lingua `{ it, en, … }`) e `colorTema` vivono in `global-settings.json → site`: l'identità minima del progetto. Ogni altra scelta estetica, smoke compreso, è del design system attivo.

I profili social del brand e la natura dell'entità sono dati d'identità: vivono in `backend/data/identity.json` (campi `social` e `personal`), serviti dall'Engine su `GET /identity` e letti dalla risorsa condivisa `IdentityService`. `social` è una lista di profili (`{ url, name? }`, o l'URL nudo): l'Engine li emette come `sameAs` dell'entità brand nel JSON-LD, il segnale che Google usa per il Knowledge Panel, e l'icona nel footer è dedotta dall'URL (più profili dello stesso social convivono). Lista vuota o identità assente → nessun `sameAs`. Un URL Twitter/X fra i profili alimenta anche il meta `twitter:site`. (Esempio in [AGENTS.md](../AGENTS.md).)

Per un sito personale/portfolio imposta `personal: true` in `identity.json`: l'entità brand diventa `Person` invece di `Organization` (default). Cambia il `@type` e l'icona passa da `logo` a `image`; il nome dell'entità è la `ragioneSociale` (fallback al nome del sito). Il default è `Organization` perché è il meno penalizzante per Google: dichiarare `Person` per un'azienda è peggio del contrario. Identità assente → esce comunque un grafo valido (Organization, senza sameAs).

> `isWebApp: false` rende il sito non installabile: il Service Worker non si registra (e `CookieConsentService` lo de-registra a runtime), `generate-statics.ts` non genera `manifest.webmanifest` e toglie da `index.html` i trigger di installabilità (`<link rel="manifest">`, `mobile-web-app-capable`, i meta `apple-mobile-web-app-*`), e il server SSR risponde `404` al manifest. Così non compare il prompt "Aggiungi a schermata Home" (a Chrome Android per l'installabilità basta il manifest, anche senza Service Worker). Con `isWebApp: true` la PWA è completa. Favicon e `<link rel="apple-touch-icon">` restano presenti in ogni caso: "Aggiungi a Home" su iOS/Safari funziona anche senza manifest/Service Worker, e anche un sito non installabile ha un'icona vera in home invece del placeholder screenshot.

### Pagina esterna (`externalUrl`) e on/off (`enabled`)

Oltre alle pagine interne (con `component`) e ai gruppi padre (con `children`), in `pages` ci sono due varianti utili a tenere i menu coerenti senza moltiplicare le rotte:

| Variante | Come la dichiari | Cosa fa |
| :--- | :--- | :--- |
| **Pagina esterna** | un oggetto con `externalUrl` (e `pageType`) invece di `component`/`children` | Mappa un `PageType` su un URL esterno: la voce resta referenziabile come ogni altra pagina (`addPage`, `[appPage]`), ma **non genera alcuna rotta Angular**: compare nei menu/footer. Esclusa dalla sitemap. |
| **Interruttore on/off** | `enabled: false` su qualsiasi pagina (interna, padre o esterna) | Disattiva la pagina in un colpo: la esclude da **rotte, menu e sitemap**. Su un gruppo padre spegne anche i figli; un gruppo con tutti i figli disabilitati sparisce dal menu. Default `enabled: true`. |

```typescript
pages: (ctx) => [
    // Pagina esterna: nessuna rotta, una voce di menu verso un URL esterno
    { pageType: PageType.BlogEsterno, title: 'navBlog', externalUrl: 'https://blog.example.com' },

    // Pagina interna temporaneamente spenta: niente rotta, niente menu, niente sitemap
    { path: 'promo', pageType: PageType.Promo, title: 'Promo', enabled: false,
      component: () => import('./promo/promo.component').then(m => m.PromoComponent) },
],
```

### Navigazione Multilivello (Navbar e Footer)

Il menu di header/footer vive in `frontend/src/app/nav.ts`, un `ShellNavResolver` (tipo esportato da `core/engine/shell-nav.ts`) fornito a `SHELL_NAV_RESOLVER` in `app.config.ts`: quali destinazioni mostrare, in che ordine, con che etichetta, è un **dato** risolto a runtime (anche da un'API, anche diverso per utente loggato), mentre `ContestoSito`/`buildSite()` (`site.ts`) sono build-time (Angular vuole `routes` statico al bootstrap). `ShellNavService` (Engine) lo risolve una volta, condiviso da navbar e footer (non un fetch a testa), prima che qualunque componente si costruisca, e lo ri-risolve a ogni cambio lingua.

`header`/`footer` sono **callback** che ricevono un builder, non array: sincrone (`void`) per una dichiarazione statica, o `async` se dipendono da un'API (stesso builder, cambia soltanto se la callback aspetta qualcosa prima di chiamarlo). Il builder espone tre azioni: `addPage(PageType, { label? })` (voce singola, con etichetta custom opzionale al posto del titolo della pagina), `addLink('chiaveLabel', 'https://…')` (URL esterno; per una pagina interna usa `addPage`), `addGroup('chiaveLabel', b => …)` (gruppo/dropdown), e i gruppi sono annidabili. Ogni voce accetta anche un `itemClass?: string` nelle options: una classe in più sul contenitore di QUELLA voce, che si aggiunge allo stile di default senza sostituirlo (header e footer, stesso campo).

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

Un resolver che dipende da un'API (es. voci per utente): stesso builder, callback `async`, `addPage` con `params` per l'istanza concreta di una rotta parametrica (stesso meccanismo con cui il resto del sito risolve un `PageType` parametrico, vedi `dynamicParams` in AGENTS.md) e `label` per un'etichetta diversa dal titolo generico della pagina:

```typescript
header: async (nav, ctx) => {
    const preferiti = await inject(ApiService).getPreferiti();
    for (const p of preferiti) {
        nav.addPage(PageType.Prodotto, { params: { slug: p.id }, label: p.nome });
    }
},
```

L'Engine elabora i gruppi da sé:
- **Navbar (Desktop)**: un menu dropdown. Dal secondo livello in giù, **flyout laterali** verso destra (ribaltati a sinistra se sforano il viewport).
- **Navbar (Mobile)**: i gruppi diventano **accordion indentati** che si espandono al click.
- **Footer**: colonne annidate per livelli di indentazione.

Limiti di profondità: oltre i 3 livelli, in sviluppo, un avviso di usabilità in console (`NAV_DEPTH_WARN`); oltre i 5 un errore bloccante (`NAV_DEPTH_MAX`).

Limite di voci di primo livello (Navbar Desktop): oltre le 6 voci dirette in `header` (la stessa soglia dell'avviso in console), la navbar desktop raccoglie le voci in eccesso in un dropdown finale "Altro", senza configurazione: l'Engine misura lo spazio disponibile a runtime (`ResizeObserver`) e sposta lì ciò che non entra nella riga. Sotto la soglia, o su mobile (dove il menu è impilato), nulla cambia.

Voci visibili da loggato (`authOnly`): `addPage`/`addLink`/`addGroup` accettano un terzo parametro opzionale `{ authOnly: true }`: la voce (o, su `addGroup`, l'intero gruppo coi suoi figli) compare in navbar e footer per gli utenti loggati e sparisce per visitatori e bot (nessun link verso una pagina a cui non accederebbero). È il complemento lato menu di `requiresAuth` sulla pagina (vedi «Proteggere una Pagina»): quello protegge la rotta, questo nasconde la voce.

```typescript
header: (h) => {
    h.addPage(PageType.AreaRiservata, { authOnly: true }); // da loggato
    h.addGroup('navAdmin', g => {                          // l'intero gruppo, non i figli uno per uno
        g.addPage(PageType.Utenti);
        g.addPage(PageType.Impostazioni);
    }, { authOnly: true });
}
```

Volutamente binario (loggato/sloggato, via `TokenService.isLoggedIn()`), non un sistema di ruoli: la navbar resta generica, e un progetto che vuole granularità per ruolo filtra a monte (nel proprio resolver di `nav.ts`, prima di costruire la voce, o componendo il menu in base a `session<T>()`), non nell'Engine.

#### Footer: oltre i link (`addField`/`addText`/`addSocialLink`/`addCustom`)

Un footer istituzionale porta spesso anche dati di identità (P.IVA, sede legale, orari...), testo libero, o contenuto arbitrario di progetto, non soltanto link. Dentro un `addGroup` del **footer** (non dell'header, che resta `addPage`/`addLink`/`addGroup`), il builder (`FooterGroupBuilder`) espone quattro azioni in più:

```typescript
// nav.ts
import { FooterField } from './core/engine/footer-content';

export const navResolver: ShellNavResolver = {
    footer: (f, ctx) => {
        f.addGroup('footerAzienda', g => {
            g.addField(FooterField.RagioneSociale);
            g.addField(FooterField.PartitaIva);
            g.addField(FooterField.SedeLegale);
            g.addText('footerNote', 'Iscritta al REA di Milano'); // testo libero, mai tradotto: è un dato
            const linkedin = ctx.identity?.social?.find(s => s.url.includes('linkedin.com'));
            if (linkedin) g.addSocialLink(linkedin.url, linkedin.name ?? 'LinkedIn');
        });
    },
};
```

- **`addField(FooterField.<Campo>, { itemClass? })`**: legge e formatta il campo da `Identity` (`GET /identity`), con la formattazione di `identity-format.ts` (indirizzo, valuta...). Si nasconde da sé se l'identità del sito non valorizza quel campo: nessuna chiave i18n né forma dei dati da conoscere lato Dominio. `FooterField` (`core/engine/footer-content.ts`) copre 19 campi: dati societari (`RagioneSociale`/`PartitaIva`/`CodiceFiscale`/`PartitaIvaCodiceFiscale`/`RegistroImprese`/`NumeroRea`/`CodiceSdi`/`CapitaleSociale`/`CapitaleVersato`/`SocioUnico`/`InLiquidazione`), contatti (`SedeLegale`/`Telefono`/`Email`/`Pec`), ruoli GDPR (`RappresentanteLegale`/`TitolareDelTrattamento`/`ResponsabileProtezioneDati`), orari (`OpeningHours`).
- **`addText(label, value, { itemClass?, kind?, skipEmptyValue? })`**: coppia libera etichetta/valore; `value` non passa MAI da i18n (è un dato, non una stringa di interfaccia). `skipEmptyValue` (default `true`) nasconde la voce se `value` è vuoto, utile quando il valore viene da un'API.
- **`addSocialLink(url, label?, { itemClass?, authOnly? })`**: deliberatamente NON un `FooterField`: quali profili social mostrare, e in che ordine, è una scelta di progetto esplicita.
- **`addCustom(component, { inputs?, itemClass?, authOnly?, key? })`**: via di fuga per contenuto arbitrario, reso via `NgComponentOutlet`, stesso ruolo di `kind: 'raw'` in `structured-data.ts`: quando le altre forme non bastano.
- **`FooterSectionBuilder.hideLegalStrip()`** (a livello di `footer`, non di gruppo): spegne la fascia automatica delle pagine legali, per chi le inserisce a mano in un gruppo.

Senza `footer` in `nav.ts` vale il footer di serie dell'Engine (`defaultFooterResolver` in `shell-nav.ts`): dati societari, dati legali, contatti e, se l'identità li ha, i social. Un `footer` di progetto lo sostituisce per intero. La riga "small print" in fondo si cambia con `footerCopyright` (default: `© anno appName | diritti riservati`).

`ctx` nel resolver del footer include `identity: Identity | null` (oltre a lingua e login), risolto una volta insieme al resto: serve a filtrare `identity.social` come nell'esempio sopra, senza una seconda chiamata API.

Icona di brand nella navbar (`brandIcon`): campo opzionale di `ShellNavResolver`, sincrono o `async` come `header`/`footer`, risolto una volta insieme a loro. Restituisce una stringa: assente → `favIcon`, altrimenti lo stesso valore che passeresti ad `[appAsset]` (chiave di `mapping.json` o slug di un blob), per un'icona diversa dal favicon nell'header. È un dato risolto a runtime e dipende anche da un'API. Questo campo decide QUALE icona; SE comparire lo decidono `navbar.icona` del design system e `showBrandIcon` del ruolo (vedi «Ruoli di Pagina (`layout.role`)»).

```typescript
// nav.ts
export const navResolver: ShellNavResolver = {
    header: (nav) => { /* … */ },
    brandIcon: () => 'a1b2c3d4.png', // slug di un blob caricato, o (ctx) => …, se dipende dal contesto
};
```

### Pagine legali (`legal`)

Perché esiste: ogni sito deve pubblicare almeno una Privacy Policy che descriva i trattamenti reali, e i trattamenti cambiano con le funzioni accese (login, form, mail, analytics…). Scritta a mano, una policy resta indietro rispetto al codice. Qui la policy si compone dalle funzioni accese e dai fatti dell'installazione: una funzione nuova senza il suo testo ferma il build.

L'Engine genera le pagine legali: rotta sotto `/policy/`, `PolicyComponent` (`core/engine/pages/policy/`), Markdown localizzato, voce nella fascia legale del footer, ruolo `'legal'`, `noindex` di default (anche le `extra`).

#### Slot

La sezione `legal` di `site.ts` funziona come `homePage`/`loginPage`: uno slot per pagina standard, valorizzato con un `PageType` del progetto. Il nome dell'ID è libero (la demo li dichiara nel `PageType` di `site.ts`), il significato lo dà lo slot:
```typescript
legal: {
  privacy: { page: PageType.PrivacyPolicy, updated: new Date('2026-09-22') },  // obbligatoria
  cookie: PageType.CookiePolicy,          // obbligatoria con cookie o PWA; senza, la pagina non viene generata
  termsOfService: { page: PageType.TermsOfService, path: { fr: 'conditions' } },  // path: solo se vuoi un segmento tuo
  legalNotice: { page: PageType.LegalNotice, markdown: 'note-legali' },  // testo tuo: assets/legal/note-legali.<lingua>.md
  accessibility: {
    page: PageType.AccessibilityStatement, updated: new Date('2026-09-23'),
    nonAccessibili: [{ descrizioneKey: 'accMappa', motivo: 'fuori-ambito', alternativaKey: 'accMappaAlternativa' }],
  },
  extra: [{ page: PageType.WithdrawalPolicy, path: { it: 'recesso', en: 'withdrawal' }, titleKey: 'recessoPolicyMenu',
            descriptionKey: 'recessoPolicyDescrizione', markdown: 'recesso', updated: new Date('2026-09-22') }],  // assets/legal/recesso.<lingua>.md
},
```
- **Slot**: il `PageType` nudo basta; `{ page, updated }` aggiunge la data di aggiornamento, formattata in UTC e mostrata sotto il titolo, che finisce anche in `og:updated_time` e nel `dateModified` del JSON-LD. La data sta in `site.ts`, mai nel Markdown. Slot assente = pagina non generata.
- **`privacy`**: obbligatorio, ogni sito riceve almeno l'IP dei visitatori.
- **`cookie`**: obbligatorio con voci in `COOKIE_MAP` o `isWebApp: true` (errore al build se manca). Senza cookie la pagina non viene generata anche con lo slot valorizzato. `SiteConfig.cookiePolicy` è il suo `PageType`, oppure `null`.
- **`accessibility`**: riguarda i siti privati nello scope dell'European Accessibility Act (dal 28 giugno 2025: e-commerce, o fatturato >2M€/≥10 dipendenti, microimprese escluse). Lo stato di conformità lo scrive l'Engine (chiavi `acc*` di `basic.*.json`) in base a `nonAccessibili`, i contenuti non accessibili noti dichiarati nello slot: `{ descrizioneKey, motivo, alternativaKey? }`, testi in `addon.*.json`, `motivo` fra `'non-conformita'`, `'onere-sproporzionato'` e `'fuori-ambito'`. Senza voci il testo dice che il sito è progettato per rispettare WCAG 2.1 AA; con voci aggiunge che ha le criticità elencate e le elenca. `intro/` tiene titolo e una frase, `outro/` redazione e segnalazioni.
- **`markdown`** (forma oggetto di ogni slot): un testo tuo al posto della composizione dell'Engine, per esempio una Privacy Policy redatta dal tuo legale. `markdown: 'nome'` fa della pagina il file `src/assets/legal/<nome>.<lingua>.md`, uno per lingua del sito, aperto dal titolo `# `: niente parti per funzione, dati di navigazione generati, stato di accessibilità né sezione identità (il testo del legale li contiene già). Rotta, titolo, data e voce nel footer restano dell'Engine; nella Cookie Policy restano anche l'elenco dei cookie, dopo il testo perché lo genera `COOKIE_MAP`, il pannello delle preferenze e la guida ai browser. `nome` è un nome di file `[A-Za-z0-9_-]`, unico fra le pagine legali.
- **Path**: `/policy/<segmento>` col prefisso lingua (`/en/policy/...`), un segmento per lingua come il `path` delle pagine. Di serie: `privacy`, `cookie`, `legal` uguali in ogni lingua; `termini`/`terms`, `accessibilita`/`accessibility`. La forma oggetto dello slot accetta `path` (stringa unica o `{ lingua: segmento }`), che si fonde sopra quello dell'Engine; una lingua che nessuno dei due nomina (es. `fr`) usa il segmento inglese. Il `path` di una voce `extra` ha la stessa forma ma nessun segmento dell'Engine sotto: una lingua senza chiave usa quello della lingua di default, come nelle pagine.
- **Override**: una pagina dichiarata a mano in `pages` con lo stesso `PageType` vince (rotta dedicata, contenuto da API): l'Engine non la genera e non ne carica i testi. Le altre policy restano automatiche.
- **Footer**: le pagine attive compaiono da sé nella fascia legale a chiusura pagina (lo stesso schema dei footer PA/Designers Italia: link istituzionali separati dal menu, in una riga compatta), e una pagina spenta sparisce. Non vanno aggiunte nei resolver `header`/`footer` di `nav.ts`: comparirebbero due volte (per inserirle a mano in un gruppo c'è `hideLegalStrip()`).
- `setup.mjs` fa nascere un figlio con `legal: { privacy }` e il footer di serie.

#### Testi e ordine della pagina

Una cartella per pagina, `src/assets/legal/<cartella>/` (`privacy`, `cookie`, `TOS`, `legal`, `accessibility`), con dentro una cartella per parte e un file per lingua: `<cartella>/<parte>/<lingua>.md` (es. `privacy/intro/it.md`, `privacy/login/en.md`, `TOS/outro/it.md`). Markdown puro, senza segnaposto. L'Engine compone la pagina in quest'ordine:
1. `intro/` (obbligatoria): comincia col titolo `# ` della pagina, sotto il quale compare la data di aggiornamento e, in Privacy/Cookie/Accessibilità, un riepilogo **"in sintesi"** generato dall'Engine (vedi sotto), prima del corpo del testo.
2. Nella Privacy, ambito e dati di navigazione generati dall'Engine (vedi «Dati di navigazione e installazione» sotto).
3. Nella Cookie Policy composta, l'elenco dei cookie per categoria (Engine + `COOKIE_MAP`).
4. Le parti delle funzioni attive, nell'ordine della tabella sotto, ognuna col proprio titolo.
5. Nella Dichiarazione di accessibilità, lo stato di conformità con l'eventuale elenco dei `nonAccessibili`.
6. `outro/` (facoltativa).
7. Nella Cookie Policy: con `markdown`, l'elenco dei cookie; poi il pannello delle preferenze (quando il visitatore ha già risposto al banner) e la guida ai browser.
8. In coda, la sezione dell'identità, generata dal codice, con i campi che servono a quella pagina (un campo non valorizzato non compare; senza dati la sezione non compare, titolo compreso):
   - Privacy e Cookie, "Titolare del trattamento" (art. 13 GDPR): ragione sociale, sede legale, P.IVA/CF, titolare del trattamento e DPO se dichiarati, email, PEC, telefono.
   - Termini, "Gestore del sito": ragione sociale, sede legale, P.IVA/CF, email, PEC, telefono.
   - Note legali, "Gestore del sito" (D.Lgs. 70/2003 art. 7, art. 2250 c.c.): in più registro imprese, REA, capitale sociale e versato, socio unico, stato di liquidazione.
   - Accessibilità, "Contatti": ragione sociale, email, telefono, per segnalare una barriera.
   I campi sono `FooterField`, gli stessi del footer, risolti con `resolveFooterFields`: la ricetta di ogni pagina ne fissa l'elenco (`LegalRecipe.identity` in `legal-pages.ts`), i contatti sono i componenti cliccabili del footer.

| Parte | Pagina | Presente se |
| :--- | :--- | :--- |
| `login` | privacy | `Features.PublicLogin`. Il login riservato (`Features.Login`) è degli amministratori (il titolare, i suoi collaboratori o chi gestisce il sito per suo conto), che non si informano con la privacy policy pubblica |
| `form`, `mail`, `errorReporting` | privacy | `Features.Forms` / `Mail` / `ErrorReporting` in `global-settings.json` |
| `analytics`, `profiling` | privacy | `COOKIE_MAP` ha voci di quella categoria |
| `cookiePolicy` | privacy | la Cookie Policy esiste |
| `tracking` | cookie | `COOKIE_MAP` ha voci Analytics o Profilazione |

Funzione spenta = la parte non compare. Per dire qualcosa proprio a funzione spenta (es. "il sito non salva nulla sul dispositivo" senza Cookie Policy) c'è la sottocartella `off/` della parte (`privacy/mail/off/it.md`), che prende il posto della parte in quel caso: facoltativa, di serie nessuna.

**Riepilogo "in sintesi"**: informativa a strati (un riassunto in linguaggio semplice prima del testo esteso) sulla stessa pagina, invece che su una pagina separata — la forma raccomandata dal Garante quando non c'è un'informativa breve a parte. Compare, come citazione Markdown (`> `), prima di `intro/`, solo sulle pagine dove l'Engine conosce fatti veri da riassumere:
- **Privacy**: da `LegalFacts` (`renderNavigationSummary` in `core/engine/legal/hosting-info.ts`), stessi fatti di «Dati di navigazione e installazione» sotto — quali dati in breve, la conservazione massima dichiarata, se l'IP serve anche al rate limiting.
- **Cookie**: da `COOKIE_MAP` (categorie presenti, quante voci, se serve il consenso — sempre tranne che con le sole voci Technical).
- **Accessibilità**: dallo stato di conformità (`nonAccessibili` dello slot) — pieno, o parziale col numero di eccezioni note.

Termini di servizio e Note legali non ne hanno uno: sono testo del progetto da cima a fondo, e l'Engine non vi aggiunge un'affermazione che non possa verificare da sé. Come `nav*`/`acc*`, le chiavi `cookieSintesi*`/`accessibilitaSintesi*` di `basic.*.json` si ridefiniscono in `addon.*.json` senza toccare l'Engine.

Un link a un'altra pagina legale si scrive col nome del suo slot, `[Cookie Policy](policy:cookie)` (slot: `privacy`, `cookie`, `termsOfService`, `legalNotice`, `accessibility`): la pagina lo trasforma nel percorso di quello slot nella lingua corrente, e se quella pagina non esiste resta il solo testo. Uno slot scritto male ferma il build. Le voci `extra` non hanno uno slot: a una di loro si rimanda col suo percorso.

I testi di serie (chiavi `nav*` e `acc*` di `basic.*.json` comprese) si cambiano senza toccare l'Engine: le chiavi ridefinite in `addon.*.json` vincono, con gli stessi segnaposto `{0}`, `{1}` dell'originale; le parti Markdown sono file di progetto.

#### Controlli di build

`legal-check`, dentro `generate:statics`, controlla le lingue servite dal sito (`SupportedLanguages` normalizzate, o la lingua di default). Il build si ferma su:
- dentro la cartella di una pagina composta, una cartella o un file dal nome non previsto, perché non verrebbe mai caricato: sono ammesse le cartelle delle sue parti, e dentro una parte `<lingua>.md` e, per le parti a funzione, la cartella `off/`;
- `intro/` mancante, o un suo file che non comincia con `# `;
- una parte mancante per una funzione accesa;
- una cartella di parte presente (compresa `outro/` e `off/`) senza il file di ogni lingua del sito;
- una pagina con `markdown` senza il file di ogni lingua del sito, o con un file che non comincia con `# `;
- un link `policy:<slot>` con uno slot che non esiste;
- con la Privacy composta dall'Engine, un titolare senza nome o senza recapito in `backend/data/identity.json`: serve `ragioneSociale` (o `titolareDelTrattamento.nome`) e almeno uno fra `contatti.email`, `contatti.pec`, `contatti.telefono` (o `titolareDelTrattamento.email`). Il titolare sta nel file anche se il resto dell'identità arriva da `ComposeIdentityAsync`. Il build Docker del frontend non vede `backend/` e salta il controllo, che fanno build locale e CI; con la Privacy in `markdown` il titolare lo scrive il testo.

Il resto di `assets/legal/` è del progetto e il build non lo guarda: altri Markdown letti da un tuo componente, allegati da scaricare (es. il PDF del modulo di recesso linkato dal testo di una pagina `extra`), cartelle tue. Nome e unicità dei `markdown` li controlla `buildSite()`. Dentro le cartelle delle pagine, i file che iniziano con un punto, `Thumbs.db`, `desktop.ini`, `*~`, `*.swp`, `*.bak` sono ignorati.

#### Dati di navigazione e installazione

Dopo la premessa di `privacy/intro/` l'Engine scrive (chiavi `nav*`) l'ambito, cioè il sito coperto dall'informativa (`FRONTEND_BASE_URL` o `frontend.hostname`; senza, la frase non c'è), il titolo "Dati trattati e finalità" e la sezione "Dati di navigazione": quali dati registra il server, perché (sicurezza e diagnosi, col legittimo interesse concreto), per quanto e chi li tratta per conto del titolare. Dalla configurazione prende la durata del limite di richieste per IP (`Security.ApiConfig.RateLimiting`): la frase dice che l'IP è usato per non più della finestra più lunga fra quella generale e, col login acceso, quella dei login; con `Enabled: false` non c'è. Le soglie non entrano nel testo: l'informativa dice perché e per quanto si tratta un dato, non quante richieste si possono fare prima del blocco. Log con la stessa conservazione (stessa durata, o entrambi a rotazione) si nominano insieme in una sola frase, invece di ripetere la clausola di durata per ogni tipo di log. Il riepilogo "in sintesi" prima dell'intro è una funzione separata (`renderNavigationSummary`, vedi «Testi e ordine della pagina» sopra), sugli stessi fatti.

I fatti dell'installazione dipendono da dove pubblichi e non dal progetto: un file JSON per server, condiviso dai siti che ci girano, indicato in `global-settings.local.json` da `frontend.hostingInfo` (percorso relativo alla cartella di `global-settings.json`, es. `../hosting.json`, o assoluto). Schema in `core/engine/legal/hosting-info.schema.json`, esempio in `hosting-info.example.json` alla radice. Ogni campo è facoltativo e fa comparire la sua frase:
- `hosting` (`fornitore`, `paese` ISO, `garanzie`): il fornitore del server come responsabile del trattamento e il paese dei server, con "Unione europea" o "Spazio economico europeo" ricavati dal codice;
- `cdn`: un fornitore la elenca come responsabile; `false` (nessuna CDN) vale come l'assenza e nel testo non compare;
- `reverseProxy`: dice che i dati li registra il server che instrada le richieste;
- `log` (`tipo` `accessi`/`errori`/`applicazione`, `campi`, `conservazioneGiorni`, `ipAnonimizzato`): l'elenco esatto dei dati salvati (l'unione dei `campi` dei log accessi ed errori) e la conservazione reale: con `conservazioneGiorni` la durata ("per non più di 5 settimane"), da dichiarare quando una rotazione a tempo la garantisce (es. logrotate di Nginx); senza, che il log ha dimensione limitata e viene sovrascritto a rotazione. `applicazione` sono i log dei container del sito, che Docker ruota per dimensione: di norma si dichiarano senza giorni;
- `backend`: stessi campi, per il server delle API se gira su un altro server; il testo lo descrive in un paragrafo a parte.

Un paese fuori dallo Spazio economico europeo vuole `garanzie` (`adeguatezza`, art. 45, o `clausole-standard`, art. 46). Il file lo legge e valida l'SSR del build servito all'avvio e lo passa alla pagina; il deploy lo monta nel container (vedi [DOCKER_README.md](../DOCKER_README.md)). Indicato ma assente o non valido, il frontend non parte; non indicato, la sezione usa il testo generico e l'avvio lo segnala nel log. In `ng serve` il controllo all'avvio non c'è: un file non valido fa fallire il render di ogni pagina.

> I fatti (`LegalFacts`) sono già ridotti a ciò che il testo scrive: il limite di richieste è un solo numero di secondi (la finestra più lunga, quella dei login compresa solo col login acceso) o `null` se spento, e dei log applicativi restano tipo e conservazione. Così né la pagina né l'endpoint dicono più di quanto dice l'informativa (ad esempio che il limite è spento). Passano al browser via `TransferState`, come `APP_CUSTOM` (§«Configurazione di progetto»): ci sono solo se una pagina è stata renderizzata dal server almeno una volta in questa sessione. Se il primo caricamento è una pagina `requiresAuth` (mai renderizzata dal server) e da lì si apre la Privacy senza passare da nessun'altra pagina, `PolicyComponent` li chiede a `/internal/legal-facts` (stessa fonte, lato server): un solo tentativo, un errore di rete lascia il testo generico.

#### Caricamento

Il build scrive in `environment.legalFiles` quali parti esistono per ogni pagina composta, e il resolver chiede quelle, senza tentativi a vuoto; una pagina con `markdown` chiede il suo file. L'SSR del build servito legge i testi da disco (`dist/browser/assets/legal`) e li passa al browser nella pagina (`TransferState`), che all'idratazione non li riscarica; in `ng serve`, dove quella cartella non c'è, li chiede via HTTP come il browser. `/assets/legal/*` è protetto contro il path traversal (vedi «Protezione Path Traversal»). Una parte aggiunta dopo l'ultimo `generate:statics` non compare fino al riavvio di `npm run dev`.

#### Contenuto di serie

La Privacy segue l'art. 13 GDPR e descrive i trattamenti reali: `intro` con titolo e premessa, poi i dati di navigazione generati dall'Engine nella formulazione dell'informativa del Garante; ogni parte con base giuridica, interesse concreto dove la base è il legittimo interesse, e conferimento; `outro` con obbligatorietà, destinatari (il titolare tratta i dati; hosting e fornitori delle funzioni descritte sono responsabili del trattamento, art. 28), assenza di decisioni automatizzate, diritti con tempi di risposta e verifica dell'identità (art. 12), il caso dei dati non riferibili a una persona (art. 11), reclamo all'autorità di controllo del Paese dell'utente (art. 77) e ricorso all'autorità giudiziaria (art. 79). La Cookie Policy distingue i tecnici (senza consenso) dagli altri (con consenso). Termini, Note legali e Accessibilità rimandano ai recapiti della sezione identità finale. I link a norme puntano a EUR-Lex nella lingua del file; il reclamo non linka un'autorità nazionale. Nel progetto si aggiungono a mano fornitori extra-UE, contenuti incorporati e trattamenti propri.

#### Una policy in più

Per esempio il diritto di recesso di un e-commerce: una voce in `extra` con `page` (il suo `PageType`), `path`, `titleKey` e `descriptionKey` (chiavi i18n in `addon.<lang>.json`), `markdown`, `updated` facoltativo. Il testo è un file per lingua, `src/assets/legal/<markdown>.<lingua>.md`, aperto dal titolo `# `: niente parti né identità, come uno slot standard con `markdown`. Stesso trattamento delle standard (rotta, footer, data), in coda nella fascia del footer.

### Passare Dati a una Pagina: Component Input Binding

Il router è configurato con `withComponentInputBinding()` (`app.config.ts`): ciò che finisce nella rotta diventa un input della pagina, abbinato per nome, senza iniettare `ActivatedRoute`. Per passare qualcosa a una pagina lo metti nel canale giusto e la pagina lo legge con un signal-input dello stesso nome. I canali sono quattro, da scegliere in base a dove nasce il dato:

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

4. Il resolver è già cablato: ogni pagina foglia ha `route.resolve = { contentByResolve: … }`, l'Engine risolve il contenuto della pagina (il `contentLoader` dichiarato, eseguito dal `ContentResolver` dell'Engine) e lo consegna nell'input `contentByResolve`, che `PageBaseComponent` legge già (`input<ResolvedPage<T> | null>()`). Estendendo la base hai il contenuto risolto senza scrivere nulla; i tuoi `input()` servono per i canali 1-3.

> Chiavi riservate in `route.data`: il router fonde il tuo `data` con chiavi dell'Engine (`pageType`, `lang`, `pageFade`, `engineChrome`, più `contentByResolve` dal resolver), e le sue vincono sulle omonime nel tuo `data`. Non riusare quei nomi. `pageType` e `lang` arrivano a `PageBaseComponent` come input. Fra i canali usa nomi distinti: a parità di nome la pagina riceve un valore.

`withInMemoryScrolling()` gestisce la posizione di scroll: il ritorno alla pagina precedente ripristina la posizione; i link con `#section` scorrono fino all'ancora.

---

## 🧩 Configurazione di progetto (`Custom`)

`global-settings.json → Custom` è uno spazio libero per la configurazione di progetto (flag di progetto, ID analytics, soglie; le funzioni dell'Engine si accendono in `Features`, non qui): oggetti annidati arbitrari, senza toccare schema o codice infrastrutturale. È leggibile a ogni livello:

- **Backend (ASP.NET Core):** `IConfiguration["Custom:TuaChiave"]`
- **Node SSR:** `getBr1Settings().Custom`
- **Browser Angular:** `inject(APP_CUSTOM)` in qualsiasi componente o servizio; l'SSR serializza `Custom` in `TransferState` e il client la rilegge in idratazione (fallback `{}` senza SSR).

```typescript
import { APP_CUSTOM } from './core/engine/app-custom';

const custom = inject(APP_CUSTOM);
const trackingId = custom['Analytics']?.['TrackingId'] as string | undefined;
```

> `Custom` è committabile ed esposto al client: è il posto dei valori pubblici (feature flag, limiti, ID analytics); i segreti vivono in `global-settings.local.json`.

> ⚠️ `Custom` lato browser vuole l'SSR sulla rotta: `inject(APP_CUSTOM)` si popola dal `TransferState`, che esiste se la pagina è renderizzata dal server. Su una rotta `renderMode: 'client'` (incluse le pagine `requiresAuth`) il `TransferState` non viene emesso, e al caricamento diretto/refresh di quella rotta `APP_CUSTOM` è `{}`. Una pagina che legge `Custom` lato client (es. un token mappa) resta `renderMode: 'server'`: l'SSR rende la shell e popola il `TransferState`, e la logica browser sta in `afterNextRender`. Un valore da tenere fuori dal repo va in `Custom` di `global-settings.local.json` (gitignored): il merge in dev e il file effettivo in prod lo fanno arrivare comunque.

La configurazione risolta del sito, invece, è `inject(SITE_CONFIG)`: vedi «Usare il tema nel codice».

---

## 📡 Configurazione SSR e Origine Frontend

### `FRONTEND_BASE_URL` per og:image

L'URL canonico del sito è `FRONTEND_BASE_URL` (env var: in locale la passa `scripts/deploy.sh` da `frontend.hostname`; nelle release la passa la CI dalla repository variable omonima, vedi [RELEASE.md](../RELEASE.md)). Serve a costruire gli URL assoluti di `og:image` in SSR, qualunque siano gli header del reverse proxy (Nginx, Cloudflare):

```bash
FRONTEND_BASE_URL=https://tuodominio.it
```

Nel browser, senza il token, si ricade su `document.location.origin`. Conta nei deployment multi-dominio, dove SSR e browser vedono origini diverse.

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
| Comportamento | Identico a `[routerLink]`: cambio pagina SPA, tastiera, clic destro "Apri in nuova scheda" |
| Fallback | Un `PageType` non registrato in `site.ts` porta a `/` con un avviso in console (in dev-mode; nessun errore a runtime né a compile-time: il `PageType` è un identificatore valido, manca la rotta). Un link che porta alla home senza motivo apparente di solito è un `PageType` dichiarato ma mai aggiunto a `pages`. |
| `href` | Bindato esplicitamente: RouterLink come `hostDirective` non aggiorna il proprio `@HostBinding` via effect, e senza questo binding l'elemento avrebbe `href=null` e cursore testo invece di cursore link |
| Tipo | `input.required<PageType>()`: errore TypeScript a compile-time se mancante |

Regola pratica: `[appPage]` per tutti i link interni. Per un cambio pagina da codice dopo operazioni asincrone (es. redirect post-login, post-form) inietta `Router` e chiama `router.navigate([ContestoSito.getPath(PageType.X) ?? '/'])`.

---

## 🖼️ Directive di Rendering Dichiarativo

### `img[appImgRender]`: Rendering Immagine Generata

Applica `ImgBuilderService` su un `<img>`. Il `src` si aggiorna con il data URL PNG a ogni cambio della config. Niente wrapper, niente classi proprie: l'elemento accetta gli attributi `<img>` standard.

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
- **Race condition**: un token monotono evita che render asincroni sovrapposti mostrino un'immagine obsoleta
- **Selector vincolato**: `img[appImgRender]` → errore TypeScript a compile-time su elementi diversi da `<img>`

### `img[appQrContent]`: Rendering QR Code

Applica `QrCodeService` su un `<img>`. Il `src` si aggiorna con il blob URL del QR generato.

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
- **Output `errorChange`**: messaggio localizzato (o `null` se la generazione è riuscita)
- **SSR-safe**: `src = null` server-side
- **Selector vincolato**: `img[appQrContent]` → errore TypeScript a compile-time su elementi diversi da `<img>`

---

## 🖱️ `[appContextMenu]`: Menu Contestuale

La directive `ContextMenuDirective` aggiunge un menu contestuale a qualsiasi elemento: su desktop un popover sotto il cursore, su mobile/touch un bottom sheet a tutta larghezza. Monta in `.cdk-overlay-container`, e prende il tono della pagina (§«Tono»).

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
| Long-press 450 ms (touch/mobile, `pointer: coarse`) | Bottom sheet a tutta larghezza, comodo per il pollice |
| Tasto `Escape` | Chiude il menu |
| Click fuori dal menu | Chiude il menu |
| Focus | Ripristinato sull'elemento trigger alla chiusura |

La directive usa Pointer Events unificati (mouse, touch, penna). Un timer di sicurezza di 600 ms impedisce che il click sintetico dopo il long-press chiuda subito il menu appena comparso.

---

## 🃏 Componenti Condivisi

### `app-breadcrumb`: Percorso di Navigazione

Non si monta a mano: la shell lo include in `app.component.html`, sopra il pannello contenuti. Se compare lo decide il design system: spento di default, acceso con `breadcrumb.show: true` su ogni pagina tranne la home, e tolto da un ruolo che lo spegne (§«Ruoli di Pagina (`layout.role`)»). Separatore e soglia di troncamento sono `breadcrumb.stile` e `breadcrumb.maxVoci`.

Il percorso (Home → ... → pagina corrente) lo calcola `BreadcrumbService` risalendo l'albero di `ContestoSito.pages` dal `PageType` della rotta corrente: la stessa fonte del `BreadcrumbList` JSON-LD (vedi «JSON-LD Strutturato»), e le due gerarchie non divergono. Un genitore senza una propria pagina "indice" (es. `Policy`, un padre fatto di figlie, senza un `/policy` a sé, vedi `buildPolicySection` in `legal-pages.ts`) non conta come livello: il suo titolo si fonde in quello della figlia (`"Policy - Cookie Policy"` come un'unica etichetta) invece di comparire come gradino cliccabile a vuoto.

```typescript
// design system di progetto
export const mioDesignSystem = extendDesignSystem(cartaDesignSystem, {
    breadcrumb: { show: true },                         // acceso su ogni pagina tranne la home
    ruoloPagina: { legal: { showBreadcrumb: false } },  // tranne le policy
});
```

Per un percorso non deducibile dall'albero (es. un'entità di una pagina `dynamicParams` che vuole un livello in più, da dati esterni), sovrascrivi il resolver invece del componente:
```typescript
// site.ts
resolveBreadcrumb: (type, ctx) => {
    if (type !== PageType.SocialFeed) return null;    // null → torna al calcolo automatico
    return [
        { label: 'breadcrumbHome', path: '/' },
        { label: ctx.currentTitle ?? '', path: undefined },  // ultimo livello: mai un link
    ];
},
```

### `app-loading`: Spinner Condizionale

Avvolge un blocco di contenuto e mostra uno spinner finché `loading` è `true`, poi proietta il contenuto. Evita la coppia `@if (loading()) { spinner } @else { ... }` scritta a mano in ogni pagina, ed è già accessibile (`role="status"`, `aria-live`, testo i18n per gli screen reader).

```html
<app-loading [loading]="isLoading()">
    <!-- mostrato quando isLoading() è false -->
    <p>{{ risultato() }}</p>
</app-loading>
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `loading` | `boolean` (required) | `true` → spinner; `false` → contenuto proiettato |

### `app-icon`: Badge Icona FontAwesome

Glifo FontAwesome in pastiglia con forma e animazione hover configurabili. Valori non riconosciuti per `shape`/`animation` ricadono in silenzio sul default (coerce interno).

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

Pulsante social con icona e colore del network. Deduce il network dall'URL (regex sui social noti): basta passare il `value`, niente `type`. Per gli sconosciuti usa `fa-solid fa-link` (etichetta = hostname). Il `type` esplicito resta come override (utile alla galleria demo, dove l'URL è generico).

```html
<!-- URL e basta: icona dedotta (linkedin) — una lista contiene anche più profili dello stesso social -->
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

Componente presentazionale di basso livello: un `<a>` (in nuova scheda) con icona-pastiglia (`app-icon`) e testo opzionale. È il template su cui poggiano le famiglie "Contatto" e social (`app-social-link`), che gli passano i dati senza logica propria. Usalo per un link "a badge" generico fuori da quelle famiglie.

```html
<app-link-badge [href]="'https://example.com'" glyph="fa-solid fa-link" [text]="'Sito'" [showText]="true" />
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `href` | `string` (required) | URL di destinazione (in nuova scheda) |
| `glyph` | `string` (required) | Classe FontAwesome dell'icona |
| `color` | `string \| null` | Colore icona (`null` = tema) |
| `variant` | `'badge' \| 'button'` | `'badge'`: icona tonda + testo a fianco; `'button'`: pill button unico (default `'badge'`) |
| `text` | `string` | Testo visibile accanto all'icona |
| `showText` | `boolean` | Rende il testo (default `false`) |
| `ariaLabel` | `string` | Etichetta per `title`/`aria-label`, distinta dal testo |
| `fullWidth` | `boolean` | `true` → host `display: block` a tutta larghezza (default `false`, inline-block) |
| `layout` | `'responsive' \| 'row'` | Disposizione icona/testo: `'responsive'` (colonna su mobile, riga su sm+) o `'row'` (riga in ogni caso) |
| `action` | `() => void \| Promise<void>` | Override opzionale: se presente, al click sostituisce il link |

### Editor Markdown: `app-markdown-editor`

Perché esiste: un contenuto che poi passa da `| markdown` (descrizioni, pagine gestite da un'area riservata) scritto in una `<textarea>` nuda obbliga chi scrive a conoscere la sintassi e a indovinare il risultato. `MarkdownEditorComponent` (Engine, `core/engine/components/markdown-editor/`) è il campo di form per quei contenuti: barra dei comandi, scrittura colorata e anteprima escono dalla stessa pipeline (`MarkdownPipe`) che renderà il testo.

```html
<label class="form-label" for="descrizione">Descrizione</label>
<app-markdown-editor inputId="descrizione" [rows]="10" [(ngModel)]="descrizione" />
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `inputId` | `string` | Id della casella, per un `<label for>` esterno; generato se assente |
| `ariaLabel` | `string \| null` | Nome accessibile senza `<label>` visibile |
| `placeholder` | `string` | Testo segnaposto della casella |
| `rows` | `number` | Altezza minima in righe (default 8) |
| `labels` | `MarkdownEditorLabels` | Override di `boldPlaceholder`, `italicPlaceholder`, `linkPlaceholder` (il testo inserito da grassetto, corsivo e link senza selezione); un campo non passato ricade sulla chiave i18n. Stessa forma di `labels` di `app-upload-form` |

- **Campo di form**: `ControlValueAccessor`, funziona con `[(ngModel)]` e `formControlName`, stato disabled compreso.
- **Scrittura colorata** dal lexer della pipeline (`MarkdownPipe.lex()`), con la stessa regola di sicurezza URL: un link o un'immagine con URL non sicuro non si colora come link (l'immagine appare barrata, come l'HTML grezzo scartato). Nelle citazioni si attenua il `>`.
- **Barra** (`role="toolbar"`, un unico Tab stop; frecce Sinistra/Destra fra i bottoni con ritorno circolare, Home/Fine al primo e all'ultimo, bottoni disabilitati saltati): annulla, ripeti, grassetto, corsivo, titolo (`##`), sottotitolo (`###`), elenco puntato, elenco numerato, link, anteprima. L'anteprima ha un'etichetta fissa e lo stato in `aria-pressed`, mostra l'output reale della `MarkdownPipe` e si calcola quando è visibile. I bottoni con scorciatoia la dichiarano in `aria-keyshortcuts`.
- **Scorciatoie** nella casella: Ctrl/Cmd+Z annulla; Ctrl/Cmd+Y o Ctrl/Cmd+Maiusc+Z ripete; Ctrl/Cmd+B grassetto; Ctrl/Cmd+I corsivo; Ctrl/Cmd+K link.
- **Corsivo** con `*testo*` (funziona anche dentro una parola); per toglierlo valgono `*` e `_`. Gli spazi ai bordi della selezione restano fuori dai marcatori.
- **Invio negli elenchi**: su una voce piena aggiunge una voce con lo stesso marcatore e rientro; su una voce vuota annidata la porta al livello superiore; su una voce vuota di primo livello chiude l'elenco; dopo una linea orizzontale (`---`, `* * *`, `- - -`) va a capo e basta; negli elenchi numerati rinumera le voci successive dello stesso livello fino a fine blocco. Titolo ed elenco su righe rientrate conservano il rientro.
- **Cronologia propria**: si annulla una parola alla volta (lo spazio resta con la parola precedente); incolla, taglia, trascina, correzioni ortografiche e comandi della barra sono un passo a sé; al massimo 200 passi e ~2 milioni di caratteri in tutto (si scartano i più vecchi).
- **Etichette**: chiavi `mdEditor*` in `basic.*.json` (`mdEditorToolbar`, `mdEditorUndo`, `mdEditorRedo`, `mdEditorBold`, `mdEditorItalic`, `mdEditorHeading`, `mdEditorSubheading`, `mdEditorBulletList`, `mdEditorNumberedList`, `mdEditorLink`, `mdEditorPreview`, `mdEditorEmptyPreview`, `mdEditorBoldPlaceholder`, `mdEditorItalicPlaceholder`, `mdEditorLinkPlaceholder`), sovrascrivibili in `addon.*.json`.

### Componenti di Azione

Famiglia di bottoni icon-first per operazioni asincrone su contenuto (testo, Blob, PDF). Tutti includono uno spinner durante l'esecuzione e condividono questi input di base:

- `label`: chiave i18n per il testo del bottone (ogni componente ha la sua di default)
- `showLabel`: `false` icona senza testo (default), `true` icona + testo
- `fullWidth`: `false` (default): l'host resta inline-block; `true`: l'host diventa `display: block` a tutta larghezza, e il bottone interno (`w-100`) riempie il contenitore senza CSS nel padre

Quasi tutti vogliono anche `action` (required), funzione sincrona o asincrona che produce il contenuto; fanno eccezione `app-pdf-action` (usa `config`) e `app-print-action` (nessun input di contenuto: stampa la pagina corrente).

```html
<!-- Icona e basta (default) -->
<app-copy-action [action]="getMyText" />

<!-- A tutta larghezza (es. in una colonna stretta o un modale) -->
<app-copy-action [action]="getMyText" [showLabel]="true" [fullWidth]="true" />

<!-- Icona + etichetta -->
<app-copy-action [action]="getMyText" [showLabel]="true" />

<!-- Etichetta personalizzata -->
<app-copy-action [action]="getMyText" label="copiaRisultato" [showLabel]="true" />
```

#### `app-copy-action`
Copia negli appunti il testo restituito da `action`, tramite `ShareService`. (`action` restituisce `string | Promise<string>`.)

#### `app-share-action`
Condivide il contenuto tramite Web Share API (con fallback a copia sui browser che non la supportano). `action` restituisce `string`, `Blob` o `HTMLCanvasElement`: il componente sceglie da sé il canale.

| Input aggiuntivo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `title` | `string` | Titolo passato alla Web Share API (default `''`) |
| `filename` | `string` | Nome file per la condivisione di `Blob`/Canvas |

#### `app-speech-action`
Legge il testo ad alta voce tramite `SpeechService`. Bottone toggle: in riproduzione mostra lo stato "stop" e si interrompe alla distruzione del componente.

| Input aggiuntivo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `labelStop` | `string` | Chiave i18n per l'etichetta in riproduzione (default `'speechStop'`) |

#### `app-download-action`
Scarica il `Blob` restituito da `action` col nome file indicato. (`action` restituisce `Blob | Promise<Blob>`.)

| Input aggiuntivo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `filename` | `string` (required) | Nome del file scaricato |

#### `app-pdf-action`
Mostra o scarica un PDF. Usa `config` al posto di `action`: lavora sull'URL senza produrre un Blob in memoria. `openInTab: true` lo mostra in una nuova scheda; `false` forza il download via `fetch` (con fallback a `window.open` per PDF cross-origin senza CORS).

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `config` | `PdfActionConfig` (required) | `{ url: string; openInTab: boolean }`: URL del PDF e modalità |

#### `app-print-action`
Chiama la stampa nativa del browser (`window.print()`). Non vuole `action`. Non è montato nel template di default (vedi «Stampa/PDF», che copre la resa senza un bottone): serve a un progetto che vuole un'affordance di stampa puntuale su una pagina specifica (es. una fattura, un articolo). Si esclude dalla propria stampa (`d-print-none` intrinseco).

#### `app-like-action`
Registra un apprezzamento tramite `action` (nessun contenuto prodotto: segnala un evento). Bottone a stato piatto: una volta `liked`, il click è no-op (niente "togli mi piace") e il bottone resta attivo (`.active`, `aria-pressed="true"`).

| Input aggiuntivo | Tipo | Descrizione |
| :--- | :--- | :--- |
| `liked` | `boolean` | Stato iniziale "già piaciuto" (default `false`) |

### Componenti di Contatto

Famiglia di link (`<a>` con l'aspetto di bottoni) per contattare attraverso canali esterni senza logica in Angular, con i link in nuove tab e indicizzazione SEO corretta.

I componenti condividono le configurazioni standard:
- `config` (required): oggetto con i parametri del canale
- `label`: chiave i18n
- `showLabel`: `false` icona senza testo (default)

```html
<app-mail-contact [config]="{ to: 'info@example.com', subject: 'Contatto' }" [showLabel]="true" />
<app-whatsapp-contact [config]="{ phone: '+393331234567', text: 'Ciao!' }" />
```

#### `app-mail-contact`
Genera un link `mailto:` precompilato.

#### `app-phone-contact`
Genera un link `tel:` per chiamate dirette dal dialer.

#### `app-whatsapp-contact`
Genera un link `wa.me` per una chat WhatsApp con testo precompilato.

#### `app-telegram-contact`
Genera un link `t.me` per una chat Telegram.

### Aggiungere un componente d'azione (o di contatto)

Le due famiglie sopra poggiano su una base comune, `BaseActionComponent` (`core/engine/components/base/base-action.component.ts`, Engine), che incarna il principio dei componenti autonomi: chi usa il bottone non inietta mai un servizio, passa al massimo una funzione che produce il dato. La base centralizza la parte "sporca" una volta:

- gli input `label` / `showLabel` / `fullWidth` (con l'host che diventa `display: block` quando `fullWidth`);
- la traduzione dell'etichetta (`displayLabel`), che ricade su `defaultLabelKey` senza una `label`;
- il metodo protetto `run(work)`, che gestisce il flag `loading()`, impedisce la doppia esecuzione (se è già in corso fa no-op), esegue il lavoro asincrono e, in caso di errore, mostra un toast `erroreImprevisto`.

Un tuo bottone d'azione, specifico del progetto e non generico abbastanza da stare nell'Engine, va in `components/shared/**` e dichiara due cose: la chiave i18n di default e la logica dentro `run()`. Il resto lo eredita dalla base dell'Engine.

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
        // run() pensa a loading, doppio click e toast d'errore: tu scrivi la logica
        void this.run(() => this.api.archive(this.itemId()));
    }
}
```

Nel template chiami `onClick()` sul bottone, leggi `displayLabel()` per il testo e `loading()` per lo spinner, come fanno `app-copy-action` o `app-pdf-action` (quest'ultimo estende la base e sovrascrive `displayLabel` per cambiare etichetta secondo `openInTab`). I componenti di contatto seguono lo stesso principio su una base diversa, `BaseContactComponent` (`core/engine/components/base/base-contact.component.ts`, Engine): sono link e non azioni, e specializzano `BaseLinkComponent` invece di gestire `run()`; ogni canale concreto dichiara `defaultLabelKey`, `glyph`, `color` e l'`href` derivato dalla `config`.

---

## 🏗️ Script di Build: `generate-statics.ts`

Lo script sincronizza i file statici e inietta nel frontend (via `src/environments/environment.ts`) l'identità minima del progetto: `project.name`/`project.version`, i codici lingua (`Localization`), `site.description` e `site.colorTema`, e `Features` da `global-settings.json`. I codici lingua sono il seed di build (shell, fallback `pickLocaleText`, routing per lingua); la cultura runtime (nomi nativi, giorni, formattazione) la deriva il frontend via `Intl`. Struttura e comportamento (pagine, `shell`, design system, `isWebApp`, `loginPage`, `legal`) restano in `site.ts`; il menu vive in `nav.ts`. Va eseguito a ogni modifica di `global-settings.json`, di `site.ts`, del design system o dei testi legali: è il pre-hook di `start`, `start:docker`, `dev`, `build` e `watch`; in Docker la config arriva con l'ARG `BR1_PROJECT_JSON`.

Il build si ferma su:
- `Features` scritto male (chiave sconosciuta, maiuscole diverse, valore non booleano) o presente in `global-settings.local.json`;
- login acceso senza `loginPage` in `site.ts`;
- `site.colorTema` non esadecimale, o un design system non valido (`validateDesignSystemPreset`);
- testi legali non conformi (vedi «Pagine legali (`legal`)»).

```bash
npm run generate:statics
```

### File Aggiornati

| File | Contenuto sincronizzato |
| :--- | :--- |
| `src/index.html` | `<html lang>` (+ `dir`), `<title>`, i meta OpenGraph/Twitter, `<link rel="icon">`, `<link rel="apple-touch-icon">` |
| `public/manifest.webmanifest` | `name`, `short_name`, `id`, `description`, `lang`, `dir`, `theme_color`, `background_color`, `icons` (`any`/`maskable`), `version`, con `isWebApp:true` |
| `public/robots.txt` | `Allow: /` + URL sitemap. Le pagine protette **non** sono elencate (un robots.txt è pubblico e ne rivelerebbe i path): la loro non-indicizzazione la gestisce il server SSR con `X-Robots-Tag: noindex` |
| `public/llms.txt` | Indice del sito per i crawler AI (convenzione `llms.txt`): nome, descrizione, elenco pagine |
| `public/security.txt` | Contatto di sicurezza RFC 9116 (`Expires` rigenerato a ogni build); servito sul percorso canonico `/.well-known/security.txt` dal Node SSR |
| `public/theme-init.js` | Script anti-flash del tema (vedi «Anti-flash e build»): sincrono nel `<head>`, imposta `data-bs-theme` prima che si carichino gli stili |
| `src/styles/engine/generated/_theme.scss` | Il design system attivo come dati Sass: colori per tono, colori di palette, movimento, elevazione, alone, font. Lo compilano `styles/engine/bootstrap.scss` e `base.scss` |
| `src/environments/environment.ts` | `defaultLang`, `availableLanguages`, `features`, `configFingerprint`, `legalFiles`: **file generato, non modificarlo a mano** |

> `sitemap.xml` non è un file di questo script: è un endpoint runtime (`GET /sitemap.xml`, vedi «sitemap.xml: endpoint runtime, non file statico»).

> `configFingerprint`: guardia contro un `environment.ts` non rigenerato. Un hash (12 caratteri) delle sezioni identity-critiche di `global-settings.json` (`project`/`Localization`/`site`/`Features`). Il Node SSR lo ricalcola al boot dal config letto a runtime e lo confronta con quello del bundle: se non coincidono stampa un warning (capita lanciando `ng serve` senza i pre-hook, o cambiando `global-settings.json` senza rilanciare `npm run generate:statics`). Non blocca l'avvio: è un segnale di dev. `Features` fa eccezione: se i flag del file montato differiscono da quelli compilati, `server.mjs` avviato come processo principale esce con codice 1 (in `ng serve` il controllo non gira).

> Versionati vs output di build: due output generati sono versionati come seed, `src/index.html` e `src/environments/environment.ts`, perché servono al type-check e alla build prima della prima rigenerazione (`index.html` è il documento di build, `environment.ts` è importato dal TS): lo script li tiene aggiornati e la diff si committa insieme a `global-settings.json`. Ciò che finisce in `public/` (`manifest.webmanifest`, `robots.txt`, `theme-init.js`, `icons/`, la copia degli asset) è output di build, gitignored (`public/` è ignorata per intero), rigenerato dal pre-hook, mai committato. Lo stesso vale per `src/styles/engine/generated/`.

### sitemap.xml: endpoint runtime, non file statico

`sitemap.xml` non è un file generato al build: è un endpoint (`GET /sitemap.xml`, `server/routes/dynamic-sitemap.ts`), montato in `server.ts` prima dello static handler. Usa gli stessi calcoli di `generate-statics` (via `services/sitemap-xml.ts`, condiviso) più l'espansione delle pagine con `dynamicParams` (campo opzionale di `LeafPageInput`, in `siteBuilder.ts`: una funzione che recupera dal backend l'albero `SlugNode[]` degli slug accettati per una rotta con `:segmenti`), non enumerabili a build time perché il catalogo arriva da un'API. Cache in-process con TTL (default 7 giorni, env var `SITEMAP_CACHE_TTL_MS` in millisecondi): l'aggiornamento primario è la notifica on-demand dal backend (`POST /internal/revalidate-sitemap`, `SitemapNotifier`, vedi backend/README.md) dopo una scrittura su un catalogo `dynamicParams`, e il TTL è il fallback per una notifica persa. Il consumer è quasi sempre un crawler e non serve ricalcolare a ogni accesso; gli accessi concorrenti durante un ricalcolo condividono la stessa promise, e se il ricalcolo fallisce con una cache scaduta disponibile si serve quella invece di un errore. `robots.txt` punta allo stesso URL (`Sitemap: <base>/sitemap.xml`).

### Icone del sito automatiche (`generate-icons.ts`)

Un secondo script, `generate-icons.ts`, deriva **quattro** file da un asset, `favIcon` dichiarato in `mapping.json` (ridimensiona con `sharp`, con fallback a copia semplice se `sharp` manca):

| File | Uso | Trattamento |
| :--- | :--- | :--- |
| `public/icons/icon-192x192.png` | `<link rel="icon">`, manifest (`purpose: any`) | resize semplice, trasparenza originale preservata |
| `public/icons/icon-512x512.png` | `og:image`/`twitter:image` di fallback, badge anteprime social, manifest (`purpose: any`) | sfondo brand pieno, artwork a bordo pieno (mai trasparente) |
| `public/icons/icon-512x512-maskable.png` | manifest (`purpose: maskable`) | sfondo brand pieno, artwork ridotta all'80% del canvas (safe-zone), altrimenti il masking adattivo di Android taglierebbe i bordi |
| `public/icons/apple-touch-icon-180x180.png` | `<link rel="apple-touch-icon">` | stesso trattamento della maskable (iOS non gestisce la trasparenza) |

Le prime due icone e l'Apple Touch Icon si generano in ogni caso, anche con `isWebApp:false`: favicon e "Aggiungi a Home" su iOS non dipendono dall'installabilità PWA. `icon-512x512-maskable.png` serve al manifest (generata comunque, consumata con `isWebApp:true`).

`any` e `maskable` sono due file distinti apposta, mai un'unica icona con `"purpose": "any maskable"`: un'icona pensata per il masking ha già il proprio padding di sicurezza, e usata anche come `any` apparirebbe rimpicciolita fuori da un contesto di masking adattivo (Chrome DevTools e web.dev sconsigliano la combinazione).

Lo script gira negli stessi pre-hook di `generate-statics` e non va lanciato a mano. Se la chiave `favIcon` manca da `mapping.json`, o il file che dichiara non esiste su disco, il build si ferma con un errore esplicito invece di lasciare le icone assenti in silenzio (404 su favicon/manifest/anteprime social a runtime).

### Variabili d'Ambiente

| Variabile | Descrizione | Fallback |
| :--- | :--- | :--- |
| `FRONTEND_BASE_URL` | URL canonico del sito (es. `https://tuodominio.it`), per gli URL assoluti `og:image` | `https://example.com` con warning |

Lingua di default e lingue supportate non sono variabili d'ambiente: lo script le ricava dalla sezione `Localization` del progetto (codici a 2 lettere). Su host/CI legge `global-settings.json`; nelle immagini Docker (dove il file non è nel build context) legge gli stessi dati da `BR1_PROJECT_JSON`, il JSON di progetto che `scripts/deploy.sh` (build locale) o la CI di release passa come build-arg. È il seed di build; nomi nativi e primitivi di cultura li deriva il frontend via `Intl` (`LocalizationService`).

### Esclusioni Automatiche da Sitemap e Indicizzazione

| Condizione sulla pagina | Effetto |
| :--- | :--- |
| `enabled: false` | Esclusa dalla sitemap |
| `externalUrl` presente | Esclusa dalla sitemap |
| `requiresAuth: true` | Esclusa dalla sitemap **e** marcata `noindex` dal server SSR (`X-Robots-Tag: noindex, nofollow`), senza comparire in robots.txt. Forza anche il client-render |
| `otherSEO: { noindex: true }` | Esclusa dalla sitemap **e** marcata `noindex` dal server SSR (`X-Robots-Tag: noindex, nofollow`). A differenza di `requiresAuth` la pagina resta **pubblica e SSR**, non indicizzabile (es. landing duplicate, thank-you) |

Le pagine legali (`legal/legal-pages.ts`, `extra` comprese) e la pagina di login hanno `otherSEO: { noindex: true }` di default: pagine di servizio, niente crawl budget speso su contenuti che non portano traffico. Per indicizzarle, la pagina si dichiara a mano con `otherSEO.noindex: false` (override standard).

> Deploy non indicizzabile (staging): per un'anteprima/staging dietro lo stesso reverse proxy della produzione, imposta l'env var `SEO_NOINDEX=true` sul container Node SSR: il server emette `X-Robots-Tag: noindex, nofollow` su ogni risposta e serve un `robots.txt` dinamico `Disallow: /`. Default off: in produzione il sito resta indicizzabile. Vedi [DOCKER_README.md](../DOCKER_README.md).

### `sitemap.xml`: `loc` e `xhtml:link`, `<lastmod>` dove è verificabile

La sitemap emette `<loc>` e i blocchi `xhtml:link` (hreflang). Niente `priority`/`changefreq`: Google li ignora, e restano peso morto nel file.

Niente `<lastmod>` generico per le pagine STATICHE: una data identica su ogni URL del sito (aggiornata a mano) non è un segnale che Google verifica, e comunicarla rischia di far scartare il tag come inattendibile. `<lastmod>` compare dove è per entità e verificabile: le pagine generate da `dynamicParams`, se il backend espone una data di modifica sul nodo FOGLIA del ramo (`SlugNode.lastModified`, YYYY-MM-DD; un nodo intermedio, es. una categoria in una rotta multi-segmento, non produce una entry propria). Se il nodo non la porta, `<lastmod>` viene OMESSO per quella URL invece di ricadere su una data generica.

### `og:updated_time`

Vale `project.lastModified` di `global-settings.json` (formato italiano `GG/MM/AAAA`, convertito in `YYYY-MM-DD`), da aggiornare a mano quando i contenuti cambiano. Fallback alla data corrente se il campo è assente o non valido. Una pagina legale con `updated` usa la propria data. Riguarda il tag Open Graph e il `dateModified` del JSON-LD, non il `<lastmod>` della sitemap (vedi sopra).

### `og:locale`

`og:locale` in `index.html` usa il formato regionale OpenGraph `lingua_REGIONE` (es. `it` → `it_IT`), derivato dalla `DEFAULT_LANG` via `Intl.Locale().maximize()`, coerente con il formato emesso a runtime da `PageMetaService`. Lo stesso file imposta anche `<html dir="ltr|rtl">` dalla `DEFAULT_LANG` (la stessa lista statica di codici RTL di `TranslateService`).

---

## 📦 Bundling frontend: budget, code-splitting e i confini del builder

Il builder è `@angular/build:application` (`angular.json → architect.build.builder`): impacchetta con esbuild dietro un'interfaccia dichiarativa, senza un `esbuild.config.*`/`webpack.config.*` da estendere. È un confine di design, non una lacuna: le leve di un progetto figlio stanno in `angular.json`, negli stessi punti di contatto elencati nella tabella «Condivisi con punti di contatto» del [README radice](../README.md).

| Leva | Dove | Effetto |
| :--- | :--- | :--- |
| `budgets` (`configurations.production`) | `angular.json` | Soglia sul peso del bundle iniziale (`950kB` warning, `1.1MB` errore, vedi sotto il perché di questi numeri) e per stile di componente (`6kB`/`10kB`). **`maximumError` è il gate anti-regressione**: fa fallire `ng build` (e la CI); `maximumWarning` stampa un avviso e il build riesce |
| `allowedCommonJsDependencies` | `angular.json` | Whitelist delle dipendenze CommonJS (niente tree-shaking, altrimenti warning bloccante). Qui va una libreria di terze parti che non spedisce ESM (`qrcode` c'è già per il template) |
| `styles` / `scripts` | `angular.json` | CSS/JS globali caricati prima del bundle applicativo: Bootstrap compilato dall'Engine (`styles/engine/bootstrap.scss`), FontAwesome e SweetAlert2 da `node_modules` |
| `assets` | `angular.json` | Glob di file copiati così come sono, fuori dal bundle JS |

Budget iniziale (`950kB`): il bundle iniziale del template (senza una riga di contenuto del progetto figlio) pesa ~860kB raw / ~190kB trasferiti (gzip); la cifra che conta per chi visita il sito è quella trasferita, mentre il budget di Angular CLI misura il peso raw. La scomposizione, dal più pesante:

| Voce | Peso raw sorgente | Nota |
| :--- | ---: | :--- |
| Bootstrap (CSS completo) | ~230kB | Compilato da sorgente coi colori del design system (`styles/engine/bootstrap.scss`), tutti i moduli |
| Angular (core/common/router/forms/platform-browser) | ~90kB gzip | Costo fisso di qualunque app Angular con questi moduli, non ottimizzabile qui |
| Font Awesome (solid + brands, classi icona) | ~72kB | I glifi sono in file `.woff2` (caricati a parte, fuori dal bundle): questo è il CSS che mappa ogni classe `.fa-*` al proprio carattere |
| SweetAlert2 (tema CSS) | ~5kB | Il JS della libreria è dietro `import()` dinamico (`notification.service.ts`), in un chunk lazy |
| Stili propri dell'Engine + CDK overlay | ~5kB | Trascurabile |

Il limite non cresce con le pagine del progetto figlio: sono lazy-loaded una per una (`component: () => import(...)`, vedi sotto) e non contano nel bundle iniziale (misurato costruendo sia un progetto vuoto sia il template con qualche pagina in più: il numero cambia di pochi kB). È il costo fisso di includere Bootstrap e Font Awesome per intero anziché un sottoinsieme: il template non taglia componenti Bootstrap o icone che un progetto figlio userebbe senza che l'Engine lo sappia (un sito che non usa `.carousel` lo userà magari domani). Il budget alto è la conseguenza di quella scelta: se un progetto figlio arriva a `950kB` col proprio codice (non con il template e basta) è il segnale reale, e a quel punto si alza la soglia lì o si sposta quel contenuto dietro un `import()` dinamico. Se un `ng build` pulito del template appena clonato è già vicino alla soglia, il problema è a monte, qui, non nel figlio.

Code-splitting: automatico, segui il pattern esistente. Ogni pagina, nel suo file di area, si dichiara con `component: () => import('./.../x.component').then(m => m.XComponent)`: il router genera un chunk lazy per pagina senza altra configurazione. Per un SDK di terze parti pesante (mappe, player video, chat) lo stesso principio va applicato a mano: `import()` dinamico dentro il componente/servizio che lo usa, non un import statico in cima al file, così il codice entra nel bundle quando serve (e, se l'SDK scrive cookie/Web Storage, dietro il gate del consenso: vedi «Aggiungere voci in `COOKIE_MAP`», [AGENTS.md](../AGENTS.md#persistere-dati-lato-client-cookie-web-storage-consenso)).

Cosa resta fuori per scelta: chunking manuale, plugin esbuild custom o un builder alternativo (webpack, Vite) non sono seam supportati: vorrebbero sostituire `architect.build.builder`, che è scaffold del template (vince il template al merge). Un progetto che arriva a un limite che budget, code-splitting e CommonJS-allowlist non risolvono lo porta a monte (Engine), senza aggirarlo nel figlio.

---

## ⚙️ Server SSR: Sicurezza e Performance

### Health Check JSON

L'endpoint `/health` restituisce JSON strutturato:

```json
{
  "status": "ok",
  "mode": "ssr",
  "auditPaths": ["/", "/policy/privacy", "/policy/cookie"],
  "imageCache": { "hits": 120, "misses": 14, "hitRate": 0.8955 }
}
```

`auditPaths` è la lista delle pagine pubbliche SSR statiche per gli audit live (il nome copre Pa11y e Lighthouse, non soltanto l'accessibilità). È separata dalla sitemap di proposito: include le pagine `noindex`, comprese le policy legali, perché restano superficie utente da verificare; contiene la lingua di default (`Localization.DefaultLanguage`) e basta, perché le varianti di lingua di una pagina condividono template e markup (cambia il testo tradotto) e un audit strutturale o di performance darebbe lo stesso esito in ogni lingua. Pagine protette e client-only restano escluse.

Le pagine `dynamicParams` (rotte parametriche enumerate a runtime dal backend, es. `social-feed/:slug`) NON sono in `auditPaths`: arrivano da un endpoint dedicato, `GET /internal/dynamic-audit-paths`, che le raggruppa per `pageType` (una entry `{ "pageType": ["/path1", "/path2", ...] }` per gruppo, lingua di default). `live-test.sh` (`scripts/test/`) campiona OGNI gruppo per conto suo, non un unico campione su tutte le pagine dinamiche mescolate: un `pageType` con mille entità (es. un blog) non "ruba" campione a uno con cinque (es. la demo `social-feed`), perché sono componenti indipendenti con un proprio profilo di accessibilità e performance. Pa11y campiona fino a 100 istanze per gruppo (`A11Y_DYNAMIC_MAX`), Lighthouse fino a 5 (`LIGHTHOUSE_DYNAMIC_MAX`, seriale e costoso per pagina; le istanze di uno stesso `pageType` condividono template); oltre il tetto ciascun gruppo seleziona un campione distribuito e deterministico sul proprio elenco.

`imageCache` sono i contatori hit/miss della cache su disco delle miniature (`/cdn-cgi/asset`, `/cdn-cgi/preview`, vedi «Cache Immagini su Disco»): `hits` sono gli accessi serviti dalla cache, `misses` quelli che hanno lanciato un job sharp (decode/resize), `hitRate` il rapporto (`null` prima del primo accesso). In memoria e per processo, azzerati a ogni riavvio: bastano a valutare se `IMAGE_CACHE_MAX_MB` è dimensionato bene per il traffico reale, senza un sistema di metriche esterno.

### Status Code SEO-Aware

Il server imposta lo status code HTTP reale in base al path, confrontandolo con le pagine note di `site.ts`. Senza questo controllo Angular SSR risponderebbe `200` anche alle rotte che rendono la pagina 404 del sito (un soft 404: i crawler vedono una pagina di errore servita con esito positivo e continuano a indicizzarla).

| Path | Status HTTP restituito |
| :--- | :--- |
| Path corrispondente a una pagina dichiarata | Status originale di Angular (di norma `200`) |
| Path non corrispondente a nessuna pagina | `404 Not Found` |
| `/error/{codice}` (es. `/error/403`) | Il codice indicato (`403`) |
| `/error` | `500` |

Il body resta quello reso da Angular (la pagina di errore del sito); cambia lo status code della risposta, e i motori di ricerca de-indicizzano gli URL inesistenti.

### Host Allowlist (HTTP 421)

Gli host non autorizzati ricevono `HTTP 421 Misdirected Request` prima di raggiungere il proxy API o l'SSR. Il controllo usa `request.hostname` dopo `app.set('trust proxy', ...)`.

```bash
NG_ALLOWED_HOSTS=tuodominio.it,www.tuodominio.it
```

Default (nessuna variabile impostata): `localhost`, `127.0.0.1`, `[::1]`, per lo sviluppo locale senza configurazione aggiuntiva.

> Nota: `@angular/ssr` non riconosce `*` come wildcard globale (lo tratta come match letterale, con `400 Bad Request` per qualsiasi host reale). Per più host, elencali separati da virgola in `NG_ALLOWED_HOSTS` (env var che ha la precedenza), oppure valorizza `frontend.hostname` in `global-settings.local.json`.

### CSP Nonce Per-Request (Produzione)

In produzione (`node server.mjs`), ogni risposta SSR ha un nonce casuale a 16 byte (base64url):
- sostituisce `{NONCE_PLACEHOLDER}` nell'header `Content-Security-Policy`, in `script-src` e in `style-src-elem` (lo stesso nonce per le due direttive);
- Angular inietta `nonce="..."` sugli `<script>` inline e sugli `<style>` di style encapsulation generati in SSR (via `CSP_NONCE`, `app.config.server.ts`);
- `style-src-attr` resta su `'unsafe-inline'`: copre i binding `[style.x]`/`[ngStyle]` (navbar, icone), valori per istanza, e i browser non supportano nonce sugli attributi `style`;
- in development (HMR attivo) vale `unsafe-inline` ovunque (lo vuole l'HMR).

### Estendere la CSP (domini esterni: mappe, analytics, CDN)

La Content-Security-Policy base vive in [`security-headers.json`](../security-headers.json) alla radice, sorgente condivisa letta dal backend .NET e dal Node SSR (il layer che la invia al browser, `security-headers.ts`). Il default è restrittivo: `default-src 'self'`, nessun dominio esterno.

`security-headers.json` è un file del **template**: identico per ogni progetto, aggiornato dal merge dell'upstream. **Non va modificato a mano**: il Node SSR ne verifica lo sha256 all'avvio (`EXPECTED_TEMPLATE_SHA256` in `security-headers.ts`) e non parte se il contenuto su disco non combacia, così una modifica locale non diverge in silenzio dai futuri aggiornamenti del template.

Un servizio di terze parti (tile di una mappa, analytics, font da CDN, un player embed) resta bloccato dal browser finché il suo dominio non è autorizzato nella direttiva giusta, in [`security-headers.override.json`](../security-headers.override.json), anch'esso alla radice: file del **progetto figlio**, committabile (non un segreto), che il template non tocca mai. Ogni chiave sotto `csp` è una direttiva; i valori vengono **aggiunti** a quelli del template, mai in sostituzione:

| Cosa integri | Direttiva da estendere |
| :--- | :--- |
| fetch/XHR/WebSocket (API esterne, tile mappa) | `connect-src` |
| `<script>` da CDN | `script-src` |
| Immagini da host esterni | `img-src` |
| Font da CDN (es. Google Fonts) | `font-src` (+ `style-src-elem` per il `<link>` del CSS del font; `style-src` è ignorato per `<link>`/`<style>` quando c'è `style-src-elem`) |
| `<iframe>` embed (YouTube, Spotify, ...) | `frame-src` |
| Audio/video diretti | `media-src` |

Esempio: abilitare Mapbox:
```json
{
  "csp": {
    "connect-src": ["https://api.mapbox.com", "https://events.mapbox.com"],
    "script-src": ["https://api.mapbox.com"]
  }
}
```

Il nonce per risposta (`'nonce-...'`) resta in `script-src` a prescindere da questo file: lo aggiunge il server. Una direttiva assente da `security-headers.override.json` (o l'intero file assente) lascia la CSP del template invariata.

### Estendere la Permissions-Policy (fotocamera, microfono, geolocalizzazione)

Stesso principio della CSP, stesso file: `security-headers.json` fissa anche la `Permissions-Policy` (default restrittivo: `camera=(), microphone=(), geolocation=(), browsing-topics=()`, nessuna feature autorizzata) ed è protetto dallo stesso controllo di integrità: non va modificato a mano nemmeno per questo.

Una pagina che usa `navigator.geolocation`, la fotocamera o il microfono va autorizzata in [`security-headers.override.json`](../security-headers.override.json), sezione `permissionsPolicy`: ogni chiave è una feature, i valori (`self`, o un'origine tra virgolette) vengono **aggiunti** a quelli del template, mai in sostituzione. Il gate è a livello di sito (l'header vale per l'intero documento, non per rotta): se una pagina usa il GPS, autorizzare `geolocation` qui lo rende disponibile in tutto il sito.

Esempio: autorizzare la geolocalizzazione per il proprio dominio (una pagina con una mappa che usa la posizione dell'utente):
```json
{
  "permissionsPolicy": {
    "geolocation": ["self"]
  }
}
```

Una feature assente da `security-headers.override.json` (o l'intero file assente) lascia la Permissions-Policy del template invariata (negata).

### X-Request-Id: Correlazione SSR ↔ Backend

Ogni risposta porta un `X-Request-Id` (riusato dal reverse proxy a monte se presente e ben formato, alfanumerico + `.-_`, max 128 caratteri, altrimenti generato con `randomUUID()`), propagato al backend .NET dal proxy `/api/*` (`api-proxy.ts`). Il backend lo promuove a `TraceIdentifier` (vedi `SecurityExtensions.cs` → "Ordine della pipeline HTTP" in [backend/README.md](../backend/README.md)) e lo aggiunge a ogni `ProblemDetails`. Un log SSR e un log .NET dello stesso scambio condividono lo stesso id, senza incrociare i timestamp.

### Server Fingerprinting Nascosto

`app.disable('x-powered-by')` rimuove l'header `X-Powered-By: Express` dalle risposte, e il fingerprinting del server diventa più difficile.

### Trusted Proxy Headers

Il server dichiara una lista esplicita di header proxy fidati, incluso `x-forwarded-scheme` (non standard, inviato da Nginx Proxy Manager). Senza questa configurazione Angular SSR, davanti a un `X-Forwarded-*` non dichiarato, degrada in silenzio a CSR (`index.csr.html`) invece di rendere lato server.

### Cache Strategy per Tipo di File Statico

| Tipo di file | `Cache-Control` | Motivo |
| :--- | :--- | :--- |
| Asset con hash nel nome (JS/CSS Angular) | `public, max-age=31536000, immutable` | Il contenuto non cambia: l'hash nel nome garantisce unicità |
| `ngsw-worker.js`, `ngsw.json` | `no-store` | Il Service Worker deve scaricare la versione più recente |
| `manifest.webmanifest` | `public, max-age=86400` | Con `isWebApp:true`. Con `isWebApp:false` non viene generato e il server risponde `404` (sito non installabile) |
| Traduzioni, icone, altri statici | `no-cache` | Rivalidati a ogni accesso |
| Pagine SSR | `no-cache` | Contenuto dinamico per risposta |

### Protezione Path Traversal (`/assets/legal`)

I file Markdown delle policy legali sono serviti con protezione contro il path traversal:
```
GET /assets/legal/privacy/intro/it.md  → OK
GET /assets/legal/../../etc/passwd     → 403
GET /assets/legal/%2e%2e/secret        → 403  (anche URL-encoded)
GET /assets/legal/....//secret         → 403  (anche sequenze miste)
```
Usa `path.resolve()` + prefix check con separatore di directory (`path.sep`), più robusto di un replace di `../`; vale anche nelle sottocartelle.

### `/assets/files`: Accesso Diretto Bloccato

```
GET /assets/files/qualsiasi-file → 404
```
I file degli asset si servono tramite `/cdn-cgi/asset?id=...`, per passare dalla pipeline di ottimizzazione, cache e controllo degli accessi.

### Streaming SSR (Zero Buffering RAM)

La risposta HTML va al browser senza bufferizzarla in memoria:
```typescript
Readable.fromWeb(renderedResponse.body).pipe(response);
```
Il browser riceve e analizza l'HTML prima che Angular abbia completato il rendering della pagina.

### Graceful Shutdown

Su `SIGTERM` / `SIGINT` (docker stop, redeploy, rollout k8s) il server smette di accettare nuove connessioni e lascia terminare quelle in corso prima di uscire (`server.close()`), con un timeout di sicurezza a 10s: nessuna risposta troncata a metà durante un redeploy.

### Compressione gzip con eccezione SSE

Il middleware `compression` comprime di default le risposte testuali (HTML SSR, JS, CSS, JSON, SVG); le immagini già compresse sono saltate per Content-Type. La compressione vive a livello applicativo, non soltanto nel reverse proxy, ed è garantita anche se il proxy davanti non ricomprime l'upstream.

Un'eccezione la gestisce il `filter` di `compression`: gli stream `text/event-stream` (il proxy verso `/api/notifications/stream` del campanellino) non vanno compressi. gzip bufferizza per accumulare dati prima di emettere, e i piccoli frame SSE non arriverebbero al browser in tempo reale; il client manda comunque `Accept-Encoding: gzip`, e senza questa esclusione il campanellino resterebbe muto. Il filtro lascia non compresso l'`event-stream`; il resto usa il filtro di default. A complemento, il backend marca lo stream con `Cache-Control: no-transform` per impedire ricompressioni intermedie.

> Testare l'SSE: in un browser vero o con `curl --compressed` (che dichiara `Accept-Encoding: gzip` come il browser). Un `curl` liscio non chiede gzip e non riprodurrebbe il problema della bufferizzazione: passerebbe anche con la compressione attiva, dando un falso "funziona".

### Cache Immagini su Disco (`IMAGE_CACHE_DIR`, `IMAGE_CACHE_MAX_MB`)

Le miniature generate da `/cdn-cgi/asset` e `/cdn-cgi/preview` finiscono su disco, per non ricalcolarle a ogni accesso. Sono un dato derivato ed effimero: servite dagli handler Node (l'accesso diretto a `/assets/files` è 404), mai come file statico, e non vivono sotto `src/assets` né nel build output.

```bash
IMAGE_CACHE_DIR=/var/cache/app-images   # default: <temp di sistema>/br1-image-cache-<hash>
IMAGE_CACHE_MAX_MB=500                   # default: 500 MB — oltre questa soglia elimina i file meno usati
```

Posizione (`IMAGE_CACHE_DIR`): senza override la cache vive in una cartella dedicata nella temp di sistema, isolata per progetto con un hash del percorso asset (più siti sullo stesso host, il template e i suoi figli, non si mischiano le immagini). Tenerla fuori da `src/assets` evita che `ng serve` ricarichi la pagina a ogni miniatura generata in sviluppo, e che miniature effimere finiscano in `dist` al build. In produzione la temp è scrivibile anche col container non-root, ma è effimera: dopo un riavvio la cache parte fredda e si rigenera on-demand. Per una cache calda fra i deploy, monta un volume persistente e punta `IMAGE_CACHE_DIR` lì.

Sweep (`IMAGE_CACHE_MAX_MB`): lo sweep LRU avviene ogni 6 ore e porta la cache al 90% del cap (non al 100%), per non ripartire a ogni miniatura aggiunta. L'`mtime` di ogni file si aggiorna a ogni hit: le miniature in uso sopravvivono e si scartano quelle inutilizzate.

Concorrenza dei job (`IMAGE_JOBS_MAX`), indipendente dal cap di dimensione: ogni decode/resize `sharp` alloca il bitmap intero in memoria, e i job in parallelo sono limitati: default `Math.max(2, availableParallelism())`, configurabile via `IMAGE_JOBS_MAX`. Quelli oltre il tetto entrano in una coda FIFO interna (non limitata, senza timeout): a cache fredda con tante immagini distinte in una pagina (di norma il primo traffico dopo un deploy) le miniature oltre il tetto aspettano il proprio turno invece di fallire, con un ritardo di caricamento silenzioso (nessun log, nessuna metrica dedicata), non un errore.

```bash
IMAGE_JOBS_MAX=4   # default: max(2, CPU disponibili)
```

---

## Quick Start
```bash
npm install
npm run start
```
Il proxy si collega da sé al backend .NET in esecuzione sulla porta di default.

> Il proxy del dev server è configurato da `proxy.local.conf.cjs` (sviluppo locale, backend su `localhost:5000`) o `proxy.docker.conf.cjs` (dev in Docker, backend sul container). Entrambi leggono la `x-api-key` dalla sorgente unica `global-settings(.local).json` tramite il modulo condiviso `proxy.api-key.cjs`.
