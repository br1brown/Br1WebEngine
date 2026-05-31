# Br1WebEngine - Frontend (Angular 19)

Benvenuto nel frontend di Br1WebEngine. Questo non è un semplice progetto Angular, è un ecosistema dichiarativo ottimizzato per Server-Side Rendering (SSR) e Developer Experience (DX).

La complessità tipica (routing frammentato, meta tag SEO sparsi, lazy loading) è stata centralizzata in un singolo **Domain Specific Language (DSL)**.

---

## 🚀 Le "Killer Feature" (Cosa l'Engine ti Fornisce)

### 1. `site.ts`: Il Cuore Pulsante (DSL)
**Perché è così?** In Angular "Vanilla" aggiungere una pagina richiede di toccare il file di routing, i componenti menu per i link e logiche SEO ripetitive.
**Cosa fa l'Engine:** In `src/app/site.ts` dichiari un oggetto JSON. L'Engine crea a runtime le rotte, nasconde/mostra la navbar in base a `layout.showNav`, e se la pagina ha `requiresAuth: true`, l'SSR viene spento forzando il client-side rendering.

### 2. Auto-SEO Dinamica
Aggiungi `description` o `ogImage` nel tuo oggetto pagina dentro `site.ts`. Un Resolver intercetta la navigazione e inietta prima del rendering i corretti tag Head, OpenGraph e i dati strutturati.

### 3. Signals Nativo
Gestione stato locale e globale tramite l'API nativa `Signals` di Angular 19. Niente NgRx, niente boilerplate eccessivo.

### 4. Gestione Trasparente Privacy e Accessibilità
L'Engine si occupa di iniettare meccanismi standard di base per l'Accessibilità (WCAG) e un banner cookie integrato che si allinea alla navigazione. Meno codice per te, più compliance.

### 5. Policy Pages Integrate
Le pagine legali (Privacy, Cookie, Termini, Note Legali) sono già cablate nel DSL. I testi vivono in `public/assets/legal/` come file Markdown localizzati (es. `privacy.it.md`). Il `ContentResolver` li carica via filesystem in SSR e via HTTP fetch nel browser. Il `PolicyComponent` interpola automaticamente i placeholder come `{{ragioneSociale}}` o `{{partitaIva}}` usando i dati del profilo aziendale restituiti dal backend.

---

## 📜 Le Regole del Gioco (Cosa l'Engine ti Impone)

### 1. Identità Incorruttibile: L'Enum `PageType`
Non navigherai **mai** usando stringhe dirette (`router.navigate(['/home'])`). Aggiungi un identificatore all'enum `PageType` in `site.ts`. Tutte le voci di menu e i pulsanti punteranno a quell'ID. Se domani rinomini l'URL, nessun link si romperà.
```typescript
export enum PageType { Home, AboutUs }
```

### 2. Componenti Pagina vs Componenti UI
- **`pages/`**: Sono le schermate. Ereditano da `PageBaseComponent` per ottenere l'accesso rapido ad API, logger e traduttore senza iniezioni ridondanti.
- **`components/`**: Pezzetti di UI isolati. Ricevono dati tramite `@Input()`.

### 3. Niente Manipolazioni dirette del DOM (Salva l'Idratazione)
Usa esclusivamente binding dichiarativi (`[class.hidden]="!isVisible()"`) e Template Refs. Usare `document.getElementById` romperà l'SSR lato server.

### 4. CSS: Bootstrap First, Custom Solo Se Necessario
Il progetto usa **Bootstrap 5** come sistema di design principale. Non scrivere CSS custom per cose che Bootstrap già copre.

**Cosa va nel template HTML (classi Bootstrap):**
- Layout e spacing (`d-flex`, `align-items-center`, `mb-3`, `gap-2`, `p-4`)
- Tipografia (`fw-bold`, `text-muted`, `small`, `h4`, `lead`)
- Form (`form-control`, `form-label`, `is-invalid`, `invalid-feedback`)
- Componenti (`card`, `alert`, `btn`, `spinner-border`, `badge`, `list-group`)
- Responsive (`col-md-6`, `d-none d-lg-block`)

**Cosa va nel file `.css` del componente (solo ciò che Bootstrap non può esprimere):**
- Posizionamento fisso con `safe-area-inset` (cookie banner, back-to-top)
- Animazioni CSS (`@keyframes`, transizioni custom)
- Effetti visivi avanzati (glassmorphism con `backdrop-filter`, gradienti complessi)
- Override di tema via `color-mix()` e custom properties (`--color*`)
- Layout a griglia complesso (`grid-template-rows: 0fr → 1fr` per accordion)

**Componenti senza CSS:** Se un componente non ha bisogno di nulla di quanto sopra, *non creare il file `.css`*. Il footer, ad esempio, non ne ha uno — è 100% classi Bootstrap nel template.

---

## 🛠️ Developer Journey: Aggiungere una Pagina

Vuoi creare una nuova schermata nel tuo sito? Segui esattamente questo workflow per non rompere l'integrità del routing.

### Passo 1: Registrare l'identità (PageType)
Apri `src/app/site.ts` e aggiungi il tuo nuovo tipo all'enum centrale. Questo garantisce che la pagina sia referenziabile globalmente.
```typescript
export enum PageType {
    Home = 0,
    Contatti = 1,
    MioNuovoComponente = 2 // <-- Aggiunto
}
```

### Passo 2: Dichiarare la Rotta (defineSitePages)
Sempre in `site.ts`, vai nell'oggetto `siteConfig.pages` e istruisci l'Engine su come generare la pagina. Specifica il path, eventuali guardie di sicurezza e l'Auto-SEO.
```typescript
{
    path: 'nuova-pagina',
    pageType: PageType.MioNuovoComponente,
    title: 'Nuova Pagina', // Verrà localizzato automaticamente
    description: 'La mia descrizione SEO',
    requiresAuth: false,
    component: () => import('./pages/nuova-pagina/nuova-pagina.component')
}
```

### Passo 3: Creare il Componente
Nella cartella `pages/nuova-pagina/` crea il tuo componente. Assicurati che estenda `PageBaseComponent<T>` (dove `T` è il tipo del contenuto della pagina) per ereditare i superpoteri dell'Engine.
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

Se il componente deve essere accessibile solo agli utenti autenticati, aggiungi `requiresAuth: true` nella dichiarazione in `site.ts`. L'Engine fa tutto il resto: disattiva SSR per quella pagina, aggiunge l'auth guard e reindirizza gli utenti non loggati alla `pageForAuthGuard`.

```typescript
{
    path: 'area-riservata',
    pageType: PageType.AreaRiservata,
    title: 'Area Riservata',
    requiresAuth: true, // <-- sufficiente per proteggere la pagina
    component: () => import('./pages/area-riservata/area-riservata.component')
}
```

Nel componente puoi leggere i dati di sessione tramite `AuthService`:
```typescript
export default class AreaRiservataComponent extends PageBaseComponent {
    private readonly auth = inject(AuthService);

    readonly nomeUtente = computed(() => this.auth.session()?.displayName ?? '');
}
```

### Passo 4: Navigare in Sicurezza
Per mettere un bottone che porta alla tua pagina, non usare `href="/nuova-pagina"`. Fai in modo che il framework calcoli la rotta esatta (e mantenga il link vivo anche se domani cambi l'URL in `site.ts`).
```html
<!-- Cliccando calcolerà l'URL corretto a runtime -->
<button (click)="navigateTo(PageType.MioNuovoComponente)">Vai!</button>
```

---

## 🔐 Sistema di Autenticazione (JWT)

Il sistema di login è **opzionale** e si attiva configurando `Security.Token.SecretKey` nel backend. Sul frontend, si attiva impostando due proprietà in `setSiteConfiguration()` dentro `site.ts`:

```typescript
setSiteConfiguration({
    showLoginInHeader: true,          // mostra il link Login/pulsante Logout nella navbar
    pageForAuthGuard: PageType.Login, // pagina di login (dove redirigere utenti non autenticati)
})
```

### Proteggere una Pagina

In `defineSitePages()`, imposta `requiresAuth: true` sulla pagina da proteggere. L'Engine aggiunge automaticamente `renderMode: 'client'` (disabilita SSR per quella pagina) e attiva l'auth guard.

```typescript
{
    path: 'area-riservata',
    pageType: PageType.AreaRiservata,
    requiresAuth: true,
    component: () => import('./pages/area-riservata/area-riservata.component')
}
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

### Componenti Pronti all'Uso

| Componente | Selector | Ruolo |
| :--- | :--- | :--- |
| `LoginFormComponent` | `app-login-form` | Form username/password riusabile; emette `(loggedIn)` al successo. Non naviga da solo. |
| `UserNavComponent` | `user-nav` | Area Login/Logout nella navbar. Appare solo se `showLoginInHeader: true`. Gestisce il logout con modale di conferma. |

### Ciclo di Vita del Token

Il token è persistito in `sessionStorage` (sopravvive all'F5, si azzera alla chiusura della scheda). `TokenService` (engine, intoccabile) avvia un timer automatico che esegue il logout allo scadere dell'`exp` del JWT.

---

## 🔔 NotificationService: Feedback all'Utente

`NotificationService` (iniettato come `this.notify` in ogni `PageBaseComponent`) gestisce tutti i popup e toast via SweetAlert2, già stilato con il tema Bootstrap del template.

| Metodo | Quando usarlo |
| :--- | :--- |
| `toast(msg, icon?)` | Notifica rapida in alto a destra (3 s, non bloccante). `icon`: `'success'` \| `'error'` \| `'info'` \| `'warning'` |
| `success(msg, onClose?)` | Popup di conferma operazione riuscita |
| `error(title, msg)` | Popup di errore con titolo esplicito |
| `confirm(title, text, opts?)` | Modale Sì/No → restituisce `Promise<boolean>` |
| `prompt(title, label, ...)` | Modale con input testuale → restituisce `Promise<string \| null>` |
| `interact<T>(config)` | Modale con HTML custom, validazione e mappatura del risultato |
| `openLoading(msg?)` / `closeLoading()` | Spinner bloccante (es. durante upload) |
| `validationErrors(title, errors)` | Popup con lista di errori di validazione |
| `handleApiError(status, problem, ...)` | Legge il `ProblemDetails` del backend e mostra il messaggio corretto; fallback automatico a i18n per i codici HTTP standard |

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

// Gestione errore API (legge ProblemDetails RFC 9457)
try { ... } catch (err) {
    this.notify.handleApiError(err.status, err.problem);
}
```

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

I Blob URL vengono revocati automaticamente a ogni cambio pagina, quindi non perdono memoria.

---

## 🌍 Internazionalizzazione (i18n)

Le traduzioni vivono in `public/assets/i18n/` in due cataloghi per lingua:

| File | Ruolo |
| :--- | :--- |
| `basic.{lang}.json` | Stringhe dell'Engine (messaggi di errore, azioni comuni, stati) — non toccare |
| `addon.{lang}.json` | Stringhe del **tuo progetto** — aggiungi qui le tue chiavi |

**Aggiungere una lingua:**
1. In `global-settings.json`: `"Localization.SupportedLanguages": ["it", "en", "fr"]`
2. Creare `basic.fr.json` e `addon.fr.json` in `public/assets/i18n/`
3. `i18n-check.sh` in CI verifica che nessuna chiave sia mancante

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

---

## 🌐 ApiService: Chiamare il Backend

`ApiService` (iniettato come `this.api` in ogni `PageBaseComponent`) espone questi metodi:

| Metodo | Tipo di ritorno | Quando usarlo |
| :--- | :--- | :--- |
| `getProfile()` | `Promise<Profile>` | Caricamento una-tantum del profilo aziendale |
| `getProfileResource()` | `httpResource<Profile>` | Profilo reattivo (si aggiorna col Signal) |
| `getSocial(nomi?)` | `Promise<Record<string, string>>` | URL social network, filtrabile per nome |
| `getBlob(slug)` | `Promise<Blob>` | File binari (immagini, PDF) caricati via uploads |
| `login(req)` | `Promise<LoginResult>` | Autenticazione utente (solo se JWT abilitato) |

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

---

## ⚙️ Opzioni Avanzate di `site.ts`

Oltre a `path`, `title` e `description`, ogni pagina in `defineSitePages()` accetta:

```typescript
{
    // Forza il rendering client-side (es. per pagine protette da login)
    renderMode: 'client',  // default: 'server'

    // Nasconde parti della shell per questa pagina
    layout: {
        showNav: false,     // nasconde la navbar
        showFooter: false,  // nasconde il footer
        showPanel: false,   // nasconde il pannello laterale
    },

    // Meta tag OpenGraph aggiuntivi
    otherSEO: {
        ogImage: '/assets/og-cover.png',
        ogType: 'article',
        structuredDataType: 'WebPage',
    },
}
```

La configurazione globale del sito (`setSiteConfiguration`) accetta anche `smoke` per l'effetto particellare e le opzioni di autenticazione:
```typescript
smoke: {
    enable: true,
    color: '#ffffff',
    opacity: 0.4,
    maximumVelocity: 1.5,
    particleRadius: 3,
    density: 40,
},

// Autenticazione JWT (opzionale — solo se il backend ha SecretKey configurata)
showLoginInHeader: true,           // mostra link Login / pulsante Logout nella navbar
pageForAuthGuard: PageType.Login,  // pagina verso cui redirigere utenti non autenticati
```

---

## Quick Start
```bash
npm install
npm run start
```
Il proxy si collegherà in automatico al backend .NET in esecuzione sulla porta di default.
