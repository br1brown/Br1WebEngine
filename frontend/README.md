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
Nella cartella `pages/nuova-pagina/` crea il tuo componente. Assicurati che estenda `PageBaseComponent` per ereditare i superpoteri dell'Engine.
```typescript
@Component({
  standalone: true,
  templateUrl: './nuova-pagina.component.html'
})
export default class NuovaPaginaComponent extends PageBaseComponent {
    // Hai già a disposizione this.api_get(), this.translate(), ecc.
}
```

### Passo 4: Navigare in Sicurezza
Per mettere un bottone che porta alla tua pagina, non usare `href="/nuova-pagina"`. Fai in modo che il framework calcoli la rotta esatta (e mantenga il link vivo anche se domani cambi l'URL in `site.ts`).
```html
<!-- Cliccando calcolerà l'URL corretto a runtime -->
<button (click)="navigateTo(PageType.MioNuovoComponente)">Vai!</button>
```

---

## Quick Start
```bash
npm install
npm run start
```
Il proxy si collegherà in automatico al backend .NET in esecuzione sulla porta di default.
