# Frontend — Guida allo sviluppo

Questa guida è rivolta a chi usa Br1WebEngine come template base e vuole estenderlo: aggiungere pagine, servizi, componenti o endpoint seguendo i pattern già stabiliti.

Per l'overview del progetto, la configurazione e il deploy → [`README.md`](../README.md).  
Per i pattern lato backend → [`backend/DEVELOPMENT.md`](../backend/DEVELOPMENT.md).

---

## Sommario

**Guide operative**
- [Aggiungere una pagina](#aggiungere-una-pagina)
- [Aggiungere un servizio](#aggiungere-un-servizio)
- [Aggiungere un componente](#aggiungere-un-componente)
- [Aggiungere una direttiva](#aggiungere-una-direttiva)
- [Aggiungere un endpoint API](#aggiungere-un-endpoint-api)
- [Resolver automatico dei contenuti](#resolver-automatico-dei-contenuti)
- [Regole SSR](#regole-ssr)
- [Meta SEO e SSR](#meta-seo-e-ssr)
- [Pattern dei Signal](#pattern-dei-signal)
- [Internazionalizzazione (i18n)](#internazionalizzazione-i18n)

**Riferimento**
- [Configurazione del sito (site.ts)](#configurazione-del-sito-sitets)
- [Tema e stile](#tema-e-stile)
- [Asset e ottimizzazione immagini](#asset-e-ottimizzazione-immagini)
- [Build e script](#build-e-script)
- [Servizi disponibili](#servizi-disponibili)
- [Componenti e directive disponibili](#componenti-e-directive-disponibili)

---

## Aggiungere una pagina

Ci sono esattamente **tre passi**: enum → `site.ts` → componente.  
Il router, il menu, il footer e la sitemap si aggiornano da soli.

### 1. Aggiungere il valore all'enum `PageType`

```typescript
// src/app/site.ts
export enum PageType {
    Home,
    Social,
    // ...
    MiaNuovaPagina,   // ← aggiunto qui
}
```

Usando un enum invece di stringhe, se in futuro rinomini il path URL cambi
**una riga** in `defineSitePages` e tutti i link interni restano validi.

### 2. Registrare la pagina in `defineSitePages`

```typescript
// src/app/site.ts — dentro defineSitePages([...])
{
    path: 'mia-pagina',
    title: 'miaPagina',          // chiave i18n
    description: 'miaPaginaDesc', // chiave i18n per meta description
    enabled: true,
    pageType: PageType.MiaNuovaPagina,
    component: () => import('./pages/mia-pagina/mia-pagina.component')
                         .then(m => m.MiaPaginaComponent),
}
```

Campi opzionali utili:

| Campo | Default | Quando usarlo |
|-------|---------|---------------|
| `requiresAuth: true` | — | Aggiunge il guard JWT; redirect a `/error/401` se non loggato. Forza `renderMode: 'client'` |
| `showPanel: false` | `true` | Pagina a tutto schermo (es. landing, social feed) |
| `renderMode: 'server'` | `'server'`* | Rendering a runtime lato server (default); HTML completo per i crawler |
| `renderMode: 'client'` | `'server'`* | Solo browser; usare per pagine interattive incompatibili con SSR |
| `data: { chiave: valore }` | — | Dati statici passati via `route.data` |

> *Regole di default: senza `renderMode` dichiarato il builder usa `server`;
> con `requiresAuth: true` usa `client` (i bot non possono effettuare login).

### 3. Creare il componente pagina

Il componente **deve** estendere `PageBaseComponent<T>`, dove `T` è il tipo del
contenuto caricato dal resolver. Il generic è obbligatorio:

```typescript
// src/app/pages/mia-pagina/mia-pagina.component.ts
import { Component } from '@angular/core';
import { PageBaseComponent } from '../page-base.component';

@Component({
    selector: 'app-mia-pagina',
    standalone: true,
    imports: [],
    templateUrl: './mia-pagina.component.html',
})
export class MiaPaginaComponent extends PageBaseComponent<MeteoData> {
    // pageContent() è già MeteoData | null — nessun cast necessario
    readonly temperatura = computed(() => this.pageContent()?.temperatura ?? '--');
}
```

Usare `<void>` per le pagine che non hanno contenuto dal resolver:

```typescript
export class HomeComponent extends PageBaseComponent<void> { }
```

Già disponibile da `PageBaseComponent`:

| Proprietà | Tipo | Note |
|-----------|------|------|
| `this.translate` | `TranslateService` | Traduzioni e lingua corrente |
| `this.api` | `ApiService` | Chiamate HTTP al backend |
| `this.asset` | `AssetService` | URL degli asset statici |
| `this.notify` | `NotificationService` | Toast, dialog, conferme |
| `this.pageContent()` | `T \| null` | Contenuto dal resolver, già tipizzato |

`pageContent()` è un `computed` che vale `null` per le pagine senza contenuto
e si aggiorna automaticamente ad ogni cambio lingua nel browser.

### 4. Aggiungere al menu (opzionale)

```typescript
// site.ts — dentro configureHeaderNavigation o configureFooterNavigation
h.addPage(PageType.MiaNuovaPagina);

// Oppure in un gruppo dropdown:
h.addGroup('labelGruppo', g => {
    g.addPage(PageType.MiaNuovaPagina);
});
```

Le pagine con `enabled: false` vengono escluse in automatico, anche dai gruppi.

---

## Aggiungere un servizio

### Pattern base

```typescript
// src/app/core/services/mio.service.ts
import { inject, Injectable, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class MioService {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    // Stato reattivo — usare signal(), non proprietà plain
    readonly statoCorrente = signal<string>('iniziale');

    doSomething(): void {
        if (!this.isBrowser) return;  // Guard SSR obbligatorio per API browser

        // Logica che usa window/document/localStorage/ecc.
    }
}
```

### Regole per i servizi

**Guard SSR**: qualsiasi accesso a `window`, `document`, `localStorage`,
`navigator`, `matchMedia` o qualsiasi API browser **deve** essere protetto da
`isPlatformBrowser`. Non usare `typeof window !== 'undefined'`: è error-prone
e non sfrutta il sistema di injection Angular.

**Stato reattivo**: usare `signal<T>()` per lo stato mutabile del servizio,
non proprietà plain. I componenti possono usare i signal direttamente nei template
senza `async pipe` né `ChangeDetectorRef`.

**Non usare `effect()` per sincronizzare stato**: se un valore dipende da un
altro signal, usare `computed()`. Usare `effect()` solo per effetti collaterali
genuini (logging, chiamate esterne, scrittura DOM).

### Inject vs costruttore

Il progetto usa `inject()` (functional injection), non il costruttore con parametri.
È più compatto ed evita boilerplate:

```typescript
// ✅ Pattern del progetto
private readonly http = inject(HttpClient);

// ❌ Non usare
constructor(private http: HttpClient) {}
```

---

## Aggiungere un componente

I componenti **condivisi** vanno in `src/app/shared/components/`.  
I componenti **specifici di una pagina** possono stare nella cartella della pagina stessa.

```typescript
@Component({
    selector: 'app-mio-widget',
    standalone: true,    // sempre standalone — niente NgModule
    imports: [],
    templateUrl: './mio-widget.component.html',
})
export class MioWidgetComponent {
    // inject() per le dipendenze
    private readonly translate = inject(TranslateService);
}
```

Se il componente usa API browser (DOM, canvas, IntersectionObserver, ecc.):

```typescript
export class MioWidgetComponent implements AfterViewInit {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    ngAfterViewInit(): void {
        if (!this.isBrowser) return;
        // Accesso sicuro al DOM — ngAfterViewInit non gira in SSR
    }
}
```

---

## Aggiungere una direttiva

```typescript
// src/app/shared/directives/mia.directive.ts
import { Directive, HostListener, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Directive({
    selector: '[appMia]',
    standalone: true,
})
export class MiaDirective {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    @HostListener('click', ['$event'])
    onClick(event: MouseEvent): void {
        if (!this.isBrowser) return;
        // logica
    }
}
```

Se la direttiva deve accedere all'elemento host o al suo parent nel DOM,
usare `ViewContainerRef`:

```typescript
private readonly vcr = inject(ViewContainerRef);
// vcr.element.nativeElement — elemento host della direttiva
```

---

## Aggiungere un endpoint API

Ogni endpoint del backend ha un metodo pubblico dedicato in `ApiService`.  
**Non** chiamare `HttpClient` direttamente nei componenti.

### 1. Aggiungere il path alla costante `API`

```typescript
// src/app/core/services/api.service.ts
const API = {
    // ...
    mioEndpoint: 'mio-endpoint',
    mioEndpointConId: (id: string) => `mio-endpoint/${encodeURIComponent(id)}`,
} as const;
```

### 2. Aggiungere il metodo pubblico in `ApiService`

```typescript
// GET base
getMioOggetto(): Promise<MioTipo> {
    return this.api_get<MioTipo>(API.mioEndpoint);
}

// GET con parametri query
getMioOggettoFiltrato(filtro: string): Promise<MioTipo[]> {
    const params = new HttpParams().set('filtro', filtro);
    return this.api_get<MioTipo[]>(API.mioEndpoint, params);
}

// POST con body
creaMioOggetto(payload: MioPayload): Promise<MioTipo> {
    return this.api_post<MioTipo>(API.mioEndpoint, payload);
}

// Versione reattiva GET-only (httpResource) — per componenti persistenti come footer/header.
// Restituisce HttpResourceRef<T|undefined> con i signal .value() e .isLoading.
// Si aggiorna automaticamente quando cambiano i segnali reattivi (lingua, token).
getMioOggettoResource() {
    return this.api_resource<MioTipo>(API.mioEndpoint);
}
```

**Gestione errori**: `api_get`, `api_post` e `api_resource` gestiscono gli errori
automaticamente tramite `handleError` del servizio base: mostrano la notifica
all'utente e rilanciano l'errore per eventuali handler upstream.  
Non servono `try/catch` nei componenti salvo casi specifici.

---

## Resolver automatico dei contenuti

`app.routes.ts` applica automaticamente `ContentResolver` come resolver
su ogni pagina. Il resolver restituisce un oggetto `ResolvedPage<T>` con due campi:
`content` (i dati della pagina) e `info` (i metadati SEO da `site.ts`).
`PageBaseComponent` li riceve, aggiorna i meta tag via `effect()` e
espone `pageContent()` già tipizzato come `T | null`.

### Come funziona

```
Navigazione → ContentResolver.loadResolved(pageType, lang)
                        ↓
             switch(pageType) → content da file, API, o null
             ContestoSito.getPageInfo(pageType) → info SEO da site.ts
                        ↓
             ResolvedPage { content, info } → input contentByResolve
                        ↓
             PageBaseComponent:
               effect(info)    → PageMetaService.setTitle()   [SSR + browser]
               effect(lang)    → ricarica al cambio lingua     [solo browser]
               pageContent()   → content tipizzato come T
```

Il componente usa **solo** `this.pageContent()` — non gestisce meta tag né render mode.

### Aggiungere contenuto a una nuova pagina

**1. Aggiungere il case in `ContentResolver.loadResolved()`**

```typescript
// pages/content.resolver.ts
case PageType.MiaPagina:
    content = await this.chiamataApi(lang);          // API esterna
    // oppure
    content = await this.tryLoadPolicy('slug', lang); // file MD da /assets/legal/
    break;
```

I metadati SEO statici (titolo, descrizione, ogImage) vengono letti automaticamente
da `ContestoSito.getPageInfo(pageType)` — dichiarati una sola volta in `site.ts`.

**2. Estendere `PageBaseComponent<T>` nel componente**

```typescript
export class MiaPaginaComponent extends PageBaseComponent<MeteoData> {
    readonly temperatura = computed(() => this.pageContent()?.temperatura ?? '--');
}
```

Nessun cast, nessun effect aggiuntivo. `pageContent()` è già `MeteoData | null`.

### Meta SEO dinamici (titolo/descrizione da API)

Per pagine con titolo che dipende dall'API (es. articolo con ID variabile),
aggiungere il case nel resolver e sovrascrivere `info` con i dati dell'API:

```typescript
case PageType.Articolo: {
    const articolo = await this.loadArticolo(route!.params['id'], language);
    return {
        content: articolo,
        info: {
            title: articolo.titolo,
            description: articolo.descrizione,
            path: ContestoSito.getPageInfo(pageType)?.path ?? '',
            isExternal: false,
            ogImage: articolo.previewImageId,
        }
    };
}
```

`PageBaseComponent` chiama `setTitle()` automaticamente con questi dati — nessuna
logica SEO nel componente.

### Estendere in un progetto figlio

Il progetto figlio registra la propria versione del servizio nel DI:

```typescript
// app.config.ts del figlio
{ provide: ContentResolver, useClass: ChildContentResolverService }
```

```typescript
// ChildContentResolverService
override async loadResolved(pageType: PageType, lang?: string): Promise<ResolvedPage> {
    switch (pageType) {
        case PageType.GeneratoreMeteo: {
            const content = await this.api.getMeteo(lang);
            return { content, info: ContestoSito.getPageInfo(pageType) };
        }
        default:
            return super.loadResolved(pageType, lang);
    }
}
```

`contentLoaderResolver` chiama `inject(ContentResolver)`, quindi usa automaticamente
la versione del figlio senza toccare nulla nell'engine.

---

## Regole SSR

Il frontend usa SSR con hydration (`provideClientHydration(withEventReplay())`).
Alcune API esistono solo nel browser — accedervi lato server genera errori.

### Cosa NON fare

```typescript
// ❌ window non esiste in SSR
if (typeof window !== 'undefined') { ... }

// ❌ document non esiste in SSR
document.querySelector('.mia-classe');

// ❌ localStorage non esiste in SSR
localStorage.getItem('chiave');
```

### Cosa fare nei componenti pagina

```typescript
// ✅ afterNextRender — garantisce esecuzione solo nel browser, mai in SSR
constructor() {
    afterNextRender(() => {
        // codice browser-only: canvas, scroll, analytics, ecc.
    });
}
```

### Cosa fare nei servizi

```typescript
// ✅ isPlatformBrowser — necessario nei servizi che non hanno accesso ad afterNextRender
@Injectable({ providedIn: 'root' })
export class MioService {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    metodo(): void {
        if (!this.isBrowser) return;
        // codice browser-only
    }
}
```

### Dove mettere il codice DOM

- **`afterNextRender()`**: opzione consigliata nei componenti pagina — eseguito solo nel browser, mai in SSR/prerender
- **`ngAfterViewInit`**: non viene chiamato in SSR → sicuro per accesso DOM, ma non garantisce il browser in tutti i contesti Angular
- **Event handler / `@HostListener`**: non vengono scatenati lato server → sicuri
- **`constructor` / `ngOnInit`**: vengono eseguiti lato server → richiedono guard `isPlatformBrowser` per codice browser-only

---

## Meta SEO e SSR

I meta tag (`<title>`, `og:title`, `og:description`, `og:image`, canonical)
vengono gestiti interamente da `ContentResolver` + `PageBaseComponent`.
Non serve nessun codice nei componenti per i casi standard.

### Come funziona

**Per pagine statiche** (titolo e descrizione dichiarati in `site.ts`):

```typescript
// site.ts
{
    path: 'mia-pagina',
    title: 'miaPagina',              // chiave i18n → tradotta automaticamente
    description: 'miaPaginaDesc',   // chiave i18n → meta description
    ogImage: 'id-asset-immagine',   // ID asset → og:image 1200×630: immagine centrata su sfondo sfocato + favicon
    // oppure ogImage: false        → nessuna immagine (rimuove i tag og:image)
    // oppure omesso                → preview dinamica generata da /cdn-cgi/preview
    ogType: 'article',              // og:type (default: 'website')
    structuredDataType: 'Article',  // JSON-LD @type (default: 'WebPage')
    ...
}
```

I tag aggiornati da `PageMetaService.setTitle()` in un'unica chiamata:
`<title>`, `og:title`, `og:description`, `og:url`, `og:image`, `og:type`,
`og:locale` / `og:locale:alternate` (da `availableLanguages`),
`twitter:title`, `twitter:description`, `twitter:image`,
`<link rel="canonical">` e il blocco `<script type="application/ld+json">`.
Le immagini social includono `?v={version}` di cache busting automatico.

`ContentResolver.loadResolved()` legge questi dati via `ContestoSito.getPageInfo(pageType)`
e li passa a `PageBaseComponent` nel campo `info` di `ResolvedPage`.
`PageBaseComponent` chiama `PageMetaService.setTitle()` via `effect()` — SSR-safe,
i meta tag sono nell'HTML prima che il crawler lo riceva.

**Per pagine dinamiche** (titolo/descrizione da API, es. articolo con ID):

Aggiungere il case nel `ContentResolver` e restituire un `info` personalizzato
con i dati dall'API — vedi sezione *Resolver automatico dei contenuti*.

### `PageMetaService.setTitle()`

```typescript
// Firma
setTitle(
    pageTitle: string,
    description?: string | null,
    imgId?: string | null | false,
    ogType?: string | null,          // og:type (default: 'website')
    structuredDataType?: string | null, // JSON-LD @type (default: 'WebPage')
): void

// imgId — tre comportamenti distinti:
// string  → /cdn-cgi/preview-image?id=…  — output 1200×630: immagine centrata su sfondo sfocato, favicon in basso a sinistra
// null/undefined → /cdn-cgi/preview?title=…  — preview generata (sfondo colorato, icona, titolo)
// false   → nessuna immagine: i tag og:image e twitter:image vengono rimossi
```

Può essere chiamato direttamente dal componente nei rari casi in cui serve
sovrascrivere i meta a runtime (es. dopo un'interazione utente).

---

## Pattern dei Signal

### Riepilogo dei tipi

| Tipo | Quando usarlo |
|------|--------------|
| `signal<T>(valore)` | Stato mutabile — può essere `set()` o `update()` |
| `computed(() => ...)` | Valore derivato da altri signal — **readonly**, calcolato lazy |
| `effect(() => ...)` | Effetto collaterale reale (log, scrittura DOM, API esterne) |
| `input<T>()` / `input.required<T>()` | Input di componente/direttiva — readonly, iniettato dal padre |

### `computed()` invece di `effect()` per i dati derivati

```typescript
// ✅ Corretto
readonly nomePulito = computed(() => this.nome().trim().toUpperCase());

// ❌ Errato — effect() serve per effetti collaterali, non per derivare stato
effect(() => { this.nomePulito = this.nome().trim().toUpperCase(); });
```

### Signal + ngModel (binding bidirezionale)

I `signal` non sono direttamente compatibili con `[(ngModel)]`:

```html
<!-- ✅ Corretto -->
<input [ngModel]="mioSignal()" (ngModelChange)="mioSignal.set($event)">

<!-- ❌ Non funziona — signal non è un riferimento plain -->
<input [(ngModel)]="mioSignal">
```

### Signal + `effect()` con reattività a un altro signal

```typescript
// Segue la lingua corrente e aggiorna il testo quando cambia
readonly testoLocalizzato = signal('');

constructor() {
    effect(() => {
        // translate.currentLang() è un signal → questo effect si ri-esegue a ogni cambio lingua
        this.testoLocalizzato.set(this.translate.translate('chiave'));
    });
}
```

---

## Internazionalizzazione (i18n)

Le lingue disponibili si dichiarano in `setSiteConfiguration` con `availableLanguages`:

```typescript
// site.ts
setSiteConfiguration({
    defaultLang: 'it',
    availableLanguages: ['it', 'en'], // validati BCP 47 a build time
    ...
});
```

Per aggiungere una lingua: aggiungerla ad `availableLanguages` e creare i file
`basic.{lang}.json` e `addon.{lang}.json` corrispondenti.

Le traduzioni stanno in `src/assets/i18n/<lang>.json`.  
Le chiavi sono camelCase senza spazi, in inglese.

```json
// it.json
{
    "miaPagina": "La mia pagina",
    "miaPaginaDesc": "Descrizione per SEO della mia pagina"
}
```

Nel componente:

```typescript
// Traduzione one-shot (non reattiva)
const testo = this.translate.translate('miaPagina');

// Traduzione reattiva (signal — si aggiorna al cambio lingua)
readonly testo = computed(() => this.translate.translate('miaPagina'));
```

Nel template:

```html
<!-- Pipe translate (reattiva) -->
<h1>{{ 'miaPagina' | translate }}</h1>

<!-- oppure diretta da signal -->
<h1>{{ testo() }}</h1>
```

---

## Configurazione del sito (site.ts)

### Come funziona il builder

`site.ts` è l'unico file da toccare per configurare il sito. Usa quattro chiamate sul builder:

```typescript
siteFondamentaBuilder.setSiteConfiguration({ appName, colorTema, defaultLang, ... });
siteFondamentaBuilder.defineSitePages([ /* array di pagine */ ]);
siteFondamentaBuilder.configureHeaderNavigation(h => { h.addPage(...); h.addGroup(...); });
siteFondamentaBuilder.configureFooterNavigation(f => { f.addPage(...); });
```

Internamente `buildSite` lavora in tre fasi:

1. **Dichiarazione** — l'utente descrive il sito con tipi `*Input` e campi opzionali
2. **Normalizzazione** — il builder deduce `kind` dalla struttura (`children` → parent, `component` → leaf, `externalUrl` → external), valida la coerenza e costruisce la mappa `PageType → path`. PageType duplicati o path duplicati generano un errore a build time
3. **Generazione** — produce rotte Angular, `NavLink[]` per header/footer (con flag `isExternal`), `getPath(PageType)` e `getSitemapEntries()`

Il risultato (`ContestoSito`) viene consumato da router, navbar, footer e script di build.

### Campi di setSiteConfiguration

| Campo | Obbligatorio | Effetto |
|---|---|---|
| `appName` | sì | Nome in navbar, titoli e PWA manifest |
| `version` | no | Versione app; usata per rilevare aggiornamenti e come cache busting sulle immagini social (default: `"1.0.0"`) |
| `defaultLang` | sì | Lingua di fallback |
| `availableLanguages` | no | Tag BCP 47 validati a build time (es. `['it', 'en']`); se omesso il sito è monolingua |
| `description` | sì | Meta description globale (fallback per pagine senza `description` propria) |
| `colorTema` | sì | Colore hex principale; genera contrasto WCAG, tono e CSS var |
| `showFooter` | no | Mostra/nasconde footer (default: `true`) |
| `showHeader` | no | Mostra/nasconde navbar (default: `true`) |
| `fixedTopHeader` | no | Navbar fissa in cima allo scroll (default: `false`) |
| `smoke` | no | Effetto particellare su canvas. Campi: `enable`, `color`, `opacity`, `maximumVelocity`, `particleRadius`, `density` — tutti opzionali |

### Campi opzionali di una LeafPage

| Campo | Effetto |
|---|---|
| `requiresAuth: true` | Aggiunge guard JWT; forza `renderMode: 'client'` |
| `showPanel: false` | Pagina a schermo intero (no pannello centrale) |
| `renderMode: 'client'` | Solo browser — usare per pagine interattive incompatibili con SSR |
| `renderMode: 'server'` | HTML generato a ogni richiesta lato server (default se non dichiarato) |
| `description` | Chiave i18n o stringa per meta description e sitemap |
| `ogImage` | ID asset statico / `false` (nessuna immagine) / omesso (preview dinamica) |
| `ogType` | `og:type` (es. `'article'`). Default: `'website'` |
| `structuredDataType` | `@type` del JSON-LD (es. `'Article'`). Default: `'WebPage'` |
| `data` | Dati arbitrari passati al componente via `route.data` |

### Navigazione

Tre metodi disponibili in `configureHeaderNavigation` / `configureFooterNavigation`:

```typescript
h.addPage(PageType.X)                       // voce singola — path risolto dalla mappa interna
h.addGroup('chiaveI18n', g => { ... })      // dropdown; sparisce se tutti i figli sono disabilitati
h.addLink('chiaveI18n', '/path-o-url')      // link diretto a URL arbitrario
```

Pagine con `enabled: false` escluse automaticamente. I path non si scrivono mai a mano (tranne in `addLink`).

### PageType e getPath

`ContestoSito.getPath(PageType.X)` restituisce il path di una pagina per costruire link interni. Restituisce `null` se la pagina è disabilitata o non registrata — non finisce mai silenziosamente in un `href`. Usa sempre il fallback:

```typescript
const path = ContestoSito.getPath(PageType.X) ?? '/';
```

---

## Tema e stile

### ThemeService

Imposta una sola variabile CSS (`--colorTema`) e calcola in modo reattivo tutto il resto:

| Signal / metodo | Cosa restituisce |
|---|---|
| `colorTema` | Colore hex corrente (scrivibile per switchare tema a runtime) |
| `colorTemaText` | `#000000` o `#ffffff` — contrasto massimo WCAG sul tema |
| `colorPrimary` | Tema + 40% nero — usato per pulsanti e accenti |
| `colorPrimaryText` | Testo leggibile su `colorPrimary` |
| `isDarkTextPreferred` | `true` se il tema è sufficientemente chiaro |

I metodi statici (`ThemeService.prefersDarkText`, `getReadableTextColor`, `mixHexColors`) sono puri e importabili anche da Node/server.ts senza istanziare Angular.

`ImgBuilderService` e `QrCodeService` leggono `colorPrimary()` e `colorPrimaryText()` come default colori — nessuna configurazione aggiuntiva per avere coerenza visiva e contrasto WCAG.

### Sistema CSS con color-mix()

`ThemeService` imposta solo `--colorTema`. Tutte le variabili derivate vengono calcolate dal browser:

```css
--colorBase:          color-mix(in srgb, var(--colorTema), white 20%);
--colorPrimary:       color-mix(in srgb, var(--colorTema), black 40%);
--colorSurface:       color-mix(in srgb, var(--colorTema), white 24%);
--colorSurfaceHover:  color-mix(in srgb, var(--colorTema), white 30%);
--colorSurfaceBorder: color-mix(in srgb, var(--colorTema), white 38%);
--colorSurfaceText:   color-mix(in srgb, white 94%, var(--colorTema) 6%);
```

Il pannello contenuti si adatta automaticamente al tono (scuro/chiaro). Varianti forzabili con `.panel-light` e `.panel-dark`.

### FontConfig

`src/styles/font-config.ts` — nessuna dipendenza Angular, importabile ovunque (siteBuilder, ThemeService, server.ts).

| Dizionario | Contesto |
|---|---|
| `FontConfig.WEB_FONTS` | Browser e Canvas — font di sistema, zero dipendenze esterne |
| `FontConfig.SERVER_FONTS` | Sharp / immagini OG — font installati nel container Docker |

`FontConfig.DEFAULT_WEB_FONT` e `DEFAULT_SERVER_FONT` sono i default usati da `ImgBuilderService`.

---

## Asset e ottimizzazione immagini

Il server Node SSR espone tre endpoint CDN CGI (path raccolti in `CdnCgi` in `asset.service.ts`):

| Endpoint | Scopo |
|---|---|
| `/cdn-cgi/asset?id=X[&w=N]` | Serve il file raw: resize + WebP per immagini raster, passthrough per PDF/SVG/… |
| `/cdn-cgi/preview?title=…` | Genera al volo l'og:image testuale (sfondo colorato, favicon centrata, titolo) |
| `/cdn-cgi/preview-image?id=X` | Output fisso 1200×630: immagine proporzionata al centro, sfondo sfocato (blur-fill), favicon in basso a sinistra |

Tutti e tre usano cache su disco (invalidata aggiornando `version` in `site.ts`) e single-flight per richieste concorrenti alla stessa risorsa.

La directory `assets/files/` è bloccata — i file non sono mai raggiungibili direttamente, solo tramite ID.

Nei componenti:
```typescript
this.asset.getUrl('hero', 1080)      // → URL ottimizzato via /cdn-cgi/asset
```

Per Blob locali (canvas, API esterne):
```typescript
const { rawUrl, angularUrl } = this.asset.getUrlFromBlob(blob);
// rawUrl → usabile in JS puro
// angularUrl → sanitizzato per i template Angular
// Revocati automaticamente ad ogni NavigationEnd
```

---

## Build e script

```bash
npm run generate:statics   # meta tag, sitemap.xml, robots.txt, manifest
npm run generate:icons     # icone PWA da favicon.png
npm run build              # esegue entrambi via prebuild, poi ng build
npm run dev:ssr            # build + avvia server Node SSR locale (senza Docker)
```

Gli script leggono da `ContestoSito`: nome app, colore, lingue, path pagine. Per avere una `sitemap.xml` corretta in produzione, `FRONTEND_BASE_URL` deve essere valorizzata nell'ambiente di build (derivata in automatico da `deploy.sh`); se manca, usa `https://example.com` con un warning.

### Iniezione variabili d'ambiente a runtime (Docker)

Rilevante solo in deploy con Docker — in sviluppo locale non si applica.

Angular compila il bundle a build time e non può leggere env del container a runtime. La soluzione: `environment.ts` usa i segnaposto letterali `__API_URL__` e `__API_KEY__`. All'avvio del container, `docker-entrypoint.sh` esegue `sed` su tutti i `.js` del bundle sostituendo quei segnaposto con i valori reali. Il server SSR parte solo dopo la sostituzione.

Quando `API_URL` è vuota, il server Node fa da proxy su `/api/*` verso il backend sulla rete Docker. Se valorizzata, il frontend chiama direttamente quell'URL (utile con backend su server separato).

Cache: asset con hash nel nome → 1 anno `immutable`; asset non hashati (i18n, legal, mapping) → `no-cache` per aggiornamenti immediati al deploy.

---

## Servizi disponibili

Tutti `providedIn: 'root'`.

| Servizio | Ruolo |
|---|---|
| `ThemeService` | Tema dinamico; metodi statici per calcolo colori (WCAG, mix) importabili anche da Node |
| `TranslateService` | i18n con sistema addon; `translate(key)`, `currentLang()`, `availableLangs()` |
| `TokenService` | Token JWT in memoria + sessionStorage; letto da `ApiService` per l'header `Bearer` |
| `AuthService` | Login, logout e stato sessione; delega storage a `TokenService` |
| `BaseApiService` | Classe astratta: header HTTP, URL normalization, error handling, health check |
| `ApiService` | Unico client HTTP verso il backend: `getProfile`, `getSocial`, `getBlob`, `exportDocument`, `login` |
| `ContentResolver` | Resolver automatico contenuti di pagina; estendibile via DI nei progetti figli |
| `AssetService` | URL verso `/cdn-cgi/asset`; `getUrlFromBlob` per Blob locali con tracking e revoca automatica |
| `ShareService` | Clipboard API, Web Share API, download — un'unica interfaccia con fallback |
| `ImgBuilderService` | Genera PNG su canvas (`buildBlob`, `buildCanvas`, `buildFile`); `buildSvg` statico SSR-safe |
| `QrCodeService` | QR code PNG/SVG per URL, WhatsApp, email, Wi-Fi, SEPA; cache per payload+colori |
| `NotificationService` | SweetAlert2 lazy: `success`, `error`, `confirm`, `prompt`, `interact`, `toast`, `validationErrors`, `handleApiError` |
| `CookieConsentService` | Gestione consenso GDPR; blocca scritture cookie senza consenso |
| `SpeechService` | Text-to-speech via Web Speech API; voce e lingua seguono `TranslateService` |
| `VersionCheckService` | Controlla nuova versione ogni 10 min; propone reload via `confirm()` |

---

## Componenti e directive disponibili

| Componente / Directive | Uso |
|---|---|
| `<app-loading [loading]="bool">` | Spinner Bootstrap se `true`, `<ng-content>` se `false` |
| `[appContextMenu]="options"` | Menu contestuale: click destro desktop, long-press mobile |
| `<app-social-link [type]="..." [value]="...">` | 35+ social con icona Font Awesome e colore brand |
| `<app-cookie-banner>` | Banner GDPR con testo Markdown e placeholder dinamici |
| `<app-back-to-top>` | Pulsante scroll-to-top con soglia; colori dal tema |
| `<app-smoke-effect>` | Effetto particellare su canvas configurabile da `site.ts` |
| `{{ testo \| markdown }}` | Markdown → HTML con protezione XSS integrata (HTML raw ignorato) |

### ImgBuilderService — dettaglio

```typescript
// Metodi istanza (browser — leggono i Signal del tema come default)
buildCanvas(text, opts?) → Promise<HTMLCanvasElement | null>
buildBlob(text, opts?)   → Promise<Blob | null>
buildFile(text, name?, opts?) → Promise<File | null>

// Metodo statico (SSR-safe, usato anche da /cdn-cgi/preview)
ImgBuilderService.buildSvg(text, bgColor, textColor, fontSize, fontFamily, ratio, maxWidth, lineHeight, wordWrap)
// → { svg: string, width: number, height: number }
```

`opts` è tutto opzionale: `bgColor`/`textColor` (dal tema), `fontSize` (40px), `ratio` (`'4:3'`), `fontFamily`, `wordWrap` (true), `maxWidth` (1200px), `lineHeight` (1.4). In SSR i metodi istanza restituiscono `null`.

### QrCodeService — dettaglio

Formati supportati: `text`, `whatsapp` (phone), `email` (to, subject, body), `wifi` (ssid, password, encryption), `sepa` (iban, name, amount, remittance).

```typescript
const result = await this.qrCode.create({ type: 'text', content: url });
if (result.success) {
    this.qrUrl = this.asset.getUrlFromBlob(result.blob).angularUrl; // mostra inline
    this.share.downloadBlob(result.blob, 'qrcode.png');             // scarica
}
// Con colori espliciti:
await this.qrCode.createWithColors(config, '#000000', '#ffffff');
// SVG (null in SSR):
const svg = await this.qrCode.toSVG(config);
```

Validazione integrata per telefono (E.164), email e IBAN. Risultati cachati per payload + colori.

### ShareService — dettaglio

```typescript
this.share.copyText('testo');              // Clipboard API con notifica
this.share.shareText('titolo', 'testo');   // Web Share API (fallback: download)
this.share.shareCanvas(canvas, 'img.png'); // Condivide un HTMLCanvasElement come PNG
this.share.downloadBlob(blob, 'file.png'); // Download diretto
```

### Pagine legali

Un solo componente (`PolicyComponent`) gestisce privacy, cookie policy, termini e note legali. `ContentResolver` carica il Markdown corretto da `/assets/legal/{tipo}.{lang}.md` con fallback all'italiano. Per aggiungere una nuova pagina legale: aggiungere un `case` in `ContentResolver.loadResolved()` e il file `.md` corrispondente.

### Accessibilità integrata

- **Skip-link** (WCAG 2.4.1): visibile solo su focus per navigazione da tastiera
- **`prefers-reduced-motion`** (WCAG 2.3.3): animazioni disabilitate se la preferenza è attiva
- **`safe-area-inset`**: navbar e footer si adattano ai dispositivi con notch
- **Contrasto AA**: `text-body-secondary` forzato a `#595f66`
