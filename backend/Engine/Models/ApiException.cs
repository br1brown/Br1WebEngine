namespace Backend.Models;

/// <summary>
/// Eccezione base per gli errori API che devono essere tradotti in una risposta HTTP controllata.
/// </summary>
/// <remarks>
/// <para>
/// Questa classe e' il punto d'ingresso del pattern "lancia e basta" usato nel template.
/// Invece di catturare errori nei controller e costruire manualmente risposte di errore,
/// i controller lanciano un'eccezione di questa gerarchia. Il middleware
/// <see cref="Backend.Security.ApiExceptionHandler"/> la intercetta automaticamente
/// e la converte in un payload ProblemDetails (RFC 9457) con lo status code corretto.
/// </para>
/// <para>
/// Il messaggio non e' una stringa fissa ma una <see cref="MessageKey"/>: l'handler la risolve
/// nella lingua della richiesta tramite <c>IStringLocalizer&lt;SharedResource&gt;</c> (file .resx).
/// Eventuali <see cref="MessageArgs"/> riempiono i segnaposto del testo (es. <c>{0}</c>).
/// </para>
/// <para>
/// Ogni sottoclasse rappresenta uno scenario di errore specifico con il suo codice HTTP:
/// <list type="bullet">
/// <item><see cref="DecodingException"/> (400) — il payload non e' decodificabile</item>
/// <item><see cref="InvalidParametersException"/> (400) — parametri mancanti o non validi</item>
/// <item><see cref="UnauthorizedException"/> (401) — credenziali assenti o non valide</item>
/// <item><see cref="ForbiddenException"/> (403) — autenticato ma senza permessi</item>
/// <item><see cref="NotFoundException"/> (404) — la risorsa non esiste o non e' leggibile</item>
/// <item><see cref="DataNotFoundException"/> (404) — i dati esistono ma sono vuoti</item>
/// <item><see cref="ConflictException"/> (409) — risorsa gia' esistente o conflitto di stato</item>
/// <item><see cref="GoneException"/> (410) — risorsa rimossa definitivamente</item>
/// <item><see cref="UnprocessableEntityException"/> (422) — dati validi ma semanticamente errati</item>
/// <item><see cref="TooManyRequestsException"/> (429) — limite applicativo superato</item>
/// <item><see cref="NotImplementedEndpointException"/> (501) — funzionalita' non ancora implementata</item>
/// <item><see cref="BadGatewayException"/> (502) — risposta non valida da upstream</item>
/// <item><see cref="ServiceUnavailableException"/> (503) — servizio temporaneamente non disponibile</item>
/// <item><see cref="GatewayTimeoutException"/> (504) — upstream non risponde in tempo</item>
/// </list>
/// </para>
/// <para>
/// Per aggiungere un nuovo tipo di errore: creare una sottoclasse che passa una chiave di risorsa
/// e lo status code; aggiungere la chiave nei file <c>Resources/SharedResource*.resx</c>.
/// </para>
/// </remarks>
public class ApiException : Exception
{
    /// <summary>Codice HTTP da restituire al client.</summary>
    public int StatusCode { get; }

    /// <summary>
    /// Chiave di risorsa del messaggio, risolta per lingua dall'handler (file .resx).
    /// </summary>
    public string MessageKey { get; }

    /// <summary>
    /// Argomenti che riempiono i segnaposto del messaggio localizzato (es. <c>{0}</c>).
    /// </summary>
    public object[] MessageArgs { get; }

    /// <summary>
    /// Secondi che il client deve attendere prima di riprovare.
    /// Se valorizzato, l'handler aggiunge l'header <c>Retry-After</c> alla risposta.
    /// Rilevante per <see cref="TooManyRequestsException"/> (429) e
    /// <see cref="ServiceUnavailableException"/> (503).
    /// </summary>
    public int? RetryAfterSeconds { get; protected init; }

    /// <summary>
    /// Inizializza l'eccezione con la chiave del messaggio, lo status HTTP e gli argomenti.
    /// </summary>
    /// <param name="messageKey">Chiave di risorsa presente nei file SharedResource*.resx.</param>
    /// <param name="statusCode">Codice HTTP da usare nella risposta (es. 400, 401, 404).</param>
    /// <param name="args">Valori per i segnaposto del testo localizzato.</param>
    public ApiException(string messageKey, int statusCode, params object[] args)
        : base(messageKey)
    {
        StatusCode = statusCode;
        MessageKey = messageKey;
        MessageArgs = args;
    }
}

// ── 400 Bad Request ──────────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 400 dovuto a contenuti non decodificabili.
/// </summary>
/// <remarks>
/// Uso tipico: il body della richiesta o un file di dati non e' nel formato atteso
/// (es. JSON malformato, encoding non supportato).
/// </remarks>
public class DecodingException : ApiException
{
    public DecodingException()
        : base("error_decoding", 400)
    {
    }
}

/// <summary>
/// Rappresenta un errore 400 per parametri assenti, incompleti o non validi.
/// </summary>
/// <remarks>
/// Uso tipico: un endpoint richiede un parametro obbligatorio che non e' stato fornito,
/// o il valore fornito non rispetta le regole di validazione.
/// </remarks>
public class InvalidParametersException : ApiException
{
    public InvalidParametersException()
        : base("error_invalid_parameters", 400)
    {
    }
}

// ── 401 Unauthorized ─────────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 401 per credenziali assenti, non valide o sessione non autenticata.
/// </summary>
/// <remarks>
/// Uso tipico: <c>throw new UnauthorizedException("error_invalid_credentials")</c> quando la
/// verifica delle credenziali in un controller di login fallisce. L'handler lo converte in un
/// ProblemDetails 401, coerente con il resto della gerarchia.
/// Usare la chiave generica <c>"error_unauthorized"</c> (default) quando non si vuole rivelare
/// quale campo e' errato; <c>"error_invalid_credentials"</c> solo dove la distinzione e' accettabile.
/// </remarks>
public class UnauthorizedException : ApiException
{
    /// <param name="messageKey">Chiave di risorsa del motivo. Default: <c>"error_unauthorized"</c>.</param>
    public UnauthorizedException(string messageKey = "error_unauthorized")
        : base(messageKey, 401)
    {
    }
}

// ── 403 Forbidden ────────────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 403 per accesso negato a un utente autenticato ma non autorizzato.
/// </summary>
/// <remarks>
/// Diversa da <see cref="UnauthorizedException"/> (401): quella indica che l'utente non e'
/// autenticato; questa indica che e' autenticato ma non ha i permessi per l'operazione richiesta.
/// Uso tipico: un utente loggato tenta di accedere a una risorsa riservata a un ruolo superiore.
/// </remarks>
public class ForbiddenException : ApiException
{
    public ForbiddenException()
        : base("error_forbidden", 403)
    {
    }
}

// ── 404 Not Found ────────────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 404 per una risorsa richiesta ma non trovata o non leggibile.
/// </summary>
/// <remarks>
/// Uso tipico: <c>throw new NotFoundException("profilo")</c> quando un file JSON o un record
/// non esiste. Il nome della risorsa riempie il segnaposto del messaggio localizzato.
/// </remarks>
public class NotFoundException : ApiException
{
    /// <param name="dataName">Nome della risorsa non trovata; se omesso viene usato un messaggio generico.</param>
    public NotFoundException(string? dataName = null)
        : base(
            dataName is not null ? "error_not_found_named" : "error_not_found",
            404,
            dataName is not null ? new object[] { dataName } : Array.Empty<object>())
    {
    }
}

/// <summary>
/// Rappresenta un errore 404 per dati esistenti ma vuoti o non disponibili.
/// </summary>
/// <remarks>
/// Diversa da <see cref="NotFoundException"/>: la risorsa esiste, ma il contenuto
/// e' vuoto o non disponibile per la lingua richiesta.
/// </remarks>
public class DataNotFoundException : ApiException
{
    public DataNotFoundException()
        : base("error_data_not_found", 404)
    {
    }
}

// ── 409 Conflict ─────────────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 409 per conflitti di stato sulla risorsa.
/// </summary>
/// <remarks>
/// Uso tipico: tentativo di creare una risorsa gia' esistente, o aggiornamento
/// su una versione obsoleta (ottimistic concurrency). Il nome della risorsa in conflitto
/// riempie il segnaposto <c>{0}</c> del messaggio localizzato.
/// </remarks>
public class ConflictException : ApiException
{
    /// <param name="resourceName">Nome della risorsa in conflitto; se omesso viene usato un messaggio generico.</param>
    public ConflictException(string? resourceName = null)
        : base(
            resourceName is not null ? "error_conflict_named" : "error_conflict",
            409,
            resourceName is not null ? new object[] { resourceName } : Array.Empty<object>())
    {
    }
}

// ── 410 Gone ─────────────────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 410 per risorse rimosse definitivamente.
/// </summary>
/// <remarks>
/// Diversa da <see cref="NotFoundException"/> (404): il 404 e' ambiguo (la risorsa potrebbe
/// tornare), mentre il 410 comunica esplicitamente al client e ai crawler che la risorsa
/// non esiste piu' e non tornera'. Il nome della risorsa riempie il segnaposto <c>{0}</c>.
/// </remarks>
public class GoneException : ApiException
{
    /// <param name="resourceName">Nome della risorsa rimossa; se omesso viene usato un messaggio generico.</param>
    public GoneException(string? resourceName = null)
        : base(
            resourceName is not null ? "error_gone_named" : "error_gone",
            410,
            resourceName is not null ? new object[] { resourceName } : Array.Empty<object>())
    {
    }
}

// ── 422 Unprocessable Entity ─────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 422 per richieste sintatticamente valide ma semanticamente non elaborabili.
/// </summary>
/// <remarks>
/// Usato quando il JSON e' ben formato (diversamente dal 400) ma i valori non superano
/// le regole di business (es. data di fine precedente alla data di inizio, importo negativo).
/// Complementa FluentValidation per le validazioni che richiedono logica di dominio.
/// </remarks>
public class UnprocessableEntityException : ApiException
{
    public UnprocessableEntityException()
        : base("error_unprocessable_entity", 422)
    {
    }
}

// ── 429 Too Many Requests ────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 429 per superamento dei limiti di frequenza applicativi.
/// </summary>
/// <remarks>
/// Il rate limiting infrastrutturale e' gia' gestito dal middleware (100 req/min globale,
/// 5 req/min per login). Questa eccezione serve per limiti di business applicativi piu'
/// granulari (es. max 3 tentativi di OTP per sessione, max 10 export al giorno per utente).
/// Se valorizzato, <paramref name="retryAfterSeconds"/> aggiunge l'header <c>Retry-After</c>
/// alla risposta, indicando al client quando potra' riprovare.
/// </remarks>
public class TooManyRequestsException : ApiException
{
    /// <param name="retryAfterSeconds">Secondi da attendere prima di riprovare (opzionale). Se fornito, viene incluso nel messaggio e nell'header <c>Retry-After</c>.</param>
    public TooManyRequestsException(int? retryAfterSeconds = null)
        : base(
            retryAfterSeconds.HasValue ? "error_too_many_requests_timed" : "error_too_many_requests",
            429,
            retryAfterSeconds.HasValue ? new object[] { retryAfterSeconds.Value } : Array.Empty<object>())
    {
        RetryAfterSeconds = retryAfterSeconds;
    }
}

// ── 501 Not Implemented ──────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 501 per funzionalita' non ancora implementate lato server.
/// </summary>
/// <remarks>
/// Utile per endpoint stub o funzionalita' pianificate ma non ancora disponibili.
/// Nota: il nome e' volutamente diverso da <c>System.NotImplementedException</c>
/// (usata per metodi astratti non implementati in C#) per evitare ambiguita'.
/// </remarks>
public class NotImplementedEndpointException : ApiException
{
    public NotImplementedEndpointException()
        : base("error_not_implemented", 501)
    {
    }
}

// ── 502 Bad Gateway ──────────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 502 per risposte non valide ricevute da un servizio upstream.
/// </summary>
/// <remarks>
/// Usato quando il backend agisce da intermediario (chiama API esterne, microservizi,
/// ecc.) e riceve una risposta corrotta, malformata o con un formato imprevisto.
/// Diverso da <see cref="ServiceUnavailableException"/> (503, servizio non raggiungibile)
/// e <see cref="GatewayTimeoutException"/> (504, servizio raggiungibile ma lento).
/// </remarks>
public class BadGatewayException : ApiException
{
    public BadGatewayException()
        : base("error_bad_gateway", 502)
    {
    }
}

// ── 503 Service Unavailable ──────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 503 per servizi esterni temporaneamente non disponibili.
/// </summary>
/// <remarks>
/// Uso tipico: un servizio di terze parti (email, pagamenti, SMS) non risponde o
/// restituisce un errore. Segnala al client che l'operazione puo' essere ritentata piu' tardi,
/// senza esporre dettagli tecnici dell'infrastruttura.
/// Se valorizzato, <paramref name="retryAfterSeconds"/> aggiunge l'header <c>Retry-After</c>
/// alla risposta (RFC 9110 §15.6.4).
/// </remarks>
public class ServiceUnavailableException : ApiException
{
    /// <param name="retryAfterSeconds">Secondi da attendere prima di riprovare (opzionale). Se fornito, viene incluso nel messaggio e nell'header <c>Retry-After</c>.</param>
    public ServiceUnavailableException(int? retryAfterSeconds = null)
        : base(
            retryAfterSeconds.HasValue ? "error_service_unavailable_timed" : "error_service_unavailable",
            503,
            retryAfterSeconds.HasValue ? new object[] { retryAfterSeconds.Value } : Array.Empty<object>())
    {
        RetryAfterSeconds = retryAfterSeconds;
    }
}

// ── 504 Gateway Timeout ──────────────────────────────────────────────────────

/// <summary>
/// Rappresenta un errore 504 per timeout di risposta da un servizio upstream.
/// </summary>
/// <remarks>
/// Usato quando il backend e' in attesa di una risposta da un servizio esterno e questa
/// non arriva entro il timeout configurato. Il servizio e' raggiungibile (diversamente
/// dal 503) ma troppo lento. Consente al client di distinguere tra "servizio giu'" e
/// "servizio congestionato/lento".
/// </remarks>
public class GatewayTimeoutException : ApiException
{
    public GatewayTimeoutException()
        : base("error_gateway_timeout", 504)
    {
    }
}
