# AGENTS.md

Le **regole trasversali** e le **ricette pratiche** del progetto, per chi ci sviluppa — umano o assistente di coding. Gli esempi di codice qui sotto servono soprattutto a un **agente** — gli evitano di scandire mezzo repo per ricavare un pattern; a un umano bastano i puntatori, il codice lo legge direttamente. Il *cosa offre / dove vive* per-feature sta nei README ([frontend](frontend/README.md), [backend](backend/README.md)); l'implementazione interna dell'Engine non citata per nome in quei README sta in [ENGINE.md](ENGINE.md).

> **Perché si chiama proprio `AGENTS.md` — non rinominarlo.** Non è una scelta di stile: è un **nome-convenzione cross-tool**, non legato a Br1WebEngine né a un singolo strumento. Diversi coding agent (Claude Code, Codex CLI, Cursor e altri) cercano in automatico, alla radice di un repo, un file con **esattamente questo nome** per caricare contesto di progetto — nessuna configurazione da parte tua. Un umano lo trova comunque se linkato (come nella mappa di [README.md](README.md)); un agente lo trova **da sé** solo finché resta `AGENTS.md`. Rinominarlo (es. `DEVGUIDE.md`, `RECIPES.md`) non romperebbe nulla per un lettore umano, ma toglierebbe l'auto-discovery agli agenti — la proprietà per cui questo file è fatto così.

## La regola d'oro: Engine vs Dominio

- **Engine = INTOCCABILE**, si aggiorna dal template via merge: `backend/Engine/`, `frontend/src/app/core/engine/`, `frontend/src/styles/engine/`, `frontend/src/assets/i18n/basic.*.json`. Lo **consumi** (token, signal, direttive, classi base), non lo modifichi mai.
- **Dominio = tuo**: tutto il resto. Cambi i comportamenti per **configurazione** (`global-settings(.local).json`, `site.ts`, sezione `Custom`) o per **estensione** (sottoclassi `Engine*`, nuovi servizi), mai editando l'Engine — o il prossimo merge dal template va in conflitto.

## Build, run, test

- **Frontend:** `cd frontend && npm install && npm run start` — **Backend:** `cd backend && dotnet run` (`/health` anonimo; senza `Security.ApiKeys` nel `.local`, ogni richiesta è `401`).
- **Nuovo progetto figlio:** `node setup.mjs "Nome Progetto"`.
- **Qualità (gate = CI, GitHub Actions):** lint, i18n, tsc, dipendenze circolari, a11y, Lighthouse, `npm audit`, vulnerabilità NuGet, gitleaks. In locale on-demand: `./scripts/test/run-all.sh`. Niente hook pre-push: non re-introdurlo. I test unitari sono privati di ogni progetto.

## Commit

Commit narrativi a tema, stile branch + squash: una questione chiusa per commit, non micro-commit.

## Ricette — frontend

#### Aggiungere una pagina
```typescript
// site.ts
export enum PageType { Home, NuovaPagina /* … */ }
pages: (ctx) => [
  { path: 'nuova', pageType: PageType.NuovaPagina, title: 'Nuova',
    requiresAuth: false,                       // true → protetta (guard + redirect), SSR off
    component: () => import('./pages/nuova/nuova.component') },
];
```
```typescript
// pages/nuova/nuova.component.ts — estende la base: this.api / translate / asset / notify già pronti
export default class NuovaComponent extends PageBaseComponent { }
```
```html
<a [appPage]="PageType.NuovaPagina">Vai</a>   <!-- mai URL grezzi -->
```

#### Aggiungere un endpoint al client
```typescript
// core/services/api.service.ts
getArticolo(id: string): Promise<Articolo> {
  return this.api_get<Articolo>(`articolo/${encodeURIComponent(id)}`);   // { silent: true } per UI d'errore tua
}
```

#### Persistere dati lato client (cookie, Web Storage, consenso)
UN registro (`COOKIE_MAP` in `core/services/cookie-registry.ts`), UN'API, gated dal consenso — registrare una voce basta per: toggle nel banner, riga in policy (mezzo/provider/durata), pulizia alla revoca. Ricetta completa (shape della voce, campi opzionali, la variante `match: 'prefix'` per famiglie di chiavi di SDK di terza parte) in [frontend/README.md](frontend/README.md#aggiungere-un-cookie-o-una-voce-di-web-storage). Qui solo la forma di chiamata, che è quella che serve scrivendo codice:
```typescript
// nel componente/service — instrada sul mezzo (cookie o Web Storage) in base a come la voce è
// registrata, tipizzato su valueType
this.consent.set('mioSalvataggio', { x: 1 });   // gated dal consenso; in SSR è no-op (Web Storage browser-only)
const v = this.consent.get('mioSalvataggio');    // → tipo da valueType | null
```
**MAI `localStorage`/`sessionStorage` diretti** (lo vieta una regola ESLint, eccetto `CookieConsentService`/`TokenService`): tutto passa dal gate, l'inventario in policy resta completo. `setCookie/getCookie/removeCookie` sono alias deprecati di `set/get/remove`. Su una voce `match: 'prefix'` (famiglia di chiavi di un SDK terzo) il gating sta a te: carica l'SDK solo dopo il consenso della sua categoria, altrimenti scrive le sue chiavi prima che tu possa pulirle.

#### Google Consent Mode v2 (predisposizione, non attiva di default)
Ricetta completa (snippet interi) in [frontend/README.md](frontend/README.md) §"Google Consent Mode v2". Qui solo la mappa di proprietà, perché è quella che conta per non romperla al prossimo merge:

1. `src/index.html` (**Dominio**) — stub `gtag('consent','default',{...:'denied'})` PRIMA di qualunque `gtag.js`/GTM.
2. `security-headers.json` (**Scaffold, con eccezione dichiarata** nella `_nota` del file) — whitelist CSP per i domini Google (`script-src`/`connect-src`). **Attenzione:** è Scaffold, quindi un `git merge template/main` lo sovrascrive con la versione del template a ogni merge — l'override CSP **non sopravvive da solo**, va riapplicato a mano dopo ogni merge dal template.
3. `cookie-registry.ts` (**Dominio**) — censisci `_ga`/`_gid` ecc.: categoria `Analytics` (GA4) o `Profiling` (Ads/remarketing) — sono due consensi distinti anche per Google.
4. Un `effect()` di progetto (**Dominio**, es. `core/services/analytics.service.ts`) che chiama `gtag('consent','update', {...})` sui signal `analyticsAccepted()`/`profilingAccepted()` di `CookieConsentService` — stesso pattern di gating della ricetta sopra.

#### AI Act e newsletter — promemoria, non feature dell'Engine
Nessuno dei due esiste nel template oggi (niente chatbot, niente generazione IA, niente newsletter): diventano rilevanti solo se il progetto figlio li aggiunge.
- **Chatbot/contenuti IA** (obbligo dal 2 agosto 2026): avviso esplicito al primo messaggio ("Stai parlando con un sistema di IA"); contenuti generati senza revisione editoriale umana → etichettatura visibile.
- **Newsletter/marketing**: l'iscrizione NON passa da `ConsentCategory`/`CookieConsentService` (quello gestisce storage/tracciamento lato browser) — serve una checkbox propria, non pre-spuntata, separata da un eventuale consenso alla profilazione degli iscritti.

#### Leggere `global-settings.json` tipizzato
Il tipo `GlobalSettings` è **generato dallo schema** (sorgente unica), non scritto a mano. Dopo aver toccato `global-settings.schema.json`, rigeneralo; un typo di chiave diventa errore a `tsc`.
```bash
npm run generate:types   # → src/app/core/engine/global-settings.types.ts (committato, DO NOT MODIFY)
```
```typescript
import type { GlobalSettings } from '...engine/global-settings.types';
const s = JSON.parse(raw) as GlobalSettings;
s.Localization?.SupportedLanguages   // tipizzato; `s.Localizaton` non compila
```

#### SEO: escludere una pagina dall'indice
```typescript
// site.ts — pagina pubblica e SSR ma fuori da sitemap e indice (X-Robots-Tag: noindex).
// A differenza di requiresAuth NON forza il client-render. Default: noindex false.
{ path: 'grazie', pageType: PageType.Grazie,
  component: () => import('./pages/grazie/grazie.component'),
  otherSEO: { noindex: true } }
```

#### Comporre l'identità da una fonte diversa dal file
Il caso base si riempie in `data/identity.json` (campi nello schema engine `Engine/Models/Identity/identity.schema.json`). Per prendere un pezzo da un DB/API si fa l'override del solo metodo dedicato: stesso tipo in ingresso e in uscita, arricchisci e ritorna. **Dichiari col framework** (`DayOfWeek`, `TimeOnly`, codici ISO), non stringhe magiche né nozioni di schema.org: l'Engine deriva resa e JSON-LD.
```csharp
// backend/Store/AppIdentityStore.cs (di proprietà del progetto)
protected override async Task<SiteIdentity?> ComposeIdentityAsync(
    SiteIdentity? identity, string language, CancellationToken ct)
{
    identity ??= new SiteIdentity();                    // null se non c'è il file
    identity.OpeningHours =                             // lista di intervalli tipizzati
    [
        new() { Day = DayOfWeek.Tuesday,   Opens = new(9, 0), Closes = new(18, 0) },
        new() { Day = DayOfWeek.Wednesday, Opens = new(9, 0), Closes = new(13, 0) },  // pausa pranzo
        new() { Day = DayOfWeek.Wednesday, Opens = new(15, 0), Closes = new(18, 0) },
    ];
    return identity;                                     // stesso oggetto, arricchito
}
```
Stessa filosofia per gli altri "codici": `Currency` ISO 4217, `SedeLegale.Nazione` ISO 3166, lingue in `Localization` — dichiari il codice, il framework (`CultureInfo`/`Intl`) dà nome e formato. Per una proprietà schema.org che il modello non tipizza, valorizza `identity.Extra`: fuso **per ultimo** nel nodo entità brand, sovrascrive i default (anche il `@type`, es. → `LocalBusiness` con `geo`/`openingHoursSpecification`); l'Engine si tiene solo `@context` e `@id`.

#### Sito di un'attività fisica (LocalBusiness)
Dichiara `businessType` (sottotipo schema.org) in `data/identity.json`: l'entità brand diventa quel `@type` con indirizzo e `openingHoursSpecification` portati **sul nodo**. Gli `openingHours` (già tipizzati) non cambiano; l'indirizzo è la `sedeOperativa` (fallback `sedeLegale`); la geo (opzionale per Google, basta l'indirizzo) va in `extra`. `businessType` è una **stringa libera** (qualsiasi sottotipo `LocalBusiness` valido), non un enum: la metti diretta — non serve `extra`, che resta solo per le proprietà *in più* (geo, priceRange…). Non è un enum perché i sottotipi sono 150+ ed evolvono, e tanto `extra` può comunque cambiare `@type`: validità schema.org a carico tuo.
```json
{
  "businessType": "Restaurant",
  "sedeOperativa": { "via": "Via Roma", "civico": "1", "cap": "00100", "citta": "Roma", "nazione": "IT" },
  "openingHours": [ { "day": "Monday", "opens": "12:00", "closes": "23:00" } ],
  "extra": { "servesCuisine": "Italian", "priceRange": "€€" }
}
```

#### SEO: dati strutturati (JSON-LD) con campi parlanti
Dichiari `kind` + campi, l'Engine traduce in schema.org (`structured-data.ts`). `kind`: `article` | `faq` | `product` | `event` | `raw`.
```typescript
// site.ts — STATICI (es. FAQ con domande fisse)
otherSEO: { structuredData: { kind: 'faq', questions: [{ question: 'Come?', answer: 'Così.' }] } }
```
```typescript
// content.resolver.ts — DINAMICI dal contenuto (hanno la precedenza sullo statico)
case PageType.Articolo: {
  const art = await this.apiService.getArticolo(id); content = art;
  structuredData = art && { kind: 'article', headline: art.titolo, author: art.autore, publishedOn: art.data };
  break;
}
// casi non coperti: { kind: 'raw', jsonLd: { '@type': 'Recipe', name: '…' } }
```

## Ricette — backend

#### Aggiungere un endpoint
DTO in `Models/`, logica in `Services/`, thin controller:
```csharp
[Route("api/v1/orders")]
public class OrdersController : EngineProtectedController   // o EngineApiController (solo API key)
{
    private readonly OrderService _orders;
    public OrdersController(OrderService orders, ILogger<OrdersController> logger)
        : base(logger) => _orders = orders;

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id, CancellationToken ct)
        => Ok(await _orders.GetAsync(id, ct));
}
```

#### Errori
Lancia, non `return BadRequest`:
```csharp
if (user is null) throw new NotFoundException("utente");   // → 404 ProblemDetails localizzato
```
Un tipo nuovo = una sottoclasse di `ApiException` (in una classe del tuo dominio) + la chiave nei `Resources/*.resx`:
```csharp
public class PaymentRequiredException : ApiException {
    public PaymentRequiredException() : base("error_payment_required", 402) { }
}
```

#### Leggere la sessione
```csharp
var session = User.GetSession<SessionInfo>();   // null se token assente/malformato
if (session is null) throw new UnauthorizedException();
```

#### Pubblicare una notifica realtime
Proprietà ambient, niente inject:
```csharp
Notifications.Publish(NotificationTarget.Connection(ConnectionId!),
    new NotificationMessage { Type = "toast",
        Payload = new { messageKey = "fatto", icon = "success" } });
```

#### Task lungo con notifica a fine lavoro (email o realtime)
```csharp
BackgroundQueue.TryEnqueue(async (services, ct) => {
    var store = services.GetRequiredService<IContentStore>();   // scope DI proprio
    await ImportAsync(store, ct);
    await services.GetRequiredService<IDeliveryService>().DeliverAsync(
        new DeliveryMessage { Target = target, Email = email, Body = "Import completato" },
        DeliveryChannel.Auto, ct);                              // Auto = realtime, fallback email se offline
});
return Accepted();                                             // 202 (503 se la coda è satura)
```

#### Sostituire un servizio dell'Engine
Vince l'ultima registrazione:
```csharp
// Program.cs, blocco "── SERVIZI APPLICATIVI ──" — es. l'identità da un DB invece che da identity.json
builder.Services.AddSingleton<IIdentityStore, DbIdentityStore>();
```

#### Chiamare un'API esterna
Outbound: URL/chiave in config, client tipizzato, errori verso l'upstream:
```csharp
// Program.cs, blocco "── SERVIZI APPLICATIVI ──"
builder.Services.Configure<PaymentProviderOptions>(builder.Configuration.GetSection("PaymentProvider"));
builder.Services.AddHttpClient<PaymentProviderService>();   // BaseUrl/ApiKey da IOptions, mai hardcoded
```
```csharp
// Services/PaymentProviderService.cs — errore upstream, non un 500 generico
if (!response.IsSuccessStatusCode) throw new BadGatewayException();   // 502; vedi anche 503/504
```
Dettagli (config `Custom`/sezione dedicata, segreto in `.local.json` o env var, timeout/gate) in [backend/README.md](backend/README.md) §8.

#### Ricevere un webhook
Inbound: firma sul body grezzo, non sul DTO:
```csharp
[HttpPost, AllowAnonymous]   // pubblico per forza: il chiamante è il servizio terzo, non il tuo frontend
public async Task<IActionResult> Receive(CancellationToken ct) {
    var rawBody = await new StreamReader(Request.Body).ReadToEndAsync(ct);
    if (!WebhookSignature.IsValid(rawBody, Request.Headers["X-Signature"]!, _secret))
        throw new UnauthorizedException();                 // valida PRIMA di deserializzare
    BackgroundQueue.TryEnqueue(async (services, ct) => /* elabora fuori dalla richiesta */ );
    return Ok();                                            // 200 rapido: i provider ritentano se non rispondi in fretta
}
```
Dettagli in [backend/README.md](backend/README.md) §8.

## Documentazione

Documenta **cosa garantisce e perché**, non il *come* riga-per-riga — il come vive nei commenti del codice, l'unica fonte che non mente ai refactor. Le ricette qui sopra sono **pattern d'uso** (cosa fare), non spiegazioni del motore.
