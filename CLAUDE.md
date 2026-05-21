# Br1WebEngine — Linee guida di sviluppo

## Stack

| Layer | Tecnologia |
|---|---|
| Framework | Angular 19, standalone components |
| CSS | CSS custom properties + Bootstrap 5.3.3 |
| Icone | FontAwesome 6 |
| Notifiche/dialog | SweetAlert2 11 |
| SSR | Angular SSR 19 |
| Backend | .NET 9 |
| Build | Angular CLI 19, `npx ng build` |

---

## Creare una pagina

Ogni pagina ha un tipo logico definito in `site.ts`, estende `PageBaseComponent<T>` e riceve i propri dati tramite il resolver centralizzato.

### 1. Registrare il tipo in site.ts

Aggiungere la voce a `PageType`:

```typescript
export enum PageType {
    Home     = 'home',
    Social   = 'social',
    Articoli = 'articoli',   // ← nuovo
}
```

### 2. Creare il componente

Il componente estende `PageBaseComponent<T>` dove `T` è il tipo del contenuto caricato dal resolver:

```typescript
@Component({
    selector: 'app-articoli',
    standalone: true,
    imports: [TranslatePipe],
    templateUrl: './articoli.component.html',
})
export class ArticoliComponent extends PageBaseComponent<Articolo[]> {}
```

`PageBaseComponent` inietta automaticamente i servizi comuni e li espone ai componenti figlio:

| Proprietà | Tipo | Uso |
|---|---|---|
| `pageContent()` | `Signal<T \| null>` | Dati caricati dal resolver, `null` se errore o non disponibile |
| `api` | `ApiService` | Client HTTP verso il backend |
| `asset` | `AssetService` | Risoluzione URL asset |
| `notify` | `NotificationService` | Dialog, toast, loading |
| `translate` | `TranslateService` | Traduzioni e lingua corrente |

### 3. Usare i dati nel template

`pageContent()` è un signal reattivo: si aggiorna automaticamente al cambio lingua e alla navigazione.

```html
@if (pageContent(); as articoli) {
    @for (a of articoli; track a.id) {
        <article>{{ a.titolo }}</article>
    }
} @else {
    <app-loading [loading]="true" />
}
```

### 4. Aggiungere un endpoint API

In `api.service.ts`, registrare il path nella costante `API` e aggiungere il metodo pubblico:

```typescript
const API = {
    articoli: 'articoli',   // ← aggiungere qui
} as const;

getArticoli(): Promise<Articolo[]> {
    return this.api_get<Articolo[]>(API.articoli);
}
```

Scegliere il wrapper in base al caso d'uso:

| Wrapper | Quando usarlo |
|---|---|
| `this.api_get<T>()` | Lettura una-tantum → restituisce `Promise<T>` |
| `this.api_post<T>()` | Mutazione o invio dati |
| `this.api_resource<T>()` | Componente persistente che deve aggiornarsi al cambio di signal (es. lingua nel footer) |

`BaseApiService.handleError()` gestisce automaticamente la notifica all'utente via Swal e ri-lancia l'errore. Il componente che chiama l'API deve gestire solo lo **stato** nel catch.

Per le chiamate API aggiuntive all'interno di un componente (fuori dal resolver), usare il facilitatore `loadData()` ereditato da `PageBaseComponent`:

```typescript
async caricaExtra(): Promise<void> {
    this.extra = await this.loadData(() => this.api.getArticoli());
}
```

`loadData()` restituisce `null` in caso di errore — la notifica è già stata mostrata da `BaseApiService`.

### 5. Caricare i dati nel resolver

In `content.resolver.ts`, aggiungere un case nello switch di `loadResolved()`:

```typescript
case PageType.Articoli:
    content = await this.apiService.getArticoli();
    break;
```

Il `try-catch` esterno è già presente: se l'API fallisce, la navigazione si completa con `content = null` invece di cancellarsi. Non occorre gestire l'errore nel singolo case.

---

## Componenti condivisi disponibili

Verificare sempre che il componente cercato non esista già in `shared/` prima di crearne uno nuovo.

### Componenti

| Componente | Uso | File |
|---|---|---|
| `<app-loading>` | Spinner accessibile (`role="status"`, `aria-live`, testo visually-hidden) | `shared/components/loading/` |
| `<app-nav-link>` | Link con `aria-current`, gestione external/internal/active | `shared/components/nav-link/` |
| `<app-nav-dropdown>` | Disclosure `<details>`/`<summary>` con keyboard nav | `shared/components/nav-dropdown/` |
| `<app-context-menu>` | Context menu con focus trap, keyboard nav (↑↓ Home End) e focus restore | `shared/components/context-menu/` |
| `<app-cookie-banner>` | Banner cookie con `role="alert"` e gestione consenso | `shared/components/cookie-banner/` |
| `<app-back-to-top>` | FAB "torna su" accessibile con `aria-label` tradotto | `shared/components/back-to-top/` |
| `<app-social-link>` | Link social con `aria-label` adattivo (WCAG 2.5.3-safe) | `shared/components/social-link/` |
| `<app-footer-nav>` | Griglia link footer da `ContestoSito.linkFooter` con `<nav aria-label>` | `shared/components/footer-nav/` |
| `<app-profile-render>` | Render dati profilo (contatti + dati societari) in sezioni | `shared/components/profile-render/` |

### Direttive

| Direttiva | Selettore | Uso | File |
|---|---|---|---|
| FocusTrapDirective | `appFocusTrap` | Imprigiona il focus Tab/Shift+Tab — usare su dialog/drawer | `shared/directives/focus-trap.directive.ts` |
| ContextMenuDirective | `appContextMenu` | Aggiunge context menu a qualsiasi elemento | `shared/directives/context-menu.directive.ts` |
| AssetDirective | `appAsset` / `appAssetHref` | Risolve URL asset da id tramite `AssetService` | `shared/directives/asset.directive.ts` |
| PageDirective | `appPage` | `RouterLink` da `PageType` con `href` reale per SSR | `shared/directives/page.directive.ts` |
| ImgRenderDirective | `img[imgRender]` | Genera canvas → PNG → `src` su `<img>`; l'`alt` va sull'`<img>` | `shared/directives/img-render.directive.ts` |
| QrRenderDirective | `img[qrContent]` | Genera QR code → `src` su `<img>`; l'`alt` va sull'`<img>` | `shared/directives/qr-render.directive.ts` |

### Pipe

| Pipe | Uso | File |
|---|---|---|
| `translate` | Traduce una chiave i18n con argomenti posizionali opzionali | `shared/pipes/translate.pipe.ts` |
| `markdown` | Converte Markdown → HTML sicuro | `shared/pipes/markdown.pipe.ts` |

---

## Accessibilità — Best Practice

L'accessibilità è una proprietà nativa del sistema, non un'attività correttiva. WCAG 2.1 AA è il livello minimo per ogni componente nuovo o modificato.

### Checklist prima di considerare un componente completo

- [ ] Semantic HTML corretto: `<button>` per azioni, `<a>` per navigazione, gerarchia heading rispettata
- [ ] Tutti i `<label>` associati al controllo via `for`/`id` o nesting
- [ ] Tutti i `<img>` hanno `alt` (descrittivo se informativo, `""` se puramente decorativo)
- [ ] Icone decorative hanno `aria-hidden="true"`
- [ ] Elementi interattivi raggiungibili e attivabili da tastiera, focus visibile
- [ ] `aria-label` usato solo quando non c'è testo visibile — il testo visibile è già il nome accessibile
- [ ] Ogni testo `aria-label` passa per `| translate` — nessuna stringa hardcoded
- [ ] Link esterni: `rel="noopener noreferrer"` + avviso screen reader visually-hidden
- [ ] Overlay e modal: `appFocusTrap` attivo + focus ripristinato all'elemento trigger alla chiusura
- [ ] Contrasto testo normale ≥ 4.5:1, testo grande ≥ 3:1

### aria-label — binding, non interpolazione

Usare sempre `[attr.aria-label]` (property binding). Il binding accetta `null` per rimuovere l'attributo quando c'è già testo visibile, evitando la ridondanza vietata da WCAG 2.5.3.

```html
<!-- Elemento solo-icona: aria-label necessario -->
<button [attr.aria-label]="'backToTopLabel' | translate">
    <i class="fas fa-chevron-up" aria-hidden="true"></i>
</button>

<!-- Testo visibile presente: aria-label non va aggiunto -->
<button>
    <i class="fas fa-save" aria-hidden="true"></i>
    {{ 'save' | translate }}
</button>
```

### Link esterni

```html
<a href="..." target="_blank" rel="noopener noreferrer">
    {{ label }}
    <span class="visually-hidden"> ({{ 'opensInNewTab' | translate }})</span>
</a>
```

### Form — label associate

```html
<label for="email" class="form-label">{{ 'mail' | translate }}</label>
<input id="email" type="email" class="form-control">
```

### Overlay e dialog

```html
<div role="dialog"
     aria-modal="true"
     [attr.aria-label]="'dialogTitle' | translate"
     appFocusTrap>
    <!-- contenuto -->
</div>
```

### Design token — colori e focus sempre da variabile

```css
background: var(--colorSurface);
color:       var(--colorSurfaceText);
border:      1px solid var(--colorSurfaceBorder);
outline:     var(--focusRingWidth) solid var(--focusRingColor);
```

Token disponibili (definiti in `frontend/src/styles/base.css`):

| Token | Uso |
|---|---|
| `--colorTema` | Colore brand principale |
| `--colorPrimary` | Variante WCAG-safe per bottoni/CTA |
| `--colorPrimaryText` | Testo su sfondo `--colorPrimary` |
| `--colorSurface` | Sfondo pannelli/card |
| `--colorSurfaceText` | Testo su `--colorSurface` |
| `--colorSurfaceBorder` | Bordo pannelli |
| `--colorLink` | Colore link |
| `--focusRingColor` | Colore anello di focus |
| `--focusRingWidth` | Spessore anello di focus |
| `--focusRingOffset` | Offset anello di focus |

---

## Regole ESLint accessibility

Configurate in `frontend/eslint.config.mjs`. Le violazioni seguenti rompono `npm run lint` e bloccano la CI:

| Regola | Cosa verifica |
|---|---|
| `alt-text` | `<img>` senza attributo `alt` |
| `elements-content` | Elementi interattivi senza testo accessibile |
| `label-has-associated-control` | `<label>` senza `for`/`id` corrispondente |
| `valid-aria` | Attributi ARIA inesistenti o mal formati |
| `role-has-required-aria` | Role ARIA senza le proprietà obbligatorie |
| `table-scope` | `<th>` senza `scope` |
| `no-distracting-elements` | `<marquee>`, `<blink>` |

Le seguenti sono warning, da valutare caso per caso:

| Regola | Cosa verifica |
|---|---|
| `click-events-have-key-events` | Click handler senza equivalente keyboard |
| `interactive-supports-focus` | Elementi interattivi non focusabili |
| `mouse-events-have-key-events` | Mouse events senza keyboard fallback |
| `no-autofocus` | Uso di `autofocus` |

---

## Tooling di accessibilità

### Tre livelli di protezione

| Livello | Strumento | Quando scatta |
|---|---|---|
| 1 — Locale pre-commit | `.githooks/pre-commit` → `npm run lint` | Ad ogni `git commit` con file `frontend/src/` staged |
| 2 — CI | `.github/workflows/ci.yml` → job `frontend` → step `Lint` | Ad ogni push/PR |
| 3 — Runtime WCAG | `a11y-test.sh` (pa11y + WCAG2AA) chiamato da `deploy.sh --test-public` | Nel smoke test Docker del deploy |

Il pre-commit hook viene attivato automaticamente da `npm install` (script `prepare` configura `core.hooksPath = .githooks`).

```bash
# Audit WCAG 2.1 AA su un server in esecuzione
./a11y-test.sh http://localhost:3000
./a11y-test.sh http://localhost:3000 / /social /404

# Integrato nel deploy
bash deploy.sh --test-public
bash deploy.sh --test-public --skip-a11y   # solo per debug locale
```

Configurazione in `pa11y.json` (root del repo): standard WCAG2AA, livello "error".

---

## Comandi frequenti

```bash
cd frontend
npm run lint          # ESLint + regole a11y (0 errori = pronto per PR)
npm run build         # Build production
npm test              # Test unitari (Karma/Jasmine)
```

I18n — aggiungere sempre le chiavi in tutti i file coinvolti:

```
frontend/src/assets/i18n/basic.en.json   # chiavi framework condivise (EN)
frontend/src/assets/i18n/basic.it.json   # chiavi framework condivise (IT)
frontend/src/assets/i18n/addon.en.json   # chiavi specifiche del progetto (EN)
frontend/src/assets/i18n/addon.it.json   # chiavi specifiche del progetto (IT)
```

---

## Struttura cartelle

```
# Root
a11y-test.sh              # Audit WCAG 2.1 AA runtime (pa11y), chiamato da deploy.sh
pa11y.json                # Configurazione pa11y (standard, livello, chrome flags)
deploy.sh                 # Script deploy (--test-public esegue a11y-test.sh)
.github/workflows/ci.yml  # CI: build backend + frontend + lint + smoke test
.githooks/pre-commit      # Hook: blocca commit se npm run lint fallisce

# Frontend
frontend/
├── eslint.config.mjs     # ESLint flat config con regole a11y bloccanti
├── src/app/
│   ├── core/services/    # Business logic, API, theme, i18n, translate
│   ├── layout/           # Shell (navbar, footer, smoke-effect)
│   ├── pages/            # Componenti di rotta (home, error, policy, social)
│   └── shared/
│       ├── components/   # Componenti riusabili — verificare qui prima di crearne di nuovi
│       ├── directives/   # Direttive standalone
│       └── pipes/        # translate, markdown
├── src/styles/
│   ├── base.css          # Design token, layout globale, focus policy (:focus-visible)
│   ├── nav.css           # Stili navigazione
│   └── social.css        # Stili social links
└── src/assets/i18n/
    ├── basic.en.json     # Traduzioni EN (chiavi framework condivise)
    ├── basic.it.json     # Traduzioni IT (chiavi framework condivise)
    ├── addon.en.json     # Traduzioni EN (chiavi specifiche del progetto)
    └── addon.it.json     # Traduzioni IT (chiavi specifiche del progetto)
```
