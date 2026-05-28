# Br1WebEngine - Backend (.NET 9)

Questo è il backend del template Br1WebEngine, una Web API .NET 9 progettata per essere leggera, sicura di default e "production-ready".

L'architettura è divisa in due strati principali:
1. **L'Engine (`Engine/`, `Security/`)**: Il motore infrastrutturale. Contiene le classi base e i middleware di sicurezza. **Non si tocca** durante lo sviluppo quotidiano delle feature.
2. **Il Dominio (`Controllers/`, `Services/`, `Models/`)**: Dove scrivi il tuo codice applicativo.

L'obiettivo di questa separazione è **levarti dai piedi i problemi noiosi** per farti concentrare solo sulla logica.

---

## 🚀 Le "Killer Feature" (Cosa l'Engine ti Fornisce)

### 1. Sicurezza Invalicabile (Defense in Depth)
**Perché è così?** Configurare header, rate limiter e validazioni CORS manualmente su ogni progetto espone a rischi di dimenticanze fatali. 
**Cosa fa l'Engine:** Ogni endpoint che eredita dai controller di base esige l'header `X-Api-Key`. Il framework blocca automaticamente gli IP che superano le 100 req/min (5 req/min per i login). CORS e Security Headers sono pre-applicati a livello di middleware.

### 2. Errori Standardizzati (RFC 9457)
**Perché è così?** I client frontend spesso impazziscono a parsare errori strutturati in 10 modi diversi. 
**Cosa fa l'Engine:** Non scrivi mai `return BadRequest(...)`. Lanci un'eccezione (`throw new NotFoundException("User not found")`) e un Exception Handler globale la formatta in un JSON `ProblemDetails` standardizzato. Questo garantisce uniformità assoluta senza leakare stack trace.

### 3. Routing Adattivo (JWT Opzionale)
**Perché è così?** Non tutti i progetti hanno utenti e login. Avere codice di auth "dormiente" ma esposto è un rischio di sicurezza e inquina Swagger.
**Cosa fa l'Engine:** Se imposti `Security:LoginEnabled = false` in `appsettings.json`, il `TemplateControllerFeatureProvider` interviene durante il boot di ASP.NET e **sradica fisicamente** i controller di autenticazione dalla memoria. Non esistono rotte spurie.

### 4. Il Database Fantasma (`FileContentStore`)
**Perché è così?** Installare Entity Framework e SQL per un MVP rallenta pesantemente le prime settimane. Spesso servono solo testi legali e di configurazione.
**Cosa fa l'Engine:** Il `FileContentStore` carica file JSON da `/data/`, li cacha in `ConcurrentDictionary` (velocità RAM pura) e, risolvendo la lingua dall'header HTTP `Accept-Language`, restituisce l'oggetto già localizzato. 

---

## 📜 Le Regole del Gioco (Cosa l'Engine ti Impone)

Per far sì che l'Engine possa proteggerti, devi rispettare queste convenzioni architetturali ferree:

### 1. Eredita sempre dalle classi base dell'Engine
Non ereditare **mai** direttamente da `ControllerBase`. Se lo fai, perdi i controlli di rate limiting, il logging e il controllo API Key.

**Esempio Pubblico (Solo API Key):**
```csharp
[Route("api/v1/public")]
public class PublicFeatureController : EngineApiController { }
```

**Esempio Privato (API Key + JWT Login):**
```csharp
[Route("api/v1/private")]
public class PrivateFeatureController : EngineProtectedController { }
```

### 2. Usa FluentValidation per gli Input
Non riempire i controller di `if (string.IsNullOrEmpty(model.Name)) throw ...`.
Crea un validatore ereditando da `AbstractValidator<T>`. L'Engine lo auto-registra: se l'input è malformato, il middleware scarta la richiesta tornando 400 Bad Request formattato, prima ancora che il controller venga chiamato.

### 3. L'Engine è intoccabile
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

### Passo 2: Recupero Dati (IContentStore)
Se la tua feature legge dai file JSON, aggiungi il metodo nell'interfaccia `IContentStore` e implementalo in `FileContentStore`.
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

## Quick Start
```bash
dotnet run
```
L'applicazione esporrà di default un health-check su `/health`.
