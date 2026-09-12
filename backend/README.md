# Br1WebEngine - Backend (.NET 9)

> 📚 Parte della documentazione di Br1WebEngine: indice e tabella "dove metto le mani" nel [README principale](../README.md). La sezione "Developer Journey" qui sotto è il come passo-passo del backend.

Questo è il backend del template Br1WebEngine, una Web API .NET 9 leggera e sicura di default, pronta per andare in produzione così com'è.

L'architettura è divisa in:
1. **L'Engine (`Engine/`)**: Motore infrastrutturale e sicurezza. Non si modifica.
2. **Il Dominio (`Controllers/`, `Services/`, `Models/`, `Store/`, `Validation/`)**: Codice applicativo del progetto.

---

## 🧩 Punti di personalizzazione

L'Engine si estende ereditando o registrando servizi in DI, mai modificando `Engine/`.
- **Aggiungere endpoint**: Eredita da `EngineApiController` (API key), `EngineProtectedController` (JWT), `EngineAuthController` (login), o `EngineBlobController` (file binari). Include property pronte come code, notifiche e cifratura. (Ricetta: [AGENTS.md](../AGENTS.md#aggiungere-un-endpoint)).
- **Sostituire un servizio**: Rimpiazza `IContentStore` (es. DB), `IEngineMailer`, `INotificationStream` (es. Redis), `IDeliveryService` registrandoli in DI in `Program.cs`. Lo store binario (`BlobStore`) si modifica direttamente. (Ricetta: [AGENTS.md](../AGENTS.md#sostituire-un-servizio-dellengine)).
- **Validazione ed errori**: Usa `AbstractValidator<T>` (auto-registrato). Lancia eccezioni derivate da `ApiException` per restituire JSON strutturati. Usa `CurrentSession<T>()` per il payload JWT. (Ricette: [AGENTS.md](../AGENTS.md#errori), [AGENTS.md](../AGENTS.md#leggere-la-sessione)).
- **Dati personali (Oblio/Export)**: Implementa `IPersonalDataStore`. Gli endpoint `GET/DELETE /me/data` sono già pronti e protetti. (Ricetta: [AGENTS.md](../AGENTS.md#esportare-e-cancellare-i-dati-personali)).
- **Configurazione**: Usa le sezioni `Security.*`, `Mail.*`, `Localization.*`, e `Custom:` di `global-settings.json`. Header web in `security-headers.json`.
- **Servizi esterni**: Registra un `HttpClient` tipizzato. Per i webhook, usa `EngineApiController` con `[AllowAnonymous]` e valida la firma sul body grezzo.
- **Error reporting**: Imposta `ErrorReporting.WebhookUrl` in `global-settings.local.json` per ricevere POST automatici sugli errori ≥500 (server) e sulle eccezioni JS non gestite nel browser (client, via `EngineClientErrorController`).

---

## 🚀 Funzionalità Principali dell'Engine

### 1. Sicurezza e Protezione Preconfigurate

- **`X-Api-Key` obbligatoria**: richiesta da ogni controller derivato per l'accesso base.
- **Rate Limiter automatico**: 100 req/min globali, 5 req/min per i login. Risponde con HTTP 429 e `ProblemDetails` JSON.
- **CORS e Header di Sicurezza**: `WithExposedHeaders("Retry-After")` attivato; `security-headers.json` caricato se esposto al web (`backend.public`).
- **Ordine Middleware**: `UseExceptionHandler` agisce prima di `UseRateLimiter` per non perdere i 429 né eventuali errori interni.

#### Schema di Autenticazione API Key

L'API key identifica l'applicativo client (es. Node SSR), non l'utente finale.

Meccanismo in `Security/ApiKeyAuthentication.cs`:
- **Match sicuro**: la chiave inviata viene controllata contro l'array `Security.ApiKeys` (`global-settings.local.json`) tramite `CryptographicOperations.FixedTimeEquals`.
- **Preflight CORS**: ignorano l'autenticazione.
- **Fallimento**: JSON `ProblemDetails` 401 immediato.

Aggiungere o ruotare una chiave:
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
| `Headers` | `Dictionary<string,string>` | vedi `security-headers.json` | Header di sicurezza browser (dal file del template `security-headers.json`, non da `global-settings.json`). Applicati dal backend solo se esposto pubblicamente (`backend.public`). `Content-Security-Policy` è ignorata (irrilevante su JSON) e `Strict-Transport-Security` è esclusa dal loop perché già emessa da `UseHsts()`. |
| `BehindProxy` | `bool` | `false` | Se `true`, abilita `ForwardedHeaders` che legge l'IP reale da `X-Forwarded-For`. **Impostare `true` in produzione se c'è un reverse proxy** — altrimenti il rate limiter vede l'IP del proxy, non del client, e il limite per-IP diventa inutile. Trusted solo per reti RFC 1918 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). |
| `Token.SecretKey` | `string` | `""` | Chiave di firma JWT. **Vuota = login disabilitato** (controller rimossi, JWT non registrato). Minimo 32 byte (UTF-8): sotto questa soglia il boot va in crash con `InvalidOperationException`. |
| `Token.ExpirationSeconds` | `int` | `3000` (50 min) | Durata del token JWT. `ClockSkew = TimeSpan.Zero`: scaduto = subito rifiutato, senza margine di grazia. **Non esiste un refresh token**: alla scadenza serve un nuovo login, non un rinnovo silenzioso (frontend: *vedi «Ciclo di Vita del Token»*). |

> Crash al boot: se `SecretKey` è valorizzata ma troppo corta (< 32 byte), `TokenOptions.GetSigningKey()` lancia `InvalidOperationException` con messaggio esplicito. Non è un errore a runtime, si vede al primo avvio.

> Ruotare `Token.SecretKey` invalida istantaneamente tutti i token già emessi (la firma non corrisponde più): ogni utente loggato viene sloggato al prossimo giro, senza preavviso lato client oltre il normale 401. Ruotala solo quando serve davvero (sospetto di compromissione), non come pratica di igiene periodica senza motivo: non c'è un periodo di grazia con doppia chiave valida.

> Limiti del rate limiter: non configurabili, non condivisi tra istanze. Le soglie (100 req/min globali, 5 req/min sul login) sono costanti hardcoded in `Engine/Security/SecurityExtensions.cs`, non esposte via `SecurityOptions`/`global-settings.json`: per cambiarle si modifica quel file. Sono anche in-memory per-istanza (`RateLimitPartition.GetFixedWindowLimiter`, stato nel processo): con più repliche del backend dietro un bilanciatore, ogni istanza conta le richieste per conto proprio, quindi il limite effettivo per IP si moltiplica per il numero di repliche. Stesso limite già segnalato per `IContentStore` (§ cache) e `INotificationStream`: qui non c'è ancora un backplane condiviso pronto, è responsabilità del progetto se serve scalare orizzontalmente.

### 2. Errori Standardizzati (RFC 9457)
Si lancia un'eccezione (`throw new NotFoundException("utente")`) e l'`ApiExceptionHandler` globale emette un `ProblemDetails` JSON omogeneo, senza stampare stack trace al client.

### 3. Routing Adattivo (JWT Opzionale)
- Il sistema di login si attiva automaticamente se `Security.Token.SecretKey` è presente e ≥32 caratteri in `global-settings.local.json`.
- **Rimozione silente**: se la chiave è vuota, `TemplateControllerFeatureProvider` sopprime completamente dalla memoria `EngineAuthController` e `EngineProtectedController`. Niente rotte spurie in Swagger né logica vulnerabile.

#### `TemplateControllerFeatureProvider`

- È un hook `IApplicationFeatureProvider<ControllerFeature>` che gira al boot di ASP.NET.
- Se `LoginEnabled = false`, rimuove i controller che ereditano da `EngineAuthController` e `EngineProtectedController` dalla discovery.
- **Risultato**: ASP.NET e Swagger non generano le rotte. Eventuali tue sottoclassi custom che necessitano del login vengono soppresse in automatico se manca la SecretKey.

### 4. Lo Store Basato su File (`FileContentStore`)

- Legge file JSON da `data/`, cacha i risultati in `IMemoryCache` (TTL 1h) e risolve la lingua via header `Accept-Language`.
- I contenuti di `data/` sono **parte del codice** (richiedono un deploy per cambiare). Dati mutabili vivono in `db/` o `uploads/` (il contenuto è ignorato da git tramite `!.gitignore`).
- Sostituibile agilmente da un DB reale implementando `IContentStore`. La cartella `db/` fa già da mount point in Docker.

#### `LocalizedJsonDeserializer` — regole dettagliate della risoluzione i18n

Il deserializzatore interno di `FileContentStore` risolve ricorsivamente i campi localizzati dei file JSON. Le sue regole esatte:

Quando un oggetto è "localizzato": un oggetto è considerato un blocco i18n solo se tutte le sue chiavi sono codici lingua riconosciuti da `CultureInfo` e presenti in `SupportedLanguages`. Se anche una sola chiave non è un tag lingua (es. `"name"`, `"url"`), l'oggetto è trattato come un oggetto di dominio normale e tutte le sue chiavi vengono processate ricorsivamente.

```json
// Trattato come blocco i18n (tutte le chiavi sono lingue supportate):
{ "it": "Via Roma 1", "en": "1 Rome Street" }

// Trattato come oggetto normale (ha chiave "via" che non è una lingua):
{ "via": { "it": "Via Roma 1", "en": "1 Rome Street" }, "cap": "20100" }
```

Priorità nella selezione della lingua:
1. Lingua richiesta (ricavata dall'header `Accept-Language`)
2. `Localization.DefaultLanguage` (es. `"it"`)
3. Primo valore non vuoto trovato nell'oggetto

Normalizzazione: `Accept-Language: it-IT,it;q=0.9` → prima preferenza `"it-IT"` → `CultureInfo.TwoLetterISOLanguageName` → `"it"`. Tag non riconosciuti da `CultureInfo` (es. `"xyz"`) ricadono sulla lingua di default.

Pruning dei valori vuoti: dopo la risoluzione, i campi il cui valore diventa stringa vuota, array vuoto o oggetto vuoto vengono rimossi dall'output. Il campo corrispondente nel modello risultante sarà `null`, non una stringa vuota.

> Prima di aggiungere una lingua a `SupportedLanguages`, verifica che nessun campo dati in `identity.json` usi quel codice come chiave, così l'oggetto continua a essere interpretato come dato di dominio e non come blocco i18n.

#### Invalidare la cache dei contenuti

La cache è in `IMemoryCache` con TTL di 1 ora: una modifica a un file `data/*.json` a runtime non si vede finché la voce non scade (o non si riavvia il processo). C'è però un seam per forzare il refresh subito. La firma completa del lettore è:

```csharp
// Engine/FileUtils.cs
Task<string> ReadStaticFileAsync(string name, string dataPath, IMemoryCache cache,
    TimeSpan? cacheDuration = null, bool forceReload = false, CancellationToken cancellationToken = default);
```

- **Chiave di cache = nome file senza estensione** (`"irl"`, `"social"`): è il parametro `name`, non il path. Stesso `name` letto da due punti = una sola entry condivisa.
- **`forceReload: true`** fa `cache.Remove(name)` prima di rileggere: la prossima `GetOrCreateAsync` ricarica dal disco. È il gancio per un endpoint admin tipo "ricarica contenuti": gli passi `forceReload: true` e il file viene riletto senza riavviare.
- **`cacheDuration`** sovrascrive il TTL di default (1 ora) per quella entry.

> La cache è per-istanza (RAM del singolo processo): un `forceReload` su un'istanza non tocca le altre dietro un bilanciatore. Con più istanze, l'invalidazione coordinata è uno dei motivi per cui si passerebbe a un `IContentStore` su DB/cache distribuita: lo stesso seam (`IContentStore`) resta il punto di sostituzione, vedi Sostituire un servizio dell'Engine.

### 5. Mailer (`IEngineMailer`)

Unico punto d'invio email del template (usa `MailKit`/`MimeKit`). Configurato in `global-settings.local.json` e iniettato come singleton.
- **Accensione/Spegnimento**: Se la configurazione manca, `IsEnabled` è `false` e ogni invio lancia `MailNotConfiguredException`. Non serve cablaggio.
- **Sicurezza e Hardening**: TLS sempre obbligatorio, subject sanitizzato, allegati limitati, e check sul dominio `To` (se `VerifyRecipientDomain` è true).
- **In background**: L'uso raccomandato non blocca le richieste HTTP. Usa `IEmailQueue.TryEnqueue` e un worker manderà le mail in asincrono (retry 3 volte). `IEngineMailer.SendAsync` resta disponibile per chiamate dirette.

```csharp
// In un worker/service:
if (!_mailer.IsEnabled) return; 
if (!_mailer.IsValidAddress(addr)) throw new MailInvalidAddressException(); // 400 sincrono

await _mailer.SendAsync(
    to:          new[] { "destinatario@dominio.it" },
    subject:     "Oggetto",
    body:        "Corpo",
    isHtml:      false,
    from:        null, // preleva Mail.FromAddress
    cc:          null,
    bcc:         null,
    attachments: null,
    replyTo:     "chi.scrive@altro.it");
```

> Un file per sottosistema: il messaggio, la coda (`IEmailQueue`) e il worker (`EmailSenderHostedService`) vivono in `Engine/Mail/Mail.cs`; la meccanica SMTP corposa resta in `Engine/Mail/EngineMailer.cs`. Stesso schema per gli altri sottosistemi: `Engine/Delivery/Delivery.cs`, `Engine/Notifications/Notifications.cs`, `Engine/Tasks/BackgroundTasks.cs`, ciascuno un unico file, codice Engine raramente toccato.

#### Riferimento `MailOptions` (`global-settings.local.json` → `Mail.*`)

| Chiave | Tipo | Note |
|---|---|---|
| `Host` | string | Host SMTP (es. `ssl0.ovh.net`). |
| `Port` | int | 587 (STARTTLS) o 465 (SSL/TLS). Default 587. |
| `Security` | enum | `Auto` \| `None` \| `StartTls` \| `SslOnConnect`. Default `Auto`. |
| `Username` | string | Utente SMTP. Vuoto = invio senza autenticazione. |
| `Password` | string | **Segreto**: solo in `global-settings.local.json`. |
| `FromAddress` | string | Mittente di default. **Deve stare sul tuo dominio** (SPF/DKIM). |
| `FromName` | string | Nome visualizzato del mittente (opzionale). |
| `TimeoutSeconds` | int | Timeout connessione/invio. Default 30. |
| `MaxAttachmentBytes` | long | Dimensione massima totale allegati. Default 10 MB. 0 = nessun limite. |
| `VerifyRecipientDomain` | bool | Se `true`, check MX via DNS sul dominio dei destinatari prima di inviare: typo/domini inesistenti → 400 (`MailInvalidAddressException`) senza aprire l'SMTP. Default `false`. |

La sezione vive in `global-settings.local.json` perché contiene segreti (gitignored). In produzione è preferibile iniettare `Mail:Password` come variabile d'ambiente anziché lasciarla nel file deployato (le variabili `Mail__Password` sovrascrivono il JSON). Anti-spam: il mittente deve essere sul tuo dominio e vanno configurati i record DNS SPF, DKIM e DMARC presso il provider. L'invio è una capability interna alle API: non c'è un endpoint pubblico dedicato, un servizio o controller dell'applicazione inietta `IEngineMailer` (invio diretto) o accoda via `IEmailQueue` (background con retry). Se mandi un messaggio a partire da input non fidato, validalo prima e usa il `Reply-To` per l'indirizzo del mittente esterno, mantenendo il `From` sul tuo dominio.

Verifica del destinatario: `Mail.VerifyRecipientDomain` (default `false`) accende un check DNS sul dominio dei destinatari (MX, con fallback A/AAAA per l'MX implicito di RFC 5321), becca i typo (`gmail.con`) e i domini inesistenti prima di aprire l'SMTP, ed è fail-open (se il DNS è inconcludente non blocca, l'errore vero emerge come bounce). Non verifica l'esistenza della casella: quella si sa solo col bounce dopo l'invio o con un doppio opt-in, un probe SMTP `RCPT TO` è inaffidabile (catch-all, greylisting) e dannoso per la reputazione del mittente, quindi non è previsto.

### 6. Notifiche Realtime (`INotificationStream`)

- **Server-Sent Events (SSE)**: HTTP unidirezionale, niente WebSocket.
- **Accesso**: Funziona solo con API key, anche senza login (utenti anonimi).
- **Targeting**: Puoi inviare a tutti (`All`), a una specifica connessione (`Connection`, leggendo l'header `X-Connection-Id`), o a un gruppo/tenant (`Group`).
- **Recupero messaggi**: Storico in memoria. Supporta replay se cade la connessione.

```csharp
// In un controller, "Notifications" è proprietà di base:
Notifications.Publish(
    NotificationTarget.Connection(ConnectionId!), 
    new NotificationMessage {
        Type    = "toast",
        Payload = new { messageKey = "mailInviata", icon = "success" } 
    });
```
Ricetta rapida: [AGENTS.md](../AGENTS.md#pubblicare-una-notifica-realtime).

- **EventSource ed Header**: `EventSource` non invia l'header `Authorization`. Il targeting per utente si basa sul token in querystring, risolto da `INotificationGroupResolver`.
- **Nessuna risposta da SSE**: SSE è monodirezionale. Per l'interattività, invia un normale POST.
- **Implementazione (Scala)**: il registro è in-memory. Per bilanciare su più istanze, sostituisci `INotificationStream` con un backplane (es. Redis).

| Membro | Firma | A cosa serve |
| :--- | :--- | :--- |
| `Publish` | `bool Publish(NotificationTarget target, NotificationMessage message)` | Pubblica verso i destinatari del target. Ritorna `true` se almeno una connessione viva l'ha ricevuto (lo sfrutta il fallback `Auto` della delivery, senza finestra TOCTOU). |
| `IsReachable` | `bool IsReachable(NotificationTarget target)` | `true` se esiste almeno una connessione viva che il target raggiungerebbe. |
| `ConnectionCount` | `int ConnectionCount { get; }` | Numero di connessioni attive. |
| `GetHistory` | `IReadOnlyList<NotificationMessage> GetHistory(string? groupKey, string? afterId = null)` | Storico recuperabile (broadcast + eventuale gruppo). Con `afterId` restituisce solo i messaggi successivi (replay da `Last-Event-ID`). |
| `Subscribe` / `Unsubscribe` | `NotificationSubscriber Subscribe(string? groupKey)` / `void Unsubscribe(string connectionId)` | Ciclo di vita di una connessione: li usa solo l'endpoint SSE dell'Engine, non il codice di dominio. |

> Contratto per chi reimplementa `INotificationStream` (es. backplane Redis): la firma è facile da
> rispettare, ma due invarianti sono load-bearing, il resto del template ci conta:
> 1. **`Publish` ritorna `true` SOLO se una connessione viva ha davvero ricevuto il messaggio**, non se
>    "in teoria avrebbe potuto". Nell'implementazione in memoria `delivered` diventa `true` solo quando
>    `Channel.Writer.TryWrite` riesce (fallisce se il canale è in chiusura). Il fallback `Auto` della
>    delivery si fida di questo valore di ritorno invece di chiamare `IsReachable` prima: è ciò che
>    elimina la finestra TOCTOU (la connessione potrebbe morire tra il check e il push). Se la tua
>    versione ritornasse `true` "ottimisticamente", `Auto` non ripiegherebbe mai su email e un esito
>    andrebbe perso in silenzio. `IsReachable` resta per query informative, non come gate di `Publish`.
> 2. **`GetHistory` espone solo broadcast + gruppo, mai i messaggi per-connessione.** Nell'implementazione
>    di riferimento `Publish` salta del tutto lo storico quando `target.Kind == Connection`: le notifiche a
>    una singola scheda sono effimere (legate a una connessione viva, non recuperabili dopo un reload).
>    Mantieni questa regola: replicare in storico i messaggi mirati a una connessione li farebbe ricomparire
>    al chiamante sbagliato dopo una riconnessione.

Storico recuperabile: `GET /notifications/history` restituisce le notifiche recenti rilevanti per il chiamante (broadcast + suo eventuale gruppo), il campanellino frontend (opt-in via `shell.showNotifications`) lo usa per popolarsi al primo caricamento o su una nuova scheda. Lo storico è bounded e in memoria, e contiene solo broadcast e gruppo: le notifiche mirate a una connessione sono effimere e non incluse. È il punto in cui, col login, lo storico per-utente persistente sostituirebbe questa struttura con uno store (DB) interrogato per id utente: il resto (resolver di gruppo, endpoint) resta invariato.

Demo: `POST /notifications/demo/ping[?message=...]` (in `BaseController`) pubblica una notifica di prova. Se la richiesta porta l'header `X-Connection-Id` (aggiunto dal frontend quando lo stream è attivo) la manda solo a quel client, altrimenti fa broadcast. Senza `?message=` invia una chiave i18n (`notificaDemoPing`), col parametro un testo letterale. Il lato browser è il `NotificationStreamService`, vedi [frontend/README.md](../frontend/README.md).

### 7. Task in Background e Delivery (notifica/email)

- **Coda in-memory per lavori lunghi**: `BackgroundQueue` esegue task fuori dalla richiesta HTTP, garantendo scope DI proprio e stop sicuro (diversamente da `Task.Run()`). Ritorna fallimento se i task pendenti sono più di 1000.
- **Delivery ibrida (`IDeliveryService`)**: con `DeliveryChannel.Auto` invia un toast realtime se la scheda è connessa. Se il client non lo riceve, l'Engine accoda istantaneamente l'email di notifica come fallback.

```csharp
var enqueued = BackgroundQueue.TryEnqueue(async (services, ct) =>
{
    var store = services.GetRequiredService<IContentStore>();
    await ImportRecordsAsync(store, ct);
    
    var delivery = services.GetRequiredService<IDeliveryService>();
    await delivery.DeliverAsync(
        new DeliveryMessage { Target = target, Email = email, Body = "Import completato" },
        DeliveryChannel.Auto, ct);
});
return enqueued ? Accepted() : StatusCode(StatusCodes.Status503ServiceUnavailable);
```
Ricetta rapida: [AGENTS.md](../AGENTS.md#task-lungo-con-notifica-a-fine-lavoro-email-o-realtime).

```csharp
// Nel progetto figlio (blocco SERVIZI APPLICATIVI di Program.cs): la propria policy di consegna
// vince sul default dell'Engine, simmetrico all'override di INotificationGroupResolver.
builder.Services.AddSingleton<IDeliveryService, MiaPolicy>();
```

La firma è `DeliverAsync(DeliveryMessage message, DeliveryChannel channel = DeliveryChannel.Realtime, CancellationToken ct = default)`. Il messaggio è neutro rispetto al canale e il dispatcher lo adatta:

| Campo `DeliveryMessage` | Tipo | Uso |
| :--- | :--- | :--- |
| `Target` | `NotificationTarget` | Destinatario realtime (default `All`). |
| `Email` | `string?` | Indirizzo per il canale Email / fallback Auto. Senza, l'email è no-op (loggato). |
| `Title` | `string` | Oggetto dell'email. |
| `Body` | `string` | Corpo dell'email e testo del toast realtime. |
| `Icon` | `string` | Icona del toast (`success` \| `error` \| `info` \| `warning`, default `info`). |

Demo: `POST /tasks/demo/import[?email=...]` accoda un import simulato (3 s), risponde `202` (`503` se la coda è satura), e a fine task consegna l'esito scegliendo esplicitamente `Auto` (per mostrare il fallback email): toast realtime se la scheda che ha avviato il job è ancora connessa (header `X-Connection-Id`), altrimenti email a `?email=...`. Il `GET /social[?nomi=...]` invece, se il chiamante ha lo stream aperto (header `X-Connection-Id`), consegna col default `Realtime`: notifica solo quel client, senza email. Il connectionId in entrambi arriva dall'header `X-Connection-Id`, non più da un parametro `?connectionId=...`.

### 8. Integrazioni con servizi esterni

#### Chiamare un'API esterna (outbound)
- **Configurazione**: URL in `global-settings.json`, chiavi in `global-settings.local.json`.
- **Registrazione**: Usa `AddHttpClient<T>()` in `Program.cs`.
- **Mappatura Errori**: Un upstream irraggiungibile o lento dovrebbe lanciare un `ServiceUnavailableException()` (503) o `BadGatewayException()` (502), in modo che il client riceva un errore uniforme strutturato, non un 500 generico.

```csharp
public class PaymentProviderService
{
    private readonly HttpClient _http;
    public PaymentProviderService(HttpClient http, IOptions<PaymentProviderOptions> opt)
    {
        _http = http;
        _http.BaseAddress = new Uri(opt.Value.BaseUrl);
        _http.DefaultRequestHeaders.Authorization = new("Bearer", opt.Value.ApiKey);
    }

    public async Task<PaymentResult> ChargeAsync(ChargeRequest req, CancellationToken ct)
    {
        var response = await _http.PostAsJsonAsync("charges", req, ct);
        if (!response.IsSuccessStatusCode) throw new BadGatewayException();
        return await response.Content.ReadFromJsonAsync<PaymentResult>(ct) ?? throw new BadGatewayException();
    }
}
```

#### Ricevere un webhook (inbound)

Tre regole d'oro:
- **`[AllowAnonymous]` sull'azione**: Il webhook è aperto per il provider di terze parti.
- **Firma HMAC**: Verifica la firma sul *body grezzo* (`Request.Body`) prima della deserializzazione.
- **200 Immediato**: Accoda l'elaborazione con `BackgroundQueue` (vedi §7) e restituisci `Ok()` subito. Altrimenti i provider (Stripe, GitHub) re-inviano gli eventi in loop aspettando la risposta rapida.

```csharp
[HttpPost, AllowAnonymous]
public async Task<IActionResult> Receive(CancellationToken ct)
{
    using var reader = new StreamReader(Request.Body);
    var rawBody = await reader.ReadToEndAsync(ct);

    if (!Request.Headers.TryGetValue("X-Signature", out var signature) || !WebhookSignature.IsValid(rawBody, signature, _secret))
        throw new UnauthorizedException();

    var evento = JsonSerializer.Deserialize<PaymentEvent>(rawBody) ?? throw new DecodingException();

    BackgroundQueue.TryEnqueue(async (services, ct) => 
        await services.GetRequiredService<PaymentEventHandler>().HandleAsync(evento, ct));

    return Ok();
}
```

---

### 9. Dati Personali (Export & Diritto all'Oblio)

- **Endpoint unificato**: `EngineDataPrivacyController` fornisce `GET`/`DELETE /me/data` protetto da login per assolvere agli obblighi GDPR. Non creare endpoint separati.
- **Implementazione (Seam)**: Il progetto implementa l'interfaccia `IPersonalDataStore` per aggregare i dati da restituire o eliminare. L'Engine ha già `AppPersonalDataStore.cs` pronto per essere esteso.

```csharp
public interface IPersonalDataStore
{
    Task<object?> ExportAsync(ClaimsPrincipal user, CancellationToken cancellationToken = default);
    Task EraseAsync(ClaimsPrincipal user, CancellationToken cancellationToken = default);
}
```

```csharp
// Program.cs, blocco "── SERVIZI APPLICATIVI ──"
builder.Services.AddSingleton<IPersonalDataStore, AppPersonalDataStore>();
```

- **Export Cifrato (AES-GCM)**: L'Engine serializza e cifra la risposta di `ExportAsync` restituendo `{ "data": "<base64>" }` usando la chiave `Security.CryptoSecret`.
- **Diritto all'Oblio (`EraseAsync`)**: La cancellazione deve rimuovere i dati e **l'account stesso** (eccezion fatta per dati vincolati per legge).
- **JWT Stateless**: Dopo il `DELETE`, il token JWT è ancora formalmente valido (fino a scadenza). Il client frontend deve distruggerlo (logout locale) e le tue API devono tollerare un `UserId` orfano.

---

### 10. Error Reporting (webhook)

- Imposta `ErrorReporting.WebhookUrl` in `global-settings.local.json` per abilitare le notifiche proattive.
- **Webhook POST**: un error handler invia in automatico un JSON struct con dettagli (stack trace, path, timestamp) in background per ogni eccezione applicativa (status ≥ 500) o non gestita.
- **Anche lato client**: `EngineClientErrorController` (`POST diagnostics/ui-fault`, sola API Key — funziona pure per visitatori anonimi) riceve le eccezioni JavaScript non gestite nel browser (vedi frontend README § Error Tracking, `ClientErrorReportingService`) e le accoda allo stesso `IErrorReportingService` — `source: "client"` le distingue da quelle server nello stesso canale.
- Utile per inoltrare ad allarmi Slack/Discord o a servizi centralizzati.

```json
{
  "project": "Nome Progetto", "source": "server",
  "message": "...", "exceptionType": "System.NullReferenceException",
  "statusCode": 500, "path": "/api/v1/orders", "method": "POST",
  "stackTrace": "...", "timestamp": "2026-08-24T10:00:00Z"
}
```

---

## 📜 Le Regole del Gioco (cosa impone l'Engine)

Perché l'Engine possa proteggere il progetto, vanno rispettate queste convenzioni architetturali ferree:

### 1. Eredita sempre dalle classi base dell'Engine
Eredita sempre da una delle classi base dell'Engine: così rate limiting, logging e controllo API Key arrivano automaticamente.

L'Engine offre tre classi base a seconda del livello di protezione richiesto:
- `EngineApiController`: Endpoint pubblici (richiede solo API Key).
- `EngineProtectedController`: Endpoint riservati (richiede API Key + JWT valido).
- `EngineAuthController`: Endpoint di autenticazione (transito credenziali → emissione JWT). Viene soppresso automaticamente se `Security.Token.SecretKey` è vuoto.

#### Il contesto "ambient" del controller base

Ereditando da queste classi ogni controller riceve, senza nulla nel costruttore, una serie di proprietà `protected` già pronte. Sono l'infrastruttura trasversale: il controller di dominio inietta solo le sue dipendenze e attinge al resto dal contesto.

| Proprietà | Tipo | Cosa offre |
| :--- | :--- | :--- |
| `Logger` | `ILogger` | Logger condiviso, già istanziato. |
| `Notifications` | `INotificationStream` | Pubblica notifiche realtime SSE. |
| `BackgroundQueue` | `IBackgroundTaskQueue` | Accoda un task lungo. |
| `Delivery` | `IDeliveryService` | Consegna l'esito con switch realtime/email. |
| `Crypto` | `IEngineCrypto` | Cifra/decifra byte arbitrari (AES-GCM). |
| `Sitemap` | `SitemapNotifier` | Avvisa il frontend che un catalogo `dynamicParams` è cambiato, invalidando la cache di `/sitemap.xml`. |
| `ConnectionId` | `string?` | connectionId della SSE del chiamante, o `null`. |
| `CurrentCulture` | `CultureInfo` | Cultura della richiesta. |
| `CurrentLanguage` | `string` | Codice lingua a due lettere (es. `"it"`). |
| `User` | `ClaimsPrincipal` | I claim della sessione. |

I servizi sopra (`Notifications`, `BackgroundQueue`, `Delivery`, `Crypto`, `Sitemap`) sono singleton risolti pigramente da `HttpContext.RequestServices`: il getter scatta solo quando lo invochi dentro un'azione. Non vanno iniettati nel costruttore, per `Crypto` in particolare, farlo costruirebbe (e quindi fallirebbe, se `Security.CryptoSecret` è vuota) `EngineCrypto` a ogni richiesta, anche in un'azione che non cifra nulla.

`EngineProtectedController` aggiunge inoltre `CurrentSession<T>()`: rilegge il payload di sessione tipizzato (`User.GetSession<T>()`) senza dover importare l'extension method, vedi «Sistema di Login e Sessioni JWT».

> Nota: gli snippet pratici (le "ricette") su come scrivere un controller o usare la sessione sono riassunti in `AGENTS.md`.

> Il `CancellationToken` resta un parametro esplicito dell'azione (idioma ASP.NET): dichiararlo nella firma fa sì che ASP.NET lo leghi a `HttpContext.RequestAborted`. Solo il connectionId è migrato dalla firma all'header, il `CancellationToken` no.

> Observability, cosa c'è e cosa manca: `Logger` è un `ILogger` ASP.NET Core standard (provider Console di default: testo in dev, JSON strutturato con `docker compose logs` in produzione se configurato), niente di custom, nessun sink dell'Engine. Oltre a `/health` (per l'healthcheck Docker, vedi DOCKER_README.md) non c'è un endpoint di metriche né tracing distribuito cablato nel template: sono estensioni di Dominio, tipicamente `OpenTelemetry.Extensions.Hosting` più un exporter (Prometheus, un APM). Se il progetto ne ha bisogno, si aggiunge in `Program.cs`: l'Engine non lo impone né lo ostacola, semplicemente non lo fornisce oggi.

##### Un endpoint *davvero* pubblico: `[AllowAnonymous]` sull'azione

Attenzione a "pubblico": `EngineApiController` ha `[Authorize]` a livello di classe, quindi ogni endpoint che ne deriva richiede comunque l'API key (è l'auth dello schema API key, non il JWT). "Pubblico" nel template significa "senza login utente", non "senza credenziali". Per un endpoint totalmente aperto, raggiungibile senza alcun header come fa `/health`, serve marcare la singola azione con `[AllowAnonymous]`, che sovrascrive l'`[Authorize]` ereditato:

```csharp
[HttpGet("status")]
[AllowAnonymous]                       // bypassa anche la API key, come /health
public IActionResult Status() => Ok(new { up = true });
```

Senza `[AllowAnonymous]`, anche un endpoint "informativo" su un `EngineApiController` resta dietro la API key: di solito è ciò che vuoi, ma sappi qual è l'interruttore quando non lo è.

##### `CurrentCulture` è ambient (async-local), non l'header — niente cultura nei task in background

`CurrentCulture`/`CurrentLanguage` del controller base leggono `CultureInfo.CurrentCulture`, non parsano `Accept-Language` a mano: è `UseRequestLocalization` (early nella pipeline) a impostare la cultura sul contesto async-local della richiesta, e queste proprietà la rileggono. Stessa fonte usata da `FileIdentityStore` (`GET /identity`) e da `FileContentStore`. Comodo, ma con un limite:

In un task in background non c'è una richiesta, quindi non c'è cultura di richiesta: il lavoro accodato con `BackgroundQueue.TryEnqueue(...)` gira fuori dal contesto HTTP (scope DI proprio, nessun `Accept-Language`), lì `CultureInfo.CurrentCulture` è quella di default del processo, non quella del client che ha avviato il job. Se il task deve produrre contenuto localizzato (un'email, un testo nello store), cattura la lingua nel controller (`var lang = CurrentLanguage;`) e passala esplicitamente nella closure, invece di affidarti a `CurrentCulture` dentro il task.

### 2. Lancia Eccezioni per gli Errori

Per segnalare un errore, lancia l'eccezione appropriata: `ApiExceptionHandler` la intercetta, localizza il messaggio tramite `.resx` e scrive una risposta `ProblemDetails` (RFC 9457) con `status` + `detail`. È il modo unico e uniforme di restituire errori dai controller.

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
| `ConflictException()` | 409 | `error_conflict` | Conflitto (messaggio generico) |
| `ConflictException("ordine")` | 409 | `error_conflict_named` | Conflitto con nome della risorsa (`{0}` = "ordine") |
| `GoneException()` | 410 | `error_gone` | Risorsa rimossa definitivamente (messaggio generico) |
| `GoneException("articolo")` | 410 | `error_gone_named` | Risorsa rimossa definitivamente con nome (`{0}` = "articolo") |
| `UnprocessableEntityException()` | 422 | `error_unprocessable_entity` | Dati validi ma semanticamente non elaborabili |
| `TooManyRequestsException()` | 429 | `error_too_many_requests` | Limite applicativo superato (non il rate limiter globale) |
| `TooManyRequestsException(60)` | 429 | `error_too_many_requests_timed` | Come sopra + `{0}` secondi nel testo + header `Retry-After: 60` |
| `MailInvalidAddressException()` | 400 | `error_mail_invalid_address` | Indirizzo (from/to/cc/bcc/reply-to) non parsabile o senza dominio |
| `MailAttachmentTooLargeException()` | 413 | `error_mail_attachment_too_large` | Allegati oltre `Mail.MaxAttachmentBytes` |
| `NotImplementedEndpointException()` | 501 | `error_not_implemented` | Funzionalità non ancora implementata |
| `MailSendException()` | 502 | `error_mail_send_failed` | SMTP a monte ha rifiutato/non ha consegnato (dettaglio solo nei log) |
| `BadGatewayException()` | 502 | `error_bad_gateway` | Risposta non valida da servizio upstream |
| `MailNotConfiguredException()` | 503 | `error_mail_disabled` | Invio richiesto ma il mailer non è configurato (sezione `Mail` assente/incompleta) |
| `ServiceUnavailableException()` | 503 | `error_service_unavailable` | Servizio esterno temporaneamente non disponibile |
| `ServiceUnavailableException(120)` | 503 | `error_service_unavailable_timed` | Come sopra + `{0}` secondi nel testo + header `Retry-After: 120` |
| `GatewayTimeoutException()` | 504 | `error_gateway_timeout` | Servizio upstream non risponde in tempo |
| qualsiasi altra eccezione .NET | 500 | — | ASP.NET restituisce 500 generico senza esporre dettagli |

> **Pattern `_named` / `_timed`**: le eccezioni con parametro opzionale usano una chiave `.resx` diversa a seconda che il parametro sia fornito. La variante `_named` include `{0}` con il nome della risorsa (evita di passare stringhe in lingua hardcoded come argomento del messaggio localizzato). La variante `_timed` include `{0}` con i secondi di attesa e imposta l'header HTTP `Retry-After`.

> **401 vs 403**: `UnauthorizedException` (401) = utente non autenticato. `ForbiddenException` (403) = autenticato ma senza i permessi. Non confonderle.
>
> **404 vs 410**: `NotFoundException` (404) = risorsa assente o temporaneamente non trovata. `GoneException` (410) = rimossa in modo permanente. Il 410 comunica ai crawler che non devono più indicizzare l'URL.
>
> **503 vs 502**: `ServiceUnavailableException` (503) = servizio non raggiungibile. `BadGatewayException` (502) = servizio raggiungibile ma ha restituito una risposta non valida.
>
> **429 applicativo vs rate limiter infrastrutturale**: il middleware blocca già 100 req/min globali e 5/min sul login. Quando scatta, produce anch'esso un `ProblemDetails` JSON con `Retry-After` (via callback `OnRejected`), quindi il formato è coerente con `ApiExceptionHandler`. `TooManyRequestsException` serve per limiti di dominio più granulari (es. max 3 tentativi OTP per sessione); usa `TooManyRequestsException(60)` per includere i secondi di attesa nel messaggio e nell'header.

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

Aggiungere un tipo di errore custom:
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

Le eccezioni non-`ApiException` (es. `NullReferenceException`, errori di database) vengono ignorate dall'handler: ASP.NET restituisce un 500 generico senza esporre stack trace né dettagli interni.

#### `SharedResource` e la localizzazione dei messaggi

`SharedResource` (in `Engine/SharedResource.cs`) è una classe vuota che serve da ancora di tipo per `IStringLocalizer<SharedResource>`. I file resx associati sono:

```
Resources/SharedResource.resx       ← inglese / fallback
Resources/SharedResource.it.resx    ← italiano
```

L'attributo `[assembly: RootNamespace("Backend")]` in quel file è critico: il nome dell'assembly è `"backend"` (minuscolo, dal `.csproj`), ma il namespace è `"Backend"`. Senza questo attributo `IStringLocalizer` cercherebbe `backend.Resources.SharedResource.resx` (inesistente) e tutti i messaggi mostrerebbero la chiave grezza invece del testo localizzato.

Sintomo di un problema di namespace: se in risposta agli errori il frontend riceve `"detail": "error_not_found"` invece del messaggio, il localizzatore non trova il file resx, controlla che il `RootNamespace` nel `.csproj` e in `SharedResource.cs` siano allineati.

Inietta `IStringLocalizer<SharedResource>` ovunque servano messaggi localizzati (validatori, service, controller): `SharedResource` è l'unico tipo-ancora, riusalo sempre.

### 3. Usa FluentValidation per gli Input
Metti tutte le validazioni d'input in un validatore dedicato, ereditando da `AbstractValidator<T>`: i controller restano puliti, senza `if` di controllo sparsi. L'Engine auto-registra in DI ogni `AbstractValidator<T>` dell'assembly (`AddValidatorsFromAssemblyContaining<Program>` in `Program.cs`): tu nel controller inietti `IValidator<T>`, chiami `ValidateAsync` e, se l'input non è valido, restituisci `ValidationProblem()`. Grazie a `[ApiController]` la risposta è un `ProblemDetails` 400 con la lista degli errori. La validazione è quindi esplicita (la decidi tu nell'azione), non un filtro automatico pre-controller: così controlli quando eseguirla e come reagire.

```csharp
// Services/LoginRequest.cs (i DTO stanno vicino a chi li espone; le cartelle sono una convenzione, non un vincolo)
public record LoginRequest(string Username, string Pwd);

// Validation/LoginRequestValidator.cs (nome convenzionale: <Tipo>Validator)
public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Username).NotEmpty().MaximumLength(64);
        RuleFor(x => x.Pwd).NotEmpty().MinimumLength(8);
    }
}

// Nel controller: l'Engine ha già registrato il validator in DI, tu lo inietti e lo esegui.
public AuthController(IValidator<LoginRequest> validator) => _validator = validator;

[HttpPost("login")]
public async Task<ActionResult<LoginResult>> Login([FromBody] LoginRequest request)
{
    var result = await _validator.ValidateAsync(request);
    if (!result.IsValid)
    {
        foreach (var error in result.Errors)
            ModelState.AddModelError(error.PropertyName, error.ErrorMessage);
        return ValidationProblem(); // 400 ProblemDetails con la lista degli errori
    }
    // ... logica con input già validato
}
```

#### Il Validator di Login Incluso

Il template include già `Validation/LoginRequestValidator.cs`, auto-registrato, con tre regole predefinite:

| Campo | Regola | Chiave resx |
| :--- | :--- | :--- |
| `Username` | `NotEmpty` | `username_required` |
| `Pwd` | `NotEmpty` | `pwd_required` |
| `Pwd` | `MinimumLength(8)` | `pwd_length` |

Eredita direttamente da `AbstractValidator<LoginRequest>`: per adattare la validazione alle policy del progetto, modifica questo file aggiungendo o cambiando le regole.

```csharp
// Validation/LoginRequestValidator.cs
public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator(IStringLocalizer<SharedResource> localizer)
    {
        RuleFor(x => x.Username)
            .NotEmpty().WithMessage(_ => localizer["username_required"].Value);

        RuleFor(x => x.Pwd)
            .NotEmpty().WithMessage(_ => localizer["pwd_required"].Value)
            .MinimumLength(8).WithMessage(_ => localizer["pwd_length"].Value);

        // Regole aggiuntive del progetto, es:
        RuleFor(x => x.Username)
            .Matches(@"^[a-zA-Z0-9._-]+$")
            .WithMessage(_ => localizer["username_invalid"].Value);
    }
}
```

Localizzazione nei validator: usa sempre la forma lambda `_ => localizer["key"].Value`, non la forma diretta `localizer["key"].Value`. Il validator è un singleton: la forma diretta risolverebbe la stringa al boot con la cultura del processo, ignorando la lingua della richiesta HTTP.

> I validator sono Singleton: due conseguenze. L'auto-registrazione è
> `AddValidatorsFromAssemblyContaining<Program>(ServiceLifetime.Singleton)` (`Program.cs:122`): ogni
> `AbstractValidator<T>` vive una sola istanza per tutto il processo.
> 1. **Localizzazione:** è il motivo della forma lambda qui sopra: la stringa va risolta a ogni
>    validazione (lingua della richiesta), non una volta al boot.
> 2. **Niente dipendenze scoped nel costruttore.** Un singleton che inietta un servizio scoped (es. un
>    `DbContext`, o `IContentStore` se in futuro lo registri scoped) crea una **captive dependency**: lo
>    scoped resta "intrappolato" nel singleton e non viene mai rilasciato/ricreato per richiesta. Va bene
>    iniettare altri singleton (`IStringLocalizer<SharedResource>` lo è). Se ti serve un dato per-richiesta
>    dentro una regola, passalo via `ValidationContext` (es. `RuleFor(...).Must((dto, val, ctx) => …)`)
>    invece di iniettarlo; se proprio ti serve un servizio scoped, cambia il lifetime di
>    registrazione del validator, anche se è raro che serva davvero.

### 4. L'Engine è intoccabile
Aggiungi in `Engine/` solo logiche universali e infrastrutturali astratte. Il codice per un cliente specifico o una feature verticale va nelle cartelle di dominio, fuori dall'Engine.

---

## ⚙️ Configurazione e Boot Sequence

### Sorgenti di Configurazione

L'unica sorgente di configurazione è `global-settings.json`. Al boot, tutte le sorgenti `appsettings*.json` vengono rimosse attivamente dalla pipeline di configurazione ASP.NET:

```csharp
// Program.cs — rimozione esplicita
var defaultJsonSources = builder.Configuration.Sources
    .OfType<JsonConfigurationSource>()
    .Where(s => s.Path?.StartsWith("appsettings") == true)
    .ToList();
foreach (var source in defaultJsonSources)
    builder.Configuration.Sources.Remove(source);
```

Conseguenza pratica: `appsettings.Development.json` non viene letto. L'identità/config di progetto vive in `global-settings.json`; i segreti e la pubblicazione (ApiKeys, SecretKey, porte) in `global-settings.local.json`.

I file vengono cercati e fusi in quest'ordine (gli ultimi vincono, lo stesso deep-merge che `scripts/lib/br1-config.sh` fa in prod producendo il file effettivo):
1. `../global-settings.json` poi `global-settings.json` — base committata (dev `cwd=backend/` → `../`; Docker `cwd=/app`)
2. `../global-settings.local.json` poi `global-settings.local.json` — override coi segreti (gitignored)
3. `../security-headers.json` poi `security-headers.json` — header del template (sezione `Security.Headers`)

Tutte `optional: true` (se un file manca si usano i default dei modelli `*Options`). In dev locale è il punto 2 che fa arrivare `Security.ApiKeys` (da `global-settings.local.json`) al backend senza env var né deploy: prima del template 2.0.1 il backend leggeva solo `global-settings.json` (privo di `Security`) → `ApiKeys` vuoto → 401 su ogni richiesta. In Docker/prod il `.local` non esiste (i segreti sono già fusi nel file effettivo montato) → no-op.

#### Lo schema (`global-settings.schema.json`) e chi legge cosa

`global-settings.json` dichiara in testa `"$schema": "./global-settings.schema.json"`. Lo schema
(JSON Schema draft-07) dà all'editor autocomplete e validazione live sulle chiavi: è la rete di
sicurezza più importante qui, perché una chiave digitata male non dà errore a runtime, il binding
.NET semplicemente non la trova e usa il default del modello `*Options`, in silenzio. L'autocomplete
dello schema è ciò che fa emergere il typo mentre scrivi, invece di lasciarti debuggare un valore "che
non viene applicato".

Non tutte le sezioni del file finiscono nel backend: il file è condiviso
da tre consumer (backend ASP.NET, frontend Node SSR, `scripts/deploy.sh`), e ognuno legge la sua fetta.
Lato backend, `Program.cs` lega come `IOptions<T>` solo `Security`, `Localization` e `Mail`
(`builder.Services.Configure<…>`), e legge `Custom` ad-hoc via `IConfiguration` (non un `*Options`
tipizzato). I codici di `Localization` vengono poi arricchiti nelle culture .NET da `EngineCultures`. Le sezioni `project` e `site` (più `frontend`/`backend` di deploy) non sono lette dal
backend: sono frontend-owned o di deploy. Quindi mettere una chiave applicativa dentro `site`
aspettandosi che il backend la veda non funziona, i valori liberi che il backend deve leggere vanno in
`Custom` (vedi Sezione `Custom`).

### Ordine della pipeline HTTP

L'ordine dei middleware è critico e va mantenuto. I primi 6 vivono dentro `UseTemplateSecurity()` (`Engine/Security/SecurityExtensions.cs`), gli altri in `Program.cs`:

| # | Middleware | Perché in questa posizione |
| :-- | :--- | :--- |
| 1 | Request-id | Riusa `X-Request-Id` in ingresso (dall'SSR Node, se valido) come `TraceIdentifier`, altrimenti tiene quello di default; lo riflette in risposta. **Per primo**: ogni log/middleware successivo — inclusi quelli dei passi sotto — lo eredita. Aggiunto anche ai `ProblemDetails` via `CustomizeProblemDetails`. |
| 2 | `UseForwardedHeaders` (solo `BehindProxy`) | Ricostruisce l'IP reale da `X-Forwarded-For`: il rate limiter partiziona per IP. Trusted solo da reti private RFC 1918; se `BehindProxy` è `false` il middleware non viene proprio registrato (niente spoofing). |
| 3 | `UseCors` | I preflight `OPTIONS` che il browser manda prima delle richieste cross-origin vengono gestiti qui e **non consumano il budget del rate limiter**. |
| 4 | `UseExceptionHandler` + `UseStatusCodePages` | Prima del rate limiter: cattura anche eventuali eccezioni interne del limiter. I 429 di `OnRejected` non passano da qui (non sono eccezioni). |
| 5 | `UseRateLimiter` | Fail fast: un client abusivo viene bloccato subito, senza sprecare i middleware successivi. |
| 6 | Security headers (se `Security.Headers` presente) + `UseHsts` | Header browser-facing da `security-headers.json`. CSP esclusa (irrilevante su JSON, gestita dall'SSR), HSTS escluso dal loop perché emesso da `UseHsts()`. |
| 7 | `UseRequestLocalization` | Da qui in poi `IStringLocalizer` risolve nella lingua di `Accept-Language`. Per questo `OnRejected` del limiter (che sta **prima**) ricava la cultura a mano, e `ApiExceptionHandler` la rilegge da `IRequestCultureFeature`. |
| 8 | `UseAuthentication` → `UseAuthorization` | API key e JWT validati dopo i filtri "di costo" (CORS, rate limit). |
| 9 | `MapControllers` + `MapHealthChecks("/health")` | `/health` è `AllowAnonymous`. |

### Comportamento Serializzazione JSON (Risposte API)

Tutti i controller usano queste opzioni globali, applicate automaticamente a tutte le risposte:

| Comportamento | Impostazione | Effetto |
| :--- | :--- | :--- |
| Campi `null` | `WhenWritingNull` | Omessi dal JSON — il client non li vede |
| Enum | `JsonStringEnumConverter` | Serializzati come stringa, non numero |

Un campo `null` nel DTO non appare nella risposta JSON. Se il frontend si aspetta un campo assente come `null` funziona; se si aspetta un campo assente come un valore di default va gestito lato client.

> Queste sono le opzioni delle risposte API (registrate in `AddJsonOptions`, `Program.cs`). Per i file di contenuto (`data/*.json`) lo store usa invece l'istanza condivisa `EngineJson.Web` (`Engine/EngineJson.cs`): convenzioni web + enum come stringhe, un'unica istanza così la cache dei metadata di System.Text.Json viene riusata da tutti i consumatori.

### `Content-Language` nelle Risposte

`ApplyCurrentCultureToResponseHeaders = true` fa sì che ogni risposta includa l'header `Content-Language` con la lingua effettivamente usata (es. `Content-Language: it`). Il frontend può leggerlo per sapere in quale lingua sono stati localizzati i messaggi di errore.

### Unico Provider Cultura: `Accept-Language`

Il `RequestCultureProviders` è impostato con solo `AcceptLanguageHeaderRequestCultureProvider`. Provider da cookie e da URL non sono attivi: la lingua viene sempre ricavata dall'header `Accept-Language` della richiesta.

Il frontend instrada le pagine per lingua via path (`/en/...`, vedi [frontend/README.md](../frontend/README.md) §"Lingua nell'URL") ma deduce la lingua dal path e la inoltra come header `Accept-Language` a ogni chiamata verso questo backend (`base-api.service.ts`): il backend legge solo l'header che riceve, non ha bisogno di un path da interpretare. Un provider da URL qui sarebbe ridondante, non mancante.

#### Riferimento `LocalizationOptions` (`global-settings.json` → `Localization.*`)

Le lingue sono codici a due lettere dichiarati in `global-settings.json` → `Localization` (dichiarazione semplice, letta anche dai consumatori sincroni a module-load del frontend). Il backend li arricchisce nelle `CultureInfo` tipizzate via `EngineCultures` (`Engine/Localization/EngineCultures.cs`), che alimenta `UseRequestLocalization`. Aggiungere una lingua = aggiungere il codice qui (più i cataloghi i18n e i file legali del frontend).

| Chiave | Tipo | Default | Comportamento |
| :--- | :--- | :--- | :--- |
| `DefaultLanguage` | `string` | `"it"` | Lingua di fallback (codice ISO 639-1): usata quando `Accept-Language` non corrisponde, e seconda priorità nella risoluzione i18n dei file `data/*.json`. |
| `SupportedLanguages` | `string[]` | `["it","en"]` | Lingue riconosciute: un oggetto JSON è trattato come blocco i18n solo se *tutte* le sue chiavi sono fra queste (vedi `LocalizedJsonDeserializer`). |

> `LocalizationOptions.SupportedLanguages` ha default vuoto di proposito: il binder di config .NET appende l'array bound al default della proprietà, quindi un default non vuoto si sommerebbe ai codici di `global-settings.json` (`["it","en"]` default + `["it","en"]` config ⇒ 4 voci duplicate). Con default vuoto il config sostituisce pulito.

#### Backend e frontend: stessa fonte, culture indipendenti

Le lingue sono dichiarate una volta in `Localization.SupportedLanguages`; backend e frontend ne derivano la cultura in modo indipendente, senza un endpoint condiviso a fare da ponte:

- **Backend** — dai codici, via `EngineCultures`/`CultureInfo`, per i propri usi: `UseRequestLocalization` (la cultura della richiesta da `Accept-Language`) e i **messaggi d'errore/validazione localizzati** (`.resx`).
- **Frontend** — deriva tutto da `Intl` (ECMA-402/CLDR): locale, formattazione (date/valuta/numeri), nomi giorno e nomi nativi delle lingue. Autonomo (nessuna chiamata al backend, corretto anche offline) e disaccoppiato da come il backend gestisce la propria cultura.

### Sezione `Custom` (Configurazione Libera)

`global-settings.json` include una sezione `"Custom": {}` per valori aggiuntivi del progetto senza toccare il codice infrastrutturale:

```json
"Custom": {
    "FeatureFlags": { "NuovaFunzione": true },
    "MaxUploadMb": 10,
    "Analytics": { "TrackingId": "UA-XXXXX" }
}
```

Backend: leggibile via `IConfiguration`:
```csharp
var maxUpload = builder.Configuration.GetValue<int>("Custom:MaxUploadMb");
var nuovaFunzione = builder.Configuration.GetValue<bool>("Custom:FeatureFlags:NuovaFunzione");
```

Frontend Node SSR: `getBr1Settings().Custom` (disponibile in `server-env.ts`).

Browser Angular: disponibile tramite `inject(APP_CUSTOM)`, l'SSR serializza `Custom` in `TransferState` e il browser la rilegge in idratazione (fallback `{}` senza SSR). Usa questo meccanismo per feature flag, limiti applicativi, ID di analytics: è l'escape hatch ufficiale per configurazione progetto-specifica senza aggiungere nuovi `*Options` a livello di schema. ⚠️ `Custom` è committabile e visibile al client: usalo per valori pubblici (feature flag, limiti, ID analytics). I segreti vanno in `global-settings.local.json`.

I valori per-ambiente (chiavi di servizi esterni, ID diversi tra dev e prod) vanno nella stessa sezione `Custom` di `global-settings.local.json`: è un uso previsto, il deep-merge li fonde sopra quelli committati. Restano comunque visibili al client, il `.local` li tiene fuori da git, non fuori dal browser.

### Sostituire un servizio dell'Engine (override via DI)

Le registrazioni vivono in `Program.cs`; il blocco `── SERVIZI APPLICATIVI ──` (`Program.cs:87`) è la regione del progetto: qui aggiungi i tuoi servizi, leggi `Custom:` per il wiring condizionale e sovrascrivi un servizio dell'Engine registrando la tua implementazione. Per un singolo `GetService<T>` vince l'ultima registrazione: un `AddSingleton<IInterface, TuaImpl>()` in fondo al blocco rimpiazza il default senza cancellare la riga dell'Engine.

Concretamente, servizio per servizio:

- **`IContentStore`** — default `FileContentStore`. Registri `AddSingleton<IContentStore, EfContentStore>()` per migrare a un database senza toccare controller né `SiteService`.
- **`IIdentityStore`** — il template registra già **`Store/AppIdentityStore.cs`** (di **proprietà del progetto**, estende il default engine `FileIdentityStore` che legge `data/identity.json`). Due livelli di estensione: **(a) comporre da più fonti** — nel tuo `AppIdentityStore` fai l'override di `ComposeIdentityAsync(identity, language, ct)` (oggi passthrough) per fondere nel modello pezzi presi altrove (es. orari o capitale da un DB/API) senza riscrivere la lettura del file; gira anche con `identity == null` (caso "tutto da un'API"). **(b) sorgente completamente diversa** — registri una tua `IIdentityStore` da zero. Il default engine (`FileIdentityStore` via `AddTemplateIdentity`, `TryAdd`) resta come rete di sicurezza.

> Nota: lo storage dei file caricati non è un'interfaccia ma la classe concreta `BlobStore` (`Store/BlobStore.cs`): file di progetto che modifichi direttamente o estendi via `override`. È deliberatamente tenuto separato da `IContentStore` (binari in volume runtime vs contenuti localizzati read-only). Diventerebbe un'interfaccia solo il giorno in cui servisse davvero lo swap a runtime (es. S3): estrarla è un attimo.
- **`IEngineMailer`** — default `EngineMailer` (SMTP). Lo sostituisci con una tua implementazione di `IsEnabled`/`IsValidAddress`/`SendAsync` (es. l'API HTTP di un provider); coda e worker restano invariati.
- **`INotificationStream`** — default in-memory. Una tua implementazione (es. un backplane Redis) lo fa scalare oltre il singolo processo.
- **`IDeliveryService`** e **`INotificationGroupResolver`** — registrati con `TryAddSingleton`: basta registrare la tua versione (`AddSingleton<IDeliveryService, MiaPolicy>()` per una policy di consegna propria, `AddSingleton<…, UserGroupResolver>()` per il targeting per utente/tenant).

I primi tre usano `AddSingleton`, gli ultimi due `TryAddSingleton`: in entrambi i casi la tua registrazione nel blocco vince. Gli snippet d'override di `IDeliveryService` e `INotificationGroupResolver` sono mostrati in contesto nelle sezioni Task in Background e Delivery e Notifiche Realtime; questo elenco è il riferimento consolidato.

---

## 🛠️ Developer Journey: Aggiungere un Endpoint

Per aggiungere una nuova funzionalità API, segui questo flusso logico passo-passo.

### Passo 1: Definire il Modello DTO
Crea la classe di input/output nella cartella `Models/`. Evita di restituire oggetti di dominio grezzi se in futuro userai un Database.
```csharp
public class UserResponseDto {
    public string Name { get; set; }
}
```

### Passo 2: Recupero Dati (IContentStore e `data/`)

`IContentStore` è già implementato da `FileContentStore`: legge un file JSON da `data/`, lo cacha e lo restituisce nella forma richiesta. Nel template serve la galleria social demo:
```csharp
Task<Dictionary<string, string>> GetSocialAsync(CancellationToken cancellationToken = default); // mappa nome→URL (data/social.json)
```

Il `CancellationToken` arriva dal controller (basta dichiararlo come parametro dell'action: ASP.NET lo lega a `HttpContext.RequestAborted`) e viene propagato fino alla lettura del file: se il client abbandona la richiesta, l'I/O si interrompe. Mantenerlo nelle nuove firme: per lo store su DB diventa la cancellazione delle query.

> L'identità del sito è un sottosistema a parte dell'Engine, non passa da `IContentStore`. Vedi L'Identità del Sito qui sotto.

#### `social.json` → `Dictionary<string,string>` (mappa piatta, demo)

`social.json` è una mappa piatta `nomeLogico → url` (es. `"facebook": "https://…"`) deserializzata direttamente con `EngineJson.Web`, senza passaggio i18n (gli URL non hanno lingua). È la galleria di icone esercitata dalla pagina demo Social via `GET /social` (filtro per nome, `case-insensitive`, in `SiteService.GetSocialAsync`). È demo: il `setup.mjs` la brucia (pagina + endpoint + `social.json` + store/SiteService) inizializzando un progetto figlio. Da non confondere con i social del brand, che stanno nell'identità (sotto).

Aggiungere un nuovo file di dati:
1. Crea il JSON in `data/` (es. `data/products.json`)
2. Aggiungi il metodo a `IContentStore` e implementalo in `FileContentStore`
3. Inietta `IContentStore` nel `Service` e delegagli la lettura

```csharp
// IContentStore.cs
Task<UserResponseDto> GetUserAsync(string id);
```

#### L'Identità del Sito (`IIdentityStore`, `GET /identity`, `data/identity.json`)

L'identità (dati legali/anagrafici, profili social del brand, natura dell'entità) è un sottosistema dell'Engine, offerto ai figli: un progetto non scrive controller né service per servirla, l'Engine espone `GET /identity` e il figlio riempie soltanto `data/identity.json` (validato e auto-completato dallo schema dell'Engine `Engine/Models/Identity/identity.schema.json`, referenziato via `$schema`). La sorgente è il seam `IIdentityStore` (default file-based `FileIdentityStore`), sostituibile via DI per leggere da DB/API esterna (`AddTemplateIdentity` in `Program.cs`; vedi Sostituire un servizio dell'Engine). È la sorgente unica di footer, pagine legali e dati strutturati SEO (JSON-LD: `sameAs` dai social, `@type` da `personal`).

File assente o non valorizzato: `GET /identity` risponde `null` (non un errore), footer, social e JSON-LD relativi si nascondono da soli lato frontend. Schema di `SiteIdentity` (tutti i campi opzionali; i campi testuali accettano stringa o blocco localizzato `{ "it": …, "en": … }`, risolto da `LocalizedJsonDeserializer`):

```csharp
SiteIdentity {
    bool     Personal             // false = Organization (default), true = Person (JSON-LD @type)
    string?  BusinessType         // Attività fisica: sottotipo schema.org (es. "Restaurant"/"Store"/
                                  // "LocalBusiness"). Valorizzato → @type = quello, con indirizzo e
                                  // openingHoursSpecification SUL NODO; ha la precedenza su Personal.
                                  // Stringa libera (non enum: 150+ sottotipi che evolvono), validità tua
    string?  RagioneSociale
    string?  PartitaIva
    string?  CodiceFiscale        // Se distinto dalla P.IVA
    Address? SedeLegale { Via, Civico, Cap, Citta, Provincia, Nazione }   // → PostalAddress.
                                  // Nazione = codice ISO 3166-1 alpha-2 (es. "IT"): il frontend ne deriva
                                  // il nome (Intl.DisplayNames), il JSON-LD addressCountry usa il codice
    Address? SedeOperativa { … }  // Sede fisica al pubblico se ≠ legale; usata come address del brand
                                  // solo con BusinessType valorizzato; assente → ripiega su SedeLegale
    ContactInfo? Contatti { Telefono, Email, Pec }                        // → ContactPoint
    CompanyDetails? DatiSocietari {
        RegistroImprese, NumeroRea
        decimal?  CapitaleSociale
        bool?     CapitaleInteramenteVersato
        bool?     IsSocioUnico
        bool?     InLiquidazione
        string?   CodiceSdi         // Codice SDI fatturazione elettronica
    }
    List<SocialLink>? Social      // Profili social del brand. Voce = URL nudo, o { url, name } con
                                  // etichetta (anche localizzata) resa SOLO nel footer. Icona/sameAs
                                  // usano l'URL → ammessi più profili dello stesso social
    List<OpeningHoursInterval>? OpeningHours  // Lista di intervalli TIPIZZATI: { Day: DayOfWeek, Opens/Closes:
                                  // TimeOnly }. Dichiari DayOfWeek.Tuesday + TimeOnly, non stringhe; sul filo è
                                  // { day:"Tuesday", opens:"09:00", closes:"18:00" } (converter). Più voci sullo
                                  // stesso giorno = più fasce; il frontend deriva resa e OpeningHoursSpecification
    string?  Currency             // ISO 4217 (es. EUR) per i valori monetari (capitale); omessa → EUR
    string?  RappresentanteLegale // Dato noto e tipizzato (anche localizzato), reso dal footer/pagine legali
    LegalRole? TitolareDelTrattamento     { Nome, Email }  // GDPR art. 4.7, SOLO se diverso da
                                  // RagioneSociale/RappresentanteLegale (nelle realtà con più persone può
                                  // essere un altro soggetto). NESSUN fallback: nella maggior parte dei siti
                                  // (una sola persona) il titolare coincide con l'azienda, già esposta da
                                  // RagioneSociale/Contatti.Email — ripeterlo sarebbe rumore, non un dato in
                                  // più. Assente → resta null, il frontend mostra solo l'identità generale
    LegalRole? ResponsabileProtezioneDati { Nome, Email }  // DPO (GDPR art. 37), solo se designato.
                                  // Nessun fallback: la designazione non è obbligatoria per ogni realtà, un
                                  // DPO presunto inventerebbe una carica inesistente. Assente → resta null,
                                  // il frontend nasconde la riga
    Dictionary<string,string>? MetadatiAggiuntivi  // Valori flat: string, non object. NON reso dall'identità
                                  // (solo dati noti); contenitore generico per il progetto
    Dictionary<string,object>? Extra              // via di fuga: proprietà schema.org arbitrarie, fuse
                                  // PER ULTIME nel nodo entità brand → sovrascrivono i default (anche
                                  // @type → LocalBusiness); restano dell'Engine solo @context e @id
}
```

Esempio `data/identity.json`:
```json
{
    "$schema": "./identity.schema.json",
    "personal": false,
    "ragioneSociale": "Acme Srl",
    "partitaIva": "IT12345678901",
    "sedeLegale": {
        "via": { "it": "Via Roma 1", "en": "1 Rome Street" },
        "civico": "1", "cap": "20100", "citta": "Milano", "provincia": "MI", "nazione": "IT"
    },
    "contatti": { "email": "info@acme.it", "pec": "acme@pec.it", "telefono": "+39 02 1234567" },
    "datiSocietari": { "registroImprese": "MI-1234567", "numeroRea": "MI-123456", "capitaleSociale": 10000.00 },
    "social": [
        "https://facebook.com/acme",
        { "url": "https://www.linkedin.com/company/acme", "name": "LinkedIn — Acme HQ" }
    ],
    "openingHours": [
        { "day": "Monday", "opens": "09:00", "closes": "17:00" },
        { "day": "Wednesday", "opens": "09:00", "closes": "13:00" },
        { "day": "Wednesday", "opens": "14:00", "closes": "17:00" },
        { "day": "Friday", "opens": "09:00", "closes": "17:00" }
    ],
    "currency": "EUR",
    "responsabileProtezioneDati": { "nome": "Dott.ssa Rossi", "email": "dpo@acme.it" },
    "extra": { "foundingDate": "2010-05-01", "slogan": "Il claim del brand" }
}
```

> `titolareDelTrattamento` qui è omesso di proposito: come `responsabileProtezioneDati`, nessun fallback automatico. Nella maggior parte dei siti (Acme è un'unica persona) il titolare coincide con l'azienda stessa, già esposta da `ragioneSociale`/`contatti.email` — dichiararlo di nuovo qui sarebbe rumore. Valorizzalo solo quando il titolare va effettivamente distinto (es. `{ "titolareDelTrattamento": { "nome": "Socio B", "email": "privacy@acme.it" } }` in una realtà con più soci, dove il titolare non è l'amministratore che compare in `rappresentanteLegale`).

> Cosa diventa SEO (JSON-LD): l'Engine costruisce l'entità brand (`Organization`/`Person`) con `sameAs` (dai social) e `address`/`contactPoint`/`vatID`/`taxID` — questi ultimi solo se il progetto figlio li ha abilitati per campo con `jsonld: { indirizzo, telefono, email, partitaIva, codiceFiscale }` in `site.ts` (default `false` — eccetto `partitaIva`, `true`: identificativo numerico puro, già pubblico per legge — stessi nomi dei campi di `identity`/`Contatti` che ciascuno gate — vedi frontend/README.md §"JSON-LD Strutturato") — più `hoursAvailable` dagli orari, `availableLanguage` dalle lingue del sito, e, solo per `Organization`, `legalName` (sempre, da ragione sociale). Gli orari sono una lista di intervalli tipizzati (`DayOfWeek` + `TimeOnly`): chi sviluppa dichiara `DayOfWeek.Tuesday`/`TimeOnly`, non stringhe né nozioni di schema.org; il frontend ne deriva sia la resa leggibile (fondendo i giorni con orari identici, es. "Lun–Ven") sia le `OpeningHoursSpecification` (dove `DayOfWeek` è già il nome `schema.org/Tuesday`). I social sono una lista di URL (stringa nuda, o `{ url, name }` con un'etichetta resa solo nel footer): l'icona e il `sameAs` usano l'URL, quindi più profili dello stesso social convivono. La valuta dei valori monetari è un fatto dichiarato (`currency`), non dedotto dal locale del visitatore: il frontend formatta gli importi con quella valuta nella lingua corrente. Per qualsiasi proprietà schema.org non tipizzata (es. `geo`, `foundingDate`, campi di `LocalBusiness`) c'è la via di fuga `extra`: viene fusa così com'è nel nodo entità brand, senza toccare modello né adapter, l'Engine non diventa mai un collo di bottiglia. Le proprietà strutturali dell'Engine vincono sulle collisioni; la validità schema.org di `extra` è a carico del progetto, ma la sicurezza no: l'Engine escapa l'output JSON-LD (`<`/`>`/`&` → `\uXXXX`), quindi anche un valore ostile in `extra` (o da un CMS/DB) non può rompere il `<script>` e iniettare markup.

> `MetadatiAggiuntivi` è `Dictionary<string, string>`: i valori sono stringhe semplici dopo la risoluzione della localizzazione. Non annidare oggetti complessi qui; usa `DatiSocietari` per dati strutturati.

Aggiungere un nuovo file di dati:
1. Crea il JSON in `data/` (es. `data/products.json`)
2. Aggiungi il metodo a `IContentStore` e implementalo in `FileContentStore`
3. Inietta `IContentStore` nel `Service` e delegagli la lettura

```csharp
// IContentStore.cs
Task<UserResponseDto> GetUserAsync(string id);
```

> `data/` è codice, e viene copiato in build automaticamente: il `backend.csproj` contiene
> `<Content Update="data\**\*" CopyToOutputDirectory="PreserveNewest" />`, ogni file dentro `data/`
> (a qualunque profondità, `**`) viene copiato accanto alla DLL a ogni build e finisce nell'immagine
> Docker. Un JSON nuovo in `data/` quindi funziona subito, con `dotnet run`, `publish` e Docker,
> senza toccare il `.csproj`. Al contrario, un file di dati piazzato fuori da `data/` (es. accanto
> al `.cs` che lo legge) "funziona con `dotnet run` ma sparisce dopo `publish`/Docker": non viene copiato
> nell'output, e a runtime `FileContentStore` non lo trova → `NotFoundException` (404). Regola pratica:
> i contenuti stanno in `data/`, sempre.
>
> Specularmente, `uploads/` è escluso dalla compilazione: il `.csproj` rimuove `uploads\**\*` da
> `Compile`, `Content` e `None`. È una cartella di dati runtime (file caricati dagli utenti, vedi
> `BlobController`), non sorgente: un `.cs` finito lì per errore (o caricato da un utente) non viene
> mai compilato nell'assembly. `data/` (asset di build, parte del codice) e `uploads/` (volume runtime,
> dati dell'utente) hanno ruoli opposti e il `.csproj` li tratta in modo opposto.

> Nota sulla lingua: `FileIdentityStore` (e `SiteService`) ricavano la lingua da `CultureInfo.CurrentCulture`, impostato da `UseRequestLocalization` all'inizio della pipeline. Se leggi fuori da un contesto HTTP (es. job in background), la cultura usata è quella di default del processo.

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

Il login è opzionale: si attiva valorizzando `Security.Token.SecretKey` (≥32 char) in `global-settings.local.json`. Se la chiave è vuota, i controller di autenticazione vengono rimossi fisicamente dalla memoria al boot.

> `setup.mjs` lascia la `SecretKey` vuota: un figlio nasce col login spento. Attivarlo è una scelta esplicita: chiave ≥32 char nel `.local.json` e verifica propria al posto della demo (`admin`/`Password1!`) in `Services/AccountService.cs`.

### Architettura del Payload di Sessione

Il JWT trasporta un payload tipizzato nel claim `"session"`. L'Engine gestisce solo il meccanismo (serializzazione/deserializzazione generica); la forma del payload la definisce il progetto.

Il contratto vive in due posti speculari da tenere in sincronia a mano:

| File | Layer | Descrizione |
| :--- | :--- | :--- |
| `backend/Models/SessionInfo.cs` | Progetto (personalizzabile) | Record C# serializzato nel JWT |
| `frontend/src/app/core/dto/session.dto.ts` | Progetto (personalizzabile) | Interfaccia TypeScript speculare |

Per aggiungere un campo al payload di sessione, modificalo in entrambi i posti:
```csharp
// backend/Models/SessionInfo.cs
public record SessionInfo
{
    public string UserId { get; init; } = "";
    public string DisplayName { get; init; } = "";
    public string[] Roles { get; init; } = [];
    public string Department { get; init; } = ""; // <-- aggiunto
}
```
```typescript
// frontend/src/app/core/dto/session.dto.ts
export interface SessionInfo {
    userId: string;
    displayName: string;
    roles: string[];
    department: string; // <-- aggiunto (camelCase: il backend serializza con JsonSerializerDefaults.Web)
}
```

> Il JWT è leggibile dal client (Base64, non cifrato). Non mettere dati sensibili nel payload.

> Se i due file divergono, il sintomo è silenzioso, non un errore: `User.GetSession<T>()` deserializza case-insensitive e non lancia se un campo manca, un campo aggiunto solo lato backend arriva `undefined` in TypeScript senza che nulla si accorga a compile-time né a runtime (il tipo `SessionInfo` lato frontend mente su cosa c'è davvero nel token). Non c'è un check automatico che li tenga allineati: se sospetti un disallineamento, decodifica il JWT (es. su jwt.io, o `atob()` sul payload) e confrontalo a mano con `session.dto.ts`.

#### `SessionPayload` — Dettagli Implementativi

`SessionPayload` (`Engine/Security/SessionPayload.cs`) è la colla tra il JWT e il payload tipizzato del progetto.

`SessionPayload.Claim<T>(T value)` serializza il payload in JSON con `JsonSerializerDefaults.Web` (camelCase, invariant culture) e restituisce un `Claim` di tipo `"session"`. Il camelCase è load-bearing: è quello che il frontend TypeScript riceve.

`User.GetSession<T>()` è un extension method su `ClaimsPrincipal`. Trova il claim `"session"`, lo deserializza in `T` con le stesse opzioni Web (case-insensitive in lettura). Restituisce `null` senza lanciare eccezioni se il claim manca o il JSON è malformato. Controlla sempre il risultato:

```csharp
var session = User.GetSession<SessionInfo>();
if (session is null)
    throw new UnauthorizedException(); // token valido ma senza payload di sessione
```

Dentro un controller derivato da `EngineProtectedController` c'è la comodità equivalente `CurrentSession<T>()` (stesso spirito di `CurrentLanguage` per la lingua): `CurrentSession<SessionInfo>()` invece di `User.GetSession<SessionInfo>()`, niente da importare. Fuori da un controller (es. in un servizio che implementa `IPersonalDataStore`) resta `User.GetSession<T>()` sul `ClaimsPrincipal` ricevuto: è il meccanismo, `CurrentSession<T>()` è solo lo zucchero sintattico per chi eredita già dalla base.

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

La verifica delle credenziali è logica di dominio del progetto e vive in `Services/AccountService.cs`, l'unico posto del progetto che conosce gli account degli utenti: `AuthController` le delega la verifica (e resta il punto HTTP: input, esito, emissione del token), `AppPersonalDataStore` le delega la cancellazione dell'account per il diritto all'oblio (vedi §9). Quando la sorgente cambia (Identity Provider, DB, file utenti) si riscrive l'interno di questa classe e nient'altro. Nella demo le credenziali (`admin`/`Password1!`) vivono hardcoded lì e il confronto è in tempo costante, come per le API key, con fail-closed in Production finché non vengono sostituite. È una classe concreta senza contratto engine-side, di proposito: le sue firme parlano `SessionInfo`, che l'Engine non conosce, i confini contrattuali restano `EngineAuthController` e `IPersonalDataStore`. (Da non confondere con l'identità del sito, `IIdentityStore`: quella sono i dati legali del brand, non gli utenti.) Il meccanismo di emissione del token (`Auth.GenerateToken`, `SessionPayload.Claim`) è invece fornito dall'Engine.

Le due firme da rispettare (le stesse della demo, solo il corpo cambia):
```csharp
// Services/AccountService.cs — sostituisci solo l'interno, firme e nome classe invariati
public Task<SessionInfo?> ValidateCredentialsAsync(string? username, string? pwd, CancellationToken ct = default)
{
    // null se le credenziali non corrispondono; altrimenti il payload di sessione da firmare nel JWT.
    // Es.: query al tuo DB/IdP, poi new SessionInfo { UserId = utente.Id, Roles = utente.Ruoli, ... }.
}

public Task DeleteAccountAsync(SessionInfo session, CancellationToken ct = default)
{
    // Diritto all'oblio: rimuovi/anonimizza l'account identificato da session.UserId.
}
```

#### `AuthService` — Claim Impliciti in Ogni Token

`AuthService.GenerateToken` include automaticamente due claim in ogni token emesso, indipendentemente da quelli passati dal controller:

| Claim | Valore | Perché |
| :--- | :--- | :--- |
| `ClaimTypes.Role` | `"Authenticated"` | Richiesto dalla policy `RequireLogin` su `EngineProtectedController`. Senza di esso il token viene accettato come firma ma rifiutato dall'autorizzazione (403). |
| `"loginTime"` | Timestamp Unix UTC | Momento dell'emissione. Utile per "forza re-login se la sessione ha più di N ore" senza modificare il middleware. |

Il token è firmato con HMAC-SHA256. La scadenza assoluta è `Security.Token.ExpirationSeconds`. Il middleware JWT Bearer ha `ClockSkew = TimeSpan.Zero`: un token scaduto è immediatamente rifiutato, senza margine di grazia.

`AuthService` è registrato come singleton (DI); viene registrato solo se `LoginEnabled` è `true`.

> In test di integrazione: per raggiungere un endpoint `EngineProtectedController`, il token fake deve includere il ruolo `"Authenticated"` oltre alla firma corretta. Senza quel ruolo la risposta sarà 403, non 401.

#### Ruoli: payload di sessione e `ClaimTypes.Role`

Nel token convivono due nozioni di "ruolo", ed è utile tenerle distinte:

- **`SessionInfo.Roles`** (es. `["admin"]`) vive nel blob JSON del claim `"session"`: sono i ruoli **di
  dominio**, che rileggi con `User.GetSession<SessionInfo>()`. Da soli sarebbero invisibili al motore di
  autorizzazione di ASP.NET.
- **`ClaimTypes.Role`** è ciò che leggono le policy native e `[Authorize(Roles = …)]`.
  `AuthService.GenerateToken` emette sempre `"Authenticated"` (l'interruttore loggato/non-loggato della
  policy `RequireLogin` che protegge `EngineProtectedController`).

Il template collega le due cose: `AuthController.Login` emette un `ClaimTypes.Role` per ogni voce di
`session.Roles` accanto al payload. Quindi nel progetto `[Authorize(Roles = "admin")]` funziona
nativamente: la demo logga `admin` come ruolo reale, non solo come dato di sessione.

```csharp
// AuthController.Login — i ruoli di dominio diventano claim che le policy native riconoscono
var claims = new List<Claim> { SessionPayload.Claim(session) };
claims.AddRange(session.Roles.Select(role => new Claim(ClaimTypes.Role, role)));
return Ok(new LoginResult(true, Token: Auth.GenerateToken(claims)));
```

Per un controllo puntuale resta possibile anche l'enforce imperativo, senza policy:
`if (User.GetSession<SessionInfo>()?.Roles.Contains("admin") != true) throw new ForbiddenException();`.

### Leggere la Sessione (in `ProtectedController`)

```csharp
[HttpGet("ping")]
public IActionResult Ping()
{
    var session = CurrentSession<SessionInfo>(); // null se token assente o malformato
    return Ok(new { status = "ok", session });
}
```
Ricetta rapida: [AGENTS.md](../AGENTS.md#leggere-la-sessione).

### Logout

Il JWT è stateless: il logout sul client (rimozione del token) non invalida il token sul backend, che resta tecnicamente valido fino alla scadenza (`exp`). Vale anche per la cancellazione dell'account (§9): un token già emesso sopravvive alla `DELETE` fino a `exp`. La finestra di esposizione è al massimo `Security.Token.ExpirationSeconds`, abbassarlo è la prima mitigazione. Se il progetto richiede la revoca immediata, il seam c'è già senza infrastruttura esterna: ogni token porta il claim `loginTime`, basta salvare accanto all'account un "nessun token emesso prima di X" e confrontarlo a richiesta. Una denylist server-side (cache condivisa dei token revocati) è l'alternativa classica, sproporzionata per un processo singolo.

---

## 📦 Strumenti HTTP di Fabbrica

> I controller dimostrativi del template (galleria social, login demo, ping protetto) non sono
> documentati qui: il catalogo vive nella vetrina della demo del [README root](../README.md).
> Sono segnaposto: al `setup` scegli tra riusarli (rispondi `N`), li tieni e ne cambi il
> contenuto (i dati in `data/*.json`, la verifica delle credenziali, i filtri di dominio) o ne lasci
> non valorizzate le parti che non esponi, oppure l'eject (rispondi `s`), che li rimuove lasciando un
> `BaseController` vuoto. L'identità (`GET /identity`) non è demo: è dell'Engine e sopravvive
> sempre, il figlio riempie solo `data/identity.json`. In entrambi i casi aggiungi accanto i
> controller del tuo dominio. Qui sotto restano gli strumenti che il template fornisce di default.

#### `BlobStore` — lo storage dei file caricati

`BlobStore` (`Store/BlobStore.cs`, accanto a `FileContentStore`) è un `File`/`Directory` in stile nostro sistema: una utility concreta che possiede la cartella `uploads/` e centralizza in un punto solo tutte le casistiche del ciclo di vita di un file caricato, con le policy già cablate dentro (slug immutabile, guardia path-traversal, deduzione del content-type). Il codice di dominio che riceve file in altri form la usa direttamente, `_blobs.SaveAsync(...)`, invece di reimplementare slug e sicurezza.

| Metodo | Analogo `System.IO` | Cosa fa in più |
|---|---|---|
| `SaveAsync(stream/IFormFile, ext)` | `File.Create` | conia lo slug `{GUID}.{ext}`, crea `uploads/` se manca |
| `OpenRead(slug)` | `File.OpenRead` | risolve+valida lo slug, `null` se assente |
| `GetInfo(slug)` | `FileInfo` | restituisce `mtime`/`size`/`content-type`/`IsImage` (per servire + ETag) |
| `Exists(slug)` / `Delete(slug)` | `File.Exists` / `File.Delete` | passano sempre dalla guardia path-traversal |
| `TryResolve(slug, out path)` | `Path.GetFullPath` | rifiuta gli slug che escono da `uploads/` |

È un file di progetto che possiedi: come `AuthController`/`BlobController`, lo apri e lo modifichi. Per aggiungere validazioni MIME, quote o antivirus tocchi `SaveAsync`, oppure, se preferisci non editare il default, ne ridefinisci un metodo `virtual` in una sottoclasse e registri quella. Non ci sono "implementazioni" separate da piazzare: ce n'è una, ed è tua. È registrato come singleton in DI solo per ricevere la content root (`AddSingleton<BlobStore>()`).

> Perché una classe concreta e non un'interfaccia: a differenza di `IContentStore` (che ha una traiettoria reale verso il DB e una forma specifica del progetto), lo storage dei file è I/O generico con un'unica implementazione plausibile, per un'app su filesystem l'interfaccia sarebbe cerimonia (YAGNI). I metodi sono `virtual` e la classe non è `sealed`, quindi override per i test e per i comportamenti custom restano possibili: il vantaggio esclusivo di un'interfaccia (iniettare un backend completamente diverso, es. S3) si recupera con un extract interface di due minuti il giorno in cui servirà davvero.

> Perché separato da `IContentStore` e non fuso dentro: sono responsabilità diverse (ISP). I contenuti sono read-only, localizzati, in cache, parte del codice e deployati con l'immagine, con traiettoria di swap verso un DB; i blob sono binari mutevoli in un volume runtime (`uploads/`), con traiettoria verso un object storage (S3). Fonderli costringerebbe chi migra i contenuti su DB a reimplementare anche lo storage dei file nella stessa classe. Stessa cartella (`Store/`) e stesso stile per coerenza, contratti separati per coesione.

#### `BlobController` — Upload e Download File

Espone download e upload dei file gestiti da `BlobStore` (vedi sopra). È un thin controller: tutto lo storage vive nello store; qui resta solo il wiring HTTP (resize on-demand, difesa XSS, cache). Eredita da `EngineBlobController` per il solo helper di resize immagini.

> `EngineBlobController` come base riusabile: un controller figlio che serve altri binari (PDF firmati, export) eredita da `EngineBlobController` per riusarne l'helper `protected static ResizeImageForWeb` senza riscrivere il resize. La generazione slug e il riconoscimento immagine non sono più qui: sono responsabilità di `BlobStore`.

`GET /blob/{slug}[?webopt=true]` richiede API key, nessuna autenticazione utente. `webopt=true` richiede la versione ottimizzata per il web del file: oggi l'ottimizzazione implementata è il resize delle immagini (lato più lungo max 1920 px → WebP), mentre i tipi non ancora gestiti vengono restituiti invariati. È il punto di aggancio per estendere l'ottimizzazione lato API ad altri tipi di contenuto in futuro.

Cache HTTP: lo slug è immutabile (ogni upload conia un nuovo GUID, mai sovrascritto), quindi la risposta è cacheabile a lungo: `Cache-Control: public, max-age=31536000, immutable`. In più viene emesso un ETag (da `mtime`+`size`+variante `r`/`w`, dove `w` è l'originale ottimizzato): se il client rimanda `If-None-Match` la GET risponde 304 senza riaprire né ridecodificare nulla, evitando il resize SkiaSharp sui re-hit. L'ETag è anche la cintura di sicurezza per cache condivise e per eventuali evoluzioni: se un domani si introducesse l'overwrite dello stesso slug, andrebbe rimosso `immutable` (il browser non rivalida durante `max-age`).

Cache server-side del resize (`BoundedByteCache`, `Engine/BoundedByteCache.cs`): l'ETag/304 sopra evita il ri-resize solo per un client che ha *già* visto quel blob. Il primo visitatore di un dato slug — e ogni client dietro una cache condivisa che non rispetta `Cache-Control` — fa comunque scattare un decode+resize+encode SkiaSharp completo. `?webopt=true` tiene quindi anche una `MemoryCache` dedicata in-process, chiave = `slug` (una sola variante esiste, niente `w=` a query come in `/cdn-cgi/asset` del frontend — qui i file sono caricati dall'utente, non un catalogo di asset noto a build time, e più larghezze avrebbero moltiplicato la cache senza un motivo concreto), popolata al primo miss e servita as-is sui successivi. È una `MemoryCache` separata da quella condivisa (`AddMemoryCache()`, usata per JSON di config): ha un proprio `SizeLimit` (`BLOB_WEBOPT_CACHE_MAX_MB`, default 500 MB — vedi `DOCKER_README.md`) perché un byte[] di immagine è ordini di grandezza più pesante di un file di config, e il numero di slug caricati non ha un tetto noto a priori; superato il limite, `MemoryCache` fa eviction da sola. Dedup anche sulle richieste concorrenti per lo stesso slug (stesso principio della `inProgress` Map del frontend, adattato al multi-thread di Kestrel): la dictionary interna tiene un `Lazy<Task<byte[]>>` per chiave, non il `Task` nudo — così, se due richieste arrivano nella stessa finestra di miss, solo una delle due esegue davvero il resize e l'altra ne attende il risultato, invece di rifarlo in parallelo.

Difesa XSS (Stored): il controller serve inline solo le immagini raster note (`BlobStore` le marca via `BlobInfo.IsImage`). Tutti gli altri formati, inclusi file HTML, SVG o XML caricati dagli utenti, sono forzati al download (`Content-Disposition: attachment`) con Content-Type `application/octet-stream`. Questo previene l'esecuzione di script malevoli sull'origin dell'API; `nosniff` resta attivo dagli header di sicurezza. Per recuperarli lato client, usare TypeScript/`fetch` per leggere i dati grezzi.

`POST /blob/up` richiede API key e token JWT valido (`[Authorize(Policy = RequireLogin)]`). Riceve un `IFormFile`, delega a `BlobStore.SaveAsync` e restituisce lo slug univoco: `{ "slug": "abc123.jpg" }`. Limite di dimensione `10 MB` (`[RequestSizeLimit]`): l'azione `Upload` vive per intero in `Controllers/BlobController.cs` (Dominio, non nell'Engine), quindi "sovrascrivere il limite" non è un'ereditarietà da comporre, è cambiare il numero nell'attributo, direttamente lì:
```csharp
// Controllers/BlobController.cs
[RequestSizeLimit(50 * 1024 * 1024)] // 50 MB, invece dei 10 MB di default
public async Task<IActionResult> Upload(IFormFile file, CancellationToken ct) { /* invariato */ }
```

Slug: identificativo univoco del file inclusa l'estensione (es. `abc123.jpg`), assegnato dallo store al momento dell'upload (`{GUID}.{ext}`). L'estensione è necessaria alla GET per determinare il content-type; il GUID rende lo slug immutabile (→ la cache di cui sopra).

Percorso fisico: `{ContentRootPath}/uploads/{slug}`. In Docker (`cwd=/app`) diventa `/app/uploads`. In dev locale è `backend/uploads/`. La directory viene creata automaticamente al primo `SaveAsync` (`Directory.CreateDirectory`), quindi non serve predisporla a mano.

Protezione path traversal: è dentro `BlobStore.TryResolve`, risolve il percorso assoluto con `Path.GetFullPath` e verifica che resti sotto la cartella upload (con trailing separator). Uno slug tipo `../../etc/passwd` non risolve: `GetInfo` torna `null` → 404, senza esporre il filesystem.

Range requests: il file è servito con `enableRangeProcessing: true`, supporta l'header HTTP `Range` per lo streaming di video/audio e i download riprendibili.

Content-Type: dedotto dallo store dall'estensione del file (`FileExtensionContentTypeProvider`). Se l'estensione non è riconosciuta, viene usato `application/octet-stream`.

> Nota: l'upload (`POST /blob/up`) richiede un token JWT valido (utente autenticato). Per validazioni di dominio (tipi MIME consentiti, antivirus, quote) estendi il controller nel progetto figlio o avvolgi `BlobStore.SaveAsync`. In un progetto senza login (`SecretKey` vuota) l'upload è impossibile per design: il blob store resta in sola lettura e la `GET` serve i file già presenti nel volume.

#### Health Check (`GET /health`)

L'endpoint `/health` è registrato con `.AllowAnonymous()`: bypassa sia la verifica API key che il JWT. È pensato per Docker health checks e probe dei load balancer: nessun client esterno deve poter raggiungere il backend direttamente nella configurazione standard.

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

> `UseStatusCodePages` è registrato dopo `UseExceptionHandler`. Intercetta risposte 4xx/5xx senza body e aggiunge un testo minimo. In pratica quasi mai visibile perché `AddProblemDetails` popola già il body, ma ricordati di lanciare eccezioni (`throw new NotFoundException()`) invece di `return StatusCode(404)` per garantire il formato ProblemDetails anche negli edge case.

---

## Quick Start
```bash
dotnet run
```
L'applicazione esporrà di default un health-check su `/health` (anonimo, risponde `Healthy` se tutto va bene).

### Primo avvio in locale — cosa aspettarsi

`dotnet run` parte dalla cartella `backend/`. Tre cose da sapere alla prima esecuzione:

- **Porta.** Il profilo dev (`Properties/launchSettings.json`) serve su `http://localhost:5000`. È
  HTTP, interno: il TLS lo termina il reverse proxy in produzione, in locale non serve.
- **La trappola del 401 senza `.local`.** Ogni controller esige `X-Api-Key`, e le chiavi arrivano da
  `global-settings.local.json` (i segreti, fuori da git). Se quel file manca o non ha
  `Security.ApiKeys`, l'array è vuoto e ogni richiesta torna 401: il backend è partito
  correttamente, ma rifiuta tutto. Verifica il `/health` (anonimo, bypassa la API key) per confermare
  che il processo è su, poi copia `global-settings.local.example.json` in `global-settings.local.json`
  e valorizza `Security.ApiKeys` prima di chiamare gli altri endpoint. (Dettaglio del layering in
  Sorgenti di Configurazione.)
- **Resize immagini in Docker Linux.** Il `backend.csproj` referenzia
  `SkiaSharp.NativeAssets.Linux.NoDependencies`: è il binario nativo che permette a `EngineBlobController`
  di ridimensionare le immagini (`GET /blob/{slug}?webopt=true`) sotto Linux. In locale su
  Windows/macOS non incide; rimuoverlo rompe `?webopt=true` solo in produzione (il container Linux),
  in modo silenzioso fino alla prima richiesta di immagine ottimizzata. Lascialo nel `.csproj`.

> In più: se valorizzi `Security.Token.SecretKey` per attivare il login, dev'essere ≥ 32 byte o il
> boot va in crash con `InvalidOperationException` (vedi `SecurityOptions`). Lasciata vuota, il login
> resta spento e i controller di auth non vengono nemmeno mappati.
