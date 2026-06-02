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
Per navigare alla tua pagina, non usare mai `href="/nuova-pagina"` hardcoded. Fai in modo che il framework calcoli la rotta esatta (e mantenga il link vivo anche se domani cambi l'URL in `site.ts`).

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

## 🔒 Consenso Cookie e Privacy (GDPR/ePrivacy)

`CookieConsentService` implementa una strategia "Privacy by Default": nessun cookie viene scritto finché l'utente non esprime consenso esplicito per quella categoria.

### Tre Categorie di Consenso

| Categoria | Cosa include |
| :--- | :--- |
| **Technical** | Preferenza lingua, Service Worker, cookie essenziali di funzionamento |
| **Analytics** | Tracciamento e analytics (Google Analytics, ecc.) |
| **Profiling** | Pubblicità comportamentale e profilazione |

### Aggiungere un Nuovo Cookie

Registra il cookie nel `COOKIE_MAP` (in `src/app/core/services/cookie-registry.ts`), specifica la categoria e il banner mostrerà automaticamente il toggle corrispondente:

```typescript
export const COOKIE_MAP = {
    'mioTracker': {
        category: CookieCategory.Analytics,
        displayName: 'My Tracker',
        description: 'Usato per il tracciamento anonimo...'
    }
} as const;
```

Nel componente:
```typescript
this.consent.setCookie('mioTracker', 'valore', 60 * 60 * 24); // 1 giorno
```

Il cookie viene scritto solo se la categoria corrispondente è stata accettata.

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

---

## 🎨 Tema e Sistema di Colori (OKLCH + WCAG)

Il sito ha un sistema di tema che genera 75+ variabili CSS partendo da un **solo colore brand** dichiarato in `site.ts`.

### Un Colore, Palette Completa

```typescript
// site.ts
setSiteConfiguration({
    colorTema: '#1f40ff',  // Un solo colore — l'engine genera tutto il resto
    // ...
});
```

Da questo colore vengono generati automaticamente:
- Varianti brand: primario, secondario (muted), testo leggibile
- Surface colors: sfondo pagina, card, hover states (light e dark)
- Semantic colors: link, borders, emphasis text, subtle backgrounds
- Navbar colors: adattiva al brand (full immersive se scuro, pastello se chiaro)

### Garanzia WCAG 4.5:1

Tutti i colori di testo su sfondo sono calcolati per garantire contrasto WCAG AA:
- `findCompliantColor()` regola la luminanza L in OKLCH finché non raggiunge 4.5:1
- Funziona sia in light che dark mode
- Risultato: accessibilità garantita senza lavoro manuale

### Dark Mode Automatico

Reattivo a `prefers-color-scheme`: se l'utente cambia tema OS, il sito si adatta in tempo reale senza reload:
```typescript
readonly themeTone: Signal<'light' | 'dark'>; // Reattivo a prefers-color-scheme
readonly prefersReducedMotion: Signal<boolean>; // Per animazioni accessibili
```

### Metodi Statici (SSR-Safe)

`ThemeService` espone metodi statici puri usabili in Node.js/SSR senza Angular:
```typescript
const [L, C, H] = ThemeService.hexToOklch('#1f40ff');
const textColor = ThemeService.findCompliantColor(C, H, bgHex, 4.5, startL, stepDir);
const hex = ThemeService.oklchToHex(L, C, H);
```

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

---

## 🌍 Internazionalizzazione (i18n)

Le traduzioni vivono in `public/assets/i18n/` in due cataloghi per lingua:

| File | Ruolo |
| :--- | :--- |
| `basic.{lang}.json` | Stringhe dell'Engine: traduzioni per le pagine di errore HTTP (`errore400Titolo`/`Descrizione` … fino al 504), azioni comuni (`clipboardCopied`, `clipboardError`, `shareError`, ecc.) e messaggi di login. **Non aggiungere qui chiavi di dominio** — quelle vanno in `addon.{lang}.json`. Aggiungere invece qui quando si modifica l'Engine stesso o si introduce una nuova notifica/comportamento globale; in quel caso la chiave va aggiunta in *tutti* i file `basic.*.json` — `i18n-check.sh` lo verifica in CI. |
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

### Normalizzazione BCP-47

L'engine normalizza internamente i tag lingua per coerenza:
```typescript
// "it-IT" e "it" sono equivalenti — entrambi caricano basic.it.json
TranslateService.normalizeBcp47('it-IT')  // → 'it'
TranslateService.normalizeBcp47('en-US')  // → 'en'
```

### Pipe `translate` — Impura by Design

La `TranslatePipe` è dichiarata `pure: false` perché le traduzioni cambiano al cambio lingua, e una pipe pura non rileva il cambiamento di stato esterno. Angular la ri-esegue ad ogni ciclo di change detection. Se serve ottimizzare per template ad alta frequenza, usa `computed()`:

```typescript
readonly trad = computed(() => this.translate.translate('chiave'));
```

### Pipe `markdown`

Converte Markdown a HTML nel template, con sanitizzazione XSS automatica:
```html
<div [innerHTML]="testo | markdown"></div>
```

Usata internamente da `PolicyComponent` per le pagine legali. Disponibile in qualsiasi componente per contenuto rich text.

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

### Errori Silenziosi per UI Custom

In componenti con UI d'errore propria (es. form di login), passa `{ silent: true }` per impedire la notifica automatica:

```typescript
// LoginFormComponent: gestisce l'errore internamente
await this.api.login(req, { silent: true })
    .catch(err => {
        this.errorMsg.set(err.problem?.detail ?? this.translate.translate('erroreImprevisto'));
    });
```

Senza `silent: true`, `BaseApiService` chiamerebbe `NotificationService.handleApiError()` automaticamente.

### `httpResource` per Componenti Sempre-On

Usa `getProfileResource()` nei componenti che restano attivi durante tutta la navigazione (navbar, footer):
```typescript
readonly profile = this.api.getProfileResource();
// profile.value() → Profile | undefined
// profile.isLoading() → boolean
```
Si aggiorna automaticamente al cambio lingua (tramite segnale `Accept-Language`).

---

## 📤 ShareService: Copia, Condivisione, Download

`ShareService` centralizza tutte le operazioni di condivisione e download.

```typescript
// Copia negli appunti
const ok = await this.share.copyText('testo');
// → mostra toast "Copiato negli appunti"

// Condivisione nativa (Web Share API) con fallback a copy
await this.share.shareText('Titolo', 'Testo da condividere');

// Download canvas come PNG
await this.share.downloadCanvas(myCanvas, 'screenshot.png');

// Download blob generico
this.share.downloadBlob(blob, 'documento.pdf');
```

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

### JSON-LD Strutturato

Schema.org viene injected automaticamente per ogni pagina. Migliora l'apparenza in Google Search e altri motori. Il tipo (`Article`, `WebPage`, `Organization`, ecc.) si imposta tramite `structuredDataType` nella config della pagina in `site.ts`.

---

## 🔄 Controllo Versione e Aggiornamenti (VersionCheckService)

L'app controlla automaticamente se è disponibile una nuova versione e notifica l'utente.

### Fonti di Versione

La versione è dichiarata in `site.ts` e distribuita in tre posti tramite `generate-statics.ts` al build:
1. Meta tag `app-version` — baseline in memoria
2. `manifest.webmanifest` — usato dal polling ogni 10 minuti
3. Hash NGSW — usato da SwUpdate nelle PWA installate

### Meccanica

**Browser normale:** polling ogni 10 minuti su `/manifest.webmanifest` → se version cambia → dialog "Nuova versione disponibile" → hard reload attiva la nuova versione.

**PWA installata:** SwUpdate intercetta il manifest (Service Worker) → emette `VERSION_READY` quando la nuova versione è scaricata → l'utente conferma → `activateUpdate()` + reload.

**Prerequisito:** il controllo versione è **disabilitato finché `isTechnicalConsentGiven()` è false**. Una volta accettato il consenso tecnico, il servizio si attiva al reload successivo.

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

### Router: Component Input Binding e Scroll

Il router è configurato con `withComponentInputBinding()`: i parametri di rotta si leggono direttamente come `@Input()` nel componente, senza iniettare `ActivatedRoute`:

```typescript
@Component({ ... })
export class ArticleComponent {
    readonly id = input<string>();       // Letto da route params
    readonly tab = input<string>('info'); // Valore di default
}
```

`withInMemoryScrolling()` gestisce la posizione di scroll: il ritorno alla pagina precedente ripristina la posizione; i link con `#section` scrollano all'ancora.

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
| Fallback | Se il `PageType` non è registrato in `site.ts`, naviga verso `/` |
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

---

## 🏗️ Script di Build: `generate-statics.ts`

Lo script sincronizza tutti i file statici con la configurazione centrale in `site.ts`. **Va eseguito ogni volta che si modifica `site.ts`** (appName, description, colorTema, version, struttura pagine).

```bash
npm run generate:statics
```

### File Aggiornati

| File | Contenuto sincronizzato |
| :--- | :--- |
| `src/index.html` | `<html lang>`, `<title>`, tutti i meta OpenGraph/Twitter, favicon |
| `public/manifest.webmanifest` | `name`, `description`, `theme_color`, `background_color`, `lang`, `version` |
| `public/sitemap.xml` | URL di tutte le pagine indicizzabili con `priority` e `changefreq` automatici |
| `public/robots.txt` | `Disallow` per le pagine `requiresAuth: true`, URL sitemap |
| `src/environments/environment.ts` | `defaultLang`, `availableLanguages` — **file generato automaticamente, non modificare manualmente** |

### Variabili d'Ambiente

| Variabile | Descrizione | Fallback |
| :--- | :--- | :--- |
| `FRONTEND_BASE_URL` | URL canonico del sito (es. `https://tuodominio.it`) | `https://example.com` con warning |
| `DEFAULT_LANG` | Lingua di default — usata nelle immagini Docker | Da `global-settings.json` |
| `SUPPORTED_LANGS` | Lingue separate da virgola — usata nelle immagini Docker | Da `global-settings.json` |

Su host/CI lo script legge direttamente `global-settings.json`. Nelle immagini Docker (dove il file non è nel build context) `deploy.sh` estrae le variabili dal file e le passa come `--build-arg`.

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
| 2+ | `/blog/articolo` | `0.6` e sotto | `yearly` |

### `og:updated_time`

Impostato alla data dell'ultimo commit git (formato `YYYY-MM-DD`, granularità giornaliera per evitare diff a ogni commit nello stesso giorno). Fallback alla data odierna se git non è disponibile (build da tarball).

---

## ⚙️ Server SSR: Sicurezza e Performance

### Health Check JSON

L'endpoint `/health` restituisce JSON strutturato (non una stringa generica):

```json
{ "status": "ok", "mode": "ssr", "a11yPaths": ["/home", "/chi-siamo", "..."] }
```

`a11yPaths` è la lista di tutte le pagine indicizzabili — usato da sistemi di monitoraggio per verificare la salute dell'SSR e pilotare test automatici di accessibilità (Lighthouse, axe-core) su tutte le pagine del sito.

### Host Allowlist (HTTP 421)

Le richieste da host non autorizzati vengono rifiutate con `HTTP 421 Misdirected Request` prima di raggiungere il proxy API o l'SSR. Il controllo avviene tramite `request.hostname` dopo `app.set('trust proxy', ...)`.

```bash
ALLOWED_HOSTS=tuodominio.it,www.tuodominio.it
# Wildcard — accetta qualsiasi host (coerente con AllowAnyOrigin del backend):
ALLOWED_HOSTS=*
```

### CSP Nonce Per-Request (Solo Produzione)

In produzione (`node server.mjs`), ogni risposta SSR ottiene un nonce casuale a 16 byte (base64url):
- Rimpiazza `{SCRIPT_NONCE_PLACEHOLDER}` nell'header `Content-Security-Policy`
- Angular inietta `nonce="..."` su tutti gli `<script>` inline generati in SSR
- In development (HMR attivo) viene usato `unsafe-inline` (richiesto da webpack HMR)

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

---

## Quick Start
```bash
npm install
npm run start
```
Il proxy si collegherà in automatico al backend .NET in esecuzione sulla porta di default.
