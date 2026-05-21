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

| Componente/Direttiva | Uso | File |
|---|---|---|
| `<app-loading>` | Spinner accessibile con testo screen reader | `shared/components/loading/` |
| `<app-nav-link>` | Link con aria-current, external/internal/active | `shared/components/nav-link/` |
| `<app-nav-dropdown>` | Disclosure navigation con keyboard | `shared/components/nav-dropdown/` |
| `<app-context-menu>` | Context menu con focus trap e keyboard nav | `shared/components/context-menu/` |
| `<app-cookie-banner>` | Banner consenso cookie con role="alert" | `shared/components/cookie-banner/` |
| `<app-back-to-top>` | FAB "torna su" accessibile | `shared/components/back-to-top/` |
| `<app-social-link>` | Link social con aria-label adattivo | `shared/components/social-link/` |
| `appFocusTrap` | Direttiva focus trap per dialog/drawer | `shared/directives/focus-trap.directive.ts` |
| `appContextMenu` | Aggiunge context menu a qualsiasi elemento | `shared/directives/context-menu.directive.ts` |
| `appAsset` / `appAssetHref` | Risolve URL asset da id | `shared/directives/asset.directive.ts` |
| `appPage` | RouterLink da PageType con href reale | `shared/directives/page.directive.ts` |

**Regola**: prima di creare un nuovo componente, verifica che non esista già in `shared/`. Duplicare componenti shared senza motivazione valida è un errore architetturale.

---

## Pattern da seguire

### Aria-label — quando usarlo

```html
<!-- ✅ Solo icona: aria-label necessario -->
<button aria-label="{{ 'backToTopLabel' | translate }}">
    <i class="fas fa-chevron-up" aria-hidden="true"></i>
</button>

<!-- ✅ Testo visibile: aria-label NON va messo -->
<button>
    <i class="fas fa-save" aria-hidden="true"></i>
    {{ 'save' | translate }}
</button>

<!-- ❌ Testo visibile + aria-label identico: ridondante e fragile -->
<button aria-label="{{ 'save' | translate }}">
    <i class="fas fa-save" aria-hidden="true"></i>
    {{ 'save' | translate }}
</button>
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

## Struttura cartelle (frontend)

```
src/app/
├── core/services/        # Business logic, API, theme, i18n
├── layout/               # Shell (navbar, footer, smoke-effect)
├── pages/                # Componenti di rotta (home, error, policy, social)
├── shared/
│   ├── components/       # Componenti riusabili — usa questi prima di crearne di nuovi
│   ├── directives/       # Direttive standalone
│   └── pipes/            # translate, markdown
src/styles/
├── base.css              # Design token, layout globale, focus policy
├── nav.css               # Stili navigazione
└── social.css            # Stili social links
src/assets/i18n/
├── basic.en.json         # Traduzioni EN (chiavi condivise)
├── basic.it.json         # Traduzioni IT (chiavi condivise)
├── addon.en.json         # Traduzioni EN (chiavi aggiuntive progetto)
└── addon.it.json         # Traduzioni IT (chiavi aggiuntive progetto)
```
