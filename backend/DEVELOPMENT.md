# Backend — Guida allo sviluppo

Questa guida è rivolta a chi usa Br1WebEngine come template base e vuole estenderlo: aggiungere endpoint, servizi, store o logica di sicurezza seguendo i pattern già stabiliti.

**Se non conosci ASP.NET Core**, questa guida ti accompagna passo per passo spiegando perché ogni pezzo è dove si trova. Se lo conosci già, i pattern ti sembreranno familiari ma più compatti del solito: l'engine elimina tutto il boilerplate ripetitivo (API key, JWT, logger) dalle classi concrete.

Per l'overview del progetto, la configurazione e il deploy → [`README.md`](../README.md).  
Per i pattern lato frontend → [`frontend/DEVELOPMENT.md`](../frontend/DEVELOPMENT.md).

---

## Sommario

- [Architettura in breve](#architettura-in-breve)
- [Aggiungere un endpoint](#aggiungere-un-endpoint)
- [Aggiungere un servizio](#aggiungere-un-servizio)
- [Gestione degli errori](#gestione-degli-errori)
- [Sostituire FileContentStore con un database](#sostituire-filecontentstore-con-un-database)
- [Endpoint protetti da login JWT](#endpoint-protetti-da-login-jwt)
- [Configurazione (appsettings.json)](#configurazione-appsettingsjson)
- [Content store](#content-store)
- [Login condizionale (JWT)](#login-condizionale-jwt)
- [Servizi registrati](#servizi-registrati)

---

## Architettura in breve

### Struttura delle cartelle

```
backend/
├── Controllers/                  ← endpoint concreti — aggiungi qui i tuoi
│   ├── BaseController.cs         ← endpoint pubblici (solo API key)
│   ├── AuthController.cs         ← POST /auth/login → genera JWT
│   ├── ProtectedController.cs    ← endpoint protetti (API key + JWT)
│   └── BlobController.cs         ← GET /blob/:slug → file dal volume uploads
│
├── Engine/                       ← infrastruttura del template — non modificare
│   ├── Controllers/
│   │   ├── EngineApiController.cs        ← base di tutti i controller: [ApiController], [Authorize], Logger
│   │   ├── EngineAuthController.cs       ← aggiunge Auth (AuthService) per generare JWT
│   │   └── EngineProtectedController.cs  ← aggiunge policy RequireLogin (JWT obbligatorio)
│   └── Services/
│       └── AuthService.cs                ← GenerateToken(): firma il JWT con HMAC-SHA256
│
├── Models/                       ← DTO, modelli di risposta, eccezioni
│   ├── ApiException.cs           ← NotFoundException, InvalidParametersException, ecc.
│   ├── Configuration/
│   │   └── SecurityOptions.cs    ← binding di appsettings.json → Security
│   └── Legal/
│       └── UniversalLegalModel.cs← modello legale riutilizzabile nei progetti figli
│
├── Security/                     ← middleware e autenticazione — non modificare
│   ├── ApiExceptionHandler.cs    ← converte ApiException in ProblemDetails (RFC 9457)
│   ├── ApiKeyAuthentication.cs   ← verifica X-Api-Key su ogni richiesta
│   ├── SecurityExtensions.cs     ← AddEngineServices() / UseEngineSecurity()
│   ├── SecurityHeadersMiddleware.cs ← aggiunge header di sicurezza (X-Frame-Options, ecc.)
│   └── TemplateControllerFeatureProvider.cs ← esclude Auth/Protected se JWT non configurato
│
├── Services/                     ← logica applicativa — aggiungi qui i tuoi servizi
│   └── SiteService.cs            ← esempio: profilo, social, legal
│
├── Store/                        ← layer di persistenza
│   ├── IContentStore.cs          ← contratto interface (implementa qui se cambi storage)
│   └── FileContentStore.cs       ← implementazione default: legge JSON da data/
│
├── data/                         ← file JSON letti da FileContentStore (baked nell'immagine, gestiti via git)
│   ├── irl.json                  ← dati profilo e legali
│   └── social.json               ← link social
│
├── db/                           ← volume Docker persistente (non sovrascritto al rebuild)
│   └── .gitkeep                  ← tieni qui SQLite (.db) e JSON runtime mutabili
│
├── Program.cs                    ← bootstrap, DI, pipeline middleware
└── appsettings.json              ← API key, CORS, JWT secret, localizzazione
```

**Regola pratica:** tutto ciò che si trova in `Engine/` e `Security/` è infrastruttura del template — funziona senza essere toccato. Tutto il resto (`Controllers/`, `Services/`, `Store/`, `Models/`, `data/`) è territorio di progetto.

### Perché le classi base dell'engine?

In ASP.NET Core, ogni controller ha bisogno di `[ApiController]`, `[Authorize]`, un logger, e — se usa JWT — del servizio `AuthService`. Riscrivere queste decorazioni su ogni controller genera errori e incoerenze.

Le classi `Engine/Controllers/` risolvono questo problema: ogni controller concreto eredita tutto ciò di cui ha bisogno senza dichiararlo esplicitamente.

| Controller astratto | Cosa ottiene il controller concreto che lo estende |
|---|---|
| `EngineApiController` | `[ApiController]`, `[Authorize]` (API key), proprietà `Logger` già iniettata |
| `EngineAuthController` | Tutto quanto sopra + proprietà protetta `Auth` (l'`AuthService` per generare token JWT) |
| `EngineProtectedController` | `EngineApiController` + `[Authorize(Policy = RequireLogin)]` — richiede anche il JWT valido |

Concretamente: quando scrivi `public class BaseController : EngineApiController`, il tuo controller ha già l'autenticazione API key configurata e `Logger` pronto. Non devi aggiungere `[Authorize]` né iniettare `ILogger` nel costruttore.

### API esposte (esempi del template)

| Metodo | Path | Auth | Note |
|---|---|---|---|
| `GET` | `/api/profile` | API key | Profilo aziendale localizzato in base ad `Accept-Language` |
| `GET` | `/api/social` | API key | Lista social; filtro opzionale con query param `nomi` |
| `GET` | `/api/blob/{slug}` | API key | File dal volume `/app/uploads`; path traversal bloccato; `Content-Type` rilevato dall'estensione |
| `POST` | `/api/auth/login` | API key | Body `{ "pwd": "..." }`; esposto solo quando `LoginEnabled = true` |
| `GET` | `/health` | nessuna | Health check del processo |

Gli endpoint in `ProtectedController` richiedono API key + JWT e sono inaccessibili finché `LoginEnabled = false`.

### Flusso di una richiesta

Capire questo flusso aiuta a sapere dove intervenire quando qualcosa non funziona:

```
Request → API Key → RateLimiter → (JWT se protetto) → Controller → Service → IContentStore
                                                              ↓
                                               ApiException → ProblemDetails JSON
```

La richiesta attraversa prima i middleware di sicurezza (API key, rate limiter, JWT), poi arriva al controller, che delega tutta la logica al servizio. Se il servizio lancia un'`ApiException`, il middleware `ApiExceptionHandler` la intercetta e costruisce automaticamente una risposta JSON nel formato standard ProblemDetails (RFC 9457). Il controller non deve mai gestire gli errori manualmente.

### Ordine della pipeline HTTP (critico — non invertire)

`UseTemplateSecurity()` registra i middleware in quest'ordine fisso. Cambiare quest'ordine causa bug subdoli (per esempio: il rate limiter che legge l'IP sbagliato da proxy, o i preflight CORS che consumano quota).

| # | Middleware | Perché in questa posizione |
|---|-----------|---------------------------|
| 1 | **ForwardedHeaders** | deve essere primo: sovrascrive `RemoteIpAddress` con l'IP reale prima che il rate limiter lo legga (solo se `BehindProxy: true`) |
| 2 | **CORS** | gestisce i preflight `OPTIONS` prima del rate limiter; i preflight non consumano quota |
| 3 | **RateLimiter** | fail fast per IP: 100 req/min globali, 5/min su `/auth/login`; posizione alta = risparmio risorse |
| 4 | **SecurityHeaders** | aggiunge header anti-clickjacking/XSS su ogni risposta, inclusi 429 e errori |
| 5 | **HSTS** | forza HTTPS |
| 6 | **ExceptionHandler** | converte `ApiException` → `ProblemDetails` JSON |

Dopo `UseTemplateSecurity()`, `Program.cs` aggiunge nell'ordine:

| # | Middleware | Note |
|---|-----------|------|
| 7 | **RequestLocalization** | legge `Accept-Language` → imposta `CultureInfo.CurrentUICulture` |
| 8 | **Authentication** | valida API key (sempre) e JWT Bearer (se `LoginEnabled`) |
| 9 | **Authorization** | applica policy `RequireLogin` sui controller protetti |
| 10 | **MapControllers** | smista al controller corretto |

**Nota CORS vs AllowAnyOrigin:** `CorsOrigins` vuoto = `AllowAnyOrigin` deliberato per API pubbliche.
La protezione reale è l'API key (`X-Api-Key`), indipendente dall'origine.
Valorizzare `Security.CorsOrigins` solo per domini admin separati o multi-tenant.

---

## Aggiungere un endpoint

Aggiungere un endpoint richiede quattro passi che lavorano in strati separati. Ogni strato ha una responsabilità precisa: il DTO descrive i dati, lo store li legge, il servizio li elabora, il controller li espone via HTTP.

### Scegliere la classe base del controller

Prima di tutto, decidi che tipo di accesso deve avere il tuo endpoint:

| Scenario | Classe base da ereditare |
|----------|--------------------------|
| Endpoint pubblico (solo API key) | `EngineApiController` |
| Endpoint di autenticazione (login, solo generazione token) | `EngineAuthController` |
| Endpoint protetto (API key + JWT utente) | `EngineProtectedController` |

**Regola pratica**: i controller concreti già esistenti (`BaseController`, `AuthController`, `ProtectedController`) sono il punto giusto dove aggiungere nuovi endpoint dello stesso tipo. Creare un nuovo controller separato ha senso solo quando la responsabilità è davvero distinta — come `BlobController` per i file upload.

I passi seguenti mostrano il flusso completo per il caso tipico: un nuovo endpoint GET che legge dati dallo store, li elabora nel servizio e li restituisce al client.

### Passo 1 — Definire il DTO di risposta in `Models/`

**Perché questo passo?** Definire i tipi di risposta separatamente dai controller serve a due cose: rende chiaro esattamente cosa restituisce ogni endpoint, e permette al compilatore di verificare che il servizio restituisca davvero quel tipo.

**Dove si trova il file:** `backend/Models/` è la cartella dedicata ai DTO (Data Transfer Object) e ai modelli di risposta. Creare un file per ogni DTO mantiene gli import ordinati e rende chiaro a quale endpoint corrisponde ogni tipo.

> Questo passo è **opzionale** se l'endpoint restituisce un tipo già esistente (es. `UniversalLegalModel`) o un tipo primitivo come `string` o `bool`.

```csharp
// backend/Models/Prodotto.cs
namespace Backend.Models;

public class Prodotto
{
    public string Id { get; set; } = string.Empty;
    public string Nome { get; set; } = string.Empty;
    public decimal Prezzo { get; set; }
}
```

Nota: `= string.Empty` evita warning di nullability — in .NET 6+ i campi `string` non-nullable devono avere un valore iniziale.

### Passo 2 — Aggiungere il metodo a `IContentStore`

**Perché questo passo?** `IContentStore` è il contratto di accesso ai dati. Definire qui la firma del metodo (solo l'interfaccia, non l'implementazione) serve a garantire che chiunque sostituisca lo store — che sia `FileContentStore` con i file JSON o un futuro `DbContentStore` con un database — implementi obbligatoriamente questo metodo.

**Dove si trovano i file:** `backend/Store/IContentStore.cs` contiene l'interfaccia (il contratto), `backend/Store/FileContentStore.cs` contiene l'implementazione concreta (la lettura dai file).

> Questo passo è **opzionale** se i dati non vengono dallo store — per esempio, se si calcolano nel servizio o arrivano da un'API esterna. In quel caso scrivi la logica direttamente nel servizio.

**`Store/IContentStore.cs`** — aggiungere la firma del metodo:

```csharp
// backend/Store/IContentStore.cs
using Backend.Models.Legal;

namespace Backend.Infrastructure;

public interface IContentStore
{
    // Metodi già esistenti:
    Task<UniversalLegalModel> GetProfileAsync(string language);
    Task<Dictionary<string, string>> GetSocialAsync();

    // ↓ aggiunto
    /// <summary>Recupera tutti i prodotti per la lingua richiesta.</summary>
    Task<List<Prodotto>> GetProdottiAsync(string language);
}
```

**`Store/FileContentStore.cs`** — implementare il metodo nella classe concreta.

Il metodo `ReadFileAsync("prodotti")` legge il file `backend/data/prodotti.json`. `LocalizedJsonDeserializer.Deserialize<T>` è un helper interno dello store che risolve automaticamente i campi localizzati nel formato `{ "it": "...", "en": "..." }`, scegliendo la lingua richiesta e ricadendo sull'italiano come fallback.

```csharp
// backend/Store/FileContentStore.cs — aggiungere alla classe FileContentStore
using Backend.Models;

public async Task<List<Prodotto>> GetProdottiAsync(string language)
{
    var json = await ReadFileAsync("prodotti");   // legge backend/data/prodotti.json
    return LocalizedJsonDeserializer.Deserialize<List<Prodotto>>(json, language, "it");
}
```

Creare anche il file dati `backend/data/prodotti.json` con la struttura attesa.

### Passo 3 — Aggiungere il metodo al servizio in `Services/`

**Perché questo passo?** Il servizio è il luogo della logica di business. Non si mette logica nei controller (devono restare sottili: ricevono una request, chiamano il servizio, restituiscono `Ok`). Non si mette logica nello store (deve restare un accesso dati puro). Il servizio è il layer intermedio dove si fa il filtraggio, la validazione del dominio, la gestione dei null, la scelta della lingua.

**Dove si trova il file:** `backend/Services/` contiene tutti i servizi applicativi. Creare un file per servizio.

`CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` legge la lingua già impostata dal middleware di localizzazione dall'header `Accept-Language` della richiesta. Il servizio non deve preoccuparsi di come arriva la lingua: è già disponibile nel contesto della richiesta.

```csharp
// backend/Services/ProdottoService.cs
using System.Globalization;
using Backend.Infrastructure;
using Backend.Models;

namespace Backend.Services;

public class ProdottoService
{
    private readonly IContentStore _store;

    // Il costruttore riceve IContentStore (non FileContentStore direttamente):
    // questo rende il servizio indipendente dall'implementazione dello storage.
    // Se domani sostituisci FileContentStore con DbContentStore, questo file non cambia.
    public ProdottoService(IContentStore store)
    {
        _store = store;
    }

    /// <summary>Restituisce tutti i prodotti nella lingua corrente della richiesta.</summary>
    public async Task<List<Prodotto>> GetProdottiAsync()
    {
        // CurrentUICulture è già impostata dal middleware RequestLocalization
        // in base all'header Accept-Language della richiesta. Non serve passarla come parametro.
        var language = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        var data = await _store.GetProdottiAsync(language);

        // Se lo store non trova dati, si lancia NotFoundException.
        // Il middleware ApiExceptionHandler la intercetta e restituisce un 404 JSON.
        // Non serve try/catch nel controller.
        if (data == null || data.Count == 0)
            throw new NotFoundException("prodotti");

        return data;
    }

    /// <summary>Restituisce un singolo prodotto per ID.</summary>
    public async Task<Prodotto> GetProdottoByIdAsync(string id)
    {
        // Validazione dell'input: un ID vuoto è un errore del chiamante, non un errore interno.
        // InvalidParametersException → 400 Bad Request automatico.
        if (string.IsNullOrWhiteSpace(id))
            throw new InvalidParametersException();

        var language = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        var tutti = await _store.GetProdottiAsync(language);
        var prodotto = tutti?.FirstOrDefault(p => p.Id == id);

        if (prodotto == null)
            throw new NotFoundException($"prodotto {id}");

        return prodotto;
    }
}
```

**Registrare il servizio in `Program.cs`:**

`Program.cs` si trova nella radice del progetto `backend/`. La sezione dei servizi applicativi è marcata con il commento `SERVIZI APPLICATIVI`. Aggiungere una riga per ogni nuovo servizio.

`AddScoped` registra il servizio con una durata per-request: una nuova istanza per ogni richiesta HTTP. È il lifetime corretto per i servizi che leggono `CultureInfo.CurrentUICulture`, perché quella proprietà è specifica della richiesta corrente. Usare `AddSingleton` per servizi stateless (es. `FileContentStore`) che non dipendono da stato per-request.

```csharp
// backend/Program.cs — sezione "SERVIZI APPLICATIVI"
builder.Services.AddScoped<ProdottoService>();
```

### Passo 4 — Aggiungere l'endpoint al controller

**Perché questo passo?** Il controller è il punto di ingresso HTTP. Il suo ruolo è minimale: ricevere la richiesta, delegare al servizio, restituire `Ok(data)`. Non contiene logica di business.

**Dove si trova il file:** `backend/Controllers/BaseController.cs` contiene gli endpoint pubblici. Non aggiungere `[ApiController]`, `[Authorize]` o il logger: li eredita tutti da `EngineApiController`.

`Logger` (maiuscolo) è la proprietà protetta esposta da `EngineApiController` — è già iniettata e pronta. Non serve dichiarare `ILogger` nel costruttore.

```csharp
// backend/Controllers/BaseController.cs
using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers;

[Route("")]
public class BaseController : EngineApiController
{
    private readonly SiteService _service;
    private readonly ProdottoService _prodottoService;   // ← aggiunto

    public BaseController(
        SiteService service,
        ProdottoService prodottoService,                 // ← aggiunto nel costruttore
        ILogger<BaseController> logger)
        : base(logger)   // ← logger passato alla classe base (EngineApiController)
    {
        _service = service;
        _prodottoService = prodottoService;
    }

    // GET /api/prodotti  — lista completa
    [HttpGet("prodotti")]
    public async Task<IActionResult> GetProdotti()
    {
        // Logger è ereditato da EngineApiController. Nessun inject manuale.
        Logger.LogInformation("Richiesta lista prodotti");
        var data = await _prodottoService.GetProdottiAsync();
        return Ok(data);   // 200 con il JSON serializzato automaticamente
    }

    // GET /api/prodotti/{id}  — singolo prodotto
    [HttpGet("prodotti/{id}")]
    public async Task<IActionResult> GetProdottoById(string id)
    {
        // La validazione dell'input qui è opzionale se il servizio la fa già.
        // Aggiungerla nel controller serve per casi in cui si vuole il 400 prima di chiamare il servizio.
        if (string.IsNullOrWhiteSpace(id))
            throw new InvalidParametersException();

        var data = await _prodottoService.GetProdottoByIdAsync(id);
        return Ok(data);
    }

    // POST /api/prodotti  — creazione (body JSON)
    [HttpPost("prodotti")]
    public async Task<IActionResult> CreaProdotto([FromBody] Prodotto request)
    {
        // [FromBody] deserializza automaticamente il corpo JSON nella classe Prodotto.
        // Se il JSON è malformato, ASP.NET restituisce 400 prima ancora di entrare qui.
        if (request == null || string.IsNullOrWhiteSpace(request.Nome))
            throw new InvalidParametersException();

        var result = await _prodottoService.CreaProdottoAsync(request);
        return Ok(result);
    }
}
```

### Aggiungere endpoint a un controller già configurato (forma compatta)

Se il controller ha già il costruttore con tutte le dipendenze, aggiungere solo il metodo endpoint:

```csharp
// backend/Controllers/BaseController.cs — aggiungere solo il metodo, non il costruttore

// GET con path parameter
[HttpGet("mio-endpoint/{id}")]
public async Task<IActionResult> GetMioOggettoById(string id)
{
    if (string.IsNullOrWhiteSpace(id))
        throw new InvalidParametersException();

    var data = await _service.GetByIdAsync(id);
    return Ok(data);
}

// POST con body JSON
[HttpPost("mio-endpoint")]
public async Task<IActionResult> CreaMioOggetto([FromBody] MioRequest request)
{
    if (request == null)
        throw new InvalidParametersException();

    var result = await _service.CreaAsync(request);
    return Ok(result);
}
```

### Creare un nuovo controller

Creare un nuovo controller separato ha senso quando la responsabilità è davvero distinta da quelle già presenti. Il routing (`[Route]`) si dichiara sul controller concreto, non sulle classi base dell'engine. Non aggiungere `[ApiController]` o `[Authorize]`: li ereditano da `EngineApiController`.

```csharp
// backend/Controllers/MioController.cs
using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Backend.Services;

namespace Backend.Controllers;

// [Route("mia-area")] determina il prefisso del path dopo /api/.
// Tutti gli endpoint di questo controller avranno il path /api/mia-area/...
[Route("mia-area")]
public class MioController : EngineApiController
{
    private readonly ProdottoService _prodottoService;

    // Il costruttore riceve solo le dipendenze specifiche di questo controller.
    // ILogger<MioController> identifica questo controller nei log.
    public MioController(ProdottoService prodottoService, ILogger<MioController> logger)
        : base(logger)
    {
        _prodottoService = prodottoService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var data = await _prodottoService.GetProdottiAsync();
        return Ok(data);
    }
}
```

---

## Aggiungere un servizio

I servizi contengono la **logica di business** e dipendono da `IContentStore`, non dai controller né dai controller base. Questa separazione è intenzionale: il servizio non conosce HTTP, non conosce il formato dei file JSON, non conosce come arriva la richiesta. Conosce solo le regole del dominio.

**Dove si trova il file:** `backend/Services/`. Creare un file per servizio.

```csharp
// backend/Services/MioService.cs
using System.Globalization;
using Backend.Infrastructure;
using Backend.Models;

namespace Backend.Services;

public class MioService
{
    private readonly IContentStore _store;

    // Il servizio dipende dall'interfaccia IContentStore, non dall'implementazione concreta.
    // Questo significa che il servizio funzionerà ugualmente con FileContentStore, DbContentStore
    // o qualsiasi altra implementazione futura, senza modificare questo file.
    public MioService(IContentStore store)
    {
        _store = store;
    }

    public async Task<MioModello> GetMioOggettoAsync()
    {
        // La lingua è già disponibile nel contesto della richiesta corrente.
        // Il middleware RequestLocalization l'ha letta dall'header Accept-Language
        // e l'ha impostata come CultureInfo.CurrentUICulture.
        var language = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        var data = await _store.GetMioOggettoAsync(language);

        if (data == null)
            throw new NotFoundException("mio-oggetto");

        return data;
    }
}
```

### Registrare il servizio in Program.cs

```csharp
// backend/Program.cs — dentro la sezione "SERVIZI APPLICATIVI"
builder.Services.AddScoped<MioService>();
```

**`AddScoped` vs `AddSingleton`:** usare `AddScoped` per i servizi con stato per-request (es. quelli che leggono `CultureInfo.CurrentUICulture`, che è specifica della richiesta corrente). Usare `AddSingleton` per servizi stateless che non dipendono da dati della richiesta (es. `FileContentStore`, `AuthService`).

### Iniettarlo nel controller

```csharp
// backend/Controllers/BaseController.cs — modificare solo il costruttore
public class BaseController : EngineApiController
{
    private readonly SiteService _service;
    private readonly MioService _mioService;   // ← aggiunto

    public BaseController(
        SiteService service,
        MioService mioService,                 // ← aggiunto
        ILogger<BaseController> logger)
        : base(logger)
    {
        _service = service;
        _mioService = mioService;
    }
}
```

---

## Gestione degli errori

**La regola fondamentale:** non costruire mai risposte di errore manualmente nei controller. Non usare `return BadRequest(...)`, `return NotFound(...)` o simili. Lanciare un'eccezione della gerarchia `ApiException`: il middleware `ApiExceptionHandler` la intercetta automaticamente e restituisce un payload ProblemDetails (RFC 9457) con il codice HTTP corretto.

**Perché questo approccio?** I controller restano puliti e lineari (solo il percorso felice è esplicito). La gestione degli errori è centralizzata in un unico punto. Il formato della risposta di errore è sempre coerente per tutti gli endpoint.

### Eccezioni disponibili

Tutte in `backend/Models/ApiException.cs`. Non serve nessun `using` aggiuntivo nei controller — sono già nel namespace importato.

| Eccezione | HTTP | Messaggio nel `detail` | Quando usarla |
|---|---|---|---|
| `NotFoundException` | 404 | `"Impossibile leggere le informazioni {dataName}"` | La risorsa richiesta non esiste o non è leggibile (es. file mancante, record non trovato) |
| `DataNotFoundException` | 404 | `"Dati non trovati"` | La risorsa esiste ma è vuota o non disponibile per la lingua richiesta |
| `InvalidParametersException` | 400 | `"Parametri non validi o mancanti"` | Parametri della richiesta assenti, vuoti o in formato non valido |
| `DecodingException` | 400 | `"Errore nella decodifica"` | Il body della richiesta o un file di dati non è decodificabile (JSON malformato, encoding errato) |

```csharp
throw new NotFoundException("profilo");          // → 404 "Impossibile leggere le informazioni profilo"
throw new DataNotFoundException();               // → 404 "Dati non trovati"
throw new InvalidParametersException();          // → 400 "Parametri non validi o mancanti"
throw new DecodingException();                   // → 400 "Errore nella decodifica"
```

### Aggiungere un nuovo tipo di errore

Se nessuna delle eccezioni esistenti copre il tuo caso (es. conflitto di risorse → 409), creare una sottoclasse di `ApiException` nello stesso file `backend/Models/ApiException.cs`. Il middleware `ApiExceptionHandler` gestisce automaticamente tutte le sottoclassi di `ApiException` senza modifiche.

```csharp
// backend/Models/ApiException.cs — aggiungere in fondo al file

/// <summary>Errore 409 per conflitto di dati: la risorsa esiste già.</summary>
public class ConflictException : ApiException
{
    // Il costruttore riceve il nome della risorsa per un messaggio d'errore descrittivo.
    // Il codice HTTP 409 Conflict viene passato alla classe base.
    public ConflictException(string risorsa)
        : base($"Conflitto: {risorsa} esiste già", 409)
    { }
}
```

### Pattern completo in un controller

```csharp
// Esempio: endpoint che legge una risorsa per slug
[HttpGet("{slug}")]
public async Task<IActionResult> Get(string slug)
{
    // Prima validazione: il parametro deve essere presente e non vuoto.
    // Se manca → 400 automatico, il servizio non viene chiamato.
    if (string.IsNullOrWhiteSpace(slug))
        throw new InvalidParametersException();

    // Il servizio può lanciare NotFoundException se la risorsa non esiste.
    // Non serve un try/catch: il middleware lo gestisce.
    var result = await _service.GetBySlug(slug);

    // Doppio controllo: se il servizio restituisce null invece di lanciare.
    if (result == null)
        throw new NotFoundException("elemento");

    return Ok(result);
}
```

---

## Sostituire FileContentStore con un database

`IContentStore` è il contratto di accesso ai dati. L'implementazione attuale (`FileContentStore`) legge da file JSON in `backend/data/`. Passare a un database reale richiede solo di creare una nuova classe che implementa la stessa interfaccia — nessun altro file del progetto va modificato, perché controller e servizi dipendono da `IContentStore`, non dall'implementazione concreta.

> **Dove mettere i file runtime persistenti (SQLite, JSON mutabili):** usa `backend/db/`, che è montato come volume Docker (`db-data:/app/db`). Il suo contenuto sopravvive ai rebuild e ai `docker compose down` senza `-v`. La cartella `backend/data/` è invece **baked nell'immagine**: perfetta per contenuto gestito via git (irl.json, social.json), ma non adatta per file che il container scrive o che non vuoi sovrascrivere ad ogni deploy.

### 1. Implementare `IContentStore`

**Dove creare il file:** `backend/Store/DbContentStore.cs`. La nuova classe deve implementare tutti i metodi definiti in `IContentStore`.

```csharp
// backend/Store/DbContentStore.cs
using Backend.Models.Legal;

namespace Backend.Infrastructure;

public class DbContentStore : IContentStore
{
    private readonly MioDbContext _db;

    // Il DbContext viene iniettato dal sistema DI di ASP.NET, come qualsiasi altro servizio.
    public DbContentStore(MioDbContext db)
    {
        _db = db;
    }

    public async Task<UniversalLegalModel> GetProfileAsync(string language)
    {
        // Esempio: cerca il profilo nella lingua richiesta, o fallback sull'italiano.
        var profilo = await _db.Profili
            .FirstOrDefaultAsync(p => p.Lingua == language)
            ?? await _db.Profili.FirstOrDefaultAsync(p => p.Lingua == "it");

        if (profilo == null)
            throw new NotFoundException("profilo");

        return profilo.ToUniversalLegalModel();
    }

    public async Task<Dictionary<string, string>> GetSocialAsync()
    {
        return await _db.Social
            .ToDictionaryAsync(s => s.Nome, s => s.Url);
    }
}
```

### 2. Registrare il DbContext e la nuova implementazione in Program.cs

**Dove modificare:** `backend/Program.cs`, sezione `SERVIZI APPLICATIVI`. Sostituire la registrazione di `FileContentStore` con quella di `DbContentStore`.

```csharp
// backend/Program.cs — sezione "SERVIZI APPLICATIVI"
// Registrare il DbContext con la connection string da appsettings.json:
builder.Services.AddDbContext<MioDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

// Sostituire questa riga:
//   builder.Services.AddSingleton<IContentStore, FileContentStore>();
// con:
builder.Services.AddScoped<IContentStore, DbContentStore>();
// (DbContentStore usa il DbContext che è Scoped, quindi non può essere Singleton)
```

Nessun altro file va modificato. Controller e servizi dipendono da `IContentStore`, che ora il DI risolve con `DbContentStore`.

### 3. Aggiungere la connection string in appsettings.json

**Dove modificare:** `backend/appsettings.json`.

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost;Database=MioDb;Trusted_Connection=True;"
  }
}
```

---

## Endpoint protetti da login JWT

> Per il lato frontend (storage token, header automatico, route guard, stato `isLoggedIn`) → [`frontend/DEVELOPMENT.md — Autenticazione JWT`](../frontend/DEVELOPMENT.md#autenticazione-jwt-login).

Per aggiungere endpoint che richiedono che l'utente sia loggato (cioè abbia un token JWT valido oltre all'API key), usare `EngineProtectedController` come base.

**Come funziona:** `EngineProtectedController` applica automaticamente la policy `RequireLogin`, che verifica che la richiesta abbia un header `Authorization: Bearer <token>` con un token JWT valido e firmato. Se il token manca o è scaduto, il middleware restituisce 401 prima ancora di entrare nel controller.

```csharp
// backend/Controllers/ProtectedController.cs (già esistente nel template)
// Aggiungere qui i propri endpoint protetti.

[Route("protected")]
public class ProtectedController : EngineProtectedController
{
    // Il costruttore riceve solo ILogger — tutto il resto è nella classe base.
    // Non serve AuthService qui: serve solo in AuthController per generare il token.
    public ProtectedController(ILogger<ProtectedController> logger)
        : base(logger) { }

    [HttpGet("dati-privati")]
    public IActionResult GetDatiPrivati()
    {
        // Arrivati qui, l'utente è già autenticato: la policy RequireLogin
        // è applicata dalla classe base EngineProtectedController.
        // Non serve nessun controllo manuale del token.
        return Ok(new { segreto = "solo per utenti loggati" });
    }
}
```

### Tipi del login

Questi record sono definiti in `backend/Engine/Services/AuthService.cs` e sono disponibili in tutto il progetto:

```csharp
record LoginRequest(string? Pwd);
// Corpo JSON atteso dal client: { "pwd": "password-in-chiaro" }

record LoginResult(bool Valid, string? Token = null, string? Error = null);
// Risposta di successo:  { "valid": true,  "token": "eyJ..." }
// Risposta di errore:    { "valid": false, "error": "Credenziali non valide" }
```

### Implementare il login (AuthController)

Il template include un `AuthController` con un placeholder che risponde sempre `501 Not Implemented`. Questo è intenzionale: ogni progetto ha la propria logica di verifica delle credenziali (da database, da appsettings, da LDAP…).

**Dove modificare:** `backend/Controllers/AuthController.cs`.

`Auth` (maiuscolo) è la proprietà protetta esposta da `EngineAuthController` — contiene già l'istanza di `AuthService`. Non serve iniettarla nel costruttore del tuo controller.

`Auth.GenerateToken()` firma il token con HMAC-SHA256 usando la `SecretKey` da `appsettings.json` e include automaticamente il ruolo `Authenticated`, che è quello richiesto dalla policy `RequireLogin`. Accetta opzionalmente un elenco di `Claim` aggiuntivi (es. `userId`, `tenantId`) da includere nel payload del token.

#### Caso semplice: solo password da appsettings

Per siti piccoli dove l'area protetta è ad uso esclusivamente personale (es. una dashboard admin che usi solo tu), verificare una singola password da `appsettings.json` è una soluzione perfettamente praticabile: semplice da configurare, zero dipendenze aggiuntive.

```csharp
// backend/Controllers/AuthController.cs — caso semplice, un solo admin
using Microsoft.Extensions.Configuration;

[HttpPost("login")]
[EnableRateLimiting(SecurityDefaults.LoginRateLimitPolicy)]
public ActionResult<LoginResult> Login([FromBody] LoginRequest request)
{
    var password = _configuration["Security:AdminPassword"];
    if (request.Pwd != password)
        return Unauthorized(new LoginResult(false, Error: "Credenziali non valide"));

    // Auth è ereditato da EngineAuthController, già pronto all'uso.
    return Ok(new LoginResult(true, Token: Auth.GenerateToken()));
}
```

**Quick win: aggiungi anche uno username.** Anche se entrambi sono hardcoded in `appsettings.json`, richiedere username + password è sempre meglio di richiedere solo la password — un attaccante deve indovinare due valori invece di uno. Non aumenta la complessità del codice:

```json
// backend/appsettings.json
"Security": {
  "AdminUsername": "admin",
  "AdminPassword": "password-sicura"
}
```

```csharp
// backend/Models/LoginModels.cs — estendi LoginRequest per includere lo username
record LoginRequest(string? Username, string? Pwd);
// LoginResult rimane invariato
```

```csharp
// backend/Controllers/AuthController.cs — verifica username + password
var username = _configuration["Security:AdminUsername"];
var password = _configuration["Security:AdminPassword"];
if (request.Username != username || request.Pwd != password)
    return Unauthorized(new LoginResult(false, Error: "Credenziali non valide"));

return Ok(new LoginResult(true, Token: Auth.GenerateToken()));
```

Per aggiungere claim personalizzati al token (es. un ruolo da passare al frontend):

```csharp
using System.Security.Claims;

var claims = new List<Claim> { new Claim("role", "admin") };
return Ok(new LoginResult(true, Token: Auth.GenerateToken(claims)));
```

Il token JWT viene configurato in `appsettings.json` (vedi sotto).

---

### Quando il caso semplice non basta: login con database e hash

Se il progetto ha utenti multipli, registrazione pubblica, o dati sensibili di terzi, il meccanismo da `appsettings.json` non è sufficiente: le password degli utenti devono essere hashate nel database e non mai salvate in chiaro. Valuta caso per caso in base alla natura del progetto.

| Segnale | Implicazione |
|---|---|
| Un solo utente admin, accesso personale | Appsettings con username+password va bene |
| Più admin, ma gestiti manualmente | Appsettings con più entry o un hash nel DB senza framework completo |
| Utenti registrati dal frontend | Necessario hash nel DB, blocco tentativi, verifica email |
| Dati sensibili di terzi (GDPR) | Hash obbligatorio, valutare MFA, refresh token, audit log |

Il template è volutamente anonimo riguardo al layer di persistenza (EF Core, Dapper, MongoDB — dipende dal progetto). Il pattern che segue è indipendente dall'ORM scelto.

#### Checklist per progetti con utenti multipli

- [ ] Tabella `Users` nel database con `PasswordHash` (mai la password in chiaro)
- [ ] Hash con algoritmo moderno: **BCrypt** (`BCrypt.Net-Next`) o **Argon2id** (`Isopoh.Cryptography.Argon2`); in alternativa il `PasswordHasher<T>` di ASP.NET Core Identity (PBKDF2-SHA256, zero dipendenze NuGet aggiuntive)
- [ ] Blocco account dopo N tentativi falliti consecutivi (`FailedAttempts`, `LockedUntil`)
- [ ] Refresh token con rotazione (token a vita breve + refresh token a vita lunga salvato su DB)
- [ ] Revoca token (logout server-side: invalidare il refresh token)
- [ ] Verifica email all'iscrizione (se il progetto prevede auto-registrazione)
- [ ] MFA (TOTP via `Google Authenticator` o SMS) per account con privilegi elevati

#### Scaffold: login con database e hash

Questo scaffold usa `Microsoft.AspNetCore.Identity.PasswordHasher<T>` perché è incluso in ASP.NET Core senza NuGet aggiuntivi e produce PBKDF2-SHA256. Se preferisci BCrypt, la logica è identica: sostituisci il hasher.

**Passo 1 — Model utente** (`backend/Models/AppUser.cs`)

```csharp
// backend/Models/AppUser.cs
namespace Backend.Models;

public class AppUser
{
    public int Id { get; set; }
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string? Email { get; set; }
    public string Role { get; set; } = "User";
    public int FailedAttempts { get; set; }
    public DateTime? LockedUntil { get; set; }
}
```

**Passo 2 — Repository** (`backend/Services/IUserRepository.cs` + implementazione)

```csharp
// backend/Services/IUserRepository.cs
namespace Backend.Services;

public interface IUserRepository
{
    Task<AppUser?> FindByUsernameAsync(string username);
    Task UpdateAsync(AppUser user);
}
```

L'implementazione concreta dipende dall'ORM scelto (EF Core, Dapper, ecc.) e non fa parte del template.

**Passo 3 — Aggiornare `LoginRequest`** (se serve lo username)

Il template usa `record LoginRequest(string? Pwd)`. Per un login reale aggiungi lo username:

```csharp
// backend/Models/LoginModels.cs — estendi i record esistenti
record LoginRequest(string? Username, string? Pwd);
// LoginResult rimane invariato: record LoginResult(bool Valid, string? Token, string? Error)
```

**Passo 4 — Aggiornare `AuthController`**

```csharp
// backend/Controllers/AuthController.cs
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Backend.Models;
using Backend.Services;

public class AuthController : EngineAuthController
{
    private readonly IUserRepository _users;
    private readonly PasswordHasher<AppUser> _hasher = new();
    private const int MaxFailedAttempts = 5;
    private const int LockoutMinutes = 15;

    public AuthController(IUserRepository users)
    {
        _users = users;
    }

    [HttpPost("login")]
    [EnableRateLimiting(SecurityDefaults.LoginRateLimitPolicy)]
    public async Task<ActionResult<LoginResult>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Pwd))
            return Unauthorized(new LoginResult(false, Error: "Credenziali mancanti"));

        var user = await _users.FindByUsernameAsync(request.Username);

        // Risposta uniforme per username non trovato e password errata:
        // non rivelare quale dei due è sbagliato (timing attack mitigation).
        if (user is null)
            return Unauthorized(new LoginResult(false, Error: "Credenziali non valide"));

        if (user.LockedUntil.HasValue && user.LockedUntil > DateTime.UtcNow)
            return Unauthorized(new LoginResult(false, Error: "Account bloccato. Riprova più tardi."));

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, request.Pwd);

        if (result == PasswordVerificationResult.Failed)
        {
            user.FailedAttempts++;
            if (user.FailedAttempts >= MaxFailedAttempts)
            {
                user.LockedUntil = DateTime.UtcNow.AddMinutes(LockoutMinutes);
                user.FailedAttempts = 0;
            }
            await _users.UpdateAsync(user);
            return Unauthorized(new LoginResult(false, Error: "Credenziali non valide"));
        }

        // Login riuscito: azzera i tentativi falliti.
        user.FailedAttempts = 0;
        user.LockedUntil = null;
        await _users.UpdateAsync(user);

        var claims = new List<Claim>
        {
            new Claim("userId", user.Id.ToString()),
            new Claim("role",   user.Role),
        };
        return Ok(new LoginResult(true, Token: Auth.GenerateToken(claims)));
    }
}
```

**Passo 5 — Registrare il repository in `Program.cs`**

```csharp
// backend/Program.cs — aggiungere prima di builder.Build()
builder.Services.AddScoped<IUserRepository, EfCoreUserRepository>();
// oppure: builder.Services.AddScoped<IUserRepository, DapperUserRepository>();
```

**Passo 6 — Hash iniziale di una password** (utility da eseguire una volta)

```csharp
// Script di utilità per generare l'hash da inserire nel DB al primo avvio:
var hasher = new PasswordHasher<AppUser>();
var hash = hasher.HashPassword(new AppUser(), "la-mia-password-sicura");
Console.WriteLine(hash);
// Incolla l'output nel campo PasswordHash della tabella Users
```

> **Nota su BCrypt**: se preferisci `BCrypt.Net-Next`, installa il pacchetto NuGet e sostituisci `_hasher.VerifyHashedPassword(...)` con `BCrypt.Verify(request.Pwd, user.PasswordHash)` e l'hashing iniziale con `BCrypt.HashPassword(pwd, workFactor: 12)`. Il resto del controller rimane identico.

---

## Configurazione (appsettings.json)

**Dove si trova il file:** `backend/appsettings.json` nella radice del progetto backend. Tutte le configurazioni di sicurezza, autenticazione e localizzazione si trovano qui.

### Sezione Security

```json
{
  "Security": {
    "ApiKeys": [ "chiave-segreta-api" ],
    "CorsOrigins": [],
    "BehindProxy": false,
    "Headers": {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff"
    },
    "Token": {
      "SecretKey": "",
      "ExpirationSeconds": 3000
    }
  }
}
```

| Campo | Obbligatorio | Tipo | Default | Note |
|---|---|---|---|---|
| `ApiKeys` | sì | `string[]` | `[]` | Chiavi accettate nell'header `X-Api-Key`; array vuoto = nessuna richiesta autorizzata |
| `CorsOrigins` | no | `string[]` | `[]` | Origini CORS consentite; array vuoto = `AllowAnyOrigin` (la protezione reale è l'API key) |
| `BehindProxy` | no | `bool` | `false` | `true` attiva `ForwardedHeaders` per leggere l'IP reale da `X-Forwarded-For` (necessario dietro nginx/reverse proxy) |
| `Headers` | no | `Dictionary<string,string>` | `{}` | Header HTTP extra aggiunti a ogni risposta dal `SecurityHeadersMiddleware` |
| `Token.SecretKey` | no | `string` | `""` | Vuota = JWT disabilitato; < 32 caratteri = eccezione all'avvio del server |
| `Token.ExpirationSeconds` | no | `int` | `3000` | Durata del token in secondi (~50 minuti) |

Se `Token.SecretKey` è vuota, `LoginEnabled` è `false`: il controller `AuthController` e `ProtectedController` non vengono registrati automaticamente dal `TemplateControllerFeatureProvider`. Non serve commentare o rimuovere i controller: basta non configurare la SecretKey.

### Sezione Localization

```json
{
  "Localization": {
    "DefaultLanguage": "it",
    "SupportedLanguages": ["it", "en"]
  }
}
```

La lingua di ogni richiesta viene letta dall'header `Accept-Language` inviato dal frontend Angular. Il middleware `RequestLocalization` la imposta come `CultureInfo.CurrentUICulture` prima che la richiesta arrivi al controller. I servizi leggono direttamente `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName` — non gestiscono la lingua manualmente.

### Aggiungere una nuova sezione di configurazione

Il pattern in tre file: un modello tipizzato, la registrazione in `Program.cs`, l'uso nel servizio.

```csharp
// backend/Models/Configuration/MieOpzioni.cs
// Il modello tipizzato per la sezione di configurazione.
// I valori di default qui corrispondono a quelli "sicuri" se appsettings.json non ha quella sezione.
public class MieOpzioni
{
    public string ParametroA { get; set; } = string.Empty;
    public int ParametroB { get; set; } = 10;
}
```

```csharp
// backend/Program.cs — aggiungere nella sezione configurazione
builder.Services.Configure<MieOpzioni>(
    builder.Configuration.GetSection("MieOpzioni"));
```

```csharp
// backend/Services/MioService.cs — usare nel servizio tramite IOptions<T>
using Microsoft.Extensions.Options;

public class MioService
{
    private readonly MieOpzioni _opzioni;

    // IOptions<T> viene iniettato automaticamente dal DI.
    // _opzioni.Value contiene i valori letti da appsettings.json.
    public MioService(IOptions<MieOpzioni> opzioni)
    {
        _opzioni = opzioni.Value;
    }
}
```

```json
// backend/appsettings.json — aggiungere la sezione corrispondente
{
  "MieOpzioni": {
    "ParametroA": "valore",
    "ParametroB": 42
  }
}
```

---

## Content store

`IContentStore` definisce il contratto di accesso ai dati senza sapere dove risiedano. Nessun servizio o controller conosce il formato di persistenza: dipendono solo dall'interfaccia.

```csharp
// backend/Store/IContentStore.cs
// Namespace: Backend.Infrastructure

public interface IContentStore
{
    // Restituisce il profilo localizzato nella lingua indicata (es. "it", "en").
    Task<UniversalLegalModel> GetProfileAsync(string language);

    // Restituisce tutti i social configurati come mappa nome → URL.
    Task<Dictionary<string, string>> GetSocialAsync();
}
```

L'implementazione attiva, `FileContentStore`, legge da `backend/data/`. Internamente usa `LocalizedJsonDeserializer`: un helper privato che percorre ricorsivamente le strutture `{ "it": ..., "en": ... }` presenti nel JSON, sceglie la lingua richiesta, ricade sul fallback italiano, e scarta i nodi vuoti. Il formato del JSON può quindi essere parzialmente localizzato — non tutti i campi devono avere una traduzione.

Per sostituire la sorgente dati (es. database) basta implementare `IContentStore` e registrarla in `Program.cs` — vedi la sezione [Sostituire FileContentStore con un database](#sostituire-filecontentstore-con-un-database).

### Dati inclusi nel template

| File | Contenuto |
|---|---|
| `backend/data/social.json` | 32 social network preconfigurati (nome + URL placeholder) |
| `backend/data/irl.json` | Profilo aziendale con campi localizzati `it`/`en`: ragione sociale, P.IVA, sede legale, contatti, dati societari |

---

## Login condizionale (JWT)

Il sistema JWT si attiva o disattiva in base a una sola condizione: il valore di `Security.Token.SecretKey` in `appsettings.json`. Questo design permette di avere un'applicazione completamente pubblica (solo API key) senza dover modificare il codice.

| Condizione | Effetto |
|---|---|
| `SecretKey` vuota | `LoginEnabled = false`: nessun `AuthService`, nessun middleware JWT, nessun overhead. `AuthController` e `ProtectedController` non vengono registrati dal `TemplateControllerFeatureProvider` |
| `SecretKey` valorizzata | `LoginEnabled = true`: `AuthService` singleton registrato, middleware JWT Bearer attivo, policy `RequireLogin` applicabile |
| `SecretKey` < 32 caratteri | Il server lancia un'eccezione all'avvio (HMAC-SHA256 richiede chiavi sufficientemente lunghe per essere sicuro) |

Il token JWT viene generato da `Auth.GenerateToken()` (disponibile in `AuthController` tramite `EngineAuthController`) e restituito al frontend. Il frontend Angular lo conserva in `sessionStorage` (sopravvive al refresh della pagina, si cancella alla chiusura del tab). Le richieste successive lo inviano nell'header `Authorization: Bearer <token>`, che il middleware JWT Bearer valida automaticamente.

---

## Servizi registrati

Questi servizi sono registrati in `Program.cs` e disponibili tramite iniezione in tutta l'applicazione.

| Servizio | Namespace | Lifetime | Ruolo |
|---|---|---|---|
| `FileContentStore` | `Backend.Infrastructure` | Singleton | Implementazione di `IContentStore`; legge da `backend/data/*.json` |
| `SiteService` | `Backend.Services` | Scoped | Logica di business del progetto; dipende da `IContentStore` |
| `AuthService` | `Backend.Services` | Singleton (condizionale) | Generazione token JWT (engine); registrato solo se `LoginEnabled = true` |

### `AuthService` — API dell'engine

`AuthService` è parte dell'engine e disponibile in tutti i controller che estendono `EngineAuthController` tramite la proprietà protetta `Auth`. Non si usa direttamente nei servizi applicativi: serve solo al controller di login per generare il token.

```csharp
// Firma del metodo disponibile tramite Auth.GenerateToken() nei controller che estendono EngineAuthController.
// Genera un token JWT firmato (HMAC-SHA256) con ruolo "Authenticated" sempre incluso.
// additionalClaims: claim extra facoltativi (es. userId, tenantId, email).
string GenerateToken(IEnumerable<Claim>? additionalClaims = null)
```

### `UniversalLegalModel` — struttura

Modello del template per i dati legali e anagrafici dell'organizzazione. Restituito da `IContentStore.GetProfileAsync()` e usato come base nei progetti figli. Tutti i campi sono nullable — il modello può essere valorizzato parzialmente.

```csharp
// Namespace: Backend.Models.Legal
class UniversalLegalModel {
    string?                    RagioneSociale
    string?                    PartitaIva
    string?                    CodiceFiscale
    Address?                   SedeLegale        // Via, Civico, Cap, Citta, Provincia, Nazione
    ContactInfo?               Contatti          // Telefono, Email, Pec
    CompanyDetails?            DatiSocietari     // RegistroImprese, NumeroRea, CapitaleSociale,
                                                 // CapitaleInteramenteVersato, IsSocioUnico,
                                                 // InLiquidazione, CodiceSdi
    Dictionary<string,string>? Social            // nome logico → URL
    Dictionary<string,string>? MetadatiAggiuntivi // campi custom liberi per il progetto figlio
}
```

Il campo `MetadatiAggiuntivi` è il punto di estensione previsto per dati extra senza modificare il modello base.
