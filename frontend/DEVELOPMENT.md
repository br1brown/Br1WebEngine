# Frontend, Guida allo sviluppo

Questa guida è rivolta a chi usa Br1WebEngine come template base e vuole estenderlo: aggiungere pagine, servizi, componenti o endpoint seguendo i pattern già stabiliti.

**Se non conosci Angular**, questa guida spiega ogni passo nel dettaglio: il perché di ogni scelta, dove si trovano i file, cosa fa ogni classe o metodo citato. Se lo conosci già, i pattern ti sembreranno familiari ma più compatti del solito grazie a `PageBaseComponent`, che elimina il boilerplate ripetitivo da ogni pagina.

Per l'overview del progetto, la configurazione e il deploy → [`README.md`](../README.md).  
Per i pattern lato backend → [`backend/DEVELOPMENT.md`](../backend/DEVELOPMENT.md).

---

## Sommario

- [1. Primi Passi (Developer Journey)](#1-primi-passi-developer-journey)
  - [Mappa del progetto](#mappa-del-progetto)
  - [Configurazione del sito (site.ts)](#configurazione-del-sito-sitets)
    - [Come funziona il builder](#come-funziona-il-builder)
    - [Campi di setSiteConfiguration](#campi-di-setsiteconfiguration)
    - [Campi opzionali di una LeafPage](#campi-opzionali-di-una-leafpage)
    - [Navigazione](#navigazione)
    - [Pagine Legali Centralizzate (_createPolicy)](#pagine-legali-centralizzate-createpolicy)
    - [PageType e getPath](#pagetype-e-getpath)
  - [Aggiungere una pagina](#aggiungere-una-pagina)
    - [1. Aggiungere il valore all'enum `PageType`](#1-aggiungere-il-valore-allenum-pagetype)
    - [2. Registrare la pagina in `defineSitePages`](#2-registrare-la-pagina-in-definesitepages)
    - [3. Generare il componente pagina](#3-generare-il-componente-pagina)
    - [4. Aggiungere al menu (opzionale)](#4-aggiungere-al-menu-opzionale)
  - [Aggiungere un componente](#aggiungere-un-componente)
    - [Component o directive?](#component-o-directive)
    - [Pattern base](#pattern-base)
    - [Passi completi per generare un componente condiviso](#passi-completi-per-generare-un-componente-condiviso)
  - [Aggiungere una direttiva](#aggiungere-una-direttiva)
    - [Directive con event handler](#directive-con-event-handler)
    - [Directive che calcola un attributo (src/href)](#directive-che-calcola-un-attributo-srchref)
  - [Aggiungere un servizio](#aggiungere-un-servizio)
    - [Pattern base](#pattern-base)
    - [Regole per i servizi](#regole-per-i-servizi)
    - [Inject vs costruttore](#inject-vs-costruttore)
- [2. Core Engine (Sotto il cofano)](#2-core-engine-sotto-il-cofano)
  - [Aggiungere un endpoint API](#aggiungere-un-endpoint-api)
    - [Passo 1, Definire il tipo di risposta](#passo-1definire-il-tipo-di-risposta)
    - [Passo 2, Aggiungere il path alla costante `API`](#passo-2aggiungere-il-path-alla-costante-api)
    - [Passo 3, Aggiungere il metodo pubblico in `ApiService`](#passo-3aggiungere-il-metodo-pubblico-in-apiservice)
    - [Passo 4, Usarlo nel componente pagina](#passo-4usarlo-nel-componente-pagina)
  - [Gestione errori HTTP (Pagine vs Risorse API)](#gestione-errori-http-pagine-vs-risorse-api)
    - [Pattern Override per le API](#pattern-override-per-le-api)
    - [Contratto di Errore (Pagine vs Risorse API)](#contratto-di-errore-pagine-vs-risorse-api)
    - [L'errore si propaga comunque](#lerrore-si-propaga-comunque)
    - [Aggiungere testi i18n per un nuovo codice (o Add-on)](#aggiungere-testi-i18n-per-un-nuovo-codice-o-add-on)
  - [Autenticazione JWT (login)](#autenticazione-jwt-login)
    - [Flusso completo di login](#flusso-completo-di-login)
    - [Proteggere una pagina (route guard)](#proteggere-una-pagina-route-guard)
    - [Configurare la pagina di redirect (401)](#configurare-la-pagina-di-redirect-401)
    - [Leggere lo stato di login in un componente](#leggere-lo-stato-di-login-in-un-componente)
  - [Pattern dei Signal](#pattern-dei-signal)
    - [Riepilogo dei tipi](#riepilogo-dei-tipi)
    - [Gestione dei dati derivati (computed)](#gestione-dei-dati-derivati-computed)
    - [Signal + ngModel (binding bidirezionale)](#signalngmodel-binding-bidirezionale)
    - [Signal + `effect()` con reattività a un altro signal](#signaleffect-con-reattivit-a-un-altro-signal)
  - [Internazionalizzazione (i18n)](#internazionalizzazione-i18n)
    - [Pattern Add-on per le Traduzioni](#pattern-add-on-per-le-traduzioni)
  - [Tema e stile](#tema-e-stile)
    - [ThemeService](#themeservice)
    - [Sistema CSS con color-mix()](#sistema-css-con-color-mix)
    - [CSS scoping nei componenti standalone](#css-scoping-nei-componenti-standalone)
    - [FontConfig](#fontconfig)
- [3. Produzione, SEO & Compliance](#3-produzione-seocompliance)
  - [Regole SSR](#regole-ssr)
    - [Cosa NON fare](#cosa-non-fare)
    - [Cosa fare nei componenti pagina](#cosa-fare-nei-componenti-pagina)
    - [Cosa fare nei servizi](#cosa-fare-nei-servizi)
    - [Dove mettere il codice DOM](#dove-mettere-il-codice-dom)
  - [Meta SEO e SSR](#meta-seo-e-ssr)
    - [Come funziona](#come-funziona)
    - [`PageMetaService.setPageMeta()`](#pagemetaservicesetpagemeta)
  - [Resolver automatico dei contenuti](#resolver-automatico-dei-contenuti)
    - [Come funziona](#come-funziona)
    - [Aggiungere contenuto a una nuova pagina](#aggiungere-contenuto-a-una-nuova-pagina)
    - [Meta SEO dinamici (titolo/descrizione da API)](#meta-seo-dinamici-titolodescrizione-da-api)
    - [Estendere in un progetto figlio](#estendere-in-un-progetto-figlio)
  - [Gestione cookie e consenso GDPR](#gestione-cookie-e-consenso-gdpr)
    - [Due cookie gestiti automaticamente dal servizio](#due-cookie-gestiti-automaticamente-dal-servizio)
    - [Aggiungere un cookie di progetto](#aggiungere-un-cookie-di-progetto)
    - [Aggiungere un side effect al consenso](#aggiungere-un-side-effect-al-consenso)
    - [Leggere lo stato del consenso in un componente](#leggere-lo-stato-del-consenso-in-un-componente)
    - [Riepilogo delle API pubbliche](#riepilogo-delle-api-pubbliche)
    - [Tabella cookie nei file Markdown legali](#tabella-cookie-nei-file-markdown-legali)
  - [Cookie utilizzati](#cookie-utilizzati)
    - [Auto-disabilitazione della pagina Cookie Policy](#auto-disabilitazione-della-pagina-cookie-policy)
  - [Accessibilità](#accessibilit)
    - [Quattro livelli di protezione automatici](#quattro-livelli-di-protezione-automatici)
    - [Regole ESLint, errori bloccanti](#regole-eslinterrori-bloccanti)
    - [Checklist, prima di considerare un componente completo](#checklistprima-di-considerare-un-componente-completo)
    - [aria-label, property binding, non interpolazione](#aria-labelproperty-binding-non-interpolazione)
    - [Link esterni](#link-esterni)
    - [Form, label associate](#formlabel-associate)
    - [Overlay e dialog](#overlay-e-dialog)
    - [Design token, colori e focus sempre da variabile CSS](#design-tokencolori-e-focus-sempre-da-variabile-css)
    - [Audit WCAG a runtime](#audit-wcag-a-runtime)
- [Audit accessibilità su un server in esecuzione (auto-scopre le pagine da /health)](#audit-accessibilit-su-un-server-in-esecuzione-auto-scopre-le-pagine-da-health)
- [Audit Lighthouse (performance, a11y, best-practices, seo)](#audit-lighthouse-performance-a11y-best-practices-seo)
- [Suite completa (lint → tsc → i18n → a11y → lighthouse)](#suite-completa-linttsci18na11ylighthouse)
- [Nel deploy post-produzione](#nel-deploy-post-produzione)
  - [Asset e ottimizzazione immagini](#asset-e-ottimizzazione-immagini)
    - [Aggiungere un nuovo file (immagine, PDF, video…)](#aggiungere-un-nuovo-file-immagine-pdf-video)
    - [Uso in template, directive](#uso-in-templatedirective)
    - [Uso programmatico](#uso-programmatico)
  - [Build e script](#build-e-script)
    - [Iniezione variabili d'ambiente a runtime (Docker)](#iniezione-variabili-dambiente-a-runtime-docker)
- [4. Reference Toolkit (Libreria degli Strumenti)](#4-reference-toolkit-libreria-degli-strumenti)
  - [Servizi disponibili](#servizi-disponibili)
  - [Componenti e directive disponibili](#componenti-e-directive-disponibili)
    - [Directive](#directive)
    - [Componenti](#componenti)
    - [Pipe](#pipe)
    - [ImgBuilderService, dettaglio](#imgbuilderservicedettaglio)
    - [QrCodeService, dettaglio](#qrcodeservicedettaglio)
    - [ShareService, dettaglio](#shareservicedettaglio)
    - [Pagine legali](#pagine-legali)
    - [Accessibilità integrata](#accessibilit-integrata)


---

# 1. Primi Passi (Developer Journey)

## Mappa del progetto

```
src/
├── app/
│   ├── app.component.*         ← shell: router-outlet, cookie banner, smoke effect
│   ├── app.config.ts           ← bootstrap: providers, HttpClient, session restore
│   ├── app.config.server.ts    ← override SSR: URL backend assoluto, API key server-side
│   ├── app.routes.ts           ← routing generato da site.ts + authGuard (non toccare)
│   ├── site.ts                 ← ★ configurazione dichiarativa: pagine, menu, PageType
│   │
│   ├── core/
│   │   ├── dto/                ← tipi TypeScript delle risposte API
│   │   │   ├── api.dto.ts      ← LoginResult e tipi globali
│   │   │   └── profile.dto.ts  ← Profile (esempio: aggiungi qui i tuoi DTO)
│   │   ├── services/
│   │   │   ├── api.service.ts  ← ★ unico client HTTP: un metodo per endpoint
│   │   │   └── auth.service.ts ← TokenService + AuthService (login/logout/token)
│   │   └── engine/             ← codice del motore, non modificare
│   │       ├── siteBuilder.ts
│   │       ├── services/       ← asset, img-builder, notification, page-meta,
│   │       │                      qr-code, share, speech, theme, translate,
│   │       │                      version-check, base-api, cookie-consent
│   │       ├── directives/     ← asset, context-menu, img-render, page, qr-render
│   │       ├── pipes/          ← markdown, translate
│   │       ├── scripts/        ← generate-statics, generate-icons
│   │       └── server/         ← server.ts, server-env.ts, preview-crypto.server.ts
│   │
│   ├── components/
│   │   ├── layout/             ← componenti sempre visibili (non sono pagine)
│   │   │   ├── navbar/         ← navbar responsiva con dropdown e menu mobile
│   │   │   ├── footer/         ← footer con nav e profilo
│   │   │   └── smoke-effect/   ← effetto decorativo canvas
│   │   └── shared/             ← ★ aggiungi qui i tuoi componenti condivisi
│   │       ├── back-to-top/
│   │       ├── context-menu/   ← overlay + directive
│   │       ├── cookie-banner/
│   │       ├── footer-nav/
│   │       ├── loading/
│   │       ├── nav-dropdown/
│   │       ├── nav-link/
│   │       ├── profile-render/
│   │       └── social-link/
│   │
│   └── pages/                  ← una cartella per ogni pagina
│       ├── page-base.component.ts ← ★ classe base per tutte le pagine
│       ├── content.resolver.ts    ← resolver automatico contenuti (non toccare)
│       ├── home/               ← pagina home (esempio e showcase dell'engine)
│       ├── policy/             ← pagine legali (privacy, cookie, TOS, legal)
│       ├── social/             ← pagina link social
│       └── error/              ← pagina errore (404, 401, 500 ecc.)
│
└── assets/
    ├── i18n/
    │   ├── basic.it.json       ← traduzioni engine (errori, UI comuni), non toccare
    │   ├── basic.en.json
    │   ├── addon.it.json       ← ★ traduzioni di progetto, aggiungi qui le tue chiavi
    │   └── addon.en.json
    ├── legal/                  ← testi legali in Markdown, una coppia per lingua
    └── files/                  ← immagini statiche e favicon
```

**I file contrassegnati con ★ sono i punti di ingresso principali del progetto:**
- `site.ts`, per aggiungere pagine, voci di menu, route protette
- `core/dto/`, per i tipi delle risposte API
- `core/services/api.service.ts`, per i metodi HTTP verso il backend
- `pages/page-base.component.ts`, da estendere per ogni nuova pagina
- `components/shared/`, per i componenti condivisi riutilizzabili
- `assets/i18n/addon.*.json`, per le traduzioni di progetto

---

## Configurazione del sito (site.ts)

### Come funziona il builder

`src/app/site.ts` è **l'unico file da toccare** per configurare il sito. Usa quattro chiamate sul builder:

```typescript
// src/app/site.ts
siteFondamentaBuilder.setSiteConfiguration({ appName, colorTema, defaultLang, ... });
siteFondamentaBuilder.defineSitePages([ /* array di pagine */ ]);
siteFondamentaBuilder.configureHeaderNavigation(h => { h.addPage(...); h.addGroup(...); });
siteFondamentaBuilder.configureFooterNavigation(f => { f.addPage(...); });
```

Internamente `buildSite` lavora in tre fasi:

1. **Dichiarazione**, l'utente descrive il sito con tipi `*Input` e campi opzionali
2. **Normalizzazione**, il builder deduce `kind` dalla struttura (`children` → parent, `component` → leaf, `externalUrl` → external), valida la coerenza e costruisce la mappa `PageType → path`. PageType duplicati o path duplicati generano un errore a build time
3. **Generazione**, produce rotte Angular, `NavLink[]` per header/footer (con flag `isExternal`), `getPath(PageType)` e `getSitemapEntries()`

Il risultato (`ContestoSito`) viene consumato da router, navbar, footer e script di build.

### Campi di setSiteConfiguration

| Campo | Obbligatorio | Effetto |
|--|--|--|
| `appName` | sì | Nome in navbar, titoli e PWA manifest |
| `version` | no | Versione canonica dell'app (default: `"1.0.0"`). A build time `generate-statics.ts` la scrive nel meta `app-version`, nel `manifest.webmanifest` e indirettamente negli hash di NGSW. A runtime `VersionCheckService` la confronta via polling sul manifest (tab browser) + `SwUpdate.versionUpdates` (PWA installata). Concorre anche alla cache key server-side delle preview OG |
| `defaultLang` | sì | Lingua di fallback |
| `availableLanguages` | no | Tag BCP 47 validati a build time (es. `['it', 'en']`); se omesso il sito è monolingua |
| `description` | sì | Meta description globale (fallback per pagine senza `description` propria) |
| `colorTema` | sì | Colore hex principale; genera contrasto WCAG, tono e CSS var |
| `showFooter` | no | Mostra/nasconde footer (default: `true`) |
| `showNav` | no | Mostra/nasconde navbar (default: `true`) |
| `fixedTopHeader` | no | Navbar fissa in cima allo scroll (default: `false`) |
| `smoke` | no | Effetto particellare su canvas. Campi: `enable`, `color`, `opacity`, `maximumVelocity`, `particleRadius`, `density`, tutti opzionali |

### Campi opzionali di una LeafPage

| Campo | Obbligatorio | Effetto |
|--|--|--|
| `requiresAuth: true` | no | Aggiunge guard JWT; forza `renderMode: 'client'` |
| `layout: { showPanel: false }` | no | Pagina a schermo intero (no pannello centrale) |
| `layout: { showNav: false }` | no | Nasconde la navbar esclusivamente su questa pagina (subordinato al globale `showNav`) |
| `layout: { showFooter: false }` | no | Nasconde il footer esclusivamente su questa pagina (subordinato al globale `showFooter`) |
| `renderMode: 'client'` | no | Esclusivamente browser, usare per pagine interattive incompatibili con SSR |
| `renderMode: 'server'` | no | HTML generato a ogni richiesta lato server (default se non dichiarato) |
| `description` | no | Chiave i18n o stringa per meta description e sitemap |
| `otherSEO: { ogImage }` | no | ID asset statico / `false` (nessuna immagine) / omesso (preview dinamica) |
| `otherSEO: { ogType }` | no | `og:type` (es. `'article'`). Default: `'website'` |
| `otherSEO: { structuredDataType }` | no | `@type` del JSON-LD (es. `'Article'`). Default: `'WebPage'` |
| `data` | no | Dati arbitrari passati al componente via `route.data` |

### Navigazione

Tre metodi disponibili in `configureHeaderNavigation` / `configureFooterNavigation`:

```typescript
h.addPage(PageType.X)                       // voce singola, path risolto dalla mappa interna
h.addGroup('chiaveI18n', g => { ... })      // dropdown; sparisce se tutti i figli sono disabilitati
h.addLink('chiaveI18n', '/path-o-url')      // link diretto a URL arbitrario
```

### Pagine Legali Centralizzate (_createPolicy)

Per garantire la conformità normativa (es. GDPR), la configurazione delle pagine legali non è inserita direttamente nell'array principale, ma è generata dalla funzione `_createPolicy()`.
Questa funzione restituisce un blocco pre-configurato per `PrivacyPolicy`, `CookiePolicy`, `TermsOfService` e `LegalNotice`. In questo modo la configurazione delle policy è raggruppata in un unico punto, garantendo che i progetti derivati abbiano le dichiarazioni obbligatorie incluse "by default" e correttamente associate al `PageType` e ai componenti `PolicyComponent` dedicati.

### PageType e getPath

`ContestoSito.getPath(PageType.X)` restituisce il path di una pagina per costruire link interni. Restituisce `null` se la pagina è disabilitata o non registrata, non finisce mai silenziosamente in un `href` sbagliato. Usa sempre il fallback:

```typescript
const path = ContestoSito.getPath(PageType.X) ?? '/';
```

---

## Aggiungere una pagina

Il sistema di routing è interamente dichiarativo: non si modifica `app.routes.ts` a mano. Si descrive la pagina in `site.ts` e il router, il menu, il footer e la sitemap si aggiornano da soli.

Ci sono esattamente **tre passi obbligatori**: enum → `site.ts` → componente, più un passo opzionale per il menu.

### 1. Aggiungere il valore all'enum `PageType`

**Perché questo passo?** Ogni pagina è identificata da un valore dell'enum `PageType`, non da una stringa libera. Questo significa che se in futuro cambi il path URL (`'mia-pagina'` → `'la-mia-pagina'`), cambi una riga sola in `defineSitePages` e tutti i link interni costruiti con `ContestoSito.getPath(PageType.MiaNuovaPagina)` restano validi automaticamente. Con le stringhe libere dovresti cercare e sostituire in tutto il progetto.

**Dove si trova il file:** `src/app/site.ts`, è il file di configurazione centrale del sito. Trovi l'enum `PageType` in cima.

```typescript
// src/app/site.ts
export enum PageType {
    Home,
    Social,
    // ...
    MiaNuovaPagina,   // ← aggiunto qui
}
```

### 2. Registrare la pagina in `defineSitePages`

**Perché questo passo?** La registrazione in `defineSitePages` è ciò che trasforma un valore dell'enum in una pagina vera: associa il path URL, le chiavi i18n per titolo e descrizione, il componente da caricare, e tutti i metadati opzionali (auth, SEO, render mode). Il builder legge questo array e genera automaticamente le rotte Angular, le voci del menu, la sitemap.

**Dove si trova il file:** Sempre `src/app/site.ts`, dentro la chiamata `defineSitePages([...])`.

```typescript
// src/app/site.ts, dentro defineSitePages([...])
{
    path: 'mia-pagina',
    title: 'miaPagina',          // chiave i18n, tradotta automaticamente nei meta tag
    description: 'miaPaginaDesc', // chiave i18n, usata come meta description
    enabled: true,               // false = pagina ignorata: no rotta, no menu, no sitemap
    pageType: PageType.MiaNuovaPagina,
    component: () => import('./pages/mia-pagina/mia-pagina.component')
                         .then(m => m.MiaPaginaComponent),
    // Il lazy import divide il bundle: il codice della pagina viene scaricato
    // esclusivamente quando l'utente naviga verso di essa, non all'avvio dell'app.
}
```

Campi opzionali utili:

| Campo | Default | Obbligatorio | Quando usarlo |
|----|-----|--|--------|
| `requiresAuth: true` |, | no | Aggiunge il guard JWT; redirect a `/error/401` se non loggato. Forza automaticamente `renderMode: 'client'` (i bot non possono fare login) |
| `layout: { showPanel: false }` | `true` | no | Pagina a tutto schermo senza il pannello centrale (es. landing, social feed) |
| `layout: { showNav: false }` |, | no | Nasconde la navbar esclusivamente su questa pagina. Subordinato al globale: se `showNav` è `false` in `setSiteConfiguration`, questo flag non ha la capacità di riattivarla |
| `layout: { showFooter: false }` |, | no | Nasconde il footer esclusivamente su questa pagina. Subordinato al globale: se `showFooter` è `false` in `setSiteConfiguration`, questo flag non ha la capacità di riattivarlo |
| `renderMode: 'server'` | `'server'` | no | Rendering a runtime lato server (default); l'HTML è completo per i crawler |
| `renderMode: 'client'` |, | no | Esclusivamente browser; da usare per pagine interattive incompatibili con SSR (canvas, WebRTC, ecc.) |
| `data: { chiave: valore }` |, | no | Dati statici aggiuntivi accessibili via `route.data` nel componente |
| `otherSEO: { ogImage }` |, | no | ID asset → og:image 1200×630 (immagine centrata + sfondo sfocato + favicon). `false` rimuove i tag og:image. Se omesso → preview dinamica |
| `otherSEO: { ogType }` | `'website'` | no | Valore di `og:type` (es. `'article'` per post di blog) |
| `otherSEO: { structuredDataType }` | `'WebPage'` | no | `@type` del JSON-LD inserito nella pagina (es. `'Article'`) |

### 3. Generare il componente pagina

**Perché estendere `PageBaseComponent`?** `PageBaseComponent<T>` è la classe base che ogni componente pagina deve estendere. Fa tre cose per te:
- Inietta e rende disponibili `this.api`, `this.translate`, `this.asset`, `this.notify`, non devi iniettarli di nuovo nel componente figlio.
- Gestisce i meta tag SEO (`<title>`, `og:title`, `og:description`, `og:image`, JSON-LD, canonical) in modo automatico e SSR-safe via `effect()`.
- Espone `this.pageContent()`, il segnale reattivo con il contenuto caricato dal resolver, già tipizzato con il generic `T`.

Il generic `T` descrive il tipo del contenuto che la pagina si aspetta dal resolver. È **obbligatorio** dichiararlo: se la pagina non ha contenuto dal resolver, usare `<void>`.

**Dove generare il file:** `src/app/pages/mia-pagina/mia-pagina.component.ts`. Ogni pagina ha la propria cartella dentro `src/app/pages/`.

```typescript
// src/app/pages/mia-pagina/mia-pagina.component.ts
import { Component, computed } from '@angular/core';
import { PageBaseComponent } from '../page-base.component';

// Interfaccia che descrive i dati che il resolver caricherà per questa pagina.
// Se la pagina non ha contenuto dal resolver, usa: PageBaseComponent<void>
interface MeteoData {
    temperatura: number;
    citta: string;
}

@Component({
    selector: 'app-mia-pagina',
    standalone: true,   // sempre standalone, niente NgModule nel progetto
    imports: [],
    templateUrl: './mia-pagina.component.html',
})
export class MiaPaginaComponent extends PageBaseComponent<MeteoData> {
    // pageContent() è già MeteoData | null, nessun cast necessario.
    // computed() deriva un nuovo signal da pageContent(): si ricalcola automaticamente
    // quando pageContent() cambia (es. al cambio lingua).
    readonly temperatura = computed(() => this.pageContent()?.temperatura ?? ',');
    readonly citta = computed(() => this.pageContent()?.citta ?? '');
}
```

Per le pagine senza contenuto dal resolver (es. una home page statica):

```typescript
// Il generic <void> indica esplicitamente che non c'è contenuto dal resolver.
// pageContent() varrà sempre null, non serve usarla.
export class HomeComponent extends PageBaseComponent<void> { }
```

Già disponibile da `PageBaseComponent` senza nessun `inject()` aggiuntivo:

| Proprietà | Tipo | Note |
|------|---|---|
| `this.translate` | `TranslateService` | Traduzioni e lingua corrente |
| `this.api` | `ApiService` | Chiamate HTTP al backend |
| `this.asset` | `AssetService` | URL degli asset statici |
| `this.notify` | `NotificationService` | Toast, dialog, conferme |
| `this.pageContent()` | `T \| null` | Contenuto dal resolver, già tipizzato |

`pageContent()` è un `computed` signal che vale `null` per le pagine senza contenuto, e si aggiorna automaticamente a ogni cambio lingua nel browser (il resolver viene rieseguito dal `PageBaseComponent` tramite un `effect()` che reagisce a `translate.currentLang()`).

### 4. Aggiungere al menu (opzionale)

**Dove si trova il file:** Ancora `src/app/site.ts`, nelle funzioni `configureHeaderNavigation` e `configureFooterNavigation`.

```typescript
// site.ts, dentro configureHeaderNavigation
h.addPage(PageType.MiaNuovaPagina);

// Oppure in un gruppo dropdown:
h.addGroup('labelGruppo', g => {
    g.addPage(PageType.MiaNuovaPagina);
});
```

Le pagine con `enabled: false` vengono escluse in automatico, anche dai gruppi. Non serve rimuoverle dalla navigazione manualmente.

---

## Aggiungere un componente

I componenti **condivisi** (usabili in più pagine) vanno in `src/app/components/shared/`.  
I componenti **specifici di una pagina** (usati esclusivamente lì) possono stare nella cartella della pagina stessa.

### Component o directive?

**Questo è un punto critico**: prima di generare un componente, valuta se una directive è più appropriata.

Un **componente** ha senso quando il template **compone più elementi HTML**, ha **branching condizionale** fra varianti di markup, o espone `<ng-content>` per proiettare contenuto esterno. Esempi reali nel template:
- `<app-nav-dropdown>`, compone `<details>`/`<summary>` + `<ul>` con i figli
- `<app-nav-link>`, alterna tre rami: `<a>` interno, `<span aria-current>` se la rotta è attiva, `<a target="_blank">` se è un link esterno
- `<app-profile-render>`, struttura complessa di label + valori con layout proprio

Una **directive** ha senso quando si vuole aggiungere comportamento o calcolare un attributo su un tag HTML già esistente.

**Anti-pattern da evitare**: un componente che renderizza esclusivamente un singolo elemento HTML con un attributo calcolato (es. esclusivamente `<img [src]>`). Questo causa tre problemi:
1. Si aggiunge un host element superfluo nel DOM.
2. Si perde la possibilità di applicare attributi standard (`class`, `alt`, `loading`, …) direttamente senza API custom.
3. I selettori CSS del componente padre non raggiungono più l'`<img>` reale perché Angular applica encapsulation view (vedi *CSS scoping nei componenti standalone*).

In questi casi una **directive** sul tag esistente è la soluzione corretta: `[appAsset]` su `<img>`, `[imgRender]` su `<img>`, `[qrContent]` su `<img>`.

### Pattern base

```typescript
// src/app/components/shared/mio-widget/mio-widget.component.ts
@Component({
    selector: 'app-mio-widget',
    standalone: true,    // sempre standalone, niente NgModule
    imports: [],         // qui si importano pipe, directive e altri componenti usati nel template
    templateUrl: './mio-widget.component.html',
})
export class MioWidgetComponent {
    // Le dipendenze si iniettano con inject(), non nel costruttore
    private readonly translate = inject(TranslateService);
}
```

Se il componente usa API browser (DOM, canvas, IntersectionObserver, ecc.):

```typescript
export class MioWidgetComponent implements AfterViewInit {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    ngAfterViewInit(): void {
        // ngAfterViewInit non viene chiamato in SSR, di conseguenza è sicuro per accesso al DOM.
        // Il guard isPlatformBrowser aggiunge un livello extra di sicurezza.
        if (!this.isBrowser) return;
        // Accesso sicuro al DOM
    }
}
```

### Passi completi per generare un componente condiviso

#### 1. Generare il file TypeScript

**Dove si trova il file:** `src/app/components/shared/mio-widget/mio-widget.component.ts`. Ogni componente ha la propria cartella con lo stesso nome del componente.

`input.required<string>()` è un input obbligatorio: Angular dà errore a compile time se il padre non lo passa. `input<boolean>(true)` è un input opzionale con valore di default `true`.

```typescript
// src/app/components/shared/mio-widget/mio-widget.component.ts
import { Component, inject, input } from '@angular/core';
import { TranslateService } from '../../../core/engine/services/translate.service';
import { TranslatePipe } from '../../../core/engine/pipes/translate.pipe';

@Component({
    selector: 'app-mio-widget',
    standalone: true,
    imports: [TranslatePipe],   // TranslatePipe serve per usare | translate nel template
    templateUrl: './mio-widget.component.html',
})
export class MioWidgetComponent {
    private readonly translate = inject(TranslateService);

    /** Titolo da mostrare nel widget. Obbligatorio: il padre deve passarlo. */
    readonly titolo = input.required<string>();

    /** Mostra o nasconde il contenuto opzionale. Opzionale: default true. */
    readonly visibile = input<boolean>(true);
}
```

#### 2. Generare il template HTML

**Dove si trova il file:** `src/app/components/shared/mio-widget/mio-widget.component.html`.

Gli input signal si leggono con la sintassi `input()` (con le parentesi), sono funzioni che restituiscono il valore corrente. `@if` e `@for` sono la nuova sintassi di controllo del flusso di Angular 17+ (più leggibile della vecchia `*ngIf`/`*ngFor`).

```html
<!-- src/app/components/shared/mio-widget/mio-widget.component.html -->
<div class="card">
    <div class="card-header">
        <!-- titolo() legge il valore dell'input signal -->
        <h3>{{ titolo() }}</h3>
    </div>

    @if (visibile()) {
        <div class="card-body">
            <!-- | translate: pipe reattiva, si aggiorna al cambio lingua senza refresh -->
            <p>{{ 'widgetContenuto' | translate }}</p>
        </div>
    }
</div>
```

#### 3. Importarlo nel componente o pagina che lo usa

**Perché questo passo?** Con i componenti standalone, ogni componente dichiara esplicitamente le proprie dipendenze nell'array `imports`. Angular usa questa lista per il tree-shaking (rimuovere dal bundle il codice non usato) e per la verifica a compile time dei template.

Nel file `.ts` del componente/pagina che deve includere `<app-mio-widget>`:

```typescript
// src/app/pages/home/home.component.ts
import { Component, computed } from '@angular/core';
import { PageBaseComponent } from '../page-base.component';
import { MioWidgetComponent } from '../../components/shared/mio-widget/mio-widget.component';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [MioWidgetComponent],   // ← aggiunto qui
    templateUrl: './home.component.html',
})
export class HomeComponent extends PageBaseComponent<void> {
    // this.translate è già disponibile da PageBaseComponent, nessun inject aggiuntivo.
    // computed() genera un signal derivato: si ricalcola automaticamente al cambio lingua.
    readonly titoloWidget = computed(() =>
        this.translate.translate('widgetTitolo')
    );
}
```

Nel template del componente che lo usa:

```html
<!-- home.component.html -->
<app-mio-widget [titolo]="titoloWidget()" [visibile]="true" />
```

---

## Aggiungere una direttiva

Le directive aggiungono comportamento a elementi HTML esistenti senza introdurre elementi wrapper. Sono ideali per modificare attributi, reagire a eventi, o calcolare proprietà su tag HTML standard.

### Directive con event handler

**Dove generare il file:** `src/app/core/directives/mia.directive.ts`.

`@HostListener` intercetta un evento sull'elemento host della direttiva. Non viene scatenato lato server, di conseguenza è naturalmente SSR-safe, il guard `isPlatformBrowser` è un ulteriore livello di sicurezza per codice browser-only esplicito.

```typescript
// src/app/core/directives/mia.directive.ts
import { Directive, HostListener, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// [appMia] è l'attributo selector: si usa come <div appMia> o <button appMia>
@Directive({
    selector: '[appMia]',
    standalone: true,
})
export class MiaDirective {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    // '$event' nell'array passa l'oggetto evento al parametro del metodo.
    @HostListener('click', ['$event'])
    onClick(event: MouseEvent): void {
        if (!this.isBrowser) return;
        // logica eseguita esclusivamente nel browser
    }
}
```

Se la direttiva deve accedere all'elemento host o al suo parent nel DOM, usare `ViewContainerRef`:

```typescript
private readonly vcr = inject(ViewContainerRef);
// vcr.element.nativeElement, elemento HTML su cui è applicata la direttiva
```

### Directive che calcola un attributo (src/href)

Questo è il pattern dominante nel template per gli "atomi presentazionali": la direttiva reagisce a un input via signal/computed e aggiorna automaticamente un attributo dell'host. Il vantaggio è che l'elemento host (es. `<img>`) conserva tutti i suoi attributi standard (`alt`, `class`, `loading`, `width`) senza bisogno di una API custom.

```typescript
// src/app/core/directives/mia.directive.ts
@Directive({
    selector: 'img[appMia]',                  // selector vincolato al tag img
    standalone: true,
    host: { '[src]': 'src()' },               // host binding: aggiorna [src] quando src() cambia
})
export class MiaDirective {
    private readonly mio = inject(MioService);

    // input.required(): il padre deve passare questo valore
    readonly appMia = input.required<MioConfig>();

    // computed() calcola src() ogni volta che appMia() o lo stato del servizio cambiano
    protected readonly src = computed(() => this.mio.compute(this.appMia()));
}
```

Per rendering **asincrono** (canvas, blob, API esterne): usare `effect()` + un `signal` interno per `src`, con un *render token* monotono per evitare race condition quando build sovrapposte si "sorpassano". Se il consumer ha bisogno di accedere a stati derivati (blob originale, canvas raw, errore tradotto), esporli via `output()` (funzionano anche cross-template, i template reference no).

**`$event` negli output non è un DOM event.** A differenza di `(click)` o `(input)` dove `$event` è un `MouseEvent`/`InputEvent`, negli `output()` Angular `$event` è esattamente il valore passato a `.emit()`, di conseguenza il tipo concreto dichiarato nel generic (`Blob | null`, `HTMLCanvasElement | null`, ecc.). Nel template si usa direttamente come valore: `(blobChange)="blob.set($event)"` assegna il `Blob` al signal senza nessun `.target` o `.detail`. Gli output sono anche completamente opzionali: se il consumer non li ascolta, la directive emette nel vuoto senza errori, utile quando serve esclusivamente il render dell'`<img>` senza accedere al blob o all'errore.

Vedi `AssetDirective` (sync), `ImgRenderDirective` e `QrRenderDirective` (async con output) come esempi completi.

> ⚠️ `output().emit()` durante `DestroyRef.onDestroy()` viene swallowed: se il consumer mantiene stato locale dagli output (blob, canvas) e poi rimuove l'host via `@if`, deve resettare i propri signal esplicitamente. La directive non ha la capacità di pulirli al momento della distruzione.

---

## Aggiungere un servizio

I servizi contengono la logica condivisa tra più componenti: comunicazione con API esterne, gestione di stato, calcoli riutilizzabili. In Angular, un servizio è una classe con `@Injectable` che il sistema di Dependency Injection (DI) istanzia e condivide tra tutti i componenti che la richiedono.

### Pattern base

**Dove generare il file:** `src/app/core/services/mio.service.ts`. La cartella `core/services/` contiene tutti i servizi dell'applicazione.

```typescript
// src/app/core/services/mio.service.ts
import { inject, Injectable, signal, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// providedIn: 'root' registra il servizio nell'iniettore radice:
// esiste una sola istanza per tutta l'app, condivisa da tutti i componenti.
// Non serve aggiungerlo ad alcun array providers[].
@Injectable({ providedIn: 'root' })
export class MioService {
    // PLATFORM_ID è un token che Angular inietta automaticamente.
    // isPlatformBrowser() restituisce true nel browser, false in SSR.
    // Questo pattern è necessario in tutti i servizi che accedono ad API browser.
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    // Lo stato reattivo usa signal(), non proprietà plain.
    // I componenti possono leggere questo signal direttamente nel template
    // senza async pipe né ChangeDetectorRef.
    readonly statoCorrente = signal<string>('iniziale');

    doSomething(): void {
        // Guard SSR: ogni accesso a window, document, localStorage, navigator,
        // matchMedia o qualsiasi API browser deve essere protetto da questo controllo.
        if (!this.isBrowser) return;

        // Logica che usa API browser in modo sicuro.
    }
}
```

### Regole per i servizi

**Guard SSR**: qualsiasi accesso a `window`, `document`, `localStorage`, `navigator`, `matchMedia` o qualsiasi API browser **deve** essere protetto da `isPlatformBrowser(inject(PLATFORM_ID))`. Non usare `typeof window !== 'undefined'`: non sfrutta il sistema di injection Angular e ha la capacità di causare problemi con il prerendering.

**Stato reattivo**: usare `signal<T>()` per lo stato mutabile del servizio, non proprietà plain. I componenti possono usare i signal direttamente nei template senza `async pipe` né `ChangeDetectorRef`.

**Non usare `effect()` per sincronizzare stato**: se un valore dipende da un altro signal, usare `computed()`. Usare `effect()` esclusivamente per effetti collaterali genuini (logging, chiamate esterne, scrittura DOM).

### Inject vs costruttore

Il progetto usa `inject()` (functional injection), non il costruttore con parametri. È più compatto e permette di usare le dipendenze direttamente come inizializzatori di proprietà (senza dover aspettare il costruttore):

```typescript
// ✅ Pattern del progetto, le dipendenze sono disponibili immediatamente come proprietà
private readonly http = inject(HttpClient);

// ❌ Non usare, richiede boilerplate e non si integra bene con inject() a livello di classe
constructor(private http: HttpClient) {}
```

---


---

# 2. Core Engine (Sotto il cofano)

## Aggiungere un endpoint API

Ogni endpoint del backend ha un metodo pubblico dedicato in `ApiService`. La regola è: **non chiamare mai `HttpClient` direttamente nei componenti**. Centralizzare le chiamate in `ApiService` significa che header di autenticazione, API key, gestione degli errori e URL resolution sono gestiti automaticamente da `BaseApiService`.

### Passo 1, Definire il tipo di risposta

**Perché questo passo?** Definire un'interfaccia per la risposta dell'endpoint rende il tipo di ritorno esplicito, abilita l'autocompletamento nell'IDE, e permette a TypeScript di verificare che stai usando i dati correttamente nel componente.

**Dove generare il file:** `src/app/core/dto/prodotto.dto.ts`. La cartella `core/dto/` raccoglie tutti i Data Transfer Object. Un file per DTO rende chiaro a quale endpoint corrisponde ogni tipo.

```typescript
// src/app/core/dto/prodotto.dto.ts
export interface Prodotto {
    id: string;
    nome: string;
    prezzo: number;
}
```

### Passo 2, Aggiungere il path alla costante `API`

**Perché questa costante?** La costante `API` in cima ad `api.service.ts` raccoglie tutti i path degli endpoint in un unico posto. Questo evita che lo stesso path stringa sia scritto in più posti (con possibili errori di battitura), e permette di vedere immediatamente tutti gli endpoint disponibili.

**Dove si trova il file:** `src/app/core/services/api.service.ts`, le prime righe del file.

Le funzioni freccia nella costante (es. `prodotto: (id) => \`prodotti/${id}\``) costruiscono URL con path parameter in modo che ogni chiamante non debba conoscere il formato del path.

```typescript
// src/app/core/services/api.service.ts, costante API in cima al file
const API = {
    social:   'social',
    profile:  'profile',
    login:    'auth/login',
    blob:     (slug: string) => `blob/${encodeURIComponent(slug)}`,
    // ↓ aggiunto
    prodotti: 'prodotti',
    prodotto: (id: string) => `prodotti/${encodeURIComponent(id)}`,
} as const;
```

### Passo 3, Aggiungere il metodo pubblico in `ApiService`

**Perché questo passo?** Il metodo pubblico è l'interfaccia che i componenti usano. Nasconde i dettagli di `HttpParams`, `firstValueFrom`, `catchError`, il componente chiama semplicemente `this.api.getProdotti()`.

**Dove si trova il file:** `src/app/core/services/api.service.ts`, dentro la classe `ApiService`. `ApiService` estende `BaseApiService`, che espone i metodi protetti `api_get`, `api_post` e `api_resource`.

- `api_get<T>(path)`, esegue una GET e restituisce una `Promise<T>`
- `api_post<T>(path, body)`, esegue una POST e restituisce una `Promise<T>`
- `api_resource<T>(path)`, restituisce un `HttpResourceRef<T | undefined>` con signal `.value()` e `.isLoading()` che si aggiornano automaticamente

**Gestione errori**:
- `api_get` e `api_post`, quando la richiesta fallisce, `BaseApiService.handleError()` mostra automaticamente la notifica all'utente via `NotificationService` e rilancia l'errore (la Promise viene rigettata). Non serve `try/catch` per la notifica; serve esclusivamente per gestire lo stato locale dopo il fallimento.
- `api_resource`, Angular's `httpResource` **non** passa per `handleError`. L'errore viene memorizzato nel signal `.error()` del resource. Nessuna notifica automatica: se si vuole avvisare l'utente, il componente deve osservare `.error()` esplicitamente (vedi Pattern b).

```typescript
// src/app/core/services/api.service.ts, dentro la classe ApiService
import { HttpParams } from '@angular/common/http';
import { Prodotto } from '../dto/prodotto.dto';

// --- variante 1: GET semplice ---
getProdotti(): Promise<Prodotto[]> {
    return this.api_get<Prodotto[]>(API.prodotti);
}

// --- variante 2: GET con query params (HttpParams) ---
// Costruisce ?categoria=elettronica&disponibile=true
getProdottiFiltrati(categoria: string, disponibile: boolean): Promise<Prodotto[]> {
    const params = new HttpParams()
        .set('categoria', categoria)
        .set('disponibile', String(disponibile));
    return this.api_get<Prodotto[]>(API.prodotti, params);
}

// --- variante 3: GET con path param (funzione nella costante API) ---
// API.prodotto(id) costruisce 'prodotti/abc-123'
getProdottoById(id: string): Promise<Prodotto> {
    return this.api_get<Prodotto>(API.prodotto(id));
}

// --- variante 4: POST con body ---
creaProdotto(payload: { nome: string; prezzo: number }): Promise<Prodotto> {
    return this.api_post<Prodotto>(API.prodotti, payload);
}

// --- variante 5: api_resource reattivo ---
// Restituisce HttpResourceRef<Prodotto[] | undefined> con i signal .value() e .isLoading().
// Si aggiorna automaticamente al cambio lingua (Accept-Language) e token JWT.
// Usare nei componenti persistenti (header, footer, sidebar) che devono restare aggiornati
// senza che il componente gestisca il ciclo di vita della chiamata.
// Non usare nelle pagine dove Promise + afterNextRender è sufficiente.
getProdottiResource() {
    return this.api_resource<Prodotto[]>(API.prodotti);
}
```

### Passo 4, Usarlo nel componente pagina

`this.api` è disponibile in tutti i componenti che estendono `PageBaseComponent`. Due pattern in base al caso d'uso:

**Pattern a, Promise in `afterNextRender` con signal locale**

Adatto per dati caricati una sola volta al montaggio del componente (es. lista prodotti, dettaglio articolo).

`afterNextRender` è la funzione Angular che garantisce l'esecuzione del codice esclusivamente nel browser, mai in SSR. Non è un hook del ciclo di vita dell'istanza: è una funzione che registra un callback che verrà eseguito dopo che Angular ha completato il primo render del componente nel browser. Questo la rende il posto ideale per le chiamate API che non devono girare in SSR.

```typescript
// src/app/pages/catalogo/catalogo.component.ts
import { Component, signal, afterNextRender } from '@angular/core';
import { PageBaseComponent } from '../page-base.component';
import { Prodotto } from '../../core/dto/prodotto.dto';

@Component({
    selector: 'app-catalogo',
    standalone: true,
    imports: [],
    templateUrl: './catalogo.component.html',
})
export class CatalogoComponent extends PageBaseComponent<void> {
    readonly prodotti = signal<Prodotto[]>([]);
    readonly loading  = signal(true);

    constructor() {
        super();   // necessario perché PageBaseComponent ha logica nel costruttore
        afterNextRender(() => {
            // this.api è ereditato da PageBaseComponent, già iniettato, pronto all'uso.
            this.api.getProdottiFiltrati('elettronica', true)
                .then(lista => this.prodotti.set(lista))
                .finally(() => this.loading.set(false));
                // .catch() non necessario per la notifica: api_get la gestisce già.
                // Se serve azzerare lo stato locale in caso di errore, usare .catch(() => null)
                // o un try-catch, ma NON chiamare notify.handleApiError() nel catch:
                // BaseApiService l'ha già invocato prima di rilanciare l'errore.
        });
    }
}
```

Nel template:

```html
<!-- catalogo.component.html -->
@if (loading()) {
    <app-loading [loading]="true" />
} @else {
    @for (p of prodotti(); track p.id) {
        <div class="card">{{ p.nome }}, {{ p.prezzo | currency }}</div>
    }
}
```

**Pattern b, `api_resource` come proprietà readonly**

Adatto per componenti persistenti (header, footer, widget) che devono restare aggiornati al cambio lingua o token senza logica aggiuntiva nel componente. Il resource si aggiorna da esclusivamente ogni volta che cambia un signal letto nella sua factory (lingua, token JWT).

```typescript
// src/app/components/shared/lista-prodotti/lista-prodotti.component.ts
import { Component, effect } from '@angular/core';
import { PageBaseComponent } from '../../../pages/page-base.component';

@Component({
    selector: 'app-lista-prodotti',
    standalone: true,
    imports: [],
    templateUrl: './lista-prodotti.component.html',
})
export class ListaProdottiComponent extends PageBaseComponent<void> {
    // Il resource si inizializza immediatamente e si aggiorna automaticamente.
    // Non serve afterNextRender, non serve un signal loading separato.
    readonly prodottiResource = this.api.getProdottiResource();

    constructor() {
        super();
        // api_resource NON chiama handleError automaticamente: l'errore va in .error().
        // Questo effect lo osserva e notifica l'utente quando il resource fallisce.
        effect(() => {
            const err = this.prodottiResource.error();
            if (err) this.notify.handleApiError((err as any).status, (err as any).error);
        });
    }
}
```

Nel template:

```html
<!-- lista-prodotti.component.html -->
@if (prodottiResource.isLoading()) {
    <app-loading [loading]="true" />
} @else if (prodottiResource.error()) {
    <!-- stato di errore: la notifica è già mostrata dall'effect nel componente -->
} @else {
    @for (p of prodottiResource.value() ?? []; track p.id) {
        <div class="card">{{ p.nome }}</div>
    }
}
```

---

## Gestione errori HTTP (Pagine vs Risorse API)

Esiste una netta separazione architetturale tra un errore di routing (l'utente visita una **Pagina** inesistente o vietata) e un errore API (il client HTTP richiede una **Risorsa** inesistente o vietata).

- **Errori di Pagina (Routing)**: Vengono gestiti da `ErrorComponent`. Questo componente legge i codici e cerca le chiavi `errore{status}Titolo` e `errore{status}Descrizione` (es. `errore404Titolo`). Se un utente visita una rotta per cui non ha permessi (es. `/impostazioni` senza auth), l'`authGuard` blocca la navigazione (mantenendolo nella rotta attuale) e mostra un popup esplicativo con la motivazione (sempre tramite `errore401Titolo`/`Descrizione`), o lo ridirige silenziosamente alla pagina di login se configurata (`pageForAuthGuard`).
- **Errori di Risorsa (API)**: Tutti gli errori HTTP innescati da `BaseApiService` passano attraverso `BaseApiService.handleError()`, che elabora l'eventuale payload RFC 9457 (`ProblemDetails`) e delega a `NotificationService.handleApiError()`. 

### Pattern Override per le API

`BaseApiService` applica un **override semantico** usando chiavi specifiche per le chiamate API (prefisso `risorsa`), garantendo che la modale di errore mostri messaggi mirati al contesto dei dati.

| Codice API | Chiavi i18n mappate in BaseApiService | Comportamento visivo |
|--|--|--|
| `400` con `errors` | n/a | Dialog SweetAlert2 con lista errori di validazione (ProblemDetails RFC 9457) |
| `401` | `risorsa401Titolo` / `risorsa401Descrizione` | Modale "Non autenticato: Impossibile caricare il dato..." |
| `403` | `risorsa403Titolo` / `risorsa403Descrizione` | Modale "Accesso negato: Non hai i privilegi..." |
| `404` | `risorsa404Titolo` / `risorsa404Descrizione` | Modale "Risorsa non trovata: L'elemento richiesto non esiste..." |
| Altro | `errore{status}Titolo` / `errore{status}Descrizione` | Fallback intelligente: se le chiavi mancano, usa `erroreGenerico` ({status}) e `erroreImprevisto`. |

Se il backend risponde con un oggetto `ProblemDetails` contenente `title` e `detail` valorizzati in modo esplicito, il frontend darà sempre priorità ai testi inviati dal backend (vedi backend `ApiException`). Il `NotificationService` sa riconoscere automaticamente se la stringa in arrivo dal backend è generica inglese e preferisce in quel caso i dizionari locali tradotti, controllando con precisione chirurgica le stringhe via TranslateService.

### Contratto di Errore (Pagine vs Risorse API)

Per distinguere visivamente e logicamente gli errori di navigazione dagli errori applicativi:
1. **Errori di Routing/Pagina**: Quando una pagina intera non esiste o è inaccessibile (es. URL digitato male o Guard non passata), le rotte di Angular usano chiavi generiche come `errore404` (es. "La pagina che cerchi non esiste").
2. **Errori API (Pattern Override)**: Quando una chiamata HTTP del `BaseApiService` fallisce, l'errore viene mostrato tramite modale (`NotificationService`). Per non usare lo stesso testo generico della pagina, il servizio estrae un "dettaglio" o un nome di risorsa dal backend e applica un prefisso. Ad esempio, un 404 su un'API cerca la chiave `risorsaNotFound` (es. "Impossibile caricare la risorsa richiesta").

Questo **contratto di errore** assicura che il backend possa inviare messaggi neutri ("user") e il frontend li traduca contestualmente in "Utente non trovato".

### L'errore si propaga comunque

Dopo aver mostrato la notifica, `handleError` rilancia l'errore con `throwError(() => error)`. Questo significa che la Promise restituita da `api_get` / `api_post` **viene rigettata**. Se il componente non cattura questo reject, Angular la tratta come un'eccezione non gestita (visibile in console).

Per ignorare il reject in modo esplicito:

```typescript
const data = await this.api.getProfile().catch(() => null);
if (!data) return; // la notifica è già stata mostrata
```

Per gestire il reject con logica specifica (es. ripristinare uno stato):

```typescript
try {
    await this.api.saveData(payload);
    this.success.set(true);
} catch {
    // La notifica è già stata mostrata da handleError.
    // Qui gestisci esclusivamente lo stato locale del componente.
    this.isSubmitting.set(false);
}
```

### Aggiungere testi i18n per un nuovo codice (o Add-on)

I testi degli errori sono in `frontend/src/assets/i18n/<lingua>.json`. Le chiavi seguono il pattern ObjectContext:

```json
"errore422Titolo": "Dati non processabili",
"errore422Descrizione": "Il server non ha potuto elaborare la richiesta."
```

In base all'architettura `TranslateService` (che unisce gli oggetti con `Object.assign`), un progetto figlio ha la capacità di sovrascrivere o generare queste chiavi direttamente nel file **`addon.it.json`**, e queste avranno la precedenza sul dizionario base! Se le chiavi per un codice non esistono affatto, il sistema ricade in sicurezza sulle stringhe definite dalle chiavi `erroreGenerico` e `erroreImprevisto`.

---

## Autenticazione JWT (login)

> Per il lato backend (generazione token, endpoint protetti, configurazione JWT) → [`backend/DEVELOPMENT.md, Endpoint protetti da login JWT`](../backend/DEVELOPMENT.md#endpoint-protetti-da-login-jwt).

L'autenticazione è gestita tramite due servizi con gerarchia stretta: `ApiService` usa `TokenService`; `AuthService` usa `ApiService`.

```
TokenService   ←  unica sorgente di verità sul token (signal + sessionStorage)
AuthService    ←  facciata di alto livello: login(), logout(), restoreSession()
BaseApiService ←  legge TokenService e aggiunge Authorization: Bearer <token> su ogni richiesta
```

### Flusso completo di login

**1. Chiamare il login dal componente**

```typescript
// In qualsiasi componente (es. una pagina di login)
import { inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({ ... })
export class LoginComponent {
    private readonly auth = inject(AuthService);

    async onSubmit(password: string) {
        const result = await this.auth.login(password);
        if (result.valid) {
            // Reindirizzare alla pagina protetta
        } else {
            // result.error contiene il messaggio dal backend
        }
    }
}
```

`AuthService.login()` chiama `ApiService.login()`, che invia `POST /api/auth/login` con body `{ pwd: "..." }`. Se il backend risponde con `{ valid: true, token: "..." }`, il token viene salvato in memoria (signal) e in `sessionStorage`. Se il token ricevuto fosse già scaduto o malformato, `login()` restituisce `{ valid: false }` senza salvarlo.

**2. Il token viene attaccato automaticamente**

`BaseApiService.build_api_Headers()` legge `tokenService.isLoggedIn()` prima di ogni richiesta. Se vero, aggiunge `Authorization: Bearer <token>` senza che il componente debba fare nulla. Funziona per `api_get`, `api_post` e `api_resource`.

**3. Il logout**

```typescript
this.auth.logout(); // rimuove token da memoria e sessionStorage
```

**4. La sessione sopravvive al refresh della pagina**

`app.config.ts` chiama `authService.restoreSession()` all'avvio dell'app. `TokenService.restore()` legge il token da `sessionStorage`, ne verifica la scadenza e, se ancora valido, lo rimette in memoria. Se il token è scaduto viene ignorato.

**5. Scadenza automatica**

`TokenService` decodifica il campo `exp` del JWT (Base64url, senza librerie esterne) e pianifica un `setTimeout` che chiama `clear()` all'ora esatta di scadenza. Il token viene rimosso proattivamente dalla memoria.

### Proteggere una pagina (route guard)

Per rendere una pagina accessibile esclusivamente agli utenti autenticati, aggiungere `requiresAuth: true` nella sua definizione in `site.ts`:

```typescript
// frontend/src/app/site.ts
defineSitePages([
    // ...
    {
        pageType: PageType.Dashboard,
        path: 'dashboard',
        component: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
        requiresAuth: true,   // ← questa riga attiva la guard
    }
]);
```

`app.routes.ts` applica automaticamente `authGuard` a tutte le rotte con questo flag. Se l'utente non è autenticato, viene mostrata una notifica di errore e viene reindirizzato.

### Configurare la pagina di redirect (401)

Per impostazione predefinita, se un utente non è autenticato (o se atterra direttamente su `/error/401`), viene mostrata una pagina di errore tecnica. 
Il router ha la capacità di reindirizzare automaticamente l'utente non loggato a una pagina specifica configurando `pageForAuthGuard` all'interno di `site.ts`:

```typescript
// frontend/src/app/site.ts
setSiteConfiguration({
    appName: 'Il mio sito',
    // ...
    pageForAuthGuard: PageType.Login // ← reindirizza i 401 a questa pagina
});
```

Il redirect avviene dinamicamente traducendo l'enum nel path reale. Non serve toccare `app.routes.ts`.

### Leggere lo stato di login in un componente

```typescript
import { inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({ ... })
export class NavbarComponent {
    readonly auth = inject(AuthService);
    // auth.isLoggedIn() è un computed signal: true/false
}
```

```html
@if (auth.isLoggedIn()) {
    <button (click)="auth.logout()">Esci</button>
} @else {
    <a [appPage]="PageType.Login">Accedi</a>
}
```

---

## Pattern dei Signal

Angular 16+ introduce i Signal come sistema di reattività. I signal sostituiscono i vecchi `BehaviorSubject`/`Observable` per lo stato locale e derivato, sono più leggibili, non richiedono `async pipe`, e permettono ad Angular di sapere esattamente quali parti del DOM aggiornare.

### Riepilogo dei tipi

| Tipo | Quando usarlo |
|---|-------|
| `signal<T>(valore)` | Stato mutabile, ha la capacità di essere `set()` o `update()` |
| `computed(() => ...)` | Valore derivato da altri signal, **readonly**, calcolato lazy, si ricalcola esclusivamente quando i signal da cui dipende cambiano |
| `effect(() => ...)` | Effetto collaterale reale: logging, scrittura DOM, chiamate a API esterne quando un signal cambia |
| `input<T>()` / `input.required<T>()` | Input di componente/direttiva, readonly, il valore viene iniettato dal padre tramite binding |

### Gestione dei dati derivati (computed)

La regola è: se il risultato è un valore (anche una stringa, un numero, un array), usa `computed()`. Se il risultato è un'azione (scrivere nel DOM, chiamare un'API, loggare), usa `effect()`.

```typescript
// ✅ Corretto, computed() per derivare stato
readonly nomePulito = computed(() => this.nome().trim().toUpperCase());

// ❌ Errato, effect() non deve essere usato per derivare stato
effect(() => { this.nomePulito = this.nome().trim().toUpperCase(); });
```

### Signal + ngModel (binding bidirezionale)

I `signal` non sono direttamente compatibili con `[(ngModel)]` (two-way binding). Il motivo è che `[(ngModel)]` si aspetta una proprietà scrivibile, mentre un signal è una funzione. Il pattern corretto è separare il binding di lettura (`[ngModel]`) da quello di scrittura (`(ngModelChange)`):

```html
<!-- ✅ Corretto, lettura e scrittura separati -->
<input [ngModel]="mioSignal()" (ngModelChange)="mioSignal.set($event)">

<!-- ❌ Non funziona, signal non è una proprietà plain scrivibile -->
<input [(ngModel)]="mioSignal">
```

### Signal + `effect()` con reattività a un altro signal

`effect()` si riesegue automaticamente ogni volta che uno dei signal letti al suo interno cambia. Questo è il pattern per reagire ai cambi di lingua senza dover gestire Subscription né unsubscribe:

```typescript
// Segue la lingua corrente e aggiorna il testo quando cambia.
// translate.currentLang() è un signal → questo effect si ri-esegue a ogni cambio lingua.
readonly testoLocalizzato = signal('');

constructor() {
    super();
    effect(() => {
        this.testoLocalizzato.set(this.translate.translate('chiave'));
    });
}
```

---

## Internazionalizzazione (i18n)

Le lingue disponibili si dichiarano in `setSiteConfiguration` con `availableLanguages`:

```typescript
// src/app/site.ts, dentro setSiteConfiguration({...})
setSiteConfiguration({
    defaultLang: 'it',
    availableLanguages: ['it', 'en'], // validati BCP 47 a build time
    ...
});
```

Per aggiungere una lingua: aggiungerla ad `availableLanguages` e generare i file `basic.{lang}.json` e `addon.{lang}.json` corrispondenti nella cartella `src/assets/i18n/`.

### Pattern Add-on per le Traduzioni
Il motore linguistico divide i dizionari in due livelli per separare le responsabilità:
- `basic.{lang}.json`: Contiene le traduzioni fornite dall'Engine (es. errori di sistema, testi delle policy, pulsanti standard). **Questo file non deve mai essere modificato** dallo sviluppatore finale, così da poter aggiornare l'Engine senza conflitti.
- `addon.{lang}.json`: È il file in cui lo sviluppatore inserisce le stringhe specifiche del suo progetto. A runtime, il `TranslateService` unisce i due dizionari (`Object.assign({}, basic, addon)`), dando sempre priorità alle chiavi dell'`addon` in caso di omonimia.

Le chiavi di traduzione sono camelCase senza spazi, solitamente in italiano o inglese. Una chiave per ogni testo distinto, non riusare la stessa chiave per testi simili ma distinti.

```json
// src/assets/i18n/it.json (esempio)
{
    "miaPagina": "La mia pagina",
    "miaPaginaDesc": "Descrizione per SEO della mia pagina"
}
```

Nel componente, due modi di usare le traduzioni:

```typescript
// Traduzione one-shot (non reattiva): utile fuori dai template, es. in una chiamata API
const testo = this.translate.translate('miaPagina');

// Traduzione reattiva (si aggiorna automaticamente al cambio lingua):
// computed() genera un signal derivato, si ricalcola ogni volta che currentLang() cambia
readonly testo = computed(() => this.translate.translate('miaPagina'));
```

Nel template, due modi equivalenti:

```html
<!-- Pipe translate, la scelta consigliata nel template: dichiarativa e reattiva -->
<h1>{{ 'miaPagina' | translate }}</h1>

<!-- Oppure da signal computed nel componente -->
<h1>{{ testo() }}</h1>
```

---

## Tema e stile

### ThemeService

Imposta una sola variabile CSS (`,colorTema`) e calcola in modo reattivo tutto il resto:

| Signal / metodo | Cosa restituisce |
|--|--|
| `colorTema` | Colore hex corrente (scrivibile per switchare tema a runtime) |
| `colorTemaText` | `#000000` o `#ffffff`, contrasto massimo WCAG sul tema |
| `colorPrimary` | Tema + 40% nero, usato per pulsanti e accenti |
| `colorPrimaryText` | Testo leggibile su `colorPrimary` |
| `isDarkTextPreferred` | `true` se il tema è sufficientemente chiaro |

I metodi statici (`ThemeService.prefersDarkText`, `getReadableTextColor`, `mixHexColors`) sono puri e importabili anche da Node/server.ts senza istanziare Angular.

`ImgBuilderService` e `QrCodeService` leggono `colorPrimary()` e `colorPrimaryText()` come default colori, nessuna configurazione aggiuntiva per avere coerenza visiva e contrasto WCAG.

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

### CSS scoping nei componenti standalone

Angular usa `ViewEncapsulation.Emulated` di default: aggiunge automaticamente un attributo univoco (`_ngcontent-xxx`) a ogni elemento del template, e riscrive i selettori del `.component.css` per matchare esclusivamente quegli elementi. Questo significa che i tuoi stili nel `.component.css` non escono accidentalmente fuori dal componente.

Il problema nasce con i **child component standalone**: gli elementi renderizzati da un child component ricevono un attributo diverso (`_ngcontent-yyy`), di conseguenza i selettori del padre non raggiungono tali elementi. Questo causa un bug: lo stile non viene applicato correttamente.

Regola pratica:

| Il selettore mira a... | Dove va lo stile |
|--|--|
| Elementi renderizzati direttamente nel template del componente | `*.component.css` (scoped), funziona correttamente |
| Classi renderizzate da un child component (es. `<app-nav-link>` → `<a class="nav-link">`) | `styles/*.css` (globale), necessario perché i selettori scoped non attraversano i boundary dei componenti |

Tutto il sistema di navigazione è implementato in `styles/nav.css` globale, `.nav-link`, `.nav-disclosure-*`, `footer a`, per fornire una base solida agli elementi nativi proiettati dai componenti di navigazione. Mantenere tali stili in `navbar.component.css` o `footer.component.css` causa errori di visualizzazione, come dropdown senza `position: absolute` o link footer con colori errati.

Per gli **override contestuali** (es. "quando il link è dentro una `.navbar` usa il colore X"), regola:

- Se il selettore parte dal container che vive nel padre (es. `.navbar .nav-link`), va in globale insieme alle definizioni base.
- Per personalizzazioni di progetto figlio, il pattern richiede l'uso delle **CSS custom properties**: il container espone `,app-nav-link-color`, il child legge `color: var(,app-nav-link-color, …)`. Questo approccio mantiene l'incapsulamento del DOM.

Il template-engine fornisce i baseline globali in `styles/base.css`, `styles/nav.css`, `styles/social.css`. I progetti figli aggiungono o sovrascrivono in `styles.css` o in nuovi file importati da lì.

### FontConfig

**Dove si trova il file:** `src/styles/font-config.ts`, nessuna dipendenza Angular, importabile ovunque (siteBuilder, ThemeService, server.ts).

| Dizionario | Contesto |
|---|---|
| `FontConfig.WEB_FONTS` | Browser e Canvas, font di sistema, zero dipendenze esterne |
| `FontConfig.SERVER_FONTS` | Sharp / immagini OG, font installati nel container Docker |

`FontConfig.DEFAULT_WEB_FONT` e `DEFAULT_SERVER_FONT` sono i default usati da `ImgBuilderService`.

---


---

# 3. Produzione, SEO & Compliance

## Regole SSR

Il frontend usa SSR con hydration (`provideClientHydration(withEventReplay())`). Il server Node genera l'HTML completo per ogni richiesta, questo è ciò che i crawler di Google ricevono. Alcune API esistono esclusivamente nel browser (DOM, localStorage, canvas, ecc.), accedervi lato server genera errori a runtime.

### Cosa NON fare

```typescript
// ❌ window non esiste in SSR, genera ReferenceError lato server
if (typeof window !== 'undefined') { ... }

// ❌ document non esiste in SSR
document.querySelector('.mia-classe');

// ❌ localStorage non esiste in SSR
localStorage.getItem('chiave');
```

### Cosa fare nei componenti pagina

`afterNextRender` è garantito non essere mai eseguito in SSR. Usarlo per qualsiasi codice che richiede il browser: canvas, analytics, scroll, chiamate API che non devono girare in SSR.

```typescript
// ✅ afterNextRender, garantisce esecuzione esclusivamente nel browser, mai in SSR
constructor() {
    super();
    afterNextRender(() => {
        // codice browser-only: canvas, scroll, analytics, chiamate API, ecc.
    });
}
```

### Cosa fare nei servizi

I servizi non hanno accesso ad `afterNextRender`, di conseguenza usano `isPlatformBrowser`:

```typescript
// ✅ isPlatformBrowser, necessario nei servizi per proteggere le API browser
@Injectable({ providedIn: 'root' })
export class MioService {
    private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

    metodo(): void {
        if (!this.isBrowser) return;   // early return: non fa nulla in SSR
        // codice browser-only sicuro
    }
}
```

### Dove mettere il codice DOM

| Dove | Quando usarlo |
|--|--|
| **`afterNextRender()`** | Opzione consigliata nei componenti pagina, non viene mai eseguito in SSR/prerender |
| **`ngAfterViewInit`** | Non viene chiamato in SSR → sicuro per accesso DOM, ma non garantisce il browser in tutti i contesti Angular |
| **Event handler / `@HostListener`** | Non vengono scatenati lato server → sicuri per natura |
| **`constructor` / `ngOnInit`** | Vengono eseguiti lato server → richiedono `isPlatformBrowser` per codice browser-only |

---

## Meta SEO e SSR

I meta tag (`<title>`, `og:title`, `og:description`, `og:image`, canonical, JSON-LD) vengono gestiti interamente da `ContentResolver` + `PageBaseComponent`. Non serve nessun codice nei componenti per i casi standard.

### Come funziona

**Per pagine statiche** (titolo e descrizione dichiarati in `site.ts`):

```typescript
// src/app/site.ts, dentro defineSitePages([...])
{
    path: 'mia-pagina',
    title: 'miaPagina',              // chiave i18n → tradotta automaticamente
    description: 'miaPaginaDesc',   // chiave i18n → meta description
    otherSEO: {
        ogImage: 'id-asset-immagine',   // ID asset → og:image 1200×630: immagine centrata su sfondo sfocato + favicon
        // oppure ogImage: false        → nessuna immagine (rimuove i tag og:image)
        // oppure omesso                → preview dinamica generata da /cdn-cgi/preview
        ogType: 'article',              // og:type (default: 'website')
        structuredDataType: 'Article',  // JSON-LD @type (default: 'WebPage')
    },
    ...
}
```

I tag aggiornati da `PageMetaService.setPageMeta()` in un'unica chiamata:
`<title>`, `og:title`, `og:description`, `og:url`, `og:image`, `og:type`,
`og:locale` / `og:locale:alternate` (da `availableLanguages`),
`twitter:title`, `twitter:description`, `twitter:image`,
`<link rel="canonical">` e il blocco `<script type="application/ld+json">`.

`ContentResolver.loadResolved()` legge questi dati via `ContestoSito.getPageInfo(pageType)` e li passa a `PageBaseComponent` nel campo `info` di `ResolvedPage`. `PageBaseComponent` chiama `PageMetaService.setPageMeta()` via `effect()`, SSR-safe: i meta tag sono nell'HTML prima che il crawler lo riceva.

**Per pagine dinamiche** (titolo/descrizione da API, es. articolo con ID): aggiungere il case nel `ContentResolver` e restituire un `info` personalizzato con i dati dall'API, vedi sezione *Resolver automatico dei contenuti*.

### `PageMetaService.setPageMeta()`

```typescript
// Firma del metodo
setPageMeta(
    pageTitle: string,                  // obbligatorio, valore già tradotto (non chiave i18n)
    description?: string | null,        // opzionale, meta description
    imgId?: string | null | false,      // opzionale, vedi comportamenti sotto
    ogType?: string | null,             // opzionale, og:type (default: 'website')
    structuredDataType?: string | null, // opzionale, JSON-LD @type (default: 'WebPage')
    updatedTime?: string | null,        // opzionale, ISO 8601 per og:updated_time per-pagina;
                                        // se nullo resta il valore globale di build
): void

// imgId, tre comportamenti distinti:
// string  → /cdn-cgi/preview?p=<blob>, payload cifrato: immagine in primo piano (contain) su sfondo sfocato.
//           Se onlyPlainImage = false, include anche favicon in basso a sinistra e badge a pillola col titolo (colorTema + contrasto WCAG).
// null/undefined → /cdn-cgi/preview?p=<blob>, payload cifrato: preview testuale (sfondo colorato, favicon, titolo)
// false   → nessuna immagine: i tag og:image e twitter:image vengono rimossi
```

**Opzione `onlyPlainImage`**, Per forzare la rimozione di favicon e badge di testo (scritte) da tutte le anteprime social, si imposta la proprietà `onlyPlainImage: true` all'interno di `setSiteConfiguration` in `src/app/site.ts`. Questa impostazione si applica globalmente a livello di sito e non è configurabile dinamicamente pagina per pagina. Il default se omesso è `false`.

**Sicurezza og:image**, `og:image` punta a `/cdn-cgi/preview?p=<blob>` dove `<blob>` è un payload AES-GCM (titolo, sottotitolo opzionale, ID asset opzionale, ed eventuale flag onlyImage) cifrato. 
La cifratura avviene in SSR in modo **sincrono** tramite la classe statica `PreviewCrypto` (descritta in `src/preview-crypto.server.ts`), la quale viene iniettata nel servizio tramite l'InjectionToken `SSR_PREVIEW_ENCRYPT_FN` (configurato in `app.config.server.ts`). Nel browser l'InjectionToken non è fornito, per cui non vengono sprecate risorse e non si espongono algoritmi di cifratura lato client.
Il server backend Express in `server.ts` decifra e valida in modo sincrono tramite `PreviewCrypto.decrypt(blob)`; qualsiasi payload alterato o manomesso fallisce la decifrazione AES-GCM restituendo un errore **`403 Forbidden`**. 

La chiave di cifratura simmetrica ha la capacità di essere configurata in produzione tramite la variabile d'ambiente **`PREVIEW_CRYPTO_SECRET`**; se assente, ricade sul fallback automatico basato su `appName:version` definita in `ContestoSito`. Bumpare `version` in `site.ts` invalida automaticamente tutte le anteprime in cache su disco.

Ha la capacità di essere chiamato direttamente dal componente nei rari casi in cui serve sovrascrivere i meta a runtime (es. dopo un'interazione utente che cambia il contenuto della pagina).

---

## Resolver automatico dei contenuti

Ogni pagina registrata in `site.ts` ottiene automaticamente un resolver che carica il contenuto prima della navigazione. Il resolver è configurato in `app.routes.ts`, che costruisce automaticamente le rotte da `site.ts`, e applica `contentLoaderResolver` come resolver su ogni leaf page.

Il resolver restituisce un oggetto `ResolvedPage<T>` con due campi:
- `content`, i dati della pagina (es. il testo Markdown di una policy, o i dati di un articolo)
- `info`, i metadati SEO da `site.ts` (titolo, descrizione, ogImage, ogType)

`PageBaseComponent` riceve questo oggetto, aggiorna i meta tag via `effect()` e espone `pageContent()` già tipizzato come `T | null`.

### Come funziona

```
Navigazione → contentLoaderResolver(pageType) chiama inject(ContentResolver).loadResolved(pageType, lang)
                        ↓
             switch(pageType) → content da file, API, o null
             ContestoSito.getPageInfo(pageType) → info SEO da site.ts
                        ↓
             ResolvedPage { content, info } → input contentByResolve di PageBaseComponent
                        ↓
             PageBaseComponent:
               effect(info)    → PageMetaService.setPageMeta()   [SSR + browser]
               effect(lang)    → ricarica al cambio lingua     [esclusivamente browser]
               pageContent()   → content tipizzato come T
```

Il componente usa **esclusivamente** `this.pageContent()`, non gestisce meta tag né reload al cambio lingua. Tutto è automatico.

**Protezione del router**: lo `switch` in `ContentResolver.loadResolved()` è avvolto da un try-catch. Se l'API fallisce, `BaseApiService.handleError()` emette la notifica di errore. Il try-catch intercetta il rilancio e restituisce `{ content: null, info }`, consentendo al router di completare la navigazione verso il componente di pagina (che gestirà lo stato nullo).

### Aggiungere contenuto a una nuova pagina

**Dove si trova il file:** `src/app/pages/content.resolver.ts`. Questo è il file centrale che determina cosa viene caricato per ogni pagina.

**1. Aggiungere il case in `ContentResolver.loadResolved()`**

```typescript
// src/app/pages/content.resolver.ts, dentro il switch(pageType)
case PageType.MiaPagina:
    content = await this.apiService.getMiaPaginaData(language); // chiamata API
    // oppure:
    content = await this.tryLoadPolicy('slug', language);       // file Markdown da /assets/legal/
    break;
```

I metadati SEO statici (titolo, descrizione, ogImage) vengono letti automaticamente da `ContestoSito.getPageInfo(pageType)`, dichiarati una sola volta in `site.ts`, usati automaticamente dal resolver.

**2. Estendere `PageBaseComponent<T>` nel componente**

```typescript
// Il generic MeteoData deve corrispondere al tipo restituito dal case nel resolver.
export class MiaPaginaComponent extends PageBaseComponent<MeteoData> {
    // pageContent() è già MeteoData | null, nessun cast necessario.
    readonly temperatura = computed(() => this.pageContent()?.temperatura ?? ',');
}
```

### Meta SEO dinamici (titolo/descrizione da API)

Per pagine con titolo che dipende dall'API (es. articolo con ID variabile nel path), il resolver ha la capacità di sovrascrivere `info` con i dati caricati dall'API:

```typescript
// src/app/pages/content.resolver.ts, dentro il switch(pageType)
case PageType.Articolo: {
    const articolo = await this.apiService.getArticolo(route!.params['id'], language);
    return {
        content: articolo,
        // info personalizzato: titolo e descrizione dall'API (bypassando site.ts)
        info: {
            title: articolo.titolo,          // stringa diretta, non chiave i18n
            description: articolo.descrizione,
            path: ContestoSito.getPageInfo(pageType)?.path ?? '',
            isExternal: false,
            ogImage: articolo.previewImageId,
        }
    };
}
```

`PageBaseComponent` chiama `setPageMeta()` automaticamente con questi dati, nessuna logica SEO nel componente.

### Estendere in un progetto figlio

Il progetto figlio registra la propria versione del servizio nel DI. Grazie al pattern DI, `contentLoaderResolver` usa automaticamente la versione del figlio senza toccare nulla nell'engine.

```typescript
// app.config.ts del progetto figlio
{ provide: ContentResolver, useClass: ChildContentResolverService }
```

```typescript
// ChildContentResolverService
// override: sovrascrive loadResolved() aggiungendo i propri case.
// super.loadResolved(): delega i case non gestiti all'implementazione base dell'engine.
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

---

## Gestione cookie e consenso GDPR

`CookieConsentService` gestisce tutto il ciclo di vita del consenso cookie in conformità con ePrivacy + GDPR. Il principio è il **Privacy by Default**: nessun cookie viene scritto finché l'utente non accetta esplicitamente la categoria corrispondente.

Il banner GDPR appare automaticamente quando almeno una categoria di cookie risulta necessaria. Non serve attivarlo manualmente.

### Due cookie gestiti automaticamente dal servizio

Indipendentemente da `COOKIE_KEYS`, il servizio gestisce sempre:

| Cookie | Categoria | Quando viene scritto |
|--|--|--|
| Preferenza lingua (`lang`) | Tecnico | Al cambio lingua, se il consenso tecnico è attivo |
| Service Worker (`ngsw-worker.js`) | Tecnico | In `applyConsent()` alla prima accettazione tecnica della sessione |

La **categoria tecnica** è di conseguenza necessaria ogni volta che il sito è multilingua (più di una lingua in `availableLanguages`). Se il sito è monolingua e `COOKIE_KEYS` è vuoto, il banner non comparirà mai.

### Aggiungere un cookie di progetto

**Dove si trova il file:** `src/app/core/services/cookie-registry.ts`, il esclusivamente `COOKIE_MAP`.

Aggiungere una riga è tutto quello che serve:

```typescript
// src/app/core/services/cookie-registry.ts
export const COOKIE_MAP = {
    '_ga':          CookieCategory.Analytics,
    '_ga_XXXXXXXX': CookieCategory.Analytics,
} as const satisfies Readonly<Record<string, CookieCategory>>;
```

La chiave è il nome raw del cookie nel browser. Il nome fisico nel browser sarà `{categoria}.{chiave}` (es. `analytics._ga`).

Aggiungendo la riga, automaticamente:
- la sezione corrispondente appare nel banner GDPR
- la chiave diventa un `CookieKey` valido e utilizzabile a compile-time
- la tabella `{{cookieList}}` nei file Markdown delle policy la include

**Usare `setCookie` / `getCookie` nel codice**

```typescript
import { inject } from '@angular/core';
import { CookieConsentService } from '../../core/services/cookie-consent.service';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
    private readonly consent = inject(CookieConsentService);

    init(): void {
        // Bloccato dal servizio se il consenso analytics non è stato dato.
        this.consent.setCookie('_ga', 'valore', 60 * 60 * 24 * 365);
    }

    getSession(): string | null {
        return this.consent.getCookie('_ga');
    }
}
```

TypeScript valida le chiavi a compile time: una stringa non presente in `COOKIE_MAP` produce un errore prima ancora del runtime. Con mappa vuota, `CookieKey = never` e i metodi sono di fatto inaccessibili.

### Aggiungere un side effect al consenso

Tutto ciò che deve accadere nel momento in cui l'utente accetta o rifiuta va nel metodo privato `applyConsent()` di `CookieConsentService`. Questo è il punto unico di estensione: non serve intercettare `accept()`, `reject()` o `saveSelected()` dall'esterno.

```typescript
// src/app/core/services/cookie-consent.service.ts
private applyConsent(): void {
    this.applyServiceWorker();        // built-in: SW tecnico
    this.applyLanguagePreference();   // built-in: pulizia cookie lingua se revocato
    this.applyAnalytics();            // ← aggiunto dal progetto figlio
}

private applyAnalytics(): void {
    if (!this.isBrowser) return;
    if (this._analyticsAccepted()) {
        // carica script analytics o inizializza SDK
    } else {
        // rimuovi cookie analytics esistenti se l'utente ha revocato il consenso
        this.removeCookie(COOKIE_KEYS.GA_SESSION);
        this.removeCookie(COOKIE_KEYS.GA_CLIENT);
    }
}
```

### Leggere lo stato del consenso in un componente

```typescript
import { inject } from '@angular/core';
import { CookieConsentService } from '../../core/services/cookie-consent.service';

@Component({ ... })
export class MioComponent {
    private readonly consent = inject(CookieConsentService);

    // signal readonly, usabile direttamente nei template
    readonly analyticsAttivi = this.consent.analyticsAccepted;
}
```

```html
@if (analyticsAttivi()) {
    <!-- contenuto disponibile esclusivamente con consenso analytics -->
}
```

### Riepilogo delle API pubbliche

| Metodo / proprietà | Descrizione |
|--|--|
| `isNeeded` | `Signal<boolean>`, `true` se almeno una categoria è necessaria (falso in SSR) |
| `isTechnicalNeeded` | `Signal<boolean>`, `true` se multilingua o ci sono cookie tecnici in `COOKIE_MAP` |
| `isAnalyticsNeeded` | `Signal<boolean>`, `true` se ci sono cookie analytics in `COOKIE_MAP` |
| `isProfilingNeeded` | `Signal<boolean>`, `true` se ci sono cookie profiling in `COOKIE_MAP` |
| `technicalAccepted` | `Signal<boolean>`, stato corrente del consenso tecnico |
| `analyticsAccepted` | `Signal<boolean>`, stato corrente del consenso analytics |
| `profilingAccepted` | `Signal<boolean>`, stato corrente del consenso profiling |
| `responded` | `Signal<boolean>`, `true` se l'utente ha già risposto al banner |
| `accept()` | Accetta tutte le categorie attive |
| `reject()` | Rifiuta tutte le categorie |
| `saveSelected(tech, anal, prof)` | Salva la selezione granulare dai toggle del banner |
| `reopen()` | Riapre il banner (porta `responded` a `false`) |
| `setCookie(key, value, maxAge)` | Scrive un cookie registrato in `COOKIE_KEYS`; bloccato senza consenso |
| `getCookie(key)` | Legge un cookie registrato in `COOKIE_KEYS` |
| `removeCookie(key)` | Rimuove un cookie; sempre consentito |
| `getSavedLanguage()` | Legge il cookie di preferenza lingua |
| `setSavedLanguage(lang)` | Scrive il cookie lingua se il consenso tecnico è attivo |
| `clearSavedLanguage()` | Rimuove il cookie lingua |
| `listMarkdown(t)` | Genera la tabella Markdown dei cookie censiti; `t` è la funzione di traduzione |

### Tabella cookie nei file Markdown legali

I file `.md` in `assets/legal/` possono contenere il placeholder `{{cookieList}}`. `ContentResolver` lo sostituisce con la tabella Markdown generata da `listMarkdown()` prima che il testo raggiunga il componente.

```markdown
## Cookie utilizzati

{{cookieList}}
```

La tabella include automaticamente: preferenza lingua (se multilingua), Service Worker (se `isWebApp: true`) e tutti i cookie censiti in `COOKIE_MAP`.

### Auto-disabilitazione della pagina Cookie Policy

Il builder (`buildSite`) disabilita automaticamente la pagina corrispondente a `PageType.CookiePolicy` quando non ci sono cookie da dichiarare, ovvero quando tutte e tre le condizioni sono vere:

- `isWebApp: false` (nessun Service Worker)
- lingua singola (nessun cookie di preferenza lingua)
- `COOKIE_MAP` vuoto (nessun cookie di progetto)

Il lookup avviene per nome (`'CookiePolicy'`) sull'enum a runtime, di conseguenza se un progetto figlio rimuove `PageType.CookiePolicy` dall'enum la logica è semplicemente inerte, nessun errore. La pagina viene esclusa da `pageMap`, dalla sitemap e dalla navigazione senza nessun intervento manuale.

---

## Accessibilità

L'accessibilità è una proprietà nativa del sistema, non un'attività correttiva. WCAG 2.1 AA è il livello minimo per ogni componente nuovo o modificato.

### Tre livelli di protezione automatici

| Livello | Strumento | Quando scatta |
|--|--|--|
| CI, statico | `lint-check.sh`, `tsc-check.sh`, `i18n-check.sh` | Ad ogni push/PR (job paralleli, nessun server) |
| CI, live | `a11y-test.sh`, `lighthouse-test.sh` | Ad ogni push/PR (job `live-tests`, dopo i job statici) |
| Deploy | `scripts/test/run-all.sh` | `deploy.sh,run-tests` (post-deploy, tutti gli script in sequenza) |

Il perché di ogni scelta, compreso come `site.ts` guida la scoperta automatica delle pagine e delle lingue, è documentato nei commenti degli script in `scripts/test/`.

### Regole ESLint, errori bloccanti

Configurate in `eslint.config.mjs`. Rompono `npm run lint` e bloccano la CI:

| Regola | Cosa verifica |
|--|--|
| `alt-text` | `<img>` senza attributo `alt` |
| `elements-content` | Elementi interattivi senza testo accessibile |
| `label-has-associated-control` | `<label>` senza `for`/`id` corrispondente |
| `valid-aria` | Attributi ARIA inesistenti o mal formati |
| `role-has-required-aria` | Role ARIA senza le proprietà obbligatorie |
| `table-scope` | `<th>` senza `scope` |
| `no-distracting-elements` | `<marquee>`, `<blink>` |

Warning (non bloccanti, da valutare caso per caso): `click-events-have-key-events`, `interactive-supports-focus`, `mouse-events-have-key-events`, `no-autofocus`.

### Checklist, prima di considerare un componente completo

- [ ] Semantic HTML corretto: `<button>` per azioni, `<a>` per navigazione, gerarchia heading rispettata
- [ ] Tutti i `<label>` associati al controllo via `for`/`id` o nesting diretto
- [ ] Tutti i `<img>` hanno `alt` (descrittivo se informativo, `""` se puramente decorativo)
- [ ] Icone decorative hanno `aria-hidden="true"`
- [ ] Elementi interattivi raggiungibili e attivabili da tastiera, focus visibile
- [ ] `aria-label` usato esclusivamente quando non c'è testo visibile, il testo visibile è già il nome accessibile dell'elemento
- [ ] Ogni testo `aria-label` passa per `| translate`, nessuna stringa hardcoded
- [ ] Link esterni: `rel="noopener noreferrer"` + avviso screen reader in `visually-hidden`
- [ ] Overlay e modal: `appFocusTrap` attivo + focus ripristinato all'elemento trigger alla chiusura
- [ ] Contrasto: testo normale ≥ 4.5:1, testo grande ≥ 3:1

### aria-label, property binding, non interpolazione

Usare sempre `[attr.aria-label]` (property binding). A differenza dell'interpolazione `aria-label="{{ ... }}"`, il binding accetta `null` per rimuovere completamente l'attributo, necessario quando è già presente testo visibile, per rispettare WCAG 2.5.3 (*Label in Name*: il nome accessibile non ha la capacità di contraddire il testo visibile).

```html
<!-- Elemento con sola icona: aria-label necessario -->
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

`opensInNewTab` è già presente nei file `basic.*.json` del template, non va aggiunto di nuovo.

### Form, label associate

```html
<label for="email" class="form-label">{{ 'mail' | translate }}</label>
<input id="email" type="email" class="form-control">
```

Un `<label>` non associato tramite `for`/`id` (o nesting diretto) è un errore bloccante ESLint.

### Overlay e dialog

```html
<div role="dialog"
     aria-modal="true"
     [attr.aria-label]="'dialogTitle' | translate"
     appFocusTrap>
    <!-- contenuto -->
</div>
```

`appFocusTrap` (in `core/directives/focus-trap.directive.ts`) intrappola il focus Tab/Shift+Tab all'interno del dialog e sposta il focus sul primo elemento interattivo all'apertura. Alla chiusura, il focus va ripristinato sull'elemento che ha aperto il dialog.

### Design token, colori e focus sempre da variabile CSS

```css
/* Corretto */
background: var(--colorSurface);
color:      var(--colorSurfaceText);
border:     1px solid var(--colorSurfaceBorder);
outline:    var(--focusRingWidth) solid var(--focusRingColor);
```

I token garantiscono che i rapporti di contrasto WCAG siano calcolati centralmente in `ThemeService` e propagati automaticamente tramite `color-mix()` in `base.css`. Usare valori hex hardcoded bypassa questo sistema e può rompere il contrasto in modalità scura o con temi personalizzati.

Token disponibili (definiti in `src/styles/base.css`):

| Token | Uso |
|---|---|
| `--colorTema` | Colore brand principale |
| `--colorPrimary` | Variante WCAG-safe per bottoni/CTA |
| `--colorPrimaryText` | Testo leggibile su `--colorPrimary` |
| `--colorSurface` | Sfondo pannelli/card |
| `--colorSurfaceText` | Testo su `--colorSurface` |
| `--colorSurfaceBorder` | Bordo pannelli |
| `--colorSecondary` | Colore secondario adattivo (chiaro su dark, scuro su light) — WCAG AA |
| `--colorSecondaryText` | Testo su sfondo `--colorSecondary` |
| `--colorInfo` | Colore info adattivo — WCAG AA |
| `--colorInfoText` | Testo su sfondo `--colorInfo` |
| `--colorWarning` | Colore warning adattivo — WCAG AA |
| `--colorWarningText` | Testo su sfondo `--colorWarning` |
| `--colorLink` | Colore link |
| `--focusRingColor` | Colore anello di focus |
| `--focusRingWidth` | Spessore anello di focus |
| `--focusRingOffset` | Offset anello di focus |

### Audit WCAG a runtime

```bash
# Audit accessibilità su un server in esecuzione (auto-scopre le pagine da /health)
scripts/test/a11y-test.sh http://localhost:3000

# Audit Lighthouse (performance, a11y, best-practices, seo)
scripts/test/lighthouse-test.sh http://localhost:3000

# Suite completa (lint → tsc → i18n → a11y → lighthouse)
scripts/test/run-all.sh http://localhost:3000

# Nel deploy post-produzione
bash deploy.sh --run-tests
```

Configurazione pa11y in `scripts/test/pa11y.json`: standard WCAG2AA, livello "error".
Soglie Lighthouse in `scripts/test/lighthouse.json`: performance 70, accessibility 90, best-practices 85, seo 80.

---

## Asset e ottimizzazione immagini

### Aggiungere un nuovo file (immagine, PDF, video…)

Tutti i file statici serviti tramite CDN vivono in `src/assets/files/` e sono **sempre referenziati tramite ID**, mai per nome file diretto. Questo permette di rinominare o sostituire un file senza toccare i template.

**Passo 1, Copia il file** in `frontend/src/assets/files/`:

```
frontend/src/assets/files/
  favicon.png
  hero.jpg          ← nuovo file
```

**Passo 2, Registra l'ID** in `frontend/src/assets/mapping.json`:

```json
{
  "favIcon": "favicon.png",
  "img4k": "pexels-kienvirak-36928649.jpg",
  "hero": "hero.jpg"
}
```

La chiave (es. `"hero"`) è l'ID che userai nei template e nel codice. Il valore è il nome file fisico. Da questo momento `appAsset="hero"` e `this.asset.getUrl('hero')` funzionano.

**Perché questo livello di indirezione?** La directory `assets/files/` è bloccata, i file non sono mai raggiungibili direttamente via URL. Passano sempre attraverso il layer `/cdn-cgi/asset`, che per le immagini raster fa resize + conversione WebP on-demand e mette in cache il risultato. Per PDF, SVG e video fa passthrough diretto. L'ID disaccoppia il riferimento dal nome fisico: se domani sostituisci `hero.jpg` con `hero-v2.webp`, aggiorni esclusivamente il mapping, non tutti i template.

---

 (path raccolti in `CdnCgi` in `asset.service.ts`):

| Endpoint | Scopo |
|---|---|
| `/cdn-cgi/asset?id=X[&w=N]` | Serve il file raw: resize + WebP per immagini raster, passthrough per PDF/SVG/… |
| `/cdn-cgi/preview?p=<blob>` | Genera al volo l'og:image (1200×630). Il blob è un payload AES-GCM prodotto in SSR tramite `SSR_PREVIEW_ENCRYPT_FN` (delegato a `PreviewCrypto.encrypt`), titolo, sottotitolo opzionale, ID asset opzionale, flag onlyImage opzionale. Variante dispatch: presenza di `id` nel payload → immagine in primo piano con sfondo sfocato (e badge + favicon se `onlyImage` non è `'true'`); assenza → SVG testuale (sfondo colorato, favicon, titolo). Blob manomesso → 403. |

Entrambi usano cache su disco (invalidata aggiornando `version` in `site.ts`) e single-flight per chiamate concorrenti alla stessa risorsa.

La directory `assets/files/` è bloccata, i file non sono mai raggiungibili direttamente, esclusivamente tramite ID.

### Uso in template, directive

Il modo preferito nei template è tramite directive: niente signal intermedi, `src` / `href` si aggiornano reattivamente al cambio degli input.

```html
<!-- src: img, video, audio, source, iframe, embed -->
<img appAsset="hero" [appAssetWidth]="1080" alt="..." class="img-fluid">
<video appAsset="intro" controls></video>
<iframe appAsset="manuale" title="Manuale PDF"></iframe>

<!-- href: a, link (download, preload) -->
<a [appAssetHref]="'manuale'" download="manuale.pdf">Scarica manuale</a>
<link rel="preload" as="image" [appAssetHref]="'hero'" [appAssetWidth]="1024">
```

`appAssetWidth` ha effetto esclusivamente per immagini raster: il server ignora il parametro per video / PDF / SVG e restituisce lo stream originale. È di conseguenza sicuro lasciarlo non valorizzato anche su tag non-immagine.

### Uso programmatico

Per casi non template (canvas dinamici, popup, costruzione URL da codice):

```typescript
// this.asset è disponibile da PageBaseComponent, nessun inject aggiuntivo nei componenti pagina.
this.asset.getUrl('hero', 1080)      // → URL ottimizzato via /cdn-cgi/asset
```

Per Blob locali (canvas, API esterne):
```typescript
const { rawUrl, angularUrl } = this.asset.getUrlFromBlob(blob);
// rawUrl → usabile in JS puro (es. assegnare a un canvas)
// angularUrl → sanitizzato per i template Angular (es. [src]="angularUrl")
// Entrambi gli URL vengono revocati automaticamente ad ogni NavigationEnd
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

Rilevante esclusivamente in deploy con Docker, in sviluppo locale non si applica.

Angular compila il bundle a build time e non ha la capacità di leggere env del container a runtime. La soluzione: `environment.ts` usa i segnaposto letterali `__API_URL__` e `__API_KEY__`. All'avvio del container, `docker-entrypoint.sh` esegue `sed` su tutti i `.js` del bundle sostituendo quei segnaposto con i valori reali. Il server SSR parte esclusivamente dopo la sostituzione.

Quando `API_URL` è vuota, il server Node fa da proxy su `/api/*` verso il backend sulla rete Docker. Se valorizzata, il frontend chiama direttamente quell'URL (utile con backend su server separato).

Cache: asset con hash nel nome → 1 anno `immutable`; asset non hashati (i18n, legal, mapping) → `no-cache` per aggiornamenti immediati al deploy.

---


---

# 4. Reference Toolkit (Libreria degli Strumenti)

## Servizi disponibili

Tutti `providedIn: 'root'`, istanziati una sola volta per tutta l'app. Disponibili tramite `inject()` in qualsiasi componente o servizio.

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
| `ShareService` | Clipboard API, Web Share API, download, un'unica interfaccia con fallback |
| `ImgBuilderService` | Genera PNG su canvas (`buildBlob`, `buildCanvas`, `buildFile`); `buildSvg` statico SSR-safe |
| `QrCodeService` | QR code PNG/SVG per URL, WhatsApp, email, Wi-Fi, SEPA; cache per payload+colori |
| `NotificationService` | SweetAlert2 lazy: `success`, `error`, `confirm`, `prompt`, `interact`, `toast`, `validationErrors`, `handleApiError` |
| `CookieConsentService` | Gestione consenso GDPR; blocca scritture cookie senza consenso |
| `SpeechService` | Text-to-speech via Web Speech API; voce e lingua seguono `TranslateService` |
| `VersionCheckService` | Rileva nuove versioni con due strategie parallele: polling del `manifest.webmanifest` ogni 10 min (tab browser) e sottoscrizione a `SwUpdate.versionUpdates` (PWA installata). Su conferma utente: `SwUpdate.activateUpdate()` + `location.reload()` |

---

## Componenti e directive disponibili

### Directive

Tutte le directive sono `standalone: true` e devono essere aggiunte all'array `imports` del componente che le usa. Non vengono importate automaticamente.

| Directive | Selector | Import da |
|---|---|---|
| `[appPage]` | qualsiasi elemento con `href` | `core/engine/directives/page.directive` → `PageDirective` |
| `[appAsset]` | `img, video, audio, source, iframe, embed` | `core/engine/directives/asset.directive` → `AssetDirective` |
| `[appAssetHref]` | `a, link` | `core/engine/directives/asset.directive` → `AssetHrefDirective` |
| `[imgRender]` | `img` | `core/engine/directives/img-render.directive` → `ImgRenderDirective` |
| `[qrContent]` | `img` | `core/engine/directives/qr-render.directive` → `QrRenderDirective` |
| `[appContextMenu]` | qualsiasi elemento | `core/engine/directives/context-menu.directive` → `ContextMenuDirective` |

I percorsi sono relativi a `src/app/`.

---

#### `[appPage]`

**Cosa fa:** traduce un `PageType` nel path corrispondente (letto da `ContestoSito`) e lo applica come `RouterLink`. Genera anche l'attributo `href` statico per SSR e per il right-click "Apri in nuova scheda". Se il `PageType` non è registrato in `site.ts` o la pagina ha `enabled: false`, naviga verso `/` come fallback sicuro.

```typescript
// Nel componente o pagina che usa la directive:
import { PageDirective } from '../../core/engine/directives/page.directive';
import { PageType } from '../../site';

@Component({
    imports: [PageDirective],
})
```

```html
<a [appPage]="PageType.Home" class="navbar-brand">Home</a>
<a [appPage]="PageType.PrivacyPolicy" class="footer-link">Privacy</a>
<button [appPage]="PageType.Contatti">Contattaci</button>
```

| Input | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `appPage` | `PageType` | sì | Valore dell'enum `PageType` dichiarato in `site.ts` |

---

#### `[appAsset]`

**Cosa fa:** imposta l'attributo `src` costruendo l'URL verso `/cdn-cgi/asset?id=ID[&w=WIDTH]`. Il resize è applicato lato server esclusivamente per immagini raster (JPEG, PNG, WebP); per video, PDF e SVG il parametro width viene ignorato e viene restituito lo stream originale. Il selector è vincolato ai tag che supportano `src`: errore a compile time se si prova ad applicarla a un `<div>`.

```typescript
import { AssetDirective } from '../../core/engine/directives/asset.directive';

@Component({
    imports: [AssetDirective],
})
```

```html
<img appAsset="hero" [appAssetWidth]="1080" alt="Banner" class="img-fluid">
<img appAsset="logo" alt="Logo">
<video appAsset="intro" controls></video>
<audio appAsset="podcast" controls></audio>
<iframe appAsset="manuale" title="Manuale PDF"></iframe>
<source appAsset="video-webm" type="video/webm">
```

| Input | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `appAsset` | `string` | sì | ID dell'asset nel file di mapping |
| `appAssetWidth` | `125 \| 320 \| 480 \| 512 \| 640 \| 768 \| 1024 \| 1080 \| 1366 \| 1600 \| 1920` | no | Larghezza resize in pixel; ignorato per video/PDF/SVG |

---

#### `[appAssetHref]`

**Cosa fa:** variante di `[appAsset]` per elementi che usano `href` invece di `src`. Stesse logiche di URL construction e resize. Utile per link di download e `<link rel="preload">`.

```typescript
import { AssetHrefDirective } from '../../core/engine/directives/asset.directive';

@Component({
    imports: [AssetHrefDirective],
})
```

```html
<a [appAssetHref]="'manuale'" download="manuale.pdf">Scarica manuale</a>
<a [appAssetHref]="'report'" [appAssetWidth]="1920" download>Download HD</a>
<link rel="preload" as="image" [appAssetHref]="'hero'" [appAssetWidth]="1024">
```

| Input | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `appAssetHref` | `string` | sì | ID dell'asset nel file di mapping |
| `appAssetWidth` | `125 \| 320 \| 480 \| 512 \| 640 \| 768 \| 1024 \| 1080 \| 1366 \| 1600 \| 1920` | no | Larghezza resize in pixel; ignorato per PDF/SVG |

---

#### `[imgRender]`

**Cosa fa:** genera un'immagine PNG su canvas tramite `ImgBuilderService` e la imposta come `src` dell'`<img>`. Non opera in SSR, il browser mostra il testo `alt` come fallback finché il canvas non è pronto. Emette il canvas grezzo via `(canvasChange)` così il componente padre ha la capacità di usarlo per download o condivisione senza accedere al DOM direttamente. Un token monotono garantisce che build asincrone sovrapposte non producano risultati fuori ordine.

```typescript
import { ImgRenderDirective, ImgRenderConfig } from '../../core/engine/directives/img-render.directive';
import { computed, signal } from '@angular/core';

@Component({
    imports: [ImgRenderDirective],
})
export class MioComponent {
    // imgConfig è un computed signal: si ricalcola automaticamente quando i signal
    // da cui dipende (es. this.testo()) cambiano, aggiornando di conseguenza l'immagine.
    readonly imgConfig = computed<ImgRenderConfig>(() => ({
        text: this.testo(),
        bgColor: '#3a86ff',
        ratio: '16:9',
        renderMode: 'wrap',
    }));
    readonly canvas = signal<HTMLCanvasElement | null>(null);
}
```

```html
<img [imgRender]="imgConfig()"
     (canvasChange)="canvas.set($event)"
     alt="Anteprima immagine generata"
     class="img-fluid rounded">
```

| Input | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `imgRender` | `ImgRenderConfig \| null` | no (default `null`) | `null` rimuove `src` ed emette `canvasChange(null)` |

| Output | Tipo | Note |
|---|---|---|
| `canvasChange` | `HTMLCanvasElement \| null` | Canvas raw aggiornato ad ogni render; `null` se config è `null` o la generazione fallisce |

**`ImgRenderConfig`** — tutti i campi eccetto `text` sono opzionali:

| Campo | Tipo | Obbligatorio | Default | Note |
|---|---|---|---|---|
| `text` | `string` | sì | nessuno | Testo da disegnare sull'immagine |
| `bgColor` | `string` | no | colore tema dal `ThemeService` | Esadecimale, es. `'#3a86ff'` |
| `textColor` | `string` | no | contrasto WCAG automatico su `bgColor` | Esadecimale |
| `fontSize` | `number` | no | `40` | Pixel |
| `fontFamily` | `'System' \| 'Arial' \| 'Verdana' \| 'Georgia' \| 'Times' \| 'CourierNew'` | no | `'System'` | Font di sistema, nessuna dipendenza esterna |
| `ratio` | `'4:3' \| '16:9' \| '1:1' \| '9:16'` | no | `'4:3'` | Rapporto d'aspetto del canvas |
| `maxWidth` | `number` | no | `1200` | Larghezza massima in pixel |
| `lineHeight` | `number` | no | `1.4` | Moltiplicatore di interlinea rispetto a `fontSize` |
| `renderMode` | `'wrap' \| 'exactInLine' \| 'fixedRatio'` | no | `'wrap'` | Vedi sotto |

**Valori di `renderMode`**:

| Valore | Comportamento |
|---|---|
| `'wrap'` | Il testo va a capo per rispettare `maxWidth`; l'altezza del canvas cresce con le righe |
| `'exactInLine'` | Il testo sta su una sola riga; il font viene ridimensionato finché entra in `maxWidth` |
| `'fixedRatio'` | Canvas con dimensioni fisse determinate da `ratio` e `maxWidth`; il testo va a capo ma non altera le dimensioni |

> ⚠️ Se il componente rimuove l'`<img>` via `@if` mentre un render è in corso, `canvasChange` non viene emesso al momento della distruzione. Resettare `canvas` esplicitamente prima di rimuovere l'elemento (es. `canvas.set(null)`).

---

#### `[qrContent]`

**Cosa fa:** genera un QR code PNG tramite `QrCodeService` e lo imposta come `src` dell'`<img>`. Non opera in SSR. Emette il Blob originale via `(blobChange)` (per download/share) e il messaggio di errore tradotto via `(errorChange)`. Un token monotono previene race condition.

```typescript
import { QrRenderDirective } from '../../core/engine/directives/qr-render.directive';
import { QrConfig } from '../../core/engine/services/qr-code.service';
import { computed, signal } from '@angular/core';

@Component({
    imports: [QrRenderDirective],
})
export class MioComponent {
    readonly qrConfig = computed<QrConfig>(() => ({
        type: 'text',
        content: this.url(),
    }));
    readonly qrBlob  = signal<Blob | null>(null);
    readonly qrError = signal<string | null>(null);
}
```

```html
<img [qrContent]="qrConfig()"
     (blobChange)="qrBlob.set($event)"
     (errorChange)="qrError.set($event)"
     alt="QR Code"
     class="img-fluid">
@if (qrError()) {
    <p class="text-danger">{{ qrError() }}</p>
}
```

| Input | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `qrContent` | `QrConfig \| null` | no (default `null`) | `null` rimuove `src` ed emette `blobChange(null)` e `errorChange(null)` |

| Output | Tipo | Note |
|---|---|---|
| `blobChange` | `Blob \| null` | Blob PNG del QR; `null` su errore o quando `qrContent` è `null` |
| `errorChange` | `string \| null` | Messaggio d'errore tradotto nella lingua corrente; `null` se la generazione ha avuto successo |

**`QrConfig`**, discriminated union su `type`. Il campo `type` è sempre obbligatorio; gli altri campi dipendono dal tipo scelto:

```typescript
| { type: 'text';      content: string }
| { type: 'whatsapp';  phone: string;  text?: string }
| { type: 'email';     to: string;     subject?: string; body?: string }
| { type: 'wifi';      ssid: string;   password?: string; encryption?: 'WPA' | 'WEP' | 'nopass' }
| { type: 'sepa';      iban: string;   name: string; amount: number; remittance?: string }
```

`phone` per `whatsapp` deve essere in formato E.164 (es. `'+39331234567'`).
`iban` per `sepa` viene validato; se non valido `errorChange` emette il messaggio d'errore tradotto.

> ⚠️ Stessa limitazione di `[imgRender]` sui signal al destroy: resettare `qrBlob` e `qrError` a `null` prima di rimuovere l'`<img>` via `@if`.

---

#### `[appContextMenu]`

**Cosa fa:** aggiunge un menu contestuale a qualsiasi elemento HTML. Su desktop si apre con click destro come popover posizionato vicino al cursore. Su touch (mobile, penna) si apre con long-press (450 ms) come bottom sheet a tutta larghezza. Si chiude su click fuori dall'overlay, tasto `Escape`, o selezione di un'opzione. Se `appContextMenu` è un array vuoto il long-press non viene attivato (il click destro rimane comunque intercettato).

```typescript
import { ContextMenuDirective } from '../../core/engine/directives/context-menu.directive';
import { ContextMenuOption } from '../../components/shared/context-menu/context-menu.models';
import { computed } from '@angular/core';

@Component({
    imports: [ContextMenuDirective],
})
export class MioComponent {
    // Le opzioni sono un computed signal: si aggiornano automaticamente
    // quando cambiano le dipendenze (es. this.puòEliminare()).
    readonly opzioni = computed<ContextMenuOption[]>(() => [
        {
            label: 'Scarica',
            icon: 'fa-solid fa-download',   // classe Font Awesome completa
            action: () => this.scarica(),
        },
        { separator: true },   // divisore visuale, gli altri campi vengono ignorati
        {
            label: 'Elimina',
            icon: 'fa-solid fa-trash',
            disabled: !this.puòEliminare(),   // voce visibile ma non cliccabile
            action: () => this.elimina(),
        },
    ]);
}
```

```html
<div [appContextMenu]="opzioni()">
    <!-- qualsiasi contenuto, click destro o long-press attiva il menu -->
</div>
```

| Input | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `appContextMenu` | `ContextMenuOption[]` | no (default `[]`) | Array vuoto: long-press disabilitato, click destro ancora intercettato |

**`ContextMenuOption`**:

| Campo | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `label` | `string` | sì | Testo dell'opzione (ignorato se `separator: true`) |
| `action` | `() => void` | no | Callback eseguita al click sull'opzione |
| `icon` | `string` | no | Classe Font Awesome completa, es. `'fa-solid fa-download'` |
| `disabled` | `boolean` | no | Se `true`: voce visibile ma non cliccabile |
| `separator` | `boolean` | no | Se `true`: renderizza un `<hr>` divisore; gli altri campi vengono ignorati |

### Componenti

| Componente | Uso |
|---|---|
| `<app-loading [loading]="bool">` | Spinner Bootstrap se `true`, `<ng-content>` se `false` |
| `<app-nav-link [link]="…" [cssClass]="…" [activeCssClass]="…" (linkClick)="…">` | Atomo link: `<a>` interno via routerLink, `<span aria-current>` se rotta attiva, `<a target="_blank">` se esterno |
| `<app-nav-dropdown [item]="…" (toggle)="…" (linkClick)="…">` | `<details>`/`<summary>` + lista figli renderizzati come `<app-nav-link>`; usato dalla navbar |
| `<app-footer-nav [links]="…">` | Griglia di gruppi/link del footer |
| `<app-profile-render [profile]="…">` | Render strutturato del profilo aziendale (contatti + dati societari) |
| `<app-social-link [type]="…" [value]="…" [label]="…" [showLabel]="bool">` | 35+ social con icona Font Awesome e colore brand; `label` sovrascrive il testo mostrato, `showLabel` (default `false`) lo rende visibile |
| `<app-cookie-banner>` | Banner GDPR con testo Markdown e placeholder dinamici |
| `<app-back-to-top>` | Pulsante scroll-to-top con soglia; colori dal tema |
| `<app-smoke-effect>` | Effetto particellare su canvas configurabile da `site.ts` |

### Pipe

| Pipe | Uso |
|---|---|
| `{{ chiave \| translate }}` | i18n reattivo: si aggiorna al cambio lingua senza refresh della pagina |
| `{{ testo \| markdown }}` | Markdown → HTML con protezione XSS integrata (HTML raw ignorato) |

### ImgBuilderService, dettaglio

```typescript
// Metodi istanza (browser, leggono i Signal del tema come default)
buildCanvas(text, opts?) → Promise<HTMLCanvasElement | null>
buildBlob(text, opts?)   → Promise<Blob | null>
buildFile(text, name?, opts?) → Promise<File | null>

// Metodo statico (SSR-safe, usato anche da /cdn-cgi/preview)
ImgBuilderService.buildSvg(text, bgColor, textColor, fontSize, fontFamily, ratio, maxWidth, lineHeight, wordWrap)
// → { svg: string, width: number, height: number }
```

`opts` è tutto opzionale: `bgColor`/`textColor` (dal tema), `fontSize` (40px), `ratio` (`'4:3'`), `fontFamily`, `wordWrap` (true), `maxWidth` (1200px), `lineHeight` (1.4). In SSR i metodi istanza restituiscono `null`.

### QrCodeService, dettaglio

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

### ShareService, dettaglio

```typescript
this.share.copyText('testo');                           // Clipboard API con notifica
this.share.shareText('titolo', 'testo o URL');          // Web Share API su testo (fallback: copia in clipboard)
this.share.shareBlob(blob, 'file.png', 'titolo');       // Web Share API su Blob (fallback: download)
this.share.shareCanvas(canvas, 'img.png', 'titolo');    // Condivide un HTMLCanvasElement come PNG
this.share.downloadBlob(blob, 'file.png');              // Download diretto
```

### Pagine legali

Un unico componente (`PolicyComponent`) gestisce privacy, cookie policy, termini e note legali. `ContentResolver` carica il Markdown corretto da `/assets/legal/{tipo}.{lang}.md` con fallback all'italiano. Per aggiungere una nuova pagina legale: aggiungere un `case` in `ContentResolver.loadResolved()` e il file `.md` corrispondente.

### Accessibilità integrata

- **Skip-link** (WCAG 2.4.1): visibile esclusivamente su focus per navigazione da tastiera
- **`prefers-reduced-motion`** (WCAG 2.3.3): animazioni disabilitate se la preferenza è attiva
- **`safe-area-inset`**: navbar e footer si adattano ai dispositivi con notch
- **Contrasto AA**: `text-body-secondary` forzato a `#595f66`

