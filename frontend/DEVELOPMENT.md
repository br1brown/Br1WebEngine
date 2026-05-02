# Frontend — Guida allo sviluppo

Questo file spiega i pattern stabiliti nel progetto per aggiungere nuove funzionalità.  
Il README è l'overview del progetto; qui si entra nel dettaglio del "come si fa".

---

## Sommario

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
| `requiresAuth: true` | — | Aggiunge il guard JWT; redirect a `/error/401` se non loggato |
| `showPanel: false` | `true` | Pagina a tutto schermo (es. landing, social feed) |
| `renderMode: 'server'` | — | Pre-rendering SSR; usare insieme a `resolve` |
| `resolve: { nome: () => inject(ApiService).qualcosa() }` | — | Dati pre-caricati lato server |
| `data: { chiave: valore }` | — | Dati statici passati via `route.data` |

**Pagine con SSR (`renderMode: 'server'`):**  
Il resolver esegue la chiamata API durante la generazione server-side.
Il componente legge il risultato tramite `input()` con lo stesso nome del resolver:

```typescript
// site.ts
resolve: { posts: () => inject(ApiService).getPosts() }

// mia-pagina.component.ts
readonly posts = input<Post[]>();
readonly postsFiltrati = computed(() => this.posts()?.filter(...) ?? []);
```

Usare sempre `computed()` (non `effect()`) per derivare stato dai dati risolti:
`effect()` crea macrotask Zone.js che possono bloccare la stabilizzazione SSR.

### 3. Creare il componente pagina

Il componente **deve** estendere `PageBaseComponent`, che pre-inietta i servizi
più comuni senza doverli ripetere in ogni pagina:

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
export class MiaPaginaComponent extends PageBaseComponent {
    // translate, api, asset, notify già disponibili da PageBaseComponent
    // pageType iniettato automaticamente dal router
}
```

Già disponibile da `PageBaseComponent`:

| Proprietà | Tipo | Note |
|-----------|------|------|
| `this.translate` | `TranslateService` | Traduzioni e lingua corrente |
| `this.api` | `ApiService` | Chiamate HTTP al backend |
| `this.asset` | `AssetService` | URL degli asset statici |
| `this.notify` | `NotificationService` | Toast, dialog, conferme |
| `this.pageContent()` | `any` | Contenuto dal resolver — castare al tipo atteso |
| `this.platformId` | `object` | Per guard `isPlatformBrowser` |

`pageContent()` è un `computed` che vale `null` per le pagine senza contenuto associato
nel resolver e si aggiorna automaticamente ad ogni cambio lingua nel browser.

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
su ogni pagina che non dichiara un `resolve` esplicito in `site.ts`.
`PageBaseComponent` riceve il risultato e lo espone tramite `pageContent()`,
già aggiornato ad ogni cambio lingua — funziona uguale per `server`, `client` e `prerender`.

### Come funziona

```
Navigazione → ContentResolver.loadResolved(pageType, lang)
                        ↓
             switch(pageType) → dati da file, API, o null
                        ↓
             contentByResolve = input  ← legato da withComponentInputBinding
                        ↓
             pageContent = computed(() => _liveContent() ?? contentByResolve())
                        ↓
             [SSR / prerender]  HTML serializzato con dati già dentro
             [Browser]          effect aggiorna _liveContent ad ogni cambio lingua
```

Il componente usa **solo** `this.pageContent()` — non sa nulla del render mode.

### Aggiungere contenuto a una nuova pagina

**1. Aggiungere il case in `ContentResolver.loadResolved()`**

```typescript
// pages/content.resolver.ts
case PageType.MiaPagina:
    return this.chiamataApi(lang);             // API esterna
    // oppure
    return this.tryLoadPolicy('slug', lang);   // file MD da /assets/legal/
    // oppure
    return Promise.resolve({ statico: true }); // dati statici, nessuna chiamata HTTP
```

Nessun altro file da toccare: il resolver viene applicato in automatico.

**2. Leggere `pageContent()` nel componente**

```typescript
export class MiaPaginaComponent extends PageBaseComponent {
    // Cast al tipo atteso — null se la pagina non ha contenuto nel resolver
    readonly meteo = computed(() => this.pageContent() as MeteoData | null);
}
```

Niente signal aggiuntivi, niente effect, niente override. `pageContent()` vale
già sia per SSR che per i cambi lingua successivi.

### Override esplicito del resolver

Se una pagina ha logica incompatibile con lo switch centrale, dichiarare
`resolve` esplicitamente in `site.ts` — il resolver automatico non viene applicato:

```typescript
// site.ts
{
    pageType: PageType.MiaPagina,
    resolve: { contentByResolve: mioResolverCustom() },
    ...
}
```

### Estendere in un progetto figlio

Il progetto figlio registra la propria versione del servizio nel DI:

```typescript
// app.config.ts del figlio
{ provide: ContentResolver, useClass: ChildContentResolverService }
```

```typescript
// ChildContentResolverService
override async loadResolved(pageType: PageType, lang?: string): Promise<any> {
    switch (pageType) {
        case PageType.GeneratoreMeteo:
            return this.api.getMeteo(lang);
        default:
            return super.loadResolved(pageType, lang); // delega al padre per le Policy
    }
}
```

`contentLoaderResolver` (usato da `app.routes.ts`) chiama `inject(ContentResolver)`,
quindi usa automaticamente la versione del figlio senza toccare nulla nell'engine.

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

### Cosa fare

```typescript
// ✅ isPlatformBrowser — il modo ufficiale Angular
private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

metodo(): void {
    if (!this.isBrowser) return;
    // codice browser-only
}
```

### Dove mettere il codice DOM

- **`ngAfterViewInit`**: non viene chiamato lato server → sicuro per accesso DOM
- **Event handler / `@HostListener`**: non vengono scatenati lato server → sicuri
- **`constructor` / `ngOnInit`**: vengono eseguiti lato server → richiedono guard

---

## Meta SEO e SSR

`AppTitleStrategy` imposta `<title>` e `<meta name="description">` ad ogni
navigazione, leggendo `title` e `description` dalla configurazione della pagina
in `site.ts`. Sono disponibili tre pattern, in ordine di semplicità.

---

### Pattern A — Stringhe statiche in `site.ts` *(zero codice nel componente)*

```typescript
// site.ts
{
    path: 'generatori/incel',
    title: 'Generatore Incel',            // stringa letterale → titolo in <title>
    description: 'Genera il tuo incel',   // stringa letterale → <meta description>
    renderMode: 'server',
    ...
}
```

`AppTitleStrategy` accetta sia chiavi i18n (`'miaPagina'` → tradotto) sia stringhe
letterali (`'Generatore Incel'` → usato direttamente). Non serve nessun resolver,
nessun `input()`, nessun `effect()` nel componente.

**Usarlo quando:** il titolo e la descrizione sono fissi e noti in `site.ts`.

---

### Pattern B — Dati da API tramite resolver *(per contenuto dinamico)*

```typescript
// site.ts
{
    renderMode: 'server',
    resolve: { post: () => inject(ApiService).getPost() },
    ...
}

// componente
readonly post = input<Post | null>(null);

constructor() {
    effect(() => {
        const p = this.post();
        if (!p) return;
        this.pageMeta.setTitle(`${p.titolo} | ${ContestoSito.config.appName}`, p.descrizione);
    });
}

ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;  // API client-only
    // caricamento aggiuntivo lato browser se necessario
}
```

> ⚠️ **Non usare `afterNextRender`** per avviare chiamate API: interferisce con
> il binding degli `input()` in SSR e causa lo stato null al primo render.
> Usare sempre `ngOnInit` + `isPlatformBrowser`.

**Usarlo quando:** il titolo o la descrizione vengono da un'API e cambiano per
ogni richiesta (es. pagina dettaglio di un articolo).

---

### Pattern C — Mappa statica per tipo di pagina *(dati fissi per PageType)*

```typescript
// componente
private static readonly META: Partial<Record<PageType, { name: string; desc: string }>> = {
    [PageType.GeneratorIncel]: { name: 'Generatore Incel', desc: 'Genera il tuo incel' },
    [PageType.GeneratorAuto]:  { name: 'Generatore Auto',  desc: 'Genera automobilisti' },
};

readonly meta = computed(() => MioComp.META[this.pageType()] ?? null);

constructor() {
    effect(() => {
        const m = this.meta();
        if (!m) return;
        this.pageMeta.setTitle(`${m.name} | ${ContestoSito.config.appName}`, m.desc);
    });
}
```

`pageType` è un `input.required` iniettato da `route.data` in modo sincrono:
è sempre disponibile prima del primo render, in SSR e nel browser.
`computed()` da `pageType()` è quindi sempre non-null per i PageType noti.

**Usarlo quando:** lo stesso componente serve più PageType con metadati diversi
e i dati sono tutti noti a compile-time (non servono chiamate API).

---

### Quale scegliere?

| Caso | Pattern |
|------|---------|
| Titolo e descrizione fissi, gestiti in `site.ts` | **A** |
| Titolo/descrizione da API (SEO per crawler) | **B** |
| Un componente, N PageType con dati statici diversi | **C** |
| Titolo dinamico che aggiorna anche dopo l'idratazione | **B** o **C** + `effect()` |

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
