# Br1WebEngine - Backend (.NET 9)

Questo è il backend del template Br1WebEngine, una Web API .NET 9 progettata per essere leggera, sicura di default e "production-ready".

L'architettura è divisa in due strati principali:
1. **L'Engine (`Engine/`, `Security/`)**: Il motore infrastrutturale. Contiene le classi base e i middleware di sicurezza. **Non si tocca** durante lo sviluppo quotidiano delle feature.
2. **Il Dominio (`Controllers/`, `Services/`, `Models/`)**: Dove scrivi il tuo codice applicativo.

L'obiettivo di questa separazione è **levarti dai piedi i problemi noiosi** per farti concentrare solo sulla logica.

---

## 🚀 Le "Killer Feature" (Cosa l'Engine ti Fornisce)

### 1. Sicurezza Invalicabile (Defense in Depth)
**Perché è così?** Configurare rate limiter e validazioni CORS manualmente su ogni progetto espone a rischi di dimenticanze fatali. 
**Cosa fa l'Engine:** Ogni endpoint che eredita dai controller di base esige l'header `X-Api-Key`. Il framework blocca automaticamente gli IP che superano le 100 req/min (5 req/min per i login) e applica CORS a livello di middleware. Gli header di sicurezza rivolti al browser sono definiti una sola volta in `Security.Headers` di `global-settings.json` e condivisi col Node SSR del frontend: nel default il backend è interno alla rete Docker e serve solo JSON, ma se lo esponi (`backend.public`) applica gli stessi header (saltando la CSP, irrilevante su risposte JSON).

Tre dettagli architetturali che incidono sul comportamento osservabile:
- **CORS + `Retry-After`**: la configurazione CORS include `WithExposedHeaders("Retry-After")`. Senza questa riga il server imposta correttamente l'header, ma il browser lo filtra per policy CORS e JavaScript non può leggerlo.
- **Rate limiter strutturato**: il callback `OnRejected` del rate limiter produce un `ProblemDetails` JSON (RFC 9457) con status 429 e `Retry-After` calcolato dal tempo residuo della finestra — stesso formato di `ApiExceptionHandler`, nessun 429 con body vuoto.
- **Ordine middleware**: `UseExceptionHandler` è registrato **prima** di `UseRateLimiter`. I 429 da `OnRejected` non sono eccezioni, quindi l'ordine non cambia il flusso normale; garantisce però che eventuali eccezioni interne al rate limiter vengano catturate dall'handler globale invece di produrre risposte non strutturate.

### 2. Errori Standardizzati (RFC 9457)
**Perché è così?** I client frontend spesso impazziscono a parsare errori strutturati in 10 modi diversi. 
**Cosa fa l'Engine:** Non scrivi mai `return BadRequest(...)`. Lanci un'eccezione (`throw new NotFoundException("utente")`) e un Exception Handler globale la formatta in un JSON `ProblemDetails` standardizzato. Questo garantisce uniformità assoluta senza leakare stack trace.

### 3. Routing Adattivo (JWT Opzionale)
**Perché è così?** Non tutti i progetti hanno utenti e login. Avere codice di auth "dormiente" ma esposto è un rischio di sicurezza e inquina Swagger.
**Cosa fa l'Engine:** Il login si attiva automaticamente solo quando valorizzi `Security.Token.SecretKey` in `global-settings.json` (≥32 caratteri); se la lasci vuota il `TemplateControllerFeatureProvider` interviene durante il boot di ASP.NET e **sradica fisicamente** i controller di autenticazione dalla memoria. Non esistono rotte spurie.

### 4. Il Database Fantasma (`FileContentStore`)
**Perché è così?** Installare Entity Framework e SQL per un MVP rallenta pesantemente le prime settimane. Spesso servono solo testi legali e di configurazione.
**Cosa fa l'Engine:** Il `FileContentStore` carica file JSON da `/data/`, li cacha in `ConcurrentDictionary` (velocità RAM pura) e, risolvendo la lingua dall'header HTTP `Accept-Language`, restituisce l'oggetto già localizzato. Per gestire la lettura del file usa `try/catch` su `ReadAllTextAsync` invece di un `File.Exists` preventivo: elimina la race condition TOCTOU (il file potrebbe essere rimosso tra il controllo e la lettura effettiva) e converte correttamente la `FileNotFoundException` in `NotFoundException`.

---

## 📜 Le Regole del Gioco (Cosa l'Engine ti Impone)

Per far sì che l'Engine possa proteggerti, devi rispettare queste convenzioni architetturali ferree:

### 1. Eredita sempre dalle classi base dell'Engine
Non ereditare **mai** direttamente da `ControllerBase`. Se lo fai, perdi i controlli di rate limiting, il logging e il controllo API Key.

L'Engine offre tre classi base a seconda del livello di protezione richiesto:

**Endpoint pubblici (solo API Key):**
```csharp
[Route("api/v1/public")]
public class PublicFeatureController : EngineApiController { }
```

**Endpoint riservati (API Key + JWT valido):**
```csharp
[Route("api/v1/private")]
public class PrivateFeatureController : EngineProtectedController { }
```

**Endpoint di autenticazione (transito credenziali → emissione JWT):**
```csharp
[Route("auth")]
public class MyAuthController : EngineAuthController { }
```
`EngineAuthController` è riservato agli endpoint che gestiscono il login. Viene soppresso automaticamente dal `TemplateControllerFeatureProvider` se `Security.Token.SecretKey` è vuoto.

### 2. Lancia Eccezioni, Non Costruire Risposte di Errore

Non scrivere mai `return BadRequest(...)` nei controller. Lancia l'eccezione appropriata — `ApiExceptionHandler` la intercetta, localizza il messaggio tramite `.resx` e scrive una risposta `ProblemDetails` (RFC 9457) con `status` + `detail`.

**Mappatura completa delle eccezioni:**

| Eccezione | HTTP | Chiave `.resx` | Note |
| :--- | :---: | :--- | :--- |
| `DecodingException()` | 400 | `error_decoding` | Body o file di dati non decodificabile |
| `InvalidParametersException()` | 400 | `error_invalid_parameters` | Parametri mancanti o non validi |
| `UnauthorizedException()` | 401 | `error_unauthorized` | Utente non autenticato |
| `UnauthorizedException("error_invalid_credentials")` | 401 | `error_invalid_credentials` | Credenziali errate (login) |
| `ForbiddenException()` | 403 | `error_forbidden` | Autenticato ma senza permessi |
| `NotFoundException()` | 404 | `error_not_found` | Risorsa non trovata (messaggio generico) |
| `NotFoundException("utente")` | 404 | `error_not_found_named` | Risorsa non trovata con nome (`{0}` = "utente") |
| `DataNotFoundException()` | 404 | `error_data_not_found` | Dati esistenti ma vuoti o non disponibili |
| `MethodNotAllowedException()` | 405 | `error_method_not_allowed` | Metodo HTTP non supportato dall'endpoint |
| `NotAcceptableException()` | 406 | `error_not_acceptable` | Formato risposta non negoziabile |
| `RequestTimeoutException()` | 408 | `error_request_timeout` | Il client ha impiegato troppo a inviare il body della richiesta |
| `ConflictException()` | 409 | `error_conflict` | Conflitto (messaggio generico) |
| `ConflictException("ordine")` | 409 | `error_conflict_named` | Conflitto con nome della risorsa (`{0}` = "ordine") |
| `GoneException()` | 410 | `error_gone` | Risorsa rimossa definitivamente (messaggio generico) |
| `GoneException("articolo")` | 410 | `error_gone_named` | Risorsa rimossa definitivamente con nome (`{0}` = "articolo") |
| `UnprocessableEntityException()` | 422 | `error_unprocessable_entity` | Dati validi ma semanticamente non elaborabili |
| `TooManyRequestsException()` | 429 | `error_too_many_requests` | Limite applicativo superato (non il rate limiter globale) |
| `TooManyRequestsException(60)` | 429 | `error_too_many_requests_timed` | Come sopra + `{0}` secondi nel testo + header `Retry-After: 60` |
| `NotImplementedEndpointException()` | 501 | `error_not_implemented` | Funzionalità non ancora implementata |
| `BadGatewayException()` | 502 | `error_bad_gateway` | Risposta non valida da servizio upstream |
| `ServiceUnavailableException()` | 503 | `error_service_unavailable` | Servizio esterno temporaneamente non disponibile |
| `ServiceUnavailableException(120)` | 503 | `error_service_unavailable_timed` | Come sopra + `{0}` secondi nel testo + header `Retry-After: 120` |
| `GatewayTimeoutException()` | 504 | `error_gateway_timeout` | Servizio upstream non risponde in tempo |
| qualsiasi altra eccezione .NET | 500 | — | ASP.NET restituisce 500 generico senza esporre dettagli |

> **Pattern `_named` / `_timed`**: le eccezioni con parametro opzionale usano una chiave `.resx` diversa a seconda che il parametro sia fornito. La variante `_named` include `{0}` con il nome della risorsa (evita di passare stringhe in lingua hardcoded come argomento del messaggio localizzato). La variante `_timed` include `{0}` con i secondi di attesa e imposta l'header HTTP `Retry-After`.

> **401 vs 403**: `UnauthorizedException` (401) = utente non autenticato. `ForbiddenException` (403) = autenticato ma senza i permessi. Non confonderle.
>
> **404 vs 410**: `NotFoundException` (404) = risorsa assente o temporaneamente non trovata. `GoneException` (410) = rimossa in modo permanente. Il 410 comunica ai crawler che non devono più indicizzare l'URL.
>
> **408 vs 504**: `RequestTimeoutException` (408) = il **client** ha impiegato troppo a inviare il body della richiesta (RFC 9110). Per un timeout verso un servizio esterno usa `GatewayTimeoutException` (504), non il 408.
>
> **503 vs 502**: `ServiceUnavailableException` (503) = servizio non raggiungibile. `BadGatewayException` (502) = servizio raggiungibile ma ha restituito una risposta non valida.
>
> **429 applicativo vs rate limiter infrastrutturale**: il middleware blocca già 100 req/min globali e 5/min sul login — quando scatta, produce anch'esso un `ProblemDetails` JSON con `Retry-After` (via callback `OnRejected`), quindi il formato è coerente con `ApiExceptionHandler`. `TooManyRequestsException` serve per limiti di dominio più granulari (es. max 3 tentativi OTP per sessione); usa `TooManyRequestsException(60)` per includere i secondi di attesa nel messaggio e nell'header.

**Formato della risposta al client:**
```json
{
    "status": 404,
    "detail": "Impossibile leggere le informazioni utente"
}
```
Il campo `detail` arriva già localizzato nella lingua della richiesta (`Accept-Language`). Il frontend può leggerlo direttamente oppure ignorarlo e usare la propria traduzione i18n basandosi sullo `status`.

**Esempio in un Service:**
```csharp
public async Task<UserResponseDto> ProcessUser(string id)
{
    var user = await _store.GetUserAsync(id);
    // Senza parametro → chiave generica (error_not_found, messaggio senza nome risorsa)
    // Con parametro   → chiave _named    (error_not_found_named, {0} = "utente")
    if (user == null) throw new NotFoundException("utente");   // → 404 con nome risorsa
    if (!user.IsActive) throw new UnauthorizedException();     // → 401 "Non autorizzato"
    return user;
}

// Esempio con RetryAfterSeconds: testo localizzato include i secondi + header Retry-After
public async Task SendOtp(string userId)
{
    if (await _rateLimitStore.IsBlockedAsync(userId, out int secondsLeft))
        throw new TooManyRequestsException(secondsLeft); // → 429 + Retry-After: {secondsLeft}
}
```

**Aggiungere un tipo di errore custom:**
1. Crea una sottoclasse di `ApiException` con la chiave `.resx` e il codice HTTP
2. Aggiungi la chiave in `Resources/SharedResource.resx` (default) e `Resources/SharedResource.it.resx` (italiano)

Il caso più comune è un errore senza parametri (chiave fissa):
```csharp
// Engine/Models/ApiException.cs  — aggiungi in coda
public class PaymentRequiredException : ApiException
{
    public PaymentRequiredException() : base("error_payment_required", 402) { }
}
```
```xml
<!-- Resources/SharedResource.it.resx -->
<data name="error_payment_required" xml:space="preserve">
    <value>Pagamento richiesto per proseguire</value>
</data>
```

Se hai bisogno del pattern `_named` (nome risorsa variabile) o `_timed` (secondi variabili), guarda come è implementato `NotFoundException` o `TooManyRequestsException` in `ApiException.cs`: il costruttore riceve il parametro nullable e sceglie la chiave resx in base alla sua presenza.

**Le eccezioni non-`ApiException`** (es. `NullReferenceException`, errori di database) vengono ignorate dall'handler: ASP.NET restituisce un 500 generico senza esporre stack trace né dettagli interni.

### 3. Usa FluentValidation per gli Input
Non riempire i controller di `if (string.IsNullOrEmpty(model.Name)) throw ...`.
Crea un validatore ereditando da `AbstractValidator<T>`. L'Engine lo auto-registra: se l'input è malformato, il middleware scarta la richiesta tornando 400 Bad Request formattato (con la lista degli errori nel `ProblemDetails`), prima ancora che il controller venga chiamato.

```csharp
// Models/LoginRequest.cs
public record LoginRequest(string Username, string Pwd);

// Validators/LoginRequestValidator.cs (nome convenzionale: <Tipo>Validator)
public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Username).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Pwd).NotEmpty().MinimumLength(8);
    }
}
// Nient'altro da fare: l'Engine registra automaticamente tutti gli AbstractValidator<T>
```

### 4. L'Engine è intoccabile
Aggiungi in `Engine/` solo logiche universali e infrastrutturali astratte. Se stai scrivendo codice per un cliente specifico o una feature verticale, mettila fuori dall'Engine. 

---

## 🛠️ Developer Journey: Aggiungere un Endpoint

Vuoi aggiungere una nuova funzionalità API? Segui questo flusso logico passo-passo.

### Passo 1: Definire il Modello DTO
Crea la classe di input/output nella cartella `Models/`. Evita di restituire oggetti di dominio grezzi se in futuro userai un Database.
```csharp
public class UserResponseDto {
    public string Name { get; set; }
}
```

### Passo 2: Recupero Dati (IContentStore e `data/`)

`IContentStore` è già implementato da `FileContentStore` per i dati del sito. I metodi esistenti sono:
```csharp
Task<UniversalLegalModel> GetProfileAsync(string language); // dati aziendali localizzati (data/irl.json)
Task<Dictionary<string, string>> GetSocialAsync();          // URL social network (data/social.json)
```

**Struttura di `data/irl.json`** (profilo aziendale):
I valori che devono variare per lingua usano un oggetto `{"it": "...", "en": "..."}` — `FileContentStore` lo risolve automaticamente in base all'header `Accept-Language` della richiesta.
```json
{
    "ragioneSociale": "Acme Srl",
    "partitaIva": "IT12345678901",
    "sedeLegale": {
        "via": { "it": "Via Roma 1", "en": "1 Rome Street" },
        "citta": "Milano"
    },
    "contatti": { "email": "info@acme.it" },
    "metadatiAggiuntivi": {
        "rappresentanteLegale": { "it": "Mario Rossi", "en": "Mario Rossi" }
    }
}
```

**Struttura di `data/social.json`** (link social network):
Oggetto piatto `chiave → URL`. Tieni solo i social che il sito usa; quelli non presenti vengono ignorati.
```json
{
    "instagram": "https://www.instagram.com/acme",
    "linkedin": "https://www.linkedin.com/company/acme"
}
```

**Aggiungere un nuovo file di dati**:
1. Crea il JSON in `data/` (es. `data/products.json`)
2. Aggiungi il metodo a `IContentStore` e implementalo in `FileContentStore`
3. Inietta `IContentStore` nel tuo `Service` e delegagli la lettura

```csharp
// IContentStore.cs
Task<UserResponseDto> GetUserAsync(string id);
```

### Passo 3: La Business Logic (Services)
Tutta la logica va qui. Inietta lo store, manipola i dati, lancia eccezioni personalizzate se necessario.
```csharp
public class UserService
{
    private readonly IContentStore _store;
    public UserService(IContentStore store) => _store = store;

    public async Task<UserResponseDto> ProcessUser(string id)
    {
        var user = await _store.GetUserAsync(id);
        // "utente" è il NOME della risorsa (finisce in {0} del messaggio localizzato),
        // non il messaggio completo. Senza parametro → chiave generica "error_not_found".
        if (user == null) throw new NotFoundException("utente");
        return user;
    }
}
```

### Passo 4: Il Thin Controller
Infine, crea il controller. Scegli se pubblico o protetto, inietta il Servizio e delega il lavoro. Il controller deve rimanere "magro".
```csharp
[Route("api/v1/users")]
public class UsersController : EngineProtectedController
{
    private readonly UserService _userService;
    
    public UsersController(UserService userService) => _userService = userService;

    [HttpGet("{id}")]
    public async Task<IActionResult> GetUser(string id)
    {
        var result = await _userService.ProcessUser(id);
        return Ok(result);
    }
}
```

---

## 🔐 Sistema di Login e Sessioni JWT

Il login è **opzionale**: si attiva valorizzando `Security.Token.SecretKey` (≥32 char) in `global-settings.json`. Se la chiave è vuota, i controller di autenticazione vengono rimossi fisicamente dalla memoria al boot.

### Architettura del Payload di Sessione

Il JWT trasporta un payload tipizzato nel claim `"session"`. L'Engine gestisce solo il meccanismo; la forma del payload la definisce il progetto.

**Livelli del contratto:**

| Tipo | Layer | Campi |
| :--- | :--- | :--- |
| `SessionBase` | Engine (intoccabile) | `UserId` |
| `SessionInfo` | Progetto (personalizzabile) | `UserId` + `DisplayName` + `Roles[]` |

Specchio frontend: `core/dto/session.dto.ts` (interfaccia `SessionInfo`) e `core/engine/models/session-base.model.ts` (interfaccia `SessionBase`). I due lati vanno tenuti in sincronia a mano — il contratto è piccolo e stabile, niente codegen.

Per aggiungere un campo al payload di sessione, modificalo in entrambi i posti:
```csharp
// backend/Models/SessionInfo.cs
public record SessionInfo : SessionBase {
    public string DisplayName { get; init; } = "";
    public string[] Roles { get; init; } = [];
    public string Department { get; init; } = ""; // <-- aggiunto
}
```
```typescript
// frontend/src/app/core/dto/session.dto.ts
export interface SessionInfo extends SessionBase {
    displayName: string;
    roles: string[];
    department: string; // <-- aggiunto (camelCase: il backend serializza con opzioni Web)
}
```

> Il JWT è leggibile dal client (Base64, non cifrato). Non mettere dati sensibili nel payload.

### Emettere un Token (in `AuthController`)

```csharp
var session = new SessionInfo
{
    UserId = "utente-id",
    DisplayName = "Mario Rossi",
    Roles = new[] { "admin" }
};
return Ok(new LoginResult(true, Token: Auth.GenerateToken(new[] { SessionPayload.Claim(session) })));
```

`AuthController` oggi usa credenziali fisse come MVP — **sostituire con Identity Provider o DB in produzione**.

### Leggere la Sessione (in `ProtectedController`)

```csharp
[HttpGet("ping")]
public IActionResult Ping()
{
    var session = User.GetSession<SessionInfo>(); // null se token assente o malformato
    return Ok(new { status = "ok", session });
}
```

`User.GetSession<T>()` è un extension method su `ClaimsPrincipal` fornito dall'Engine. Per controller che devono solo verificare l'identità senza conoscere i campi di dominio, si può usare `User.GetSession<SessionBase>()`.

### Logout

Il JWT è stateless: il logout sul client (rimozione del token) non invalida il token sul backend, che resta tecnicamente valido fino alla scadenza (`exp`). Per la revoca immediata serve una denylist server-side — da implementare se il requisito è presente.

---

## 📦 Controller Template Inclusi

Il template include già 4 controller operativi come esempio/punto di partenza:

| Controller | Base class | Endpoint |
| :--- | :--- | :--- |
| `BaseController` | `EngineApiController` | `GET /profile`, `GET /social` |
| `AuthController` | `EngineAuthController` | `POST /auth/login` |
| `ProtectedController` | `EngineProtectedController` | `GET /ping` |
| `BlobController` | `EngineApiController` | `GET /blob/{slug}` |

`BlobController` serve file binari (immagini, PDF) dal volume Docker `/app/uploads` e li espone via slug opaco.

---

## Quick Start
```bash
dotnet run
```
L'applicazione esporrà di default un health-check su `/health`.
