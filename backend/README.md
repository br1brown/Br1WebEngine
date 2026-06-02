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

#### Schema di Autenticazione API Key

La API key è il "biglietto d'ingresso": identifica il client applicativo (es. il frontend Node SSR), non l'utente. Senza di essa la richiesta non arriva ai controller.

Come funziona (`Security/ApiKeyAuthentication.cs`):
- Il client invia l'header `X-Api-Key: <chiave>` su ogni richiesta.
- L'handler confronta la chiave presentata con l'array `Security.ApiKeys` in `global-settings.json`. Il confronto è **ordinale e case-sensitive** (una API key è un segreto; ignorare il case ne dimezzerebbe l'entropia effettiva).
- Il confronto avviene con `CryptographicOperations.FixedTimeEquals` in un loop non-short-circuit su tutte le chiavi: nessun timing side-channel permette di dedurre la chiave un carattere alla volta.
- Le richieste `OPTIONS` (preflight CORS del browser) bypassano il controllo — `AuthenticateResult.NoResult()` — perché il browser le invia prima della richiesta vera senza poter allegare header custom.
- Se la chiave manca o è errata, la risposta è un `ProblemDetails` JSON 401, non un redirect né un body vuoto.

**Aggiungere o ruotare una chiave:**
```json
// global-settings.json
"Security": {
    "ApiKeys": ["frontend", "mobile-app", "nuova-chiave-32-char-minimo"],
    ...
}
```
Più chiavi coesistono; elimina quella vecchia quando tutti i client hanno aggiornato. In produzione usare almeno 32 caratteri casuali (es. `openssl rand -base64 32`).

#### Riferimento completo `SecurityOptions` (`global-settings.json` → `Security.*`)

| Campo | Tipo | Default | Comportamento |
| :--- | :--- | :--- | :--- |
| `ApiKeys` | `string[]` | obbligatorio | Chiavi accettate nell'header `X-Api-Key`. Case-sensitive. |
| `CorsOrigins` | `string[]` | `[]` | Origins CORS consentite. **Vuoto = `AllowAnyOrigin`** — la protezione è la API key. Valorizzare per multi-tenant o API admin separata. |
| `Headers` | `Dictionary<string,string>` | vedi `global-settings.json` | Header di sicurezza browser. Applicati dal backend solo se esposto pubblicamente (`backend.public`). `Content-Security-Policy` è ignorata (irrilevante su JSON). |
| `BehindProxy` | `bool` | `false` | Se `true`, abilita `ForwardedHeaders` che legge l'IP reale da `X-Forwarded-For`. **Impostare `true` in produzione se c'è un reverse proxy** — altrimenti il rate limiter vede l'IP del proxy, non del client, e il limite per-IP diventa inutile. Trusted solo per reti RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). |
| `Token.SecretKey` | `string` | `""` | Chiave di firma JWT. **Vuota = login disabilitato** (controller rimossi, JWT non registrato). Minimo 32 byte (UTF-8): sotto questa soglia il boot va in crash con `InvalidOperationException`. |
| `Token.ExpirationSeconds` | `int` | `3000` (50 min) | Durata del token JWT. `ClockSkew = TimeSpan.Zero`: scaduto = subito rifiutato, senza margine di grazia. |

> **Crash al boot:** se `SecretKey` è valorizzata ma troppo corta (< 32 byte), `TokenOptions.GetSigningKey()` lancia `InvalidOperationException` con messaggio esplicito. Non è un errore a runtime — si vede al primo avvio.

### 2. Errori Standardizzati (RFC 9457)
**Perché è così?** I client frontend spesso impazziscono a parsare errori strutturati in 10 modi diversi.
**Cosa fa l'Engine:** Non scrivi mai `return BadRequest(...)`. Lanci un'eccezione (`throw new NotFoundException("utente")`) e un Exception Handler globale la formatta in un JSON `ProblemDetails` standardizzato. Questo garantisce uniformità assoluta senza leakare stack trace.

### 3. Routing Adattivo (JWT Opzionale)
**Perché è così?** Non tutti i progetti hanno utenti e login. Avere codice di auth "dormiente" ma esposto è un rischio di sicurezza e inquina Swagger.
**Cosa fa l'Engine:** Il login si attiva automaticamente solo quando valorizzi `Security.Token.SecretKey` in `global-settings.json` (≥32 caratteri); se la lasci vuota il `TemplateControllerFeatureProvider` interviene durante il boot di ASP.NET e **sradica fisicamente** i controller di autenticazione dalla memoria. Non esistono rotte spurie.

#### Come funziona "sradica fisicamente" — `TemplateControllerFeatureProvider`

`TemplateControllerFeatureProvider` (`Security/TemplateControllerFeatureProvider.cs`) implementa `IApplicationFeatureProvider<ControllerFeature>`, un hook ASP.NET eseguito al boot **prima** che venga costruita la tabella degli endpoint. Quando `Security.Token.SecretKey` è vuota (`LoginEnabled = false`), il provider rimuove dalla lista di discovery tutti i controller che ereditano da `EngineAuthController` o da `EngineProtectedController`:

```csharp
typeof(EngineAuthController).IsAssignableFrom(controller.AsType())
```

Il metodo `IsAssignableFrom` cattura sia le classi concrete del template (`AuthController`, `ProtectedController`) sia qualsiasi futura sottoclasse del progetto. La lista viene materializzata con `.ToArray()` prima della rimozione per evitare "collection modified during iteration".

Dopo la rimozione, ASP.NET non genera rotte, non espone nulla in Swagger e nessuna richiesta HTTP può raggiungere quei controller — come se non esistessero nel codice.

**Conseguenza pratica:** se aggiungi un controller che eredita da `EngineAuthController` (es. `PasswordResetController`) e `SecretKey` è vuota, anche il tuo controller viene soppresso automaticamente. Non occorre alcuna logica aggiuntiva.

### 4. Il Database Fantasma (`FileContentStore`)
**Perché è così?** Installare Entity Framework e SQL per un MVP rallenta pesantemente le prime settimane. Spesso servono solo testi legali e di configurazione.
**Cosa fa l'Engine:** Il `FileContentStore` carica file JSON da `/data/`, li cacha in `ConcurrentDictionary` (velocità RAM pura) e, risolvendo la lingua dall'header HTTP `Accept-Language`, restituisce l'oggetto già localizzato. Per gestire la lettura del file usa `try/catch` su `ReadAllTextAsync` invece di un `File.Exists` preventivo: elimina la race condition TOCTOU (il file potrebbe essere rimosso tra il controllo e la lettura effettiva) e converte correttamente la `FileNotFoundException` in `NotFoundException`.

#### `LocalizedJsonDeserializer` — regole dettagliate della risoluzione i18n

Il deserializzatore interno di `FileContentStore` risolve ricorsivamente i campi localizzati dei file JSON. Le sue regole esatte:

**Quando un oggetto è "localizzato":**
Un oggetto è considerato un blocco i18n *solo se tutte le sue chiavi sono codici lingua riconosciuti da `CultureInfo` E presenti in `SupportedLanguages`*. Se anche una sola chiave non è un tag lingua (es. `"name"`, `"url"`), l'oggetto è trattato come un oggetto di dominio normale e tutte le sue chiavi vengono processate ricorsivamente.

```json
// Trattato come blocco i18n (tutte le chiavi sono lingue supportate):
{ "it": "Via Roma 1", "en": "1 Rome Street" }

// Trattato come oggetto normale (ha chiave "via" che non è una lingua):
{ "via": { "it": "Via Roma 1", "en": "1 Rome Street" }, "cap": "20100" }
```

**Priorità nella selezione della lingua:**
1. Lingua richiesta (ricavata dall'header `Accept-Language`)
2. `Localization.DefaultLanguage` (es. `"it"`)
3. Primo valore non vuoto trovato nell'oggetto

**Normalizzazione:** `Accept-Language: it-IT,it;q=0.9` → prima preferenza `"it-IT"` → `CultureInfo.TwoLetterISOLanguageName` → `"it"`. Tag non riconosciuti da `CultureInfo` (es. `"xyz"`) ricadono sul `DefaultLanguage`.

**Pruning dei valori vuoti:** dopo la risoluzione, i campi il cui valore diventa stringa vuota, array vuoto o oggetto vuoto vengono **rimossi** dall'output. Il campo corrispondente nel modello risultante sarà `null`, non una stringa vuota.

> **Attenzione:** aggiungere una lingua a `SupportedLanguages` può cambiare come vengono interpretati gli oggetti in `irl.json` già esistenti, se uno di essi ha un campo con la stessa chiave della nuova lingua. Prima di aggiungere una lingua, verifica che nessun campo dati abbia lo stesso nome.

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
    "detail": "Impossibile trovare l'utente richiesto"
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

#### `SharedResource` e la localizzazione dei messaggi

`SharedResource` (in `Engine/SharedResource.cs`) è una classe vuota che serve da ancora di tipo per `IStringLocalizer<SharedResource>`. I file resx associati sono:

```
Resources/SharedResource.resx       ← inglese / fallback
Resources/SharedResource.it.resx    ← italiano
```

L'attributo `[assembly: RootNamespace("Backend")]` in quel file è critico: il nome dell'assembly è `"backend"` (minuscolo, dal `.csproj`), ma il namespace è `"Backend"`. Senza questo attributo `IStringLocalizer` cercherebbe `backend.Resources.SharedResource.resx` (inesistente) e tutti i messaggi mostrerebbero la chiave grezza invece del testo localizzato.

**Sintomo di un problema di namespace:** se in risposta agli errori il frontend riceve `"detail": "error_not_found"` invece del messaggio, il localizzatore non trova il file resx — controlla che il `RootNamespace` nel `.csproj` e in `SharedResource.cs` siano allineati.

Inietta `IStringLocalizer<SharedResource>` ovunque servano messaggi localizzati (validatori, service, controller). Non creare un secondo tipo-ancora.

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

#### Estendere il Validator di Login (`LoginRequestValidatorBase`)

Il template include già un validator base per `LoginRequest` (`Engine/Validation/LoginRequestValidatorBase.cs`) con tre regole predefinite:

| Campo | Regola | Chiave resx |
| :--- | :--- | :--- |
| `Username` | `NotEmpty` | `username_required` |
| `Pwd` | `NotEmpty` | `pwd_required` |
| `Pwd` | `MinimumLength(8)` | `pwd_length` |

**Non ridefinire queste regole** in `Validation/LoginRequestValidator.cs`: le erediti automaticamente. Aggiungi solo le regole specifiche del progetto:

```csharp
// Validation/LoginRequestValidator.cs
public class LoginRequestValidator : LoginRequestValidatorBase
{
    public LoginRequestValidator(IStringLocalizer<SharedResource> localizer)
        : base(localizer)
    {
        // Regole aggiuntive del progetto:
        RuleFor(x => x.Username)
            .Matches(@"^[a-zA-Z0-9._-]+$")
            .WithMessage(_ => localizer["username_invalid"].Value);
    }
}
```

**Localizzazione nei validator:** usa sempre la forma lambda `_ => localizer["key"].Value`, non la forma diretta `localizer["key"].Value`. Il validator è un singleton: la forma diretta risolverebbe la stringa al boot con la cultura del processo, ignorando la lingua della richiesta HTTP.

### 4. L'Engine è intoccabile
Aggiungi in `Engine/` solo logiche universali e infrastrutturali astratte. Se stai scrivendo codice per un cliente specifico o una feature verticale, mettila fuori dall'Engine.

---

## ⚙️ Configurazione e Boot Sequence

### Sorgenti di Configurazione

L'unica sorgente di configurazione è `global-settings.json`. Al boot, tutte le sorgenti `appsettings*.json` vengono **rimosse attivamente** dalla pipeline di configurazione ASP.NET:

```csharp
// Program.cs — rimozione esplicita
var defaultJsonSources = builder.Configuration.Sources
    .OfType<JsonConfigurationSource>()
    .Where(s => s.Path?.StartsWith("appsettings") == true)
    .ToList();
foreach (var source in defaultJsonSources)
    builder.Configuration.Sources.Remove(source);
```

**Conseguenza pratica:** `appsettings.Development.json` non viene letto. Per override locali, modifica `global-settings.json` direttamente.

Il file viene cercato in due posizioni (ordine):
1. `../global-settings.json` (dev: `dotnet run` eseguito da `backend/`)
2. `global-settings.json` (Docker: `cwd=/app`)

Entrambe sono `optional: true`: se il file manca, l'app usa i default dei modelli `*Options`.

### Comportamento Serializzazione JSON (Risposte API)

Tutti i controller usano queste opzioni globali, applicate automaticamente a tutte le risposte:

| Comportamento | Impostazione | Effetto |
| :--- | :--- | :--- |
| Campi `null` | `WhenWritingNull` | Omessi dal JSON — il client non li vede |
| Enum | `JsonStringEnumConverter` | Serializzati come stringa, non numero |

Un campo `null` nel DTO non appare nella risposta JSON. Se il frontend si aspetta un campo assente come `null` funziona; se si aspetta un campo assente come un valore di default va gestito lato client.

### `Content-Language` nelle Risposte

`ApplyCurrentCultureToResponseHeaders = true` fa sì che ogni risposta includa l'header `Content-Language` con la lingua effettivamente usata (es. `Content-Language: it`). Il frontend può leggerlo per sapere in quale lingua sono stati localizzati i messaggi di errore.

### Unico Provider Cultura: `Accept-Language`

Il `RequestCultureProviders` è impostato con solo `AcceptLanguageHeaderRequestCultureProvider`. Provider da cookie e da URL non sono attivi: la lingua viene sempre ricavata dall'header `Accept-Language` della richiesta.

### Sezione `Custom` (Configurazione Libera)

`global-settings.json` include una sezione `"Custom": {}` per valori aggiuntivi del progetto senza toccare il codice infrastrutturale:

```json
"Custom": {
    "FeatureFlags": { "NuovaFunzione": true },
    "MaxUploadMb": 10,
    "Analytics": { "TrackingId": "UA-XXXXX" }
}
```

**Backend:** leggibile via `IConfiguration`:
```csharp
var maxUpload = builder.Configuration.GetValue<int>("Custom:MaxUploadMb");
var nuovaFunzione = builder.Configuration.GetValue<bool>("Custom:FeatureFlags:NuovaFunzione");
```

**Frontend Node SSR:** `getBr1Settings().Custom` (disponibile in `server-env.ts`).

**Browser Angular:** non disponibile direttamente — trasferisci i valori necessari via `TransferState` o via un endpoint API dedicato. Usa questo meccanismo per feature flag, limiti applicativi, ID di analytics: è l'escape hatch ufficiale per configurazione progetto-specifica senza aggiungere nuovi `*Options` a livello di schema.

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
Task<Dictionary<string, string>> GetSocialAsync(string[]? nomi = null); // URL social network (data/social.json)
```

#### Schema completo di `UniversalLegalModel` (e `data/irl.json`)

```csharp
UniversalLegalModel {
    string?  RagioneSociale
    string?  PartitaIva
    string?  CodiceFiscale        // Se distinto dalla P.IVA
    Address? SedeLegale {
        Via, Civico, Cap, Citta, Provincia, Nazione
    }
    ContactInfo? Contatti {
        Telefono, Email, Pec
    }
    CompanyDetails? DatiSocietari {
        RegistroImprese, NumeroRea
        decimal?  CapitaleSociale
        bool?     CapitaleInteramenteVersato
        bool?     IsSocioUnico
        bool?     InLiquidazione
        string?   CodiceSdi         // Codice SDI fatturazione elettronica
    }
    Dictionary<string,string>? Social           // Aggiunto da SiteService, non in irl.json
    Dictionary<string,string>? MetadatiAggiuntivi  // Valori flat: string, non object
}
```

Tutti i campi sono nullable: inserisci solo quelli che il sito deve esporre. Esempio esteso di `data/irl.json`:
```json
{
    "ragioneSociale": "Acme Srl",
    "partitaIva": "IT12345678901",
    "codiceFiscale": "12345678901",
    "sedeLegale": {
        "via": { "it": "Via Roma 1", "en": "1 Rome Street" },
        "civico": "1", "cap": "20100", "citta": "Milano",
        "provincia": "MI", "nazione": "Italia"
    },
    "contatti": { "email": "info@acme.it", "pec": "acme@pec.it", "telefono": "+39 02 1234567" },
    "datiSocietari": {
        "registroImprese": "MI-1234567",
        "numeroRea": "MI-123456",
        "capitaleSociale": 10000.00,
        "capitaleInteramenteVersato": true,
        "isSocioUnico": false,
        "inLiquidazione": false,
        "codiceSdi": "XXXXXXX"
    },
    "metadatiAggiuntivi": {
        "rappresentanteLegale": { "it": "Mario Rossi", "en": "Mario Rossi" }
    }
}
```

> `MetadatiAggiuntivi` è `Dictionary<string, string>`: i valori sono stringhe semplici dopo la risoluzione della localizzazione. Non annidare oggetti complessi qui; usare `DatiSocietari` per dati strutturati.

#### `SiteService` — Logica di Filtro dei Social

`SiteService.GetProfileAsync()` (usato da `GET /profile`) aggiunge i social al profilo legale, ma applica un **filtro hardcoded** che mantiene solo `linkedin`, `whatsapp` e `facebook`:

```csharp
// Services/SiteService.cs
string[] principali = ["linkedin", "whatsapp", "facebook"];
profile.Social = social
    .Where(kv => principali.Contains(kv.Key, StringComparer.OrdinalIgnoreCase))
    .ToDictionary(...);
```

I social non inclusi in questa lista non compaiono nella risposta di `GET /profile`. Per esporli tutti (o con un filtro diverso) usa `GET /social`, oppure modifica `principali` nel servizio.

`GetSocialAsync(string[]? nomi)` restituisce invece tutti i social o quelli filtrati per nome (case-insensitive): il parametro corrisponde al query string `?nomi=instagram&nomi=linkedin`. Il filtro è applicato lato server — non scaricare tutti i social e filtrare lato client.

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

> **Nota sulla lingua in `SiteService`:** `GetProfileAsync()` ricava la lingua da `CultureInfo.CurrentCulture`, impostato da `UseRequestLocalization` all'inizio della pipeline. Se chiami `SiteService` fuori da un contesto HTTP (es. job in background), la cultura usata è quella di default del processo.

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

#### `SessionPayload` — Dettagli Implementativi

`SessionPayload` (`Engine/Security/SessionPayload.cs`) è la colla tra il JWT e il payload tipizzato del progetto.

**`SessionPayload.Claim<T>(T value)`** serializza il payload in JSON con `JsonSerializerDefaults.Web` (camelCase, invariant culture) e restituisce un `Claim` di tipo `"session"`. Il camelCase è load-bearing: è quello che il frontend TypeScript riceve.

**`User.GetSession<T>()`** è un extension method su `ClaimsPrincipal`. Trova il claim `"session"`, lo deserializza in `T` con le stesse opzioni Web (case-insensitive in lettura). **Restituisce `null` senza lanciare eccezioni se il claim manca o il JSON è malformato.** Controlla sempre il risultato:

```csharp
var session = User.GetSession<SessionInfo>();
if (session is null)
    throw new UnauthorizedException(); // token valido ma senza payload di sessione

// Nei controller che verificano solo l'identità senza campi di dominio:
var session = User.GetSession<SessionBase>();
```

Le opzioni JSON sono identiche in scrittura e lettura: non cambiare la serializzazione in `Claim<T>` senza aggiornare anche `session.dto.ts` nel frontend.

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

#### `AuthService` — Claim Impliciti in Ogni Token

`AuthService.GenerateToken` include automaticamente due claim in **ogni** token emesso, indipendentemente da quelli passati dal controller:

| Claim | Valore | Perché |
| :--- | :--- | :--- |
| `ClaimTypes.Role` | `"Authenticated"` | Richiesto dalla policy `RequireLogin` su `EngineProtectedController`. Senza di esso il token viene accettato come firma ma rifiutato dall'autorizzazione (403). |
| `"loginTime"` | Timestamp Unix UTC | Momento dell'emissione. Utile per "forza re-login se la sessione ha più di N ore" senza modificare il middleware. |

Il token è firmato con HMAC-SHA256. La scadenza assoluta è `Security.Token.ExpirationSeconds`. Il middleware JWT Bearer ha `ClockSkew = TimeSpan.Zero`: un token scaduto è immediatamente rifiutato, senza margine di grazia.

`AuthService` è registrato come **singleton** (DI); viene registrato solo se `LoginEnabled` è `true`.

> **In test di integrazione:** per raggiungere un endpoint `EngineProtectedController`, il token fake deve includere il ruolo `"Authenticated"` oltre alla firma corretta. Senza quel ruolo la risposta sarà 403, non 401.

### Leggere la Sessione (in `ProtectedController`)

```csharp
[HttpGet("ping")]
public IActionResult Ping()
{
    var session = User.GetSession<SessionInfo>(); // null se token assente o malformato
    return Ok(new { status = "ok", session });
}
```

### Logout

Il JWT è stateless: il logout sul client (rimozione del token) non invalida il token sul backend, che resta tecnicamente valido fino alla scadenza (`exp`). Per la revoca immediata serve una denylist server-side — da implementare se il requisito è presente.

---

## 📡 Osservabilità (OpenTelemetry)

Zero dipendenze esterne quando non serve: se `Endpoint` è vuoto, OpenTelemetry non viene registrato e l'app gira senza alcun collector.

**Abilitare il tracing:**
```json
// global-settings.json
"OpenTelemetry": {
    "Endpoint": "http://jaeger:4318",
    "ServiceName": "backend",
    "ServiceVersion": "1.0.0"
}
```

**Cosa viene tracciato automaticamente:**
- Ogni richiesta HTTP inbound (route, status code, durata) — `AddAspNetCoreInstrumentation`
- Ogni chiamata `HttpClient` outbound — `AddHttpClientInstrumentation`

Sia le **trace** che le **metriche** vengono esportate allo stesso endpoint OTLP. Il formato è OTLP-over-HTTP (porta tipica 4318), non gRPC (porta 4317).

**Collector compatibili:** Jaeger ≥ 1.35, Grafana Tempo, OpenTelemetry Collector, Datadog Agent con OTLP abilitato.

| Campo | Default | Note |
| :--- | :--- | :--- |
| `Endpoint` | `""` (disabilitato) | URL del collector OTLP |
| `ServiceName` | `"backend"` | `service.name` nei trace |
| `ServiceVersion` | `"1.0.0"` | `service.version` nei trace |

---

## 📦 Controller Template Inclusi

Il template include già 4 controller operativi come esempio/punto di partenza:

| Controller | Base class | Endpoint |
| :--- | :--- | :--- |
| `BaseController` | `EngineApiController` | `GET /profile`, `GET /social[?nomi=instagram&nomi=linkedin]` |
| `AuthController` | `EngineAuthController` | `POST /auth/login` |
| `ProtectedController` | `EngineProtectedController` | `GET /ping` |
| `BlobController` | `EngineApiController` | `GET /blob/{slug}` |

#### `BlobController` — Dettagli Tecnici

**Route:** `GET /blob/{slug}` — richiede API key, nessuna autenticazione utente.

**Slug:** identificativo univoco del file **inclusa l'estensione** (es. `abc123.jpg`). L'assegnazione dello slug avviene al momento dell'upload (non implementato nel template — da aggiungere).

**Percorso fisico:** `{ContentRootPath}/uploads/{slug}`. In Docker (`cwd=/app`) diventa `/app/uploads`. In dev locale è `backend/uploads/`. **La directory deve esistere prima del primo accesso: non viene creata automaticamente.**

**Protezione path traversal:** prima di aprire il file, il controller risolve il percorso assoluto con `Path.GetFullPath` e verifica che inizi con `_uploadsPath` (con trailing separator). Un slug tipo `../../etc/passwd` produce `InvalidParametersException` (400) senza esporre il filesystem.

**Range requests:** il file è servito con `enableRangeProcessing: true` — supporta l'header HTTP `Range` per lo streaming di video/audio e i download riprendibili.

**Content-Type:** rilevato automaticamente dall'estensione del file tramite `FileExtensionContentTypeProvider`. Se l'estensione non è riconosciuta, viene usato `application/octet-stream`.

> **Nota:** `BlobController` implementa solo il GET. La logica di upload (ricevere un file, assegnargli uno slug univoco, salvarlo in `uploads/`) è da implementare nel progetto figlio.

#### Health Check (`GET /health`)

L'endpoint `/health` è registrato con `.AllowAnonymous()`: bypassa sia la verifica API key che il JWT. È pensato per Docker health checks e probe dei load balancer — nessun client esterno deve poter raggiungere il backend direttamente nella configurazione standard.

**Risposta di default** (nessun check custom configurato):
```
HTTP 200 OK
Body: Healthy
```

**Aggiungere check custom** (es. database, servizio esterno):
```csharp
// Program.cs, dopo AddHealthChecks()
builder.Services.AddHealthChecks()
    .AddUrlGroup(new Uri("https://api.esempio.com/health"), name: "external-api")
    .AddCheck("custom", () => HealthCheckResult.Healthy("tutto ok"));
```

**Docker `HEALTHCHECK`:**
```dockerfile
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:80/health || exit 1
```

> **`UseStatusCodePages`:** registrato dopo `UseExceptionHandler`. Intercetta risposte 4xx/5xx senza body e aggiunge un testo minimo. In pratica quasi mai visibile perché `AddProblemDetails` popola già il body — ma ricordati di lanciare eccezioni (`throw new NotFoundException()`) invece di `return StatusCode(404)` per garantire il formato ProblemDetails anche negli edge case.

---

## Quick Start
```bash
dotnet run
```
L'applicazione esporrà di default un health-check su `/health` (anonimo, risponde `Healthy` se tutto va bene).
