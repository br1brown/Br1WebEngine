# Backend — Guida allo sviluppo

Questo file spiega i pattern stabiliti nel progetto per aggiungere nuove funzionalità.  
Il README è l'overview del progetto; qui si entra nel dettaglio del "come si fa".

---

## Sommario

- [Architettura in breve](#architettura-in-breve)
- [Aggiungere un endpoint](#aggiungere-un-endpoint)
- [Aggiungere un servizio](#aggiungere-un-servizio)
- [Gestione degli errori](#gestione-degli-errori)
- [Sostituire FileContentStore con un database](#sostituire-filecontentstore-con-un-database)
- [Endpoint protetti da login JWT](#endpoint-protetti-da-login-jwt)
- [Configurazione (appsettings.json)](#configurazione-appsettingsjson)

---

## Architettura in breve

```
Controllers/          ← Controller concreti del progetto
  BaseController.cs   ← Endpoint pubblici (API key)
  AuthController.cs   ← Login
  ProtectedController ← Endpoint protetti (JWT)
  BlobController.cs   ← File upload

Engine/Controllers/   ← Classi base dell'engine (non toccare)
  EngineApiController     ← radice: API key, logger
  EngineAuthController    ← + AuthService JWT
  EngineProtectedController ← + policy RequireLogin

Services/             ← Logica di business del progetto
Store/                ← Accesso dati (IContentStore / FileContentStore)
Models/               ← DTO, modelli, eccezioni API
Security/             ← Autenticazione, autorizzazione, middleware
```

**Flusso di una richiesta:**

```
Request → API Key → RateLimiter → (JWT se protetto) → Controller → Service → IContentStore
                                                              ↓
                                               ApiException → ProblemDetails JSON
```

---

## Aggiungere un endpoint

### Scegliere la classe base

| Scenario | Classe base da ereditare |
|----------|--------------------------|
| Endpoint pubblico (solo API key) | `EngineApiController` |
| Endpoint di autenticazione (login, solo generazione token) | `EngineAuthController` |
| Endpoint protetto (API key + JWT utente) | `EngineProtectedController` |

I controller esistenti (`BaseController`, `AuthController`, `ProtectedController`)
sono già il punto giusto dove aggiungere nuovi endpoint.  
Creare un nuovo controller separato solo quando la responsabilità è davvero distinta
(come `BlobController` per i file upload).

### Aggiungere un endpoint a un controller esistente

```csharp
// Controllers/BaseController.cs
[HttpGet("mio-endpoint")]
public async Task<IActionResult> GetMioOggetto()
{
    Logger.LogInformation("Richiesta mio-endpoint");

    var data = await _service.GetMioOggettoAsync();
    return Ok(data);
}

// GET con parametri query
[HttpGet("mio-endpoint/{id}")]
public async Task<IActionResult> GetMioOggettoById(string id)
{
    var data = await _service.GetByIdAsync(id);
    return Ok(data);
}

// POST con body
[HttpPost("mio-endpoint")]
public async Task<IActionResult> CreaMioOggetto([FromBody] MioRequest request)
{
    var result = await _service.CreaAsync(request);
    return Ok(result);
}
```

### Creare un nuovo controller

Usare `EngineApiController` come base. Il routing (`[Route]`) va sul controller concreto,
non sulle classi base dell'engine:

```csharp
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[Route("mia-area")]
public class MioController : EngineApiController
{
    private readonly SiteService _service;

    public MioController(SiteService service, ILogger<MioController> logger)
        : base(logger)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var data = await _service.GetMioOggettoAsync();
        return Ok(data);
    }
}
```

**Non** aggiungere attributi `[ApiController]`, `[Authorize]` o simili: li ereditano
tutti da `EngineApiController`. La classe base gestisce anche il logger condiviso.

---

## Aggiungere un servizio

I servizi contengono la **logica di business** e dipendono da `IContentStore`,
non dai controller. I controller sono solo il punto di ingresso HTTP.

```csharp
// Services/MioService.cs
using System.Globalization;
using Backend.Infrastructure;

namespace Backend.Services;

public class MioService
{
    private readonly IContentStore _store;

    public MioService(IContentStore store)
    {
        _store = store;
    }

    public async Task<MioModello> GetMioOggettoAsync()
    {
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
// Program.cs — dentro la sezione "SERVIZI APPLICATIVI"
builder.Services.AddScoped<MioService>();
```

Usare `AddScoped` per i servizi con stato per-request (es. servizi che usano
`CultureInfo.CurrentUICulture`), `AddSingleton` per i servizi stateless
(es. `FileContentStore`, `AuthService`).

### Iniettarlo nel controller

```csharp
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

**Non** costruire risposte di errore manualmente nei controller.  
Lanciare un'eccezione della gerarchia `ApiException`: il middleware
`ApiExceptionHandler` la intercetta automaticamente e restituisce
un payload ProblemDetails (RFC 9457) con il codice HTTP corretto.

### Eccezioni disponibili

```csharp
// Risorsa non trovata → HTTP 404
throw new NotFoundException("nome-risorsa");
// Risposta: { "detail": "Impossibile leggere le informazioni nome-risorsa" }

// Dati vuoti o non disponibili → HTTP 404
throw new DataNotFoundException();

// Parametri mancanti o non validi → HTTP 400
throw new InvalidParametersException();

// Body o file non decodificabile → HTTP 400
throw new DecodingException();
```

### Aggiungere un nuovo tipo di errore

Creare una sottoclasse di `ApiException` in `Models/ApiException.cs`:

```csharp
/// <summary>Errore 409 per conflitto di dati.</summary>
public class ConflictException : ApiException
{
    public ConflictException(string risorsa)
        : base($"Conflitto: {risorsa} esiste già", 409)
    { }
}
```

L'`ApiExceptionHandler` la gestirà automaticamente senza modifiche.

### Pattern completo in un controller

```csharp
[HttpGet("{slug}")]
public IActionResult Get(string slug)
{
    // Validazione input — parametri non validi → 400
    if (string.IsNullOrWhiteSpace(slug))
        throw new InvalidParametersException();

    var result = _service.GetBySlug(slug);

    // Risorsa non trovata → 404
    if (result == null)
        throw new NotFoundException("elemento");

    return Ok(result);
}
```

---

## Sostituire FileContentStore con un database

`IContentStore` è il contratto di accesso ai dati. L'implementazione attuale
(`FileContentStore`) legge da file JSON. Per passare a un database è sufficiente
creare una nuova implementazione dell'interfaccia.

### 1. Implementare `IContentStore`

```csharp
// Store/DbContentStore.cs
using Backend.Models.Legal;

namespace Backend.Infrastructure;

public class DbContentStore : IContentStore
{
    private readonly MioDbContext _db;

    public DbContentStore(MioDbContext db)
    {
        _db = db;
    }

    public async Task<UniversalLegalModel> GetProfileAsync(string language)
    {
        var profilo = await _db.Profili
            .FirstOrDefaultAsync(p => p.Lingua == language);

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

```csharp
// Program.cs — sostituire la riga FileContentStore con:
builder.Services.AddDbContext<MioDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddScoped<IContentStore, DbContentStore>();
// (era: AddSingleton<IContentStore, FileContentStore>)
```

Nessun altro file va modificato: controller e servizi dipendono da `IContentStore`,
non dall'implementazione concreta.

### 3. Aggiungere la connection string in appsettings.json

```json
{
  "ConnectionStrings": {
    "Default": "Server=localhost;Database=MioDb;Trusted_Connection=True;"
  }
}
```

---

## Endpoint protetti da login JWT

Per aggiungere endpoint che richiedono che l'utente sia loggato,
usare `EngineProtectedController` come base:

```csharp
// Controllers/ProtectedController.cs (già esistente nel template)
[Route("protected")]
public class ProtectedController : EngineProtectedController
{
    public ProtectedController(ILogger<ProtectedController> logger)
        : base(logger) { }

    [HttpGet("dati-privati")]
    public IActionResult GetDatiPrivati()
    {
        // L'utente è già autenticato — la policy RequireLogin è applicata dalla classe base
        return Ok(new { segreto = "solo per utenti loggati" });
    }
}
```

### Implementare il login (AuthController)

Il template include un `AuthController` con un placeholder che risponde sempre
`501 Not Implemented`. Per implementare il login reale:

```csharp
// Controllers/AuthController.cs
[HttpPost("login")]
[EnableRateLimiting(SecurityDefaults.LoginRateLimitPolicy)]
public ActionResult<LoginResult> Login([FromBody] LoginRequest request)
{
    // Validare le credenziali (es. da database o da appsettings)
    var password = _configuration["Security:Token:AdminPassword"];
    if (request.Pwd != password)
        return Unauthorized(new LoginResult(false, Error: "Credenziali non valide"));

    // Generare il token JWT tramite il servizio engine
    return Ok(new LoginResult(true, Token: Auth.GenerateToken()));
}
```

Il token JWT viene configurato in `appsettings.json` (vedi sotto).

---

## Configurazione (appsettings.json)

Tutte le configurazioni di sicurezza, autenticazione e localizzazione
si trovano in `appsettings.json` sotto le sezioni `Security` e `Localization`.

### Sezione Security

```json
{
  "Security": {
    "ApiKey": "chiave-segreta-api",         // Richiesta da tutti gli endpoint
    "BehindProxy": false,                   // true se dietro nginx/Cloudflare
    "LoginEnabled": false,                  // true per abilitare /auth/login e JWT
    "Token": {
      "SecretKey": "chiave-jwt-min-32-char",  // < 32 caratteri = eccezione all'avvio
      "Issuer": "mio-sito",
      "Audience": "mio-sito-frontend",
      "ExpiresInMinutes": 60
    }
  }
}
```

Se `LoginEnabled` è `false`, il controller `AuthController` e `ProtectedController`
non vengono registrati — il FeatureProvider li esclude automaticamente.

### Sezione Localization

```json
{
  "Localization": {
    "DefaultLanguage": "it",
    "SupportedLanguages": ["it", "en"]
  }
}
```

La lingua di ogni richiesta viene letta dall'header `Accept-Language` inviato
dal frontend Angular. I servizi leggono `CultureInfo.CurrentUICulture`
(già impostata dal middleware di localizzazione) invece di gestire la lingua
manualmente.

### Aggiungere una nuova sezione di configurazione

```csharp
// Models/Configuration/MieOpzioni.cs
public class MieOpzioni
{
    public string ParametroA { get; set; } = string.Empty;
    public int ParametroB { get; set; } = 10;
}
```

```csharp
// Program.cs
builder.Services.Configure<MieOpzioni>(
    builder.Configuration.GetSection("MieOpzioni"));
```

```csharp
// Nel servizio che la usa
private readonly MieOpzioni _opzioni;

public MioService(IOptions<MieOpzioni> opzioni)
{
    _opzioni = opzioni.Value;
}
```

```json
// appsettings.json
{
  "MieOpzioni": {
    "ParametroA": "valore",
    "ParametroB": 42
  }
}
```
