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

### 2. Errori Standardizzati (RFC 9457)
**Perché è così?** I client frontend spesso impazziscono a parsare errori strutturati in 10 modi diversi. 
**Cosa fa l'Engine:** Non scrivi mai `return BadRequest(...)`. Lanci un'eccezione (`throw new NotFoundException("User not found")`) e un Exception Handler globale la formatta in un JSON `ProblemDetails` standardizzato. Questo garantisce uniformità assoluta senza leakare stack trace.

### 3. Routing Adattivo (JWT Opzionale)
**Perché è così?** Non tutti i progetti hanno utenti e login. Avere codice di auth "dormiente" ma esposto è un rischio di sicurezza e inquina Swagger.
**Cosa fa l'Engine:** Il login si attiva automaticamente solo quando valorizzi `Security.Token.SecretKey` in `global-settings.json` (≥32 caratteri); se la lasci vuota il `TemplateControllerFeatureProvider` interviene durante il boot di ASP.NET e **sradica fisicamente** i controller di autenticazione dalla memoria. Non esistono rotte spurie.

### 4. Il Database Fantasma (`FileContentStore`)
**Perché è così?** Installare Entity Framework e SQL per un MVP rallenta pesantemente le prime settimane. Spesso servono solo testi legali e di configurazione.
**Cosa fa l'Engine:** Il `FileContentStore` carica file JSON da `/data/`, li cacha in `ConcurrentDictionary` (velocità RAM pura) e, risolvendo la lingua dall'header HTTP `Accept-Language`, restituisce l'oggetto già localizzato. 

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

| Eccezione | HTTP | Chiave `.resx` | Messaggio (it) |
| :--- | :---: | :--- | :--- |
| `NotFoundException("risorsa")` | 404 | `error_not_found` | "Impossibile leggere le informazioni {0}" |
| `DataNotFoundException()` | 404 | `error_data_not_found` | "Dati non trovati" |
| `UnauthorizedException()` | 401 | `error_unauthorized` | "Non autorizzato" |
| `UnauthorizedException("error_invalid_credentials")` | 401 | `error_invalid_credentials` | "Credenziali non valide." |
| `DecodingException()` | 400 | `error_decoding` | "Errore nella decodifica" |
| `InvalidParametersException()` | 400 | `error_invalid_parameters` | "Parametri non validi o mancanti" |
| qualsiasi altra eccezione | 500 | — | Risposta generica ASP.NET (nessun dettaglio esposto) |

> `UnauthorizedException` accetta una chiave personalizzata come argomento. Usa `"error_unauthorized"` (generica) quando non vuoi rivelare se a sbagliare è username o password; usa `"error_invalid_credentials"` solo dove la distinzione è accettabile.

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
    if (user == null) throw new NotFoundException("utente");   // → 404 "Impossibile leggere le informazioni utente"
    if (!user.IsActive) throw new UnauthorizedException();     // → 401 "Non autorizzato"
    return user;
}
```

**Aggiungere un tipo di errore custom:**
1. Crea una sottoclasse di `ApiException` con la chiave `.resx` e il codice HTTP
2. Aggiungi la chiave in `Resources/SharedResource.resx` (default) e `Resources/SharedResource.it.resx` (italiano)

```csharp
// Engine/Models/ApiException.cs  — aggiungi in coda
public class ConflictException : ApiException
{
    public ConflictException() : base("error_conflict", 409) { }
}
```
```xml
<!-- Resources/SharedResource.it.resx -->
<data name="error_conflict" xml:space="preserve">
    <value>Risorsa già esistente</value>
</data>
```

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
        if (user == null) throw new NotFoundException("Utente non trovato");
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
