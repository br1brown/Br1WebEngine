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

## Accessibilità — Accessible by Design & by Default

L'accessibilità è una proprietà nativa del sistema, non un'attività correttiva. Ogni componente, ogni PR e ogni modifica devono rispettare questi principi.

### Baseline WCAG obbligatoria

- **WCAG 2.1 AA** come livello minimo per tutti i nuovi componenti
- Ogni violazione bloccante viene rilevata automaticamente da ESLint prima del merge

### Regole ESLint accessibility (errori bloccanti)

Configurate in `frontend/eslint.config.mjs`. Le seguenti violazioni rompono `npm run lint` e bloccano la CI:

| Regola | Cosa verifica |
|---|---|
| `alt-text` | `<img>` senza attributo `alt` |
| `elements-content` | Elementi interattivi senza testo accessibile |
| `label-has-associated-control` | `<label>` senza `for`/`id` corrispondente |
| `valid-aria` | Attributi ARIA inesistenti o mal formati |
| `role-has-required-aria` | Role ARIA senza le proprietà obbligatorie |
| `table-scope` | `<th>` senza `scope` |
| `no-distracting-elements` | `<marquee>`, `<blink>` |

Le seguenti sono warning (da valutare caso per caso, non bloccano):

| Regola | Cosa verifica |
|---|---|
| `click-events-have-key-events` | Click handler senza equivalente keyboard |
| `interactive-supports-focus` | Elementi interattivi non focusabili |
| `mouse-events-have-key-events` | Mouse events senza keyboard fallback |
| `no-autofocus` | Uso di `autofocus` |

### Checklist componente accessibile

Prima di considerare completo qualsiasi componente UI:

- [ ] Semantic HTML corretto (`<button>` per azioni, `<a>` per navigazione, heading gerarchia)
- [ ] Tutti i `<label>` associati via `for`/`id` o nesting
- [ ] Tutti i `<img>` hanno `alt` (descrittivo se informativo, `""` se decorativo)
- [ ] Icone decorative hanno `aria-hidden="true"`
- [ ] Elementi interattivi raggiungibili e attivabili da tastiera
- [ ] Focus visibile garantito (usa `.fab:focus-visible` o `:focus-visible` globale)
- [ ] `aria-label` usato **solo** quando non c'è testo visibile — mai duplicare il testo visibile
- [ ] Testi `aria-label` usano `| translate` (mai stringhe hardcoded)
- [ ] Link esterni hanno `rel="noopener noreferrer"` e avvisano dello screen change
- [ ] Overlay/modal usano `appFocusTrap` e ripristinano il focus alla chiusura
- [ ] Animazioni rispettano `prefers-reduced-motion` (già gestito in `base.css`)
- [ ] Testato a contrasto: testo normale ≥ 4.5:1, testo grande ≥ 3:1

### Design token — usa sempre i token, mai valori hardcoded

```css
/* ✅ Corretto */
background: var(--colorSurface);
color: var(--colorSurfaceText);
border: 1px solid var(--colorSurfaceBorder);
outline: var(--focusRingWidth) solid var(--focusRingColor);

/* ❌ Sbagliato */
background: #f8f9fa;
color: #212529;
outline: 3px solid #141619;
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

### Componenti condivisi disponibili (usa questi, non reinventare)

#### Componenti

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

#### Direttive

| Direttiva | Selettore | Uso | File |
|---|---|---|---|
| FocusTrapDirective | `appFocusTrap` | Imprigiona il focus Tab/Shift+Tab — usare su dialog/drawer | `shared/directives/focus-trap.directive.ts` |
| ContextMenuDirective | `appContextMenu` | Aggiunge context menu a qualsiasi elemento | `shared/directives/context-menu.directive.ts` |
| AssetDirective | `appAsset` / `appAssetHref` | Risolve URL asset da id tramite `AssetService` | `shared/directives/asset.directive.ts` |
| PageDirective | `appPage` | `RouterLink` da `PageType` con `href` reale per SSR | `shared/directives/page.directive.ts` |
| ImgRenderDirective | `img[imgRender]` | Genera canvas → PNG → `src` su `<img>`; l'`alt` va sull'`<img>` | `shared/directives/img-render.directive.ts` |
| QrRenderDirective | `img[qrContent]` | Genera QR code → `src` su `<img>`; l'`alt` va sull'`<img>` | `shared/directives/qr-render.directive.ts` |

#### Pipe

| Pipe | Uso | File |
|---|---|---|
| `translate` | Traduce una chiave i18n con argomenti posizionali opzionali | `shared/pipes/translate.pipe.ts` |
| `markdown` | Converte Markdown → HTML sicuro | `shared/pipes/markdown.pipe.ts` |

**Regola**: prima di creare un nuovo componente, verifica che non esista già in `shared/`. Duplicare componenti shared senza motivazione valida è un errore architetturale.

---

## Pattern da seguire

### Aria-label — quando usarlo

Usare sempre `[attr.aria-label]` (binding), mai `aria-label="{{ ... }}"` (interpolazione):
il binding permette di passare `null` per rimuovere l'attributo del tutto (es. WCAG 2.5.3 in `<app-social-link>`).

```html
<!-- ✅ Solo icona: aria-label necessario, binding con translate -->
<button [attr.aria-label]="'backToTopLabel' | translate">
    <i class="fas fa-chevron-up" aria-hidden="true"></i>
</button>

<!-- ✅ Testo visibile: aria-label NON va messo -->
<button>
    <i class="fas fa-save" aria-hidden="true"></i>
    {{ 'save' | translate }}
</button>

<!-- ❌ Testo visibile + aria-label identico: ridondante e fragile (WCAG 2.5.3) -->
<button [attr.aria-label]="'save' | translate">
    <i class="fas fa-save" aria-hidden="true"></i>
    {{ 'save' | translate }}
</button>

<!-- ❌ Stringa hardcoded: non localizzabile -->
<button aria-label="Close">...</button>
```

### Link esterni

```html
<!-- ✅ Annuncia l'apertura in nuova scheda -->
<a href="..." target="_blank" rel="noopener noreferrer">
    {{ label }}
    <span class="visually-hidden"> ({{ 'opensInNewTab' | translate }})</span>
</a>
```

### Form — label obbligatorie

```html
<!-- ✅ Corretto -->
<label for="email" class="form-label">{{ 'mail' | translate }}</label>
<input id="email" type="email" class="form-control">

<!-- ❌ Label orfana -->
<label class="form-label">{{ 'mail' | translate }}</label>
<input type="email" class="form-control">
```

### Overlay e dialog

```html
<!-- ✅ Con focus trap, role e aria-modal -->
<div role="dialog"
     aria-modal="true"
     [attr.aria-label]="'dialogTitle' | translate"
     appFocusTrap>
    <!-- contenuto -->
</div>
```

---

## Tooling di accessibilità

### Tre livelli di protezione

| Livello | Strumento | Quando scatta |
|---|---|---|
| 1 — Locale pre-commit | `.githooks/pre-commit` → `npm run lint` | Ad ogni `git commit` con file `frontend/src/` staged |
| 2 — CI | `.github/workflows/ci.yml` → job `frontend` → step `Lint` | Ad ogni push/PR |
| 3 — Runtime WCAG | `a11y-test.sh` (pa11y + WCAG2AA) chiamato da `deploy.sh --test-public` | Nel smoke test Docker del deploy |

### Hook pre-commit

Attivato automaticamente da `npm install` (script `prepare` in `package.json` configura `core.hooksPath = .githooks`).
Il commit viene bloccato se `npm run lint` trova errori ESLint nei file staged.

### CI lint

Lo step `Lint` in `.github/workflows/ci.yml` esegue `npm run lint` sul job `frontend`.
Un errore ESLint rompe la pipeline e blocca il merge della PR.

### a11y-test.sh

Script stand-alone che esegue pa11y (WCAG 2.1 AA) su un server in esecuzione:

```bash
# Utilizzo diretto
./a11y-test.sh http://localhost:3000
./a11y-test.sh http://localhost:3000 / /social /404

# Integrato in deploy.sh (automatico con --test-public)
bash deploy.sh --test-public
bash deploy.sh --test-public --skip-a11y   # salta il test a11y
```

Configurazione in `pa11y.json` (root del repo): standard WCAG2AA, livello "error".

Il flag `--skip-a11y` è utile solo per debug; non usarlo nelle pipeline di produzione.

---

## Aggiungere un endpoint API

### 1. Registrare il path

In `frontend/src/app/core/services/api.service.ts`, aggiungere la chiave alla costante `API`:

```typescript
const API = {
    social:  'social',
    profile: 'profile',
    articoli: 'articoli',          // ← nuovo
} as const;
```

### 2. Aggiungere il metodo pubblico

Scegliere il wrapper in base all'uso:

| Wrapper | Quando usarlo |
|---|---|
| `this.api_get<T>()` | Chiamata una-tantum, risultato come Promise |
| `this.api_post<T>()` | Mutazione/invio dati |
| `this.api_resource<T>()` | Componente reattivo che deve aggiornarsi al cambio di signal (es. lingua) |

```typescript
// Chiamata una-tantum
getArticoli(): Promise<Articolo[]> {
    return this.api_get<Articolo[]>(API.articoli);
}

// Reattivo (footer, header — componenti sempre attivi)
getArticoliResource() {
    return this.api_resource<Articolo[]>(API.articoli);
}
```

La gestione errori è automatica: `BaseApiService.handleError()` mostra il dialog e ri-lancia l'errore. Il componente che chiama l'API deve gestire solo lo **stato** nel `catch` (es. `content = null`), non notificare di nuovo.

### 3. Se il dato carica una pagina — aggiornare il resolver

In `frontend/src/app/pages/content.resolver.ts`, aggiungere un case nello switch:

```typescript
case PageType.Articoli:
    content = await this.apiService.getArticoli();
    break;
```

Il `try-catch` esterno è già presente e protegge il router: se l'API fallisce, la navigazione si completa comunque con `content = null`.

### Cosa NON fare

```typescript
// ❌ Chiamare notify.handleApiError() nel componente dopo un errore API:
//    BaseApiService lo ha già fatto → l'utente vede due dialog.
try {
    this.data = await this.api.getArticoli();
} catch (err) {
    this.notify.handleApiError(...); // doppio Swal
}

// ✅ Gestire solo lo stato:
try {
    this.data = await this.api.getArticoli();
} catch {
    this.data = null; // notifica già mostrata
}
```

---

## Comandi frequenti

```bash
# Frontend
cd frontend
npm run lint          # ESLint + regole a11y (0 errori = pronto per PR)
npm run build         # Build production
npm test              # Test unitari (Karma/Jasmine)

# I18n: aggiungi sempre le chiavi in ENTRAMBI i file
# frontend/src/assets/i18n/basic.en.json
# frontend/src/assets/i18n/basic.it.json
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
│       ├── components/   # Componenti riusabili — usa questi prima di crearne di nuovi
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
