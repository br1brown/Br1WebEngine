# Br1WebEngine - Frontend (Angular 21)

> 📚 Parte della documentazione di Br1WebEngine — indice e tabella *"dove metto le mani"* nel [README principale](../README.md). Le sezioni **"Developer Journey"** qui sotto sono il *come* passo-passo del frontend.

Benvenuto nel frontend di Br1WebEngine. Questo non è un semplice progetto Angular, è un ecosistema dichiarativo ottimizzato per Server-Side Rendering (SSR) e Developer Experience (DX).

La complessità tipica (routing frammentato, meta tag SEO sparsi, lazy loading) è stata centralizzata in un singolo **Domain Specific Language (DSL)**.

---

## 🚀 Le "Killer Feature" (cosa fornisce l'Engine)

### 1. `site.ts`: Il Cuore Pulsante (DSL)
**Perché è così?** In Angular "Vanilla" aggiungere una pagina richiede di toccare il file di routing, i componenti menu per i link e logiche SEO ripetitive.
**Cosa fa l'Engine:** In `src/app/site.ts` dichiari un oggetto JSON. L'Engine crea a runtime le rotte, nasconde/mostra la navbar in base a `layout.showNav`, e se la pagina ha `requiresAuth: true`, l'SSR viene spento forzando il client-side rendering.

### 2. Auto-SEO Dinamica
Basta aggiungere `description` o `ogImage` nell'oggetto pagina dentro `site.ts`. Un Resolver intercetta la navigazione e inietta prima del rendering i corretti tag Head, OpenGraph e i dati strutturati.

### 3. Signals Nativo (zoneless)
Gestione stato locale e globale tramite l'API nativa `Signals` di Angular 21. Niente NgRx, niente boilerplate eccessivo.

L'app è **zoneless**: non c'è `zone.js`, la change detection è guidata dai signal e dagli eventi gestiti da Angular (binding di template e `host`). Conseguenze pratiche:
- Aggiorna lo stato con i signal (`signal()`, `computed()`, `set/update`): la UI si rinfresca da sola.
- La change detection è guidata dai signal: `setInterval`/`requestAnimationFrame` non innescano cicli, quindi usa direttamente i timer del browser e aggiorna lo stato con i signal.
- Se integri una callback di una libreria esterna che muta un campo **non**-signal, convertila in signal (o usa un signal di appoggio) affinché la UI reagisca.

### 4. Gestione Trasparente Privacy e Accessibilità
L'Engine si occupa di iniettare meccanismi standard di base per l'Accessibilità (WCAG) e alcuni helper della shell già pronti e auto-iniettati — un banner cookie integrato che si allinea alla navigazione e un pulsante "torna su" (back-to-top) che compare dopo lo scroll. Non vanno istanziati né configurati: ci sono e basta. Meno codice, più compliance.

### 5. Policy Pages Integrate
Le pagine legali (Privacy, Cookie, Termini, Note Legali) le costruisce l'**Engine**: in `site.ts` valorizzi gli slot `legalPages` (`privacy`/`cookie`/`tos`/`legal`) coi tuoi `PageType` e il builder inietta da solo il nodo `/policy/*`. Uno slot omesso = quella pagina non esiste (es. una vetrina con solo i cookie). Se il sito usa cookie, lo slot `cookie` è **obbligatorio**: ometterlo è un errore al build. I testi vivono in `src/assets/legal/` come Markdown localizzati (es. `privacy.it.md`, `TOS.it.md`); il `ContentResolver` li carica da filesystem in SSR e via fetch nel browser, e il `PolicyComponent` interpola i placeholder come `{{ragioneSociale}}` / `{{partitaIva}}` dal profilo aziendale del backend.

---

## 🗺️ Mappa del territorio: cosa è tuo, cosa è dell'Engine

Prima di scrivere una riga, tieni a mente una sola linea di confine. Tutto ciò che vive sotto **`src/app/core/engine/**`** è l'**Engine**: lo consumi, non lo tocchi (così un domani aggiorni il motore senza rimergiare a mano le tue modifiche). Tutto il resto è del **progetto figlio**: è tuo e lo plasmi. La regola si riassume in una frase — *se è sotto `core/engine/`, lo consumi; altrimenti è tuo.*

| Area | Di chi è | Cosa ci fai |
| :--- | :--- | :--- |
| `core/engine/**` | **Engine** (intoccabile) | Servizi, direttive, componenti shell, builder, server SSR, script di build. Lo consumi tramite token, signal e direttive — non lo modifichi |
| `site.ts` | Tuo | Il DSL del sito: enum `PageType`, pagine, menu, shell, tema. È il primo file che apri |
| `app.component.ts` / `.html` | Tuo (la **shell**) | Monta navbar, footer, cookie banner, back-to-top e smoke, e avvia `VersionCheckService.init()`. È il posto naturale dove iniettare un servizio sempre-attivo (es. `NotificationStreamService`) |
| `components/shared/**` | Tuo (riusabili) | Le famiglie pronte — azione, contatto, social, profilo, `app-login-form`, `app-upload-form`, footer. Riusabili così come sono, ma di proprietà del figlio: estendibili e modificabili |
| `core/services/**` | Tuo | `api.service.ts` (il client API che estendi con i tuoi endpoint), `auth.service.ts`, `cookie-registry.ts` (`COOKIE_MAP`) |
| `core/dto/**` | Tuo | I contratti dati (`session.dto.ts`, `auth.dto.ts`) allineati a mano ai record C# |
| `pages/**` | Tuo | Le schermate, ognuna estende `PageBaseComponent` |

Il confine non è arbitrario: `app.component.ts` (che è *tuo*) importa `FooterComponent` da `./components/shared/footer/...`, legge `ContestoSito.config.smoke` e chiama `VersionCheckService` — orchestra cioè i pezzi dell'Engine montandoli nella shell, senza farne parte. La distinzione operativa è questa: gli oggetti sotto `core/engine/**` non si aprono per modificarli, si **consumano** (un `inject(...)`, una direttiva, un signal); tutto il resto è codice di progetto che adatti al tuo dominio. Quando un capitolo qui sotto dice "estendi" o "aggiungi un metodo", parla sempre di file fuori da `core/engine/**`; quando dice "consuma" o "leggi il signal", parla dell'Engine.

---

## 📜 Le Regole del Gioco (cosa impone l'Engine)

### 1. Identità Incorruttibile: L'Enum `PageType`
Per ogni schermata aggiungi un identificatore all'enum `PageType` in `site.ts` e naviga sempre tramite quell'ID, così il link resta valido anche cambiando l'URL. Tutte le voci di menu e i pulsanti punteranno a quell'ID. Se domani rinomini l'URL, nessun link si romperà.
```typescript
export enum PageType { Home, AboutUs }
```

### 2. Componenti Pagina vs Componenti UI
- **`pages/`**: Sono le schermate. Ereditano da `PageBaseComponent` per ottenere l'accesso rapido ad API, logger e traduttore senza iniezioni ridondanti.
- **`components/`**: Pezzetti di UI isolati. Ricevono dati tramite `@Input()`.

### 3. Manipola il DOM in modo dichiarativo (compatibile con l'idratazione)
Usa esclusivamente binding dichiarativi (`[class.hidden]="!isVisible()"`) e Template Refs: così l'accesso al DOM passa per Angular e resta valido anche in SSR.

**Idratazione incrementale per le pagine lunghe.** L'Engine registra già `withIncrementalHydration()` (`app.config.ts`): nelle pagine lunghe basta avvolgere le sezioni sotto la piega in un blocco `@defer (hydrate on viewport)`:

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
- **Primo caricamento (SSR):** la sezione è renderizzata normalmente nell'HTML — contenuto e SEO invariati — ma il browser la idrata solo quando entra nel viewport: meno JavaScript eseguito all'avvio.
- **Navigazione client (cambio pagina nella SPA):** il blocco carica `on idle`, mostrando per un attimo il `@placeholder`.
- I click su una sezione non ancora idratata non vanno persi: `withEventReplay()` li riconsegna a idratazione avvenuta.

La home demo lo applica alle sezioni QR, Notifiche e Sistema — esempio vivo, finché un progetto figlio non la riscrive.

### 4. CSS: Bootstrap First, Custom Solo Se Necessario
Il progetto usa **Bootstrap 5** come sistema di design principale: per layout, tipografia, form e componenti parti sempre dalle classi Bootstrap, e tieni il CSS custom per ciò che Bootstrap non copre.

**Cosa va nel template HTML (classi Bootstrap):**
- Layout e spacing (`d-flex`, `align-items-center`, `mb-3`, `gap-2`, `p-4`)
- Tipografia (`fw-bold`, `text-muted`, `small`, `h4`, `lead`)
- Form (`form-control`, `form-label`, `is-invalid`, `invalid-feedback`)
- Componenti (`card`, `alert`, `btn`, `spinner-border`, `badge`, `list-group`)
- Responsive (`col-md-6`, `d-none d-lg-block`)

**Cosa va nel file `styles.css` globale:**
- Stili specifici del progetto finale che sovrascrivono il tema o Bootstrap.
- Import di CSS di terze parti non gestiti dal framework.
- Classi di utilità globali non previste da Bootstrap.
*Nota bene: `base.css` è riservato all'engine e alla gestione avanzata del tema OKLCH, non va modificato con stili di progetto.*

**Cosa va nel file `.css` del componente (solo ciò che Bootstrap non può esprimere):**
- Posizionamento fisso con `safe-area-inset` (cookie banner, back-to-top)
- Animazioni CSS (`@keyframes`, transizioni custom)
- Effetti visivi avanzati (glassmorphism con `backdrop-filter`, gradienti complessi)
- Override di tema via `color-mix()` e custom properties (`--color*`)
- Layout a griglia complesso (`grid-template-rows: 0fr → 1fr` per accordion)

**z-index e ombre: solo variabili, mai letterali.** `base.css` definisce la scala z-index del template (`--z-cookie-banner`, `--z-fab`, `--z-skip-link`, `--z-cdk-overlay`), incastrata nei vuoti della scala Bootstrap così i widget persistenti restano **sotto** offcanvas e modali (che devono coprirli). Un nuovo elemento fisso usa una di queste variabili o ne aggiunge una alla scala, così resta coerente con l'ordine di sovrapposizione di Bootstrap. Stesso principio per le ombre di elevazione: `--shadowElevated` / `--shadowElevatedHover`.

**Componenti senza CSS:** crea il file `.css` di un componente solo quando ti serve qualcosa fra i casi sopra. Il footer, ad esempio, è 100% classi Bootstrap nel template e non ne ha uno.

---

## 🧩 Punti di personalizzazione (estendere l'Engine senza toccarlo)

Tutto ciò che un progetto figlio configura per fare suo il sito **senza modificare l'Engine** (`core/engine/**` resta intatto), raggruppato per area. Ogni paragrafo dice in breve *come* si attiva un seam e rimanda (*Vedi «…»*) alla sezione di dettaglio più sotto in questa pagina.

### Pagine & rotte (`site.ts`)

Tutto parte da `site.ts`. Dichiari una pagina con un oggetto in `pages` (`pageType` + `component` lazy); un oggetto con `children` crea un gruppo di menu annidato (le `/policy/*` sono l'esempio dell'Engine), uno con `externalUrl` un link verso un sito esterno, e `enabled: false` spegne la pagina ovunque in un colpo solo (rotta, menu, sitemap, padre incluso).

Per ogni pagina regoli login (`requiresAuth`), strategia di rendering (`renderMode`), shell e layout (`layout: { showNav, showFooter, showPanel, fitViewport }`) e SEO/social (`description`, `otherSEO`). A livello globale imposti il brand link e il redirect d'autenticazione (`homePage`/`loginPage`), i flag della `shell`, `isWebApp`/`onlyPlainImage`, gli slot `legalPages` (con override per-`PageType`) e i menu `headerNav`/`footerNav` (callback builder con `addPage`/`addLink`/`addGroup`). *Vedi «Developer Journey», «Opzioni Avanzate di site.ts», «Navigazione Multilivello», «Vista a tutto schermo», «Pagine legali».*

### Dati a una pagina

Per passare qualcosa a una pagina hai quattro canali, tutti letti come `@Input()` per nome: `data` statico, parametro di rotta `:x`, query `?x=` e il resolver. Per avere il contenuto già al primo render aggiungi un `case` in `ContentResolver.loadResolved()`. La configurazione libera di progetto si legge con `inject(APP_CUSTOM)` (la sezione `Custom`), mentre la configurazione risolta e normalizzata del sito con `inject(SITE_CONFIG)`. *Vedi «Passare Dati a una Pagina», «ContentResolver», «Configurazione di progetto (Custom)», «Token SITE_CONFIG».*

### Aspetto & i18n

Il colore del brand è `colorTema`, modificabile a runtime con `ThemeService.setColorTema()`; per validare un contrasto c'è `ThemeService.calcContrastRatio()` (modello WCAG 2.1). Le stringhe del progetto e le sovrascritture vanno in `addon.{lang}.json`, che ha la precedenza su `basic` (l'engine, mai toccato); la lingua si cambia a runtime con `TranslateService.setLanguage()`. *Vedi «Tema e Sistema di Colori», «Metodi Statici (SSR-Safe)», «Internazionalizzazione», «Lingua a Runtime».*

### Servizi & componenti

Estendi il client API aggiungendo path e metodo pubblico in `api.service.ts` (con `{ silent: true }` quando vuoi gestire l'errore con una UI tua); abiliti le notifiche realtime con il campanellino via `shell: { showNotifications: true }`; registri un cookie aggiungendo una voce a `COOKIE_MAP`; adatti i DTO di sessione e login in `core/dto/` (`session.dto.ts` e `auth.dto.ts`, allineati ai record C#).

Per comporre le UI riusi le direttive dichiarative (`[appPage]` per i link interni, `[imgRender]`/`[qrContent]` per immagini e QR generati, `[appContextMenu]` per i menu contestuali), la pipe `markdown` (sanitizzata) e i componenti pronti (`app-link-badge` e le famiglie azione/contatto). La PWA si attiva con `isWebApp`. *Vedi «Aggiungere un Endpoint», «Errori Silenziosi per UI Custom», «NotificationStreamService», «Aggiungere un Nuovo Cookie», «DTO di Sessione e Login», «[appPage]», «Directive di Rendering Dichiarativo», «Componenti di Azione/Contatto».*

---

## 🛠️ Developer Journey: Aggiungere una Pagina

Per creare una nuova schermata, segui questo workflow: mantiene integro e type-safe il routing dell'Engine.

### Passo 1: Registrare l'identità (PageType)
Apri `src/app/site.ts` e aggiungi il nuovo tipo all'enum centrale. Questo garantisce che la pagina sia referenziabile globalmente.
```typescript
export enum PageType {
    Home = 0,
    Contatti = 1,
    MioNuovoComponente = 2 // <-- Aggiunto
}
```

### Passo 2: Dichiarare la Rotta (`pages`)
Sempre in `site.ts`, aggiungi la pagina nell'array restituito da `pages`. Specifica il path, eventuali guardie di sicurezza e l'Auto-SEO.
```typescript
pages: (ctx) => [
    // ... pagine esistenti ...
    {
        path: 'nuova-pagina',
        pageType: PageType.MioNuovoComponente,
        title: 'Nuova Pagina', // Verrà localizzato automaticamente
        description: 'La mia descrizione SEO',
        requiresAuth: false,
        component: () => import('./pages/nuova-pagina/nuova-pagina.component')
    }
],
```

### Passo 3: Creare il Componente
Nella cartella `pages/nuova-pagina/` crea il componente. Assicurati che estenda `PageBaseComponent<T>` (dove `T` è il tipo del contenuto della pagina) per ereditare i superpoteri dell'Engine.
```typescript
@Component({
  standalone: true,
  templateUrl: './nuova-pagina.component.html'
})
export default class NuovaPaginaComponent extends PageBaseComponent<MioContenuto> {
    // Proprietà ereditate da PageBaseComponent:
    // this.api        → ApiService (chiamate al backend)
    // this.translate  → TranslateService (i18n)
    // this.asset      → AssetService (URL immagini CDN)
    // this.notify     → NotificationService (toast/alert)
    // this.pageContent → Signal<MioContenuto | null> (dati dalla pagina)
    // this.pageType   → input<PageType> (tipo corrente della pagina)
}
```

### (Opzionale) Passo 3b: Pagina Protetta da Login

Se il componente deve essere accessibile solo agli utenti autenticati, aggiungi `requiresAuth: true` nella dichiarazione in `site.ts`. L'Engine fa tutto il resto: disattiva SSR per quella pagina, aggiunge l'auth guard e reindirizza gli utenti non loggati alla `loginPage`.

```typescript
pages: (ctx) => [
    {
        path: 'area-riservata',
        pageType: PageType.AreaRiservata,
        title: 'Area Riservata',
        requiresAuth: true, // <-- sufficiente per proteggere la pagina
        component: () => import('./pages/area-riservata/area-riservata.component')
    }
],
```

Nel componente i dati di sessione si leggono tramite `AuthService`:
```typescript
export default class AreaRiservataComponent extends PageBaseComponent {
    private readonly auth = inject(AuthService);

    readonly nomeUtente = computed(() => this.auth.session()?.displayName ?? '');
}
```

### Passo 4: Navigare in Sicurezza
Per navigare verso la pagina lascia che il framework calcoli la rotta esatta dal `PageType`, così il link resta valido anche cambiando l'URL in `site.ts`.

**Per link `<a>` (preferito — SPA navigation, SEO, keyboard, right-click):**
```html
<!-- [appPage] traduce il PageType in href e attiva RouterLink -->
<a [appPage]="PageType.MioNuovoComponente" class="btn btn-primary">Vai!</a>
<a [appPage]="PageType.PrivacyPolicy" class="footer-link">Privacy</a>
```

**Per navigazione programmatica (es. redirect dopo submit form):**
```typescript
// Inietta il Router nel componente
private readonly router = inject(Router);

// Nel metodo (es. onFormSubmit)
this.router.navigate([ContestoSito.getPath(PageType.MioNuovoComponente) ?? '/']);
```

### (Opzionale) Passo 5: Caricare dati prima del render (`ContentResolver`)

Se la pagina deve avere già i suoi dati al primo render (utile per SSR e SEO: i crawler vedono il contenuto, non uno scheletro vuoto), il caricamento passa dal `ContentResolver`. È un resolver centralizzato che, in base al `PageType`, recupera il contenuto **prima** che il componente venga mostrato e lo consegna al `PageBaseComponent`, che lo espone tipizzato via `pageContent()`.

Per dare un contenuto a una nuova pagina bastano due passi (`src/app/pages/content.resolver.ts`):

```typescript
// 1. Esponi il dato in ApiService (o usa un caricamento di file statico)
// 2. Aggiungi un case nello switch di loadResolved()
switch (pageType) {
    case PageType.MioNuovoComponente:
        content = await this.apiService.getMioDato();
        break;
    // ... altri case ...
}
```

Nel componente il dato arriva già pronto, senza fetch manuale in `ngOnInit`:
```typescript
export default class NuovaPaginaComponent extends PageBaseComponent<MioContenuto> {
    // this.pageContent() → Signal<MioContenuto | null>, valorizzato dal resolver
}
```

Caratteristiche dell'Engine:
- **Router protetto:** se il caricamento fallisce, `BaseApiService` ha già notificato l'utente e il resolver restituisce `content = null` invece di rigettare — la navigazione si completa sempre, non resta bloccata.
- **SSR senza loopback:** per i contenuti da file (es. pagine legali) in SSR la lettura avviene da disco tramite `LEGAL_FILE_READER`, evitando una chiamata HTTP del server verso se stesso; nel browser è una normale fetch relativa.

Se invece la pagina carica i dati a navigazione avvenuta (contenuto non SEO-critico), si può saltare il resolver e usare i pattern one-shot / reattivo di `ApiService` direttamente nel componente.

#### `PageBaseComponent`: cosa eredita gratis

Estendere `PageBaseComponent<T>` non dà solo l'accesso rapido ai servizi (`api`, `translate`, `asset`, `notify`): porta con sé due comportamenti **automatici** che non vanno riscritti nel componente figlio.

- **SEO sempre allineata, senza chiamare `PageMetaService` a mano.** Un `effect()` interno alla base aggiorna title, description e og:image ogni volta che il contenuto risolto cambia — incluso il **cambio lingua**. Il tuo componente non tocca `PageMetaService`: dichiara i meta in `site.ts` / nel resolver e l'Engine li riapplica da solo.
- **Ricarica reattiva alla lingua, con race-guard.** Nel browser la base ri-esegue il resolver a ogni cambio di `currentLang()`, così il contenuto si ri-fetcha nella nuova lingua. Un contatore di sequenza (`reqId`) scarta le risposte lente arrivate **dopo** una più recente, evitando che dati stantii sovrascrivano quelli nuovi a cambi lingua ravvicinati.

Gli input che la base legge per te — `pageType` e `contentByResolve` — sono `protected`: li consumi dentro il componente (es. via `pageContent()`), non li ridichiari.

---

## 🔐 Sistema di Autenticazione (JWT)

Il sistema di login è **opzionale** e si attiva configurando `Security.Token.SecretKey` (in `global-settings.local.json`). Sul frontend serve:

```typescript
// site.ts → tutto strutturale, sta insieme
shell: { showLoginInHeader: true },     // mostra il link Login/pulsante Logout nella navbar
loginPage: PageType.Login,       // pagina dove redirigere gli utenti non autenticati
```

### Proteggere una Pagina

In `pages`, imposta `requiresAuth: true` sulla pagina da proteggere. L'Engine aggiunge automaticamente `renderMode: 'client'` (disabilita SSR per quella pagina) e attiva l'auth guard.

**Cosa fa il guard quando l'utente non è loggato** (`authGuard` in `app.routes.ts`): se in `site.ts` è dichiarata una `loginPage`, redirige lì con i query param `returnPageType` (la pagina di partenza, per tornarci dopo il login) e `reason=auth` (la pagina di login mostra un avviso inline invece di una modale). Senza `loginPage`, resta sulla pagina corrente e mostra la modale di errore 401.

```typescript
pages: (ctx) => [
    {
        path: 'area-riservata',
        pageType: PageType.AreaRiservata,
        requiresAuth: true,
        component: () => import('./pages/area-riservata/area-riservata.component')
    }
],
```

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

I contratti di autenticazione vivono **fuori** da `core/engine/**` (`src/app/core/dto/`), quindi sono del **progetto figlio**: li adatti al tuo dominio.

| DTO | File | Cos'è |
| :--- | :--- | :--- |
| `SessionInfo` | `core/dto/session.dto.ts` | Payload del claim `session` del JWT, decodificato da `AuthService`. Corrisponde al record C# `SessionInfo` (`backend/Models/SessionInfo.cs`): le due vanno tenute in sincronia **a mano** (niente codegen). |
| `LoginRequest` / `LoginResult` | `core/dto/auth.dto.ts` | Body e risposta di `POST /auth/login`. Stesso principio: allinea i campi al backend. |

Aggiungere un campo al profilo di sessione (es. `brandColor`) è quindi un'unica modifica coordinata: il campo nel record C# e lo stesso campo qui in `SessionInfo`.

### Componenti Pronti all'Uso

| Componente | Selector | Ruolo |
| :--- | :--- | :--- |
| `LoginFormComponent` | `app-login-form` | Form username/password riusabile; emette `(loggedIn)` al successo. Non naviga da solo. |
| `UserNavComponent` | `user-nav` | Area Login/Logout nella navbar. Appare solo se `showLoginInHeader: true`. Gestisce il logout con modale di conferma. |
| `UploadFormComponent` | `app-upload-form` | Componente "dumb" per drag-and-drop e selezione file. Emette il `File` nativo delegando la chiamata API al componente genitore. |

### Ciclo di Vita del Token

Il token è persistito in `sessionStorage` (sopravvive all'F5, si azzera alla chiusura della scheda). `TokenService` (engine, intoccabile) avvia un timer automatico che esegue il logout allo scadere dell'`exp` del JWT. Il timer gestisce il limite JavaScript di 24 giorni tramite rescheduling ricorsivo.

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

Le rotte d'errore sono generate automaticamente (`app.routes.ts`):

| Rotta | Comportamento |
| :--- | :--- |
| `**` (qualsiasi URL non riconosciuto) | redirect a `error/404` |
| `error/:errorCode` | mostra `ErrorComponent` con quel codice |
| `error` | redirect a `error/500` |
| `error/401` | redirect alla pagina di login (`loginPage`), se configurata |

Il caso `401` è speciale: un utente non autenticato non finisce su una pagina d'errore cieca ma viene mandato al login. Se nessuna pagina di login è configurata, l'`authGuard` resta sulla pagina corrente e mostra una modale di accesso negato (vedi *Sistema di Autenticazione*).

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

> **Lato server:** per le rotte `error/{code}` l'SSR restituisce anche lo status HTTP reale (es. `error/404` → `404`), non un `200`. Vedi *Server SSR → Status Code SEO-Aware*.

---

## 🔒 Consenso Cookie e Privacy (GDPR/ePrivacy)

`CookieConsentService` implementa una strategia "Privacy by Default": nessun cookie viene scritto finché l'utente non esprime consenso esplicito per quella categoria.

### Tre Categorie di Consenso

| Categoria | Cosa include |
| :--- | :--- |
| **Technical** | Preferenza lingua, Service Worker, cookie essenziali di funzionamento |
| **Analytics** | Tracciamento e analytics (Google Analytics, ecc.) |
| **Profiling** | Pubblicità comportamentale e profilazione |

### Aggiungere un Nuovo Cookie

Registra il cookie nel `COOKIE_MAP` (in `src/app/core/services/cookie-registry.ts`), specifica la categoria e il banner mostrerà automaticamente il toggle corrispondente. I tipi (`CookieCategory`, `CookieConfig`) vivono in `src/app/core/engine/services/cookie/cookie-type.ts`:

```typescript
import { CookieCategory, type CookieConfig } from '../engine/services/cookie/cookie-type';

export const COOKIE_MAP = {
    'mioTracker': {
        category: CookieCategory.Analytics,        // categoria di consenso
        descriptionKey: 'mioTrackerDescrizioneListaCookie', // chiave i18n per la Cookie Policy
        valueType: 'boolean',                       // opzionale: 'string' (default) | 'number' | 'boolean' | 'json'
    }
} as const satisfies Readonly<Record<string, CookieConfig>>;
```

`CookieConfig` accetta tre campi: `category`, `descriptionKey?` (chiave i18n per la descrizione mostrata nella Cookie Policy) e `valueType?` (usato per il cast automatico di `getCookie`/`setCookie`). La descrizione è risolta da `descriptionKey` tramite i18n, così resta localizzata in tutte le lingue.

Nel componente:
```typescript
this.consent.setCookie('mioTracker', true, 60 * 60 * 24); // 1 giorno — tipo inferito da valueType
```

Il cookie viene scritto solo se la categoria corrispondente è stata accettata. Il nome fisico del cookie nel browser è prefissato con la categoria (`{category}_{rawKey}`, es. `analytics_mioTracker`); `buildPhysicalCookieKey()` calcola questo nome a partire dalla chiave raw.

### Stato del Consenso e Azioni (reattivo)

`CookieConsentService` (iniettabile ovunque) espone lo stato del consenso come **signal di sola lettura** e le azioni che lo modificano. Tutto è reattivo: un `computed` che legge un signal di consenso si riaggiorna da solo quando l'utente accetta o rifiuta dal banner.

```typescript
private readonly consent = inject(CookieConsentService);

// Stato per categoria (Signal<boolean>)
this.consent.technicalAccepted();
this.consent.analyticsAccepted();
this.consent.profilingAccepted();

this.consent.responded();   // Signal<boolean> — true se l'utente ha già scelto (ora o in passato)
this.consent.isNeeded();    // Signal<boolean> — true se almeno una categoria richiede consenso (false in SSR)

// Azioni — modificano lo stato e persistono la scelta
this.consent.accept();                                  // accetta tutte le categorie attive
this.consent.reject();                                  // rifiuta tutto
this.consent.saveSelected(technical, analytics, profiling); // selezione granulare dai toggle
this.consent.reopen();                                  // riapre il banner per modificare le preferenze
```

**Gating di una feature sul consenso.** Per attivare qualcosa solo dopo il consenso della sua categoria — il caso tipico è caricare gli analytics — fai dipendere la logica dal signal corrispondente, così reagisce sia all'accettazione immediata sia a una scelta già salvata:

```typescript
constructor() {
    effect(() => {
        if (this.consent.analyticsAccepted()) {
            this.loadAnalytics(); // gira solo quando l'utente ha acconsentito agli analytics
        }
    });
}
```

### Accessori Cookie Tipizzati

`getCookie` / `setCookie` / `removeCookie` sono **tipizzati** sulla chiave: il tipo del valore (`boolean` / `number` / `json` / `string`) è inferito da `valueType` nel `CookieConfig` tramite `InferCookieType`, quindi niente cast a mano. La scrittura resta gated dal consenso (e bloccata per chiavi non censite); la lettura no — è di sola lettura, privacy-safe.

```typescript
this.consent.setCookie('mioTracker', true, 60 * 60 * 24); // value: boolean (da valueType), Max-Age 1 giorno
const v = this.consent.getCookie('mioTracker');           // → boolean | null, già castato
this.consent.removeCookie('mioTracker');                  // sempre permesso, anche a consenso revocato
```

### Service Worker e Consenso Tecnico

Il Service Worker è registrato **solo dopo che l'utente accetta il consenso tecnico**. Questo include:
- Registrazione `provideServiceWorker()` all'avvio
- `VersionCheckService` inizia il polling degli aggiornamenti
- La preferenza lingua viene salvata su `localStorage`

### Persistenza Lingua e Consenso

La preferenza lingua è salvata solo con consenso tecnico accettato:
1. Utente rifiuta consenso → cambia lingua a "en" → al reload torna al default
2. Utente accetta consenso tecnico → cambia lingua a "en" → persiste tra i reload

La lettura della preferenza salvata non richiede consenso (operazione di sola lettura, privacy-safe).
**Nota SSR:** In ambiente Server-Side Rendering (SSR), la lettura dei cookie avviene tramite l'header `Cookie` della richiesta HTTP in ingresso (`REQUEST` token in Angular). Questo garantisce che il server sia allineato con le preferenze del client, evitando idratazioni errate o flash di contenuto con lingua sbagliata al primo caricamento. Se il cookie non è presente, l'SSR usa l'header `Accept-Language` del client per dedurre la preferenza.

### Dichiarazione Cookie GDPR nella Cookie Policy

La pagina Cookie Policy deve elencare categorie e cookie usati dal sito (richiesto dal GDPR per ogni cookie non tecnico). L'elenco si inserisce nel Markdown della policy tramite due placeholder, espansi automaticamente dal `PolicyComponent`:

| Placeholder | Cosa rende |
| :--- | :--- |
| `{{cookieCategories}}` | Card delle categorie effettivamente presenti nel sito (Technical / Analytics / Profiling) |
| `{{cookieList}}` | Tabella dei singoli cookie con nome fisico, categoria e descrizione |

I dati provengono direttamente da `CookieConsentService`: il `PolicyComponent` legge i signal reattivi e costruisce le liste localizzate.

```typescript
private readonly cookieConsent = inject(CookieConsentService);

// Categorie attive — solo quelle realmente richieste dal sito
this.cookieConsent.isTechnicalNeeded();  // include lingua (multilingua) e SW (isWebApp)
this.cookieConsent.isAnalyticsNeeded();
this.cookieConsent.isProfilingNeeded();

// Cookie "engine" attivi (lang, ngsw-worker.js, consenso) — già filtrati per configurazione
this.cookieConsent.activeEngineCookies(); // → Record<string, CookieConfig>

// Nome fisico del cookie nel browser (es. 'technical_lang')
buildPhysicalCookieKey(rawKey, config);
```

La lista finale è l'unione di `activeEngineCookies()` (cookie built-in: lingua se multilingua, Service Worker se `isWebApp`, cookie di consenso) e `COOKIE_MAP` (cookie del progetto). Le descrizioni usano le `descriptionKey` di ogni `CookieConfig`; le etichette di categoria usano le chiavi `*CategoriaCookie` / `*DescrizioneCategoriaCookie` in `basic.{lang}.json`.

---

## 🎨 Tema e Sistema di Colori (OKLCH + WCAG)

Il sito ha un sistema di tema che genera 75+ variabili CSS partendo da un **solo colore brand** dichiarato in `site.ts`.

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

### Garanzia WCAG 4.5:1

Tutti i colori di testo su sfondo sono calcolati per garantire contrasto WCAG AA:
- `findCompliantColor()` regola la luminanza L in OKLCH finché non raggiunge 4.5:1
- Funziona sia in light che dark mode per i colori brand-derived
- I colori semantici fissi delegano a Bootstrap che li calibra per entrambi i toni

**Primary: fill vs foreground.** `colorPrimary` è scurito in OKLCH (hue e chroma preservate) finché garantisce 4.5:1 sul fondo pagina chiaro reale (`baseLt`), e alimenta i **fill** (`--bs-primary`: bottoni, `.bg-primary`, badge) dove il testo sopra si contrasta su `colorPrimaryText`. Quando invece il primary è usato come **foreground** sulla pagina (`.text-primary`, `.border-primary`), un valore tarato sul chiaro risulterebbe scuro-su-scuro in dark mode: per questo esiste la gemella `colorPrimaryDk`, schiarita in OKLCH finché garantisce 4.5:1 sul fondo scuro reale (`baseDk`). Le utility risolvono alla variante giusta via `--colorPrimaryFg`, tone-adaptive come `--colorLink`. Entrambe preservano la chroma del brand: il contrasto WCAG dipende dalla luminanza, non dalla saturazione, quindi una tinta viva resta viva senza costare accessibilità.

### Cambio Tema a Runtime

`colorTema` è un `WritableSignal` — cambiarlo aggiorna immediatamente palette, CSS vars e tutti i componenti che leggono i signal del tema.

**Pattern 1 — Colore utente al login**

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

**Pattern 2 — Colore per singola pagina**

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

**Precedenza e conflitti**

Non esiste un meccanismo di priorità centralizzato — l'ultimo chiamante vince. La convenzione suggerita:

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

Quando un componente disegna su `<canvas>`, genera un'immagine o sceglie un colore inline, **non hardcodare i valori**: leggi i signal di `ThemeService`. Sono già WCAG-safe (calcolati per garantire 4.5:1) e reattivi — cambiano da soli al cambio di brand (`setColorTema`) o di tono OS (`prefers-color-scheme`), quindi il tuo componente resta coerente senza una riga di sincronizzazione.

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

**Pannello forzato chiaro dentro una pagina scura.** Se hai un riquadro che deve restare in tono chiaro a prescindere dal tema OS (es. un pannello di anteprima), bind `panelBootstrapTheme` all'attributo Bootstrap, così tutto il sottoalbero usa il subtema corretto:

```html
<div [attr.data-bs-theme]="theme.panelBootstrapTheme">
    <!-- contenuto sempre in tono chiaro se shell.forcedLightPanel è true -->
</div>
```

`panelBootstrapTheme` vale `'light'` quando `shell.forcedLightPanel` è attivo, altrimenti `null` (nessun forzamento).

### Metodi Statici (SSR-Safe)

`ThemeService` espone due metodi statici puri (conversione colore) usabili in Node.js/SSR senza Angular:
```typescript
const [L, C, H] = ThemeService.hexToOklch('#1f40ff'); // hex → OKLCH
const hex = ThemeService.oklchToHex(L, C, H);          // OKLCH → hex
```

Pubblico è anche il **calcolo del contrasto** (modello WCAG 2.1) — l'unico seam con cui validare un colore di progetto a 4.5:1:
```typescript
ThemeService.calcContrastRatio(coloreA, coloreB); // → rapporto nel range [1, 21]
ThemeService.calcLuminance('#1f40ff');             // → luminanza relativa [0, 1]
ThemeService.hexToRgbTriplet('#1f40ff');           // → "31, 64, 255" per le rgba() di Bootstrap/CSS
```

Distinto da questo è il *derivare* automaticamente un colore conforme (link, testo muted, ecc.): quella logica (`findCompliantColor`, che regola la luminanza finché non raggiunge 4.5:1) è **interna al servizio e non è parte dell'API pubblica**. In sintesi: la **misura** del contrasto è pubblica (`calcContrastRatio`), la **derivazione** del colore conforme è privata.

### Anti-flash del tema (automatico)

Il tema corretto è in pagina **prima** che Angular si avvii: nessun lampo di tema sbagliato (FOUC) al primo caricamento. Funziona su due binari, entrambi gestiti dall'Engine senza configurazione:

- **Asset statico `public/theme-init.js`** — uno script sincrono nel `<head>` (referenziato con path **assoluto** `/theme-init.js`, perché sta prima di `<base href>`) che legge `prefers-color-scheme` e imposta subito `data-bs-theme` / `data-theme-tone` su `<html>`. Lo emette `generate-statics.ts` al build: è gitignored, quindi va materializzato lì o mancherebbe su un checkout pulito.
- **SSR per-richiesta** — `app.config.server.ts` inietta in ogni risposta i due `<meta name="theme-color">` (light/dark, dal `colorBase` della palette, per il chrome del browser e la PWA) e lo `<style id="theme-init">` con tutte le CSS vars del tema per entrambi i toni. Così la pagina server-rendered esce già coi colori giusti; `ThemeService` poi "conferma" la palette post-idratazione in `afterNextRender`.

Non c'è nulla da attivare: i due meccanismi sono parte della pipeline di build e dell'SSR.

### Font

I font del sito hanno un'unica fonte di verità: [`frontend/src/styles/font-config.ts`](src/styles/font-config.ts). Nessun valore di font è hardcoded altrove — `ThemeService` legge da qui e inietta `--fontFamily` / `--bs-body-font-family`, e `ImgBuilderService` / `PreviewBuilder` lo usano per Canvas e immagini OG.

Due dizionari, due contesti distinti:

- `WEB_FONTS` → **browser e Canvas.** Stack di font di sistema (System, Georgia, Arial, Verdana…), zero dipendenze esterne: ogni OS usa il suo font nativo, niente file da scaricare.
- `SERVER_FONTS` → **immagini OG generate da Sharp.** Font fisicamente installati nel container Docker (Roboto, DejaVu, Noto, Liberation).

```typescript
// font-config.ts — cambiare il default è una riga
static readonly DEFAULT_WEB_FONT    = FontConfig.WEB_FONTS.System;        // browser + Canvas
static readonly DEFAULT_SERVER_FONT = FontConfig.SERVER_FONTS.Liberation; // immagini OG
```

- **Cambiare il font di default:** modifica `DEFAULT_WEB_FONT` e/o `DEFAULT_SERVER_FONT`.
- **Aggiungere un font web:** aggiungilo a `WEB_FONTS` (nessuna installazione richiesta).
- **Aggiungere un font server:** aggiungilo a `SERVER_FONTS` **e** installalo nel `Dockerfile`, altrimenti Sharp non lo trova e ripiega sul fallback.

I due default sono volutamente separati perché web e server vivono in ambienti diversi: lo stack di sistema del browser non esiste dentro il container, e i font del container non servono al browser.

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
await this.api.getProfile();
this.notify.closeLoading();

// Lavoro async con spinner + toast di esito (rilancia l'errore: gestiscilo tu)
const profile = await this.notify.promise(this.api.getProfile(), {
    loading: 'Caricamento...', success: 'Profilo caricato',
});

// Gestione errore API (legge ProblemDetails RFC 9457)
try { ... } catch (err) {
    this.notify.handleApiError(err.status, err.problem);
}
```

---

## 📡 NotificationStreamService: Notifiche Realtime

`NotificationStreamService` (`providedIn: 'root'`) **estende per composizione** il `NotificationService`: si occupa solo del **trasporto realtime** — apre un `EventSource` verso l'endpoint SSE dell'Engine (`/api/notifications/stream`) — e per *mostrare* riusa ciò che `NotificationService` già espone (`toast`), senza reimplementare la UI. È il lato browser di `INotificationStream` (vedi [backend/README.md](../backend/README.md)).

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

**Notifiche non solo testuali.** Ogni notifica è `{ id, type, payload, timestamp }` con `payload` libero. Il `type` sceglie la reazione: senza handler registrato si ricade sul **toast di default**; con `on(type, ...)` fai *qualsiasi cosa* — un modale ricco (`notify.interact`), un'immagine, un link, o pilotare un tuo componente leggendo `notifications()`. Per il toast di default il payload usa il **contratto i18n**: `{ messageKey, messageParams?, icon }` (chiave tradotta lato client nella lingua corrente) oppure `{ message, icon }` per testo letterale. La risoluzione vive in un solo punto, `resolveText(notification)`, riusato anche dal campanellino.

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

**Notifica mirata a chi avvia il job — `X-Connection-Id` automatico.** Per notificare *questa scheda* a fine elaborazione il backend ha bisogno del `connectionId` della SSE. L'Engine lo allega da solo: `BaseApiService.build_api_Headers()` legge un holder inerte e condiviso (`NotificationConnection`) e, se valorizzato, aggiunge l'header `X-Connection-Id` su **ogni** chiamata `/api`. Tu fai la chiamata normale — niente header a mano:

```typescript
// Il connectionId viaggia da sé: l'header X-Connection-Id è già su questa POST.
await this.api.post('/upload', body);
```

L'holder è **inerte di proposito**: leggerlo (lato `BaseApiService`) NON inietta il `NotificationStreamService` e quindi NON apre alcuna SSE. Lo popola lo stream quando si connette e lo azzera quando cade. Finché nessuno apre lo stream (campanellino non montato) resta `null` → nessun header → il backend riceve un `connectionId` nullo e gestisce il caso (broadcast / nessun target). Lo stream resta così pigro: niente connessione SSE non richiesta, ma l'header c'è appena serve.

**Le risposte sono POST, non SSE.** Il canale è unidirezionale (server → client): l'utente "risponde" con una normale chiamata API (`api.post`), come nell'esempio sopra. Il giro completo è *notifica ricca (SSE) → azione utente → POST → eventuale esito (SSE)*. Un canale bidirezionale "vero" (chat, presence) richiederebbe WebSocket/SignalR, fuori scopo qui.

**Campanellino in navbar e storico.** `shell.showNotifications` è **opt-in** (default `false`): un campanellino sempre visibile ma mai alimentato è solo rumore, quindi lo attivi (`shell: { showNotifications: true }`) solo se il sito spinge davvero notizie. Quando attivo, l'Engine mostra in navbar un **campanellino** (`NotificationBellComponent`) con badge delle non lette e pannello dello storico, alimentato dal signal `notifications()`. La sua sola presenza **attiva lo stream** (il componente inietta il servizio): di default, quindi, un sito non apre alcuna connessione SSE.

**Robustezza e accessibilità.** La lista client è **limitata** (ultime 50) e **deduplicata per id**, così il replay SSE alla riconnessione (vedi backend) non genera doppioni e una scheda longeva non cresce all'infinito. Una notifica **senza testo** (payload di solo `type`, gestita da un handler custom) non scrive nella regione `aria-live` e non emette un toast vuoto: resta solo nello storico, senza far leggere stringhe tecniche allo screen reader. Lato a11y: il nome del pulsante include il **conteggio non lette** (`"Notifiche, 3 non lette"`), una regione **`aria-live`** annuncia gli arrivi dal vivo agli screen reader, `Esc` chiude il pannello e le voci sono una **lista semantica**. (Il pannello è una lista di sola lettura, non un menu di comandi: niente roving da tastiera in stile CDK Menu, che sarebbe la primitiva sbagliata qui.) Lo storico non è solo di sessione: a ogni (ri)apertura dello stream il servizio chiama `GET /api/notifications/history` (`loadHistory()`) e fonde i risultati per id, così il campanellino si popola anche dopo un reload, su una nuova scheda o dopo una riconnessione. Le notifiche **mirate a una connessione** restano effimere (fuori dallo storico server); broadcast e gruppo invece persistono — è la base su cui, col login lato server, poggerà lo storico **per-utente** (basta registrare un `INotificationGroupResolver`, vedi backend).

---

## 🖼️ AssetService: Immagini e File

`AssetService` (iniettato come `this.asset` in ogni `PageBaseComponent`) genera URL sicuri per le risorse multimediali.

```typescript
// URL di un asset gestito dal server (con resize on-the-fly)
// width è un tipo configurabile in app.config (es. 320 | 640 | 1280)
const url = this.asset.getUrl('id-immagine', 640);
// → /cdn-cgi/asset?id=id-immagine&w=640

// URL temporaneo per un Blob (es. file scaricato via api.getBlob())
const blob = await this.api.getBlob('mio-documento');
const { angularUrl } = this.asset.getUrlFromBlob(blob);
// angularUrl è un SafeUrl già sanitizzato per Angular
```

I Blob URL vengono revocati automaticamente a ogni cambio pagina, liberando la memoria da soli.

### Due pipeline immagini: `asset.getUrl(id)` vs `api.getBlobUrl(slug)`

Esistono **due percorsi distinti** per ottenere l'URL di un'immagine ottimizzata. Hanno comportamento simile (entrambi ridimensionano e cachano lato server) ma sorgenti diverse: scegli in base a dove vive l'immagine (vedi tabella sotto).

| | `asset.getUrl(id, width)` | `api.getBlobUrl(slug, webopt)` |
| :--- | :--- | :--- |
| Endpoint | `/cdn-cgi/asset?id=…&w=…` | `/api/blob/{slug}` |
| Identificatore | **id** dell'asset gestito | **slug** assegnato all'upload |
| Sorgente | Asset registrati in `mapping.json` (id → percorso fisico), generato al build | File caricati a runtime nel volume `uploads` via `uploadBlob()` |
| Usa quando | Immagini che fanno parte del progetto: hero, loghi, illustrazioni statiche | Contenuti caricati dagli utenti / dall'app dopo il deploy |

In breve: se l'immagine **esiste già nel repo/build** è un asset → `asset.getUrl('hero', 640)`. Se l'immagine **è stata caricata a runtime** ed è identificata da uno slug → `api.getBlobUrl(slug)`. Ognuno legge dalla propria sorgente: lo slug del blob dal volume `uploads`, l'id dell'asset da `mapping.json`.

### Ottimizzazione Immagini Server-Side

L'endpoint `/cdn-cgi/asset` effettua il resize lato server e cacha il risultato:

```
GET /cdn-cgi/asset?id=hero&w=640
→ Legge mapping.json (asset ID → percorso fisico)
→ Ridimensiona a 640px (se la larghezza è in whitelist)
→ Caches il risultato
→ Restituisce PNG/JPEG ottimizzato
```

Larghezze supportate (whitelist in `app.config.ts`): `125, 320, 480, 512, 640, 768, 1024, 1080, 1366, 1600, 1920`.
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

**Non solo `<img>` e `<a>`.** `appAsset` accetta tutti i tag con `src` — `img`, `video`, `audio`, `source`, `iframe`, `embed` — mentre `appAssetHref` vale su `a` e `link` (utile per un `<link rel="preload">`). `appAssetWidth` ha senso solo per le immagini raster: il server lo ignora automaticamente per video / PDF / SVG (restituisce lo stream originale), quindi è sicuro lasciarlo non valorizzato su quei tag.

```html
<video appAsset="intro" controls></video>
<iframe appAsset="manuale" title="Manuale"></iframe>
<link rel="preload" as="image" [appAssetHref]="'hero'" [appAssetWidth]="1024">
```

> **Sorgente:** `appAsset` / `appAssetHref` lavorano con gli asset gestiti da `AssetService` (id in `mapping.json`). Per un file caricato a runtime usa il binding diretto sullo slug: `[src]="api.getBlobUrl(slug)"` / `[href]="api.getBlobUrl(slug)"`.

### Vista a tutto schermo: `layout.fitViewport`

Per pagine/viste a tutto schermo (mappe, giochi, dashboard) dove lo scroll spezzerebbe l'esperienza. È un **flag dichiarativo per-pagina** in `site.ts` (non una direttiva sul template). Tu lo dichiari, lo gestisce l'Engine — il **builder** (`normalizeSitePage`) risolve la coerenza dei flag di layout, lo **shell** rende il `<main>` full-bleed (senza container/padding/pannello) e una regola CSS (`.fit-viewport`) fa riempire al contenuto lo spazio che resta sotto la navbar, senza scroll di pagina se il contenuto ci sta.

```typescript
// site.ts
{ path: 'radar', title: 'radarTitolo', pageType: PageType.Radar,
  component: () => import('./pages/radar/radar.component').then(m => m.RadarComponent),
  layout: { fitViewport: true } }
```

**Vista immersiva, per default.** `fitViewport` concentra la pagina sul contenuto: l'Engine lascia in scena la sola **navbar** — la via d'uscita — e mette da parte pannello, smoke e footer, che in full-bleed ruberebbero spazio. Tutto resta a portata: per riavere il footer basta `layout: { fitViewport: true, showFooter: true }`. Col footer attivo il contenuto vive *fra* navbar e footer, quindi con footer alti regola lo spazio di conseguenza.

**Lato pagina serve una cosa sola:** fai crescere il root del componente con `flex-grow-1` (o `h-100`) sul suo elemento radice, così riempie l'altezza. Il resto è territorio dell'Engine: dà già `display: block` all'host di ogni pagina e, in full-bleed, costruisce la catena flex fino al viewport adattandosi da sé a navbar/footer/orientamento — layout nativo del browser, anche in SSR. Tu pensi al contenuto.

---

## 🌍 Internazionalizzazione (i18n)

Le traduzioni vivono in `src/assets/i18n/` (la copia in `public/` è output di build, gitignored) in due cataloghi per lingua:

| File | Ruolo |
| :--- | :--- |
| `basic.{lang}.json` | Stringhe dell'Engine: traduzioni per le pagine di errore HTTP (`errore400Titolo`/`Descrizione` … fino al 504), azioni comuni (`clipboardCopied`, `clipboardError`, `shareError`, ecc.) e messaggi di login. **Non aggiungere qui chiavi di dominio** — quelle vanno in `addon.{lang}.json`. Aggiungere invece qui quando si modifica l'Engine stesso o si introduce una nuova notifica/comportamento globale; in quel caso la chiave va aggiunta in *tutti* i file `basic.*.json` — `i18n-check.sh` lo verifica in CI. |
| `addon.{lang}.json` | Stringhe del **progetto** — qui vanno le chiavi personalizzate. A parità di chiave **sovrascrive** `basic` (i cataloghi sono fusi con `addon` per ultimo): per cambiare il testo di una stringa dell'Engine si ridefinisce la chiave qui, senza mai toccare `basic.*.json` |

**Aggiungere una lingua:**
1. In `global-settings.json`: `"Localization.SupportedLanguages": ["it", "en", "fr"]`
2. Creare `basic.fr.json` e `addon.fr.json` in `src/assets/i18n/`
3. `i18n-check.sh` in CI verifica che nessuna chiave sia mancante

**Togliere una lingua:** basta rimuoverla da `SupportedLanguages`. I file `basic.*.json`/`addon.*.json` della lingua tolta restano orfani — nessun controllo li guarda più, è un limite noto: cancellarli a mano per pulizia.

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

`setLanguage(lang)` carica i cataloghi della nuova lingua, aggiorna il signal `currentLang`, scrive `<html lang>` e — solo con consenso tecnico accettato — persiste la preferenza (vedi *Persistenza Lingua e Consenso*). Poiché aggiorna `currentLang`, ogni contenuto reattivo via `httpResource` (es. `getProfileResource()`) si ri-fetcha da solo con il nuovo `Accept-Language`. Il tag passato è normalizzato BCP-47 e ricondotto a una lingua supportata: un tag non riconosciuto ricade su `defaultLang`.

```typescript
// t() è alias di translate(): stessa firma, comodo per template densi
this.translate.t('miaChiave');                    // = translate('miaChiave')

// Validazione di un tag prima di usarlo (statico)
TranslateService.isValidBcp47('it-IT');  // → true
TranslateService.isValidBcp47('xyz123'); // → false
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

Converte Markdown a HTML nel template, con sanitizzazione XSS rigorosa: l'HTML grezzo viene bloccato e gli URL non sicuri vengono neutralizzati automaticamente. Nei **link** sono ammessi solo gli schemi `http`/`https`/`mailto`/`tel` (bloccati `javascript:`, `data:`, `vbscript:` e i protocol-relative `//`); nelle **immagini** solo `http`/`https` e i data URI `data:image/` (gli altri schemi vengono scartati).
```html
<div [innerHTML]="testo | markdown"></div>
```

Supporta **GitHub Flavored Markdown** (tabelle, checklist, ecc.) e converte gli a-capo in `<br>`. Per convertire del Markdown **fuori da un template** (in TypeScript) c'è il metodo statico `MarkdownPipe.render(value)`, che applica le stesse regole di sanitizzazione:

```typescript
const html = MarkdownPipe.render('**Grassetto** e [link](https://example.com)');
```

Usata internamente da `PolicyComponent` per le pagine legali. Disponibile in qualsiasi componente per contenuto rich text.

---

## 🌐 ApiService: Chiamare il Backend

`ApiService` (iniettato come `this.api` in ogni `PageBaseComponent`) espone questi metodi:

| Metodo | Tipo di ritorno | Quando usarlo |
| :--- | :--- | :--- |
| `getProfile()` | `Promise<Profile>` | Caricamento una-tantum del profilo aziendale |
| `getProfileResource()` | `httpResource<Profile>` | Profilo reattivo (si aggiorna col Signal) |
| `getSocial(nomi?)` | `Promise<Record<string, string>>` | Link ai social del profilo; `nomi` opzionale filtra (es. `['facebook','instagram']`) generando query a chiavi ripetute (`?nomi=facebook&nomi=instagram`) |
| `getBlobUrl(slug, webopt?)` | `string` | URL relativo del file (`/api/blob/{slug}`) per `<img src>` / `<a href>` — senza download in memoria. Anche in GET passa dal proxy `/api` protetto da API key |
| `getBlob(slug)` | `Promise<Blob>` | File scaricato in memoria (anteprima locale, download forzato) |
| `uploadBlob(file)` | `Promise<{ slug }>` | Carica un file nel volume uploads (richiede JWT) |
| `login(username, password)` | `Promise<LoginResult>` | Autenticazione utente (solo se JWT abilitato) |

### File Uploads (`/api/blob`)

`getBlobUrl` restituisce sempre un path relativo con prefisso `/api` (es. `/api/blob/{slug}`): il browser raggiunge il file attraverso il proxy SSR del frontend, non tramite l'URL interno del backend. Il prefisso è configurabile via `SSR_API_PREFIX` (default `/api`).

#### Quale metodo usare per mostrare un file

Per **visualizzare o linkare un file che vive sul server** (immagine, PDF, allegato) la risposta è una sola: `getBlobUrl(slug)`. Restituisce una stringa da mettere direttamente in `<img [src]>` / `<a [href]>`, senza scaricare nulla in memoria. È il percorso da preferire: il file viaggia come una normale GET HTTP, quindi sfrutta caching del browser e range requests.

```html
<img [src]="api.getBlobUrl(slug)" alt="...">          <!-- webopt=true di default → immagine ottimizzata -->
<a  [href]="api.getBlobUrl(slug, false)" download>Scarica originale</a>
```

`getBlob()` + `AssetService.getUrlFromBlob()` serve **solo se si ha già un `Blob` in memoria** e occorre un object URL temporaneo, cioè quando:
- scarichi il file per elaborarlo lato client invece di limitarti a mostrarlo;
- mostri l'anteprima locale di un file scelto dall'utente *prima* di caricarlo;
- il `Blob` è stato generato localmente (canvas, QR, immagine da testo…).

```typescript
const blob = await this.api.getBlob(slug);
const { angularUrl } = this.asset.getUrlFromBlob(blob); // SafeUrl; revocato in automatico al cambio pagina
// <img [src]="angularUrl">
```

> **Regola pratica:** un file che sta sul server e va solo mostrato/linkato → `getBlobUrl`. Un `Blob` già disponibile in memoria → `getUrlFromBlob`.

> **Default `webopt = true`:** è un flag generico che chiede al backend la versione **ottimizzata per il web** del file, qualunque essa sia — non è legato alle immagini per definizione. Oggi l'unica ottimizzazione implementata è quella per le immagini (lato più lungo max 1920 px, conversione in WebP), quindi i contenuti per cui non esiste ancora una pipeline (PDF, video…) vengono serviti tali e quali; ma il flag è il punto di aggancio previsto per future riduzioni lato API di altri tipi di contenuto. Per ottenere **sempre** il file originale, così com'è stato caricato — es. download a piena risoluzione — passa `getBlobUrl(slug, false)`.

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

> **Nota:** `uploadBlob` richiede JWT valido (l'utente deve essere loggato). Anche le GET (`getBlobUrl`, `getBlob`) richiedono l'API key: l'endpoint `/blob/{slug}` non è anonimo, quindi i file non sono una risorsa pubblica raggiungibile direttamente dal backend (es. da un crawler) come lo sono gli asset statici. Nel browser la chiave non va gestita: la inietta in modo trasparente il proxy SSR `/api`.

**Pattern one-shot** (dati statici, caricati una volta):
```typescript
ngOnInit() {
    this.api.getProfile().then(p => this.profile.set(p));
}
```

**Pattern reattivo** (dati che si aggiornano con la lingua o lo stato):
```typescript
readonly profileRes = this.api.getProfileResource();
// In template: profileRes.value() | profileRes.isLoading()
```

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
3. **(Opzionale) ContentResolver** — se l'endpoint alimenta una pagina al primo render, aggiungi un `case` in `ContentResolver.loadResolved()` (vedi *Developer Journey → Passo 5*).

```typescript
// 1. Path
const API = { /* … */ articolo: (id: string) => `articolo/${encodeURIComponent(id)}` } as const;

// 2. Metodo pubblico — la gestione errori/notifica è automatica via interceptor
getArticolo(id: string): Promise<Articolo> {
    return this.api_get<Articolo>(API.articolo(id));
}
```

> **Upload multipart/`FormData`:** per gli endpoint che ricevono file usa `this.api_post_form<T>(path, formData)` invece di `api_post` — è quello che usa già `uploadBlob`. Non impostare `Content-Type` a mano: il browser lo aggiunge con il boundary corretto; per il resto passa per le stesse `build_api_Headers` e l'`apiErrorInterceptor`.

### `httpResource` per Componenti Sempre-On

Usa `getProfileResource()` nei componenti che restano attivi durante tutta la navigazione (navbar, footer):
```typescript
readonly profile = this.api.getProfileResource();
// profile.value() → Profile | undefined
// profile.isLoading() → boolean
```
Si aggiorna automaticamente al cambio lingua (tramite segnale `Accept-Language`).

> **`getProfile()` vs `getProfileResource()`:** scegli in base alla reattività che ti serve. `getProfile()` è una `Promise` one-shot: la risolvi una volta (es. in `ngOnInit`) e i dati restano fissi finché non richiami il metodo — adatta a dati che leggi una volta sola. `getProfileResource()` è un `httpResource` reattivo che si ri-fetcha da solo al cambio lingua: usalo nei componenti sempre-attivi (navbar, footer) così mostrano sempre la lingua corrente.

---

## 📤 ShareService: Copia, Condivisione, Download

`ShareService` centralizza tutte le operazioni di condivisione e download. **Responsabilità unica:** esegue l'operazione e ne restituisce l'esito — **non mostra toast**. La notifica è di chi scatena l'azione (il bottone/la pagina), così lo stesso servizio resta usabile anche in contesti silenziosi. I componenti `app-copy-action` / `app-share-action` lo fanno già per te.

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

**Esito (`ShareResult`):** `shared` (foglio nativo) · `copied` (fallback appunti) · `downloaded` (fallback download) · `cancelled` (annullato) · `error`. L'helper puro `shareResultNotice(result)` decide il toast appropriato (o `null`); il componente lo mostra.

**Fallback chain:** Web Share API disponibile → usa native share; non disponibile / errore → fallback a download o copy.

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

**Caching:** LRU cache automatica (max 32 QR) — QR identici con stessi colori sono serviti dalla memoria senza ricalcolo.

**Varianti utili:** `toSVG(config)` restituisce il QR come **stringa SVG** (vettoriale, scalabile) invece del Blob PNG; `createWithColors(config, fg, bg)` genera il QR con **colori espliciti** invece di leggerli dal tema (`create` è infatti uno scorciatoio che passa `colorPrimaryText` / `colorPrimary`).

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

Oltre alle opzioni di layout, puoi passare `fontFamily` (una **chiave** di `FontConfig.WEB_FONTS`, risolta nello stack CSS reale) e `lineHeight` (moltiplicatore d'interlinea, default `1.4`). Per allegare l'immagine a un `FormData`/upload c'è `buildFile(text, filename?, opts?)`, che restituisce un `File` PNG già pronto (è `buildBlob` avvolto in un `new File([...])`).

**SSR-safe:** il metodo statico `ImgBuilderService.buildSvg()` non tocca DOM né Angular — usabile in Node.js per generare preview server-side.

---

## 🔗 Meta Tag e Anteprima Sociale (PageMetaService)

`PageMetaService` aggiorna meta tag (title, og:, twitter:, canonical, JSON-LD) per ogni pagina. I valori di base vengono impostati automaticamente da `site.ts`; il resolver li affina con i dati della pagina.

### og:image Dinamica

In SSR viene generata automaticamente un'immagine personalizzata per la condivisione sociale:
- Asset di background (se `imgId` fornito)
- Overlay con titolo e sottotitolo
- Badge con favicon del sito

```typescript
// Nel ContentResolver della pagina
this.pageMeta.setPageMeta({
    pageTitle: 'Il Mio Articolo',
    description: 'Descrizione SEO',
    imgId: 'hero-image-123',
    ogType: 'article',
    structuredDataType: 'Article'
});
```

**Importante:** `og:image` si aggiorna solo in SSR. I crawler non eseguono JavaScript — vedono la versione server-rendered. Le modifiche client-side all'og:image non hanno effetto sui preview di Facebook/LinkedIn/WhatsApp.

### Generazione og:image: la rotta `/cdn-cgi/preview`

L'og:image **non è un file statico**: l'Engine la **genera al volo**. Il Node SSR espone `/cdn-cgi/preview` (`server/routes/og-preview.ts`), che produce un'immagine OpenGraph/Twitter Card 1200×630 in due varianti, scelte dal payload:

- **Card testuale** — quando non c'è un'immagine di sfondo: SVG con nome app, favicon, titolo e sottotitolo sul colore brand.
- **Variante con immagine** — quando il payload porta un `id` asset: sfondo sfocato + immagine in primo piano + (salvo `onlyImage`) favicon e badge col titolo.

Il risultato viene cachato su disco (WebP) come ogni thumbnail di `/cdn-cgi/asset`.

Tu non costruisci l'URL a mano: lo controlli da `site.ts`. La pagina dichiara `otherSEO.ogImage` (l'**id** dell'asset di sfondo) e, a livello globale, `onlyPlainImage` decide se mostrare la sola immagine senza scritte/favicon. Per la semantica a tre stati di `ogImage` (id asset / `false` = nessuna / omesso = preview dinamica auto-generata) vedi *Opzioni Avanzate di `site.ts`*.

**Il payload è cifrato e non falsificabile.** I parametri (`title`, `subtitle`, `id`, `onlyImage`) viaggiano nel query param `?p=` come blob **AES-GCM** prodotto da `PreviewCrypto` (`server/preview-crypto.server.ts`): una manomissione fa fallire la decifrazione → **403**. La chiave è derivata, in ordine di precedenza, da `PREVIEW_CRYPTO_SECRET` → la API key server-side (`Security.ApiKeys[0]`, segreta) → `appName:version`. Il fallback sull'API key rende i blob non forgiabili **anche senza configurare un secret dedicato**: senza di esso un attaccante che conosce `appName` e `version` (entrambi pubblici) potrebbe forgiare og:image arbitrarie sul dominio. L'IV è deterministico (SHA-256 del payload), quindi lo stesso payload produce sempre lo stesso URL — stabile e cacheable da browser/CDN.

### JSON-LD Strutturato (grafo Schema.org)

Schema.org viene iniettato automaticamente per ogni pagina. Migliora l'apparenza in Google Search e altri motori. L'Engine emette un **grafo di entità separate**, ognuna nel proprio `<script type="application/ld+json">`: blocchi distinti rendono il grafo più leggibile ai validator e permettono di aggiornare ogni entità senza sovrascrivere le altre.

| Entità | `@id` | Quando |
| :--- | :--- | :--- |
| `Organization` | `{origin}#organization` | Sempre — nome, URL e logo del sito |
| `WebSite` | `{origin}#website` | Sempre — collega le pagine al sito e all'organizzazione |
| `WebPage` (o tipo scelto) | `{canonical}#webpage` | Sempre — la pagina corrente, con `inLanguage`, `isPartOf`, `publisher` |
| `BreadcrumbList` | — | Solo quando il path non è la root (`/`) |

Il tipo della pagina (`Article`, `WebPage`, ecc.) si imposta tramite `structuredDataType` nella config della pagina in `site.ts`. Ogni script è marcato con l'attributo `data-br1-jsonld` (per aggiornarli/rimuoverli in blocco) e riceve il **nonce CSP** della richiesta in SSR, così rispetta la Content-Security-Policy senza `unsafe-inline`.

### URL Canonico e `og:locale`

Il canonical viene costruito in modo **stabile** per evitare contenuti duplicati e canonical divergenti tra HTML iniziale e idratazione:
- query string e hash vengono rimossi;
- in SSR l'origin è forzato a `FRONTEND_BASE_URL`, indipendentemente dagli header del reverse proxy.

Lo stesso canonical alimenta `og:url`, il tag `rel="canonical"` e gli `@id`/`url` del grafo JSON-LD, mantenendoli coerenti.

`og:locale` (e gli `og:locale:alternate` per le altre lingue) usano il formato regionale OpenGraph `lingua_REGIONE` (es. `it_IT`, `en_US`), derivato via `Intl.Locale().maximize()`. Gli alternate vengono rigenerati con remove+add a ogni cambio pagina, così funzionano correttamente anche con più di due lingue (dove `Meta.updateTag` sovrascriverebbe un solo tag).

---

## 🔄 Controllo Versione e Aggiornamenti (VersionCheckService)

L'app controlla automaticamente se è disponibile una nuova versione e notifica l'utente.

### Fonti di Versione

La versione è dichiarata in `global-settings.json` (`project.version`) e distribuita in tre posti tramite `generate-statics.ts` al build:
1. Meta tag `app-version` — baseline in memoria
2. `manifest.webmanifest` — usato dal polling ogni 10 minuti
3. Hash NGSW — usato da SwUpdate nelle PWA installate

### Meccanica

**Browser normale:** polling ogni 10 minuti su `/manifest.webmanifest` → se version cambia → dialog "Nuova versione disponibile" → hard reload attiva la nuova versione.

**PWA installata:** SwUpdate intercetta il manifest (Service Worker) → emette `VERSION_READY` quando la nuova versione è scaricata → l'utente conferma → `activateUpdate()` + reload.

**Prerequisito:** il controllo versione è **disabilitato finché `isTechnicalConsentGiven()` è false**. Una volta accettato il consenso tecnico, il servizio si attiva al reload successivo.

---

## ⚙️ Opzioni Avanzate di `site.ts`

Oltre a `path`, `title` e `description`, ogni pagina in `pages` accetta:

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
    },

    // Meta tag OpenGraph aggiuntivi
    otherSEO: {
        ogImage: 'og-cover',  // ID asset (non un path). `false` = nessun og:image; omesso = preview dinamica auto-generata
        ogType: 'article',
        structuredDataType: 'WebPage',
    },
}
```

A livello top di `site.ts` (oltre a `pages` / `headerNav` / `footerNav`) dichiari struttura e comportamento del sito. Ogni campo ha un default: dichiari solo quelli che vuoi cambiare.
```typescript
// site.ts
homePage: PageType.Home,           // pagina del brand/logo nel navbar (se omessa, il brand non è un link)
loginPage: PageType.Login,  // dove mandare gli utenti non autenticati (se omessa → /error/401)

shell: {                           // comportamento di navbar / footer / header / pannello contenuti
    showNav: true,                 // mostra la navbar (false nasconde anche il language picker)
    showFooter: true,              // mostra il footer
    fixedTopHeader: false,         // navbar fissa in alto allo scroll
    showBrandIconInHeader: true,   // favicon accanto al nome nel brand
    showLoginInHeader: true,       // link Login / pulsante Logout nella navbar
    showNotifications: false,      // campanellino notifiche realtime con storico (default false, opt-in)
    forcedLightPanel: true,        // pannello contenuti sempre chiaro, a prescindere dal tema OS
},

isWebApp: true,                    // funzionalità PWA (Service Worker, aggiornamenti, install offline)
onlyPlainImage: false,             // anteprime social con sola immagine, senza scritte/favicon

legalPages: { /* … */ },           // pagine legali → vedi sotto
```

> `description` (mappa per-lingua `{ it, en, … }`), `colorTema` e l'effetto `smoke` non stanno qui: sono identità/estetica e vivono in `global-settings.json → site`.

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

**Spento da solo quando darebbe fastidio.** Anche con `enable: true`, lo shell (`app.component.ts`) calcola `showSmoke` e tiene l'effetto **off** automaticamente quando non avrebbe senso: in `fitViewport` (vista immersiva), quando il pannello contenuti non c'è (`showPanel: false`), e quando l'utente ha richiesto `prefers-reduced-motion`. Così lo smoke compare solo dove c'è un pannello che lo ospita e l'utente non ha chiesto meno animazioni — un default rispettoso dell'accessibilità, senza configurazione.

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
      component: () => import('./pages/promo/promo.component') },
],
```

### Navigazione Multilivello (Navbar e Footer)

I menu in `site.ts` (`headerNav` e `footerNav`) sono **callback** che ricevono un builder, non array. Il builder espone tre azioni — `addPage(PageType)` (voce singola), `addLink('chiaveLabel', '/path')` (link diretto, anche URL esterno), `addGroup('chiaveLabel', b => …)` (gruppo/dropdown) — e i gruppi sono **annidabili** (dentro un `addGroup` ne richiami un altro):

```typescript
headerNav: (nav) => {
    nav.addPage(PageType.AboutUs);
    nav.addGroup('navServizi', servizi => {
        servizi.addPage(PageType.Consulting);
        servizi.addGroup('navSviluppo', dev => {            // gruppi annidabili
            dev.addPage(PageType.WebDev);
            dev.addLink('navBlog', 'https://blog.example.com'); // link esterno
        });
    });
}
```

L'Engine elabora i gruppi in modo automatico:
- **Navbar (Desktop)**: genera un menu dropdown. Dal secondo livello in giù, genera **flyout laterali** che si espandono verso destra (o si ribaltano a sinistra in automatico se sforano il viewport).
- **Navbar (Mobile)**: converte i gruppi in **accordion indentati** che si espandono al click.
- **Footer**: genera colonne annidate visivamente strutturate per livelli di indentazione.

**Limiti di Profondità**: Se superi i 3 livelli di profondità, in fase di sviluppo riceverai un avviso di usabilità in console (`NAV_DEPTH_WARN`), e un errore bloccante se si superano i 5 livelli (`NAV_DEPTH_MAX`).

### Pagine legali (`legalPages`)

Mappi gli slot legali dell'Engine ai tuoi `PageType`; il builder costruisce da solo il contenitore `/policy/*` con le sole pagine valorizzate:
```typescript
legalPages: {
    privacy: PageType.PrivacyPolicy,
    cookie:  PageType.CookiePolicy,
    tos:     PageType.TermsOfService,
    legal:   PageType.LegalNotice,
},
```
- **Slot omesso** → quella pagina non viene creata (es. una vetrina con i soli cookie).
- **Cookie obbligatoria**: se il sito usa cookie (multilingua, PWA o cookie di progetto) lo slot `cookie` dev'essere valorizzato, altrimenti il build si ferma con un errore esplicito.
- **Contenuto**: Markdown localizzati in `src/assets/legal/` (slug `privacy`, `cookie`, `TOS`, `legal` → `<slug>.<lang>.md`); il `PolicyComponent` interpola i placeholder del profilo aziendale (`{{ragioneSociale}}`, `{{partitaIva}}`, …).

**Override per-pagina.** Per gestire una policy a modo tuo (rotta dedicata, contenuto da API invece che da Markdown) dichiari tu stesso la pagina in `pages` con lo stesso `PageType`: la tua vince, l'Engine non la crea e non ne carica il `.md`. Le altre policy restano automatiche.

### Passare Dati a una Pagina: Component Input Binding

Il router è configurato con `withComponentInputBinding()` (`app.config.ts`): **tutto ciò che finisce nella rotta diventa un `@Input()` della pagina, abbinato per nome** — senza iniettare `ActivatedRoute`. Vuoi passare qualcosa a una pagina? Lo metti nel canale giusto e la pagina lo legge con un signal-input dello stesso nome. I canali sono quattro, da scegliere in base a *dove nasce il dato*:

| Canale | Da dove arriva | Quando usarlo |
| :--- | :--- | :--- |
| **`data: { … }`** (statico) | dichiarato sulla pagina in `site.ts` | configurazione/variante **fissa** di quella rotta (es. la stessa pagina riusata con un flag diverso) |
| **Parametro di rotta `:x`** | segmento dinamico del `path` | id/slug che vivono nell'URL |
| **Query string `?x=`** | querystring | filtri o stato condivisibile via URL |
| **Resolver (`contentByResolve`)** | risolto **prima** che la pagina si attivi | contenuto async che l'Engine carica per la pagina |

**1–3. `data` statico, parametro di rotta, query.** Li dichiari (o li porta l'URL) e li leggi come `input()` omonimo:

```typescript
// site.ts — `data` statico (canale 1) + parametro nel path (canale 2)
{ path: 'listino/:fascia', pageType: PageType.Listino,
  component: () => import('./pages/listino/listino.component'),
  data: { variante: 'premium' } }
```
```typescript
// listino.component.ts — tutti letti come input, senza ActivatedRoute
readonly variante = input<string>('base');  // dal `data` statico
readonly fascia   = input<string>();         // dal parametro di rotta `:fascia`
readonly q        = input<string>();         // dalla query `?q=...`
```

> È lo stesso meccanismo della rotta d'errore dell'Engine: `error/:errorCode` → `ErrorComponent` legge `readonly errorCode = input(404, …)`.

**4. Il resolver è già cablato.** Ogni pagina foglia ha `route.resolve = { contentByResolve: … }`: l'Engine risolve il contenuto della pagina (vedi `ContentResolver`) e lo consegna nell'input `contentByResolve`, che **`PageBaseComponent` legge già per te** (`input<ResolvedPage<T> | null>()`). Estendendo la base hai il contenuto risolto senza scrivere nulla; aggiungi tuoi `input()` solo per i canali 1–3.

> **Chiavi riservate in `route.data`.** Il builder fonde il tuo `data` con chiavi che gestisce l'Engine — `pageType`, `showPanel`, `showNav`, `showFooter`, `fitViewport`, `pageDescription`, `ogImage` (più `contentByResolve` dal resolver) — e **le sue vincono** sulle omonime nel tuo `data`. Non riusare quei nomi. `pageType` è sempre disponibile come `input.required<PageType>()` (lo legge `PageBaseComponent`). Tra i canali usa **nomi distinti**: a parità di nome la pagina riceve un solo valore.

`withInMemoryScrolling()` gestisce la posizione di scroll: il ritorno alla pagina precedente ripristina la posizione; i link con `#section` scrollano all'ancora.

---

## 🧩 Configurazione di progetto (`Custom`)

`global-settings.json → Custom` è uno spazio libero per la configurazione di progetto (feature flag, ID analytics, soglie): oggetti annidati arbitrari, senza toccare schema o codice infrastrutturale. È leggibile a ogni livello:

- **Backend (ASP.NET Core):** `IConfiguration["Custom:TuaChiave"]`
- **Node SSR:** `getBr1Settings().Custom`
- **Browser Angular:** `inject(APP_CUSTOM)` in qualsiasi componente o servizio — l'SSR serializza `Custom` in `TransferState` e il client la rilegge in idratazione (fallback `{}` senza SSR).

```typescript
import { APP_CUSTOM } from './core/engine/app-custom';

const custom = inject(APP_CUSTOM);
const trackingId = custom['Analytics']?.['TrackingId'] as string | undefined;
```

> `Custom` è committabile ed esposto al client: usalo per valori pubblici (feature flag, limiti, ID analytics); i segreti vivono in `global-settings.local.json`.

> ⚠️ **`Custom` lato browser richiede SSR sulla rotta.** `inject(APP_CUSTOM)` si popola dal `TransferState`, che esiste solo se la pagina è renderizzata dal server. Su una rotta `renderMode: 'client'` (incluse le pagine `requiresAuth`, vedi sopra) il `TransferState` non viene emesso → al **caricamento diretto/refresh** di quella rotta `APP_CUSTOM` è `{}`. Se una pagina deve leggere `Custom` lato client (es. un token mappa), tienila `renderMode: 'server'`: l'SSR rende solo la shell e popola il `TransferState`, mentre la logica browser resta in `afterNextRender`. Se il valore deve restare fuori dal repo, mettilo in `Custom` di `global-settings.local.json` (gitignored): il merge in dev e il file effettivo in prod lo fanno comunque arrivare.

### Token `SITE_CONFIG`: la Config Risolta del Sito

Mentre `Custom` è uno spazio libero per il progetto, `SITE_CONFIG` è il token DI che espone la `SiteConfig` finale **normalizzata** dall'Engine (provider in `app.config.ts`, valore `ContestoSito.config`). `inject(SITE_CONFIG)` restituisce la configurazione già risolta — default applicati, slot legali completi, riferimenti sanitizzati — senza ri-derivarla:

```typescript
import { SITE_CONFIG } from './core/engine/siteBuilder';

const site = inject(SITE_CONFIG);
site.appName;     // nome applicativo
site.version;     // versione canonica
site.colorTema;   // colore brand di default (usato anche da ThemeService, vedi sopra)
site.showNav;     // flag shell appiattiti al top-level di SiteConfig: showNav, showFooter,
site.showFooter;  //   fixedTopHeader, showBrandIconInHeader, showLoginInHeader, showNotifications, forcedLightPanel
site.legalPages;  // slot legali risolti (PageType o null per ciascuno)
site.homePage;    // PageType del brand (o null)
site.loginPage;   // PageType di redirect non-auth (o null)
```

---

## 📡 Configurazione SSR e Origine Frontend

### `FRONTEND_BASE_URL` per og:image

L'URL canonico del sito è dichiarato in `FRONTEND_BASE_URL` (env var letta da `deploy.sh` / `global-settings.json`). Viene usato per costruire URL assoluti di `og:image` in SSR — indipendentemente dagli header del reverse proxy (Nginx, Cloudflare):

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
| Fallback | Se il `PageType` non è registrato in `site.ts`, naviga verso `/` **in silenzio**: nessun errore a runtime né a compile-time (il `PageType` esiste come enum, manca solo la rotta). Un link che porta a casa senza motivo apparente di solito è un `PageType` dichiarato nell'enum ma mai aggiunto a `pages`. |
| `href` | Bindato esplicitamente: RouterLink come `hostDirective` non aggiorna il proprio `@HostBinding` via effect → senza questo binding, l'elemento avrebbe `href=null` e cursore testo invece di cursore link |
| Tipo | `input.required<PageType>()` — errore TypeScript a compile-time se mancante |

**Regola pratica:** usa `[appPage]` per tutti i link interni. Per navigazione programmatica dopo operazioni asincrone (es. redirect post-login, post-form) inietta `Router` e chiama `router.navigate([ContestoSito.getPath(PageType.X) ?? '/'])`.

---

## 🖼️ Directive di Rendering Dichiarativo

### `img[imgRender]`: Rendering Immagine Generata

Applica `ImgBuilderService` direttamente su un `<img>`. Il `src` viene aggiornato automaticamente con il data URL PNG ogni volta che la config cambia. Niente wrapper, niente classi proprie — l'elemento accetta tutti gli attributi `<img>` standard.

```html
<img [imgRender]="imgConfig"
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
- **Selector vincolato**: `img[imgRender]` → errore TypeScript a compile-time su elementi diversi da `<img>`

### `img[qrContent]`: Rendering QR Code

Applica `QrCodeService` direttamente su un `<img>`. Il `src` viene aggiornato automaticamente con il blob URL del QR generato.

```html
<img [qrContent]="qrConfig"
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
- **Selector vincolato**: `img[qrContent]` → errore TypeScript a compile-time su elementi diversi da `<img>`

---

## 🖱️ `[appContextMenu]`: Menu Contestuale

La directive `ContextMenuDirective` aggiunge un menu contestuale a qualsiasi elemento. Su desktop apre un **popover** sotto il cursore; su mobile/touch apre un **bottom sheet** a tutta larghezza.

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
    <app-profile-render [profile]="profile()!" />
</app-loading>
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `loading` | `boolean` (required) | `true` → spinner; `false` → contenuto proiettato |

### `app-profile-render`: Dati Aziendali Completi

Visualizza un oggetto `Profile` con tutti i campi legali italiani. I campi `null`/`undefined` vengono omessi automaticamente (skip-empty).

```html
<app-profile-render [profile]="profile" />
```

Rende due sezioni:
- **Contatti**: telefono, PEC, email
- **Dati societari**: P.IVA, Codice Fiscale, sede legale, registro imprese, REA, capitale sociale, versamento integrale, socio unico, stato di liquidazione, codice SDI

Formattazione automatica:
- **Importi**: `Intl.NumberFormat` con locale mapping (`it` → `it-IT`, `en` → `en-GB`)
- **Booleani**: tradotti tramite chiavi i18n (`siAzione` / `noAzione`)
- **Indirizzo**: assembla `via civico` + `CAP città (provincia)` + `nazione`

Le etichette usano le chiavi `*Azienda` in `addon.{lang}.json` — tutte personalizzabili.

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

Pulsante social con icona e colore brand corretti. Riconosce automaticamente tutti i network noti; per gli sconosciuti usa `fa-solid fa-link` senza colore brand.

```html
<app-social-link type="facebook"  [value]="fbUrl" />
<app-social-link type="instagram" [value]="igUrl" [showLabel]="true" />
<!-- Network non riconosciuto — usa icona generica -->
<app-social-link type="mio-sito"  [value]="url"   label="Sito web" />
```

| Input | Tipo | Descrizione |
| :--- | :--- | :--- |
| `type` | `string` (required) | Chiave network (case-insensitive) |
| `value` | `string` (required) | URL o handle |
| `label` | `string` | Etichetta custom (default: `capitalize(type)`) |
| `showLabel` | `boolean` | Mostra testo accanto all'icona (default: `false`) |

Network con branding integrato (30+): `facebook`, `instagram`, `twitter`, `linkedin`, `youtube`, `whatsapp`, `telegram`, `tiktok`, `spotify`, `discord`, `github`, `reddit`, `threads`, `google`, `snapchat`, `pinterest`, `tumblr`, `twitch`, `soundcloud`, `deezer`, `vimeo`, `dribbble`, `skype`, `mastodon`, `btc`, `amazon`, `airbnb`, `apple`, `android`, `yahoo`, `audible` e altri.

### `app-link-badge`: Link a Badge con Icona

Componente presentazionale di basso livello: un `<a>` (apre in nuova scheda) con icona-pastiglia (`app-icon`) e testo opzionale. È il template unico su cui poggiano le famiglie *Contatto* e *social* (`app-social-link`), che gli passano solo i dati senza logica propria. Usalo direttamente quando ti serve un link "a badge" generico fuori da quelle famiglie.

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

La maggior parte richiede anche `action` (required) — funzione sincrona o asincrona che produce il contenuto; fanno eccezione `app-pdf-action` (usa `config`) e `app-print-action` (nessun input di contenuto: stampa la pagina corrente).

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
Apre la finestra di stampa nativa del browser tramite `window.print()`. Non richiede `action` né altri input aggiuntivi: stampa il contenuto della pagina corrente così com'è.

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

Le due famiglie sopra poggiano su una base comune, `BaseActionComponent` (`components/shared/base/base-action.component.ts`), che incarna il principio dei **componenti autonomi**: chi usa il bottone non inietta mai un servizio, passa al massimo una funzione che produce il dato. La base centralizza la parte "sporca" una volta sola:

- gli input `label` / `showLabel` / `fullWidth` (con l'host che diventa `display: block` quando `fullWidth`);
- la traduzione della label (`displayLabel`), che ricade su `defaultLabelKey` se non passi una `label`;
- il metodo protetto `run(work)`, che gestisce il flag `loading()`, **previene la doppia esecuzione** (se è già in corso fa no-op), esegue il lavoro asincrono e, in caso di errore, mostra un toast `erroreImprevisto`.

Per aggiungere un tuo bottone d'azione (in `components/shared/**`, territorio del figlio) dichiari solo due cose: la chiave i18n di default e la logica dentro `run()`. Tutto il resto lo eredita.

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

Nel template chiami `onClick()` sul bottone, leggi `displayLabel()` per il testo e `loading()` per lo spinner — esattamente come fanno `app-copy-action` o `app-pdf-action` (quest'ultimo è un buon esempio: estende la base e sovrascrive `displayLabel` per cambiare etichetta fra "apri" e "scarica"). I componenti di contatto seguono lo stesso principio ma su una base diversa, `BaseContactComponent` (`components/shared/contact/base-contact.component.ts`): essendo link e non azioni, specializza `BaseLinkComponent` invece di gestire `run()`, e ogni canale concreto dichiara `defaultLabelKey`, `glyph`, `color` e l'`href` derivato dalla `config`.

---

## 🏗️ Script di Build: `generate-statics.ts`

Lo script sincronizza i file statici e **inietta nel frontend** (via `src/environments/environment.ts`) identità ed estetica del progetto: `project.name`/`project.version`, `Localization` e la sezione `site` (descrizione, tema, smoke) da `global-settings.json`. La **struttura e il comportamento** (pagine, menu, `shell`, `isWebApp`, `loginPage`, `legalPages`) restano in `site.ts`. **Va eseguito ogni volta che si modifica `global-settings.json` o `site.ts`** (è già nei passi `prebuild`/`prestart`; in Docker la config arriva via l'ARG `BR1_PROJECT_JSON`).

```bash
npm run generate:statics
```

### File Aggiornati

| File | Contenuto sincronizzato |
| :--- | :--- |
| `src/index.html` | `<html lang>`, `<title>`, tutti i meta OpenGraph/Twitter, favicon |
| `public/manifest.webmanifest` | `name`, `description`, `theme_color`, `background_color`, `lang`, `version` |
| `public/sitemap.xml` | URL di tutte le pagine indicizzabili con `priority`, `changefreq` e `lastmod` automatici |
| `public/robots.txt` | `Disallow` per le pagine `requiresAuth: true`, URL sitemap |
| `public/llms.txt` | Indice del sito per i crawler AI (convenzione `llms.txt`): nome, descrizione, elenco pagine |
| `public/security.txt` | Contatto di sicurezza RFC 9116 (`Expires` rigenerato a ogni build); servito sul percorso canonico `/.well-known/security.txt` dal Node SSR |
| `public/theme-init.js` | Script anti-flash del tema (vedi *Tema → Anti-flash*): sincrono nel `<head>`, imposta `data-bs-theme` da `prefers-color-scheme` prima che Bootstrap carichi gli stili |
| `src/environments/environment.ts` | `defaultLang`, `availableLanguages` — **file generato automaticamente, non modificare manualmente** |

> **Versionati vs solo-build.** Tre output generati sono **versionati** come seed — `src/index.html`, `src/environments/environment.ts`, `public/manifest.webmanifest` e `public/robots.txt` — così type-check e build funzionano anche prima della prima rigenerazione: lo script li tiene aggiornati e la diff si committa insieme a `global-settings.json`. Gli altri (`sitemap.xml`, `llms.txt`, `security.txt`, `theme-init.js`, `icons/`) sono **solo output di build**, gitignored: non vanno mai committati.

### Icone PWA automatiche (`generate-icons.ts`)

Un secondo script, `generate-icons.ts`, deriva le icone PWA `public/icons/icon-192x192.png` e `icon-512x512.png` dall'asset **`favIcon`** dichiarato in `mapping.json` (ridimensiona con `sharp`, con fallback a copia se `sharp` manca). Gira in automatico negli stessi pre-hook di `generate-statics` (`prestart` / `predev` / `prebuild`), quindi non va lanciato a mano.

Il punto pratico: **un solo asset, `favIcon`, alimenta tutto** — favicon del sito (in `index.html`), icone dell'app installabile (PWA) e il badge sulle anteprime social generate da `/cdn-cgi/preview`. Cambi quel singolo file in `mapping.json` e si aggiornano tutti e tre.

### Variabili d'Ambiente

| Variabile | Descrizione | Fallback |
| :--- | :--- | :--- |
| `FRONTEND_BASE_URL` | URL canonico del sito (es. `https://tuodominio.it`), per gli URL assoluti `og:image` | `https://example.com` con warning |

Lingua di default e lingue supportate **non** sono variabili d'ambiente: lo script le ricava dalla sezione `Localization` del progetto. Su host/CI legge direttamente `global-settings.json`; nelle immagini Docker (dove il file non è nel build context) legge gli stessi dati da `BR1_PROJECT_JSON`, il JSON di progetto che `deploy.sh` passa come build-arg.

### Esclusioni Automatiche da Sitemap e robots.txt

| Condizione sulla pagina | Effetto |
| :--- | :--- |
| `enabled: false` | Esclusa dalla sitemap |
| `externalUrl` presente | Esclusa dalla sitemap |
| `requiresAuth: true` | Esclusa dalla sitemap + riga `Disallow` in robots.txt |

### Priority e Changefreq Automatici

| Profondità del path | Esempio | `priority` | `changefreq` |
| :--- | :--- | :--- | :--- |
| 0 (root) | `/` | `1.0` | `weekly` |
| 1 | `/chi-siamo` | `0.8` | `monthly` |
| 2+ | `/blog/articolo` | `0.6` e a scendere (`1.0 − 0.2·profondità`, con minimo `0.3`) | `yearly` |

### `og:updated_time` e `<lastmod>` della sitemap

Entrambi sono impostati a `project.lastModified` in `global-settings.json` (formato italiano `GG/MM/AAAA`, convertito in `YYYY-MM-DD`). La si bumpa **a mano** quando i contenuti cambiano davvero: dà al `<lastmod>` un valore accurato e stabile, come richiesto da Google per considerarlo attendibile. Fallback alla data del build se il campo è assente o non valido.

### `og:locale`

`og:locale` in `index.html` usa il formato regionale OpenGraph `lingua_REGIONE` (es. `it` → `it_IT`), derivato dalla `DEFAULT_LANG` via `Intl.Locale().maximize()` — coerente con il formato emesso a runtime da `PageMetaService`.

---

## ⚙️ Server SSR: Sicurezza e Performance

### Health Check JSON

L'endpoint `/health` restituisce JSON strutturato (non una stringa generica):

```json
{ "status": "ok", "mode": "ssr", "a11yPaths": ["/home", "/chi-siamo", "..."] }
```

`a11yPaths` è la lista di tutte le pagine indicizzabili — usato da sistemi di monitoraggio per verificare la salute dell'SSR e pilotare test automatici di accessibilità (Lighthouse, axe-core) su tutte le pagine del sito.

### Status Code SEO-Aware

Il server imposta lo status code HTTP reale in base al path richiesto, confrontandolo con le pagine note di `site.ts`. Senza questo controllo Angular SSR risponderebbe `200` anche per le rotte che renderizzano la pagina 404 del sito (un **soft 404**: i crawler vedono una pagina di errore servita con esito positivo e continuano a indicizzarla).

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

**Default (nessuna variabile impostata):** `localhost`, `127.0.0.1`, `[::1]` — permette lo sviluppo locale senza configurazione aggiuntiva.

> **Nota:** `@angular/ssr` non riconosce `*` come wildcard globale (lo tratterebbe come match letterale, causando `400 Bad Request` per qualsiasi host reale). Per accettare host multipli, elencali esplicitamente separati da virgola in `NG_ALLOWED_HOSTS` (env var che ha precedenza), oppure valorizza `frontend.hostname` in `global-settings.local.json`.

### CSP Nonce Per-Request (Solo Produzione)

In produzione (`node server.mjs`), ogni risposta SSR ottiene un nonce casuale a 16 byte (base64url):
- Rimpiazza `{SCRIPT_NONCE_PLACEHOLDER}` nell'header `Content-Security-Policy`
- Angular inietta `nonce="..."` su tutti gli `<script>` inline generati in SSR
- In development (HMR attivo) viene usato `unsafe-inline` (richiesto da webpack HMR)

### Estendere la CSP (domini esterni: mappe, analytics, CDN)

La Content-Security-Policy non è hardcoded nel server: vive in [`security-headers.json`](../security-headers.json) alla radice — **unica sorgente condivisa** letta sia dal backend .NET sia dal Node SSR (il layer che la invia al browser, `security-headers.ts`). La default è restrittiva: `default-src 'self'`, nessun dominio esterno.

Quando integri un servizio di terze parti (tile di una mappa, analytics, font da CDN) il browser blocca le richieste finché non autorizzi il dominio nella direttiva giusta. Si modifica **direttamente `security-headers.json`** — è l'override eccezionale previsto dalla sua `_nota`:

| Cosa integri | Direttiva da estendere |
| :--- | :--- |
| fetch/XHR/WebSocket (API esterne, tile mappa) | `connect-src` |
| `<script>` da CDN | `script-src` (lascia intatto `{SCRIPT_NONCE_PLACEHOLDER}`) |
| Immagini da host esterni | `img-src` |
| Font da CDN (es. Google Fonts) | `font-src` (+ `style-src` per il CSS del font) |

Esempio — abilitare Mapbox:
```json
"connect-src 'self' https://api.mapbox.com https://events.mapbox.com",
"script-src 'self' {SCRIPT_NONCE_PLACEHOLDER} https://api.mapbox.com"
```

Due avvertenze: **non rimuovere `{SCRIPT_NONCE_PLACEHOLDER}`** da `script-src` (è ciò che l'SSR sostituisce col nonce per-request), e `security-headers.json` è un file del **template** — di norma si aggiorna col merge dall'upstream, e l'estensione della CSP è l'unica modifica di progetto attesa al suo interno.

### Server Fingerprinting Nascosto

`app.disable('x-powered-by')` rimuove l'header `X-Powered-By: Express` dalle risposte per rendere più difficile il fingerprinting del server.

### Trusted Proxy Headers

Il server dichiara una lista esplicita di header proxy fidati, incluso `x-forwarded-scheme` (non-standard, inviato da Nginx Proxy Manager). Senza questa configurazione, Angular SSR — ricevendo qualsiasi `X-Forwarded-*` non dichiarato — degrada silenziosamente a CSR (`index.csr.html`) invece di eseguire il rendering server-side.

### Cache Strategy per Tipo di File Statico

| Tipo di file | `Cache-Control` | Motivo |
| :--- | :--- | :--- |
| Asset con hash nel nome (JS/CSS Angular) | `public, max-age=31536000, immutable` | Il contenuto non cambia mai — l'hash nel nome garantisce unicità |
| `ngsw-worker.js`, `ngsw.json` | `no-store` | Il Service Worker deve scaricare sempre la versione più recente |
| `manifest.webmanifest` | `public, max-age=86400` | Il polling versione avviene ogni 10 min — massimo 1 giorno stale |
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
Usa `path.resolve()` + prefix check con separatore di directory (`path.sep`) — più robusto di un semplice replace di `../`.

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

Su `SIGTERM` / `SIGINT` (docker stop, redeploy, rollout k8s) il server smette di accettare nuove connessioni e lascia terminare quelle in volo prima di uscire (`server.close()`), con un timeout di sicurezza a 10s — nessuna richiesta troncata a metà durante un redeploy.

### Compressione gzip con eccezione SSE

Il middleware `compression` comprime di default tutte le risposte testuali (HTML SSR, JS, CSS, JSON, SVG); le immagini già compresse vengono saltate per Content-Type. La compressione vive a livello applicativo — non solo nel reverse proxy — così è garantita anche se il proxy davanti non ricomprime l'upstream.

C'è un'eccezione che il `filter` di `compression` gestisce esplicitamente: gli stream **`text/event-stream`** (il proxy verso `/api/notifications/stream` del campanellino) **non vanno compressi**. gzip bufferizza per accumulare dati prima di emettere, quindi i piccoli frame SSE non arriverebbero mai al browser in tempo reale — e il client manda comunque `Accept-Encoding: gzip`, quindi senza questa esclusione il campanellino resterebbe muto. Il filtro lascia non compresso solo l'`event-stream`; il resto usa il filtro di default. A complemento, il backend marca lo stream con `Cache-Control: no-transform` per impedire ricompressioni intermedie.

> **Testare l'SSE.** Va verificato in un **browser vero** o con `curl --compressed` (che dichiara `Accept-Encoding: gzip` come il browser). Un `curl` liscio non chiede gzip e quindi non riprodurrebbe il bug della bufferizzazione — passerebbe anche con la compressione attiva, dando un falso "funziona".

### Cache Immagini su Disco (`IMAGE_CACHE_DIR`, `IMAGE_CACHE_MAX_MB`)

I thumbnail generati da `/cdn-cgi/asset` e `/cdn-cgi/preview` vengono scritti su disco per evitare di ricalcolarli a ogni richiesta. Sono dato derivato ed effimero: serviti **solo** dagli handler Node (l'accesso diretto a `/assets/files` è 404), mai come file statico, quindi non vivono sotto `src/assets` né nel build output.

```bash
IMAGE_CACHE_DIR=/var/cache/app-images   # default: <temp di sistema>/br1-image-cache-<hash>
IMAGE_CACHE_MAX_MB=500                   # default: 500 MB — oltre questa soglia elimina i file meno usati
```

**Posizione (`IMAGE_CACHE_DIR`).** Senza override la cache vive in una cartella dedicata nella temp di sistema, isolata per progetto tramite un hash del percorso asset (così più siti — questo template e i suoi figli — sullo stesso host non si mischiano le immagini). Tenerla fuori da `src/assets` è ciò che evita che `ng serve` ricarichi la pagina a ogni miniatura generata in sviluppo, e che thumbnail effimeri finiscano copiati in `dist` al build. In produzione la temp è scrivibile anche col container non-root, ma è effimera: dopo un riavvio la cache parte fredda e si rigenera on-demand. **Per una cache calda tra i deploy**, monta un volume persistente e punta `IMAGE_CACHE_DIR` lì.

**Sweep (`IMAGE_CACHE_MAX_MB`).** Lo sweep LRU avviene ogni 6 ore e porta la cache al 90% del cap (non al 100%) per evitare di ri-sweepare a ogni singolo thumbnail aggiunto. L'`mtime` di ogni file viene aggiornato a ogni hit, così i thumbnail realmente richiesti sopravvivono e vengono scartati solo quelli inutilizzati.

---

## Quick Start
```bash
npm install
npm run start
```
Il proxy si collegherà in automatico al backend .NET in esecuzione sulla porta di default.

> Il proxy del dev server è configurato da `proxy.local.conf.cjs` (sviluppo locale, backend su `localhost:5000`) o `proxy.docker.conf.cjs` (dev in Docker, backend sul container). Entrambi leggono la `x-api-key` dalla sorgente unica `global-settings(.local).json` tramite il modulo condiviso `proxy.api-key.cjs`.
