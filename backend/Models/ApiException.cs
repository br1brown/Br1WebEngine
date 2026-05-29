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
/// <item><see cref="UnauthorizedException"/> (401) — credenziali assenti o non valide</item>
/// <item><see cref="NotFoundException"/> (404) — la risorsa non esiste o non e' leggibile</item>
/// <item><see cref="DataNotFoundException"/> (404) — i dati esistono ma sono vuoti</item>
/// <item><see cref="DecodingException"/> (400) — il payload non e' decodificabile</item>
/// <item><see cref="InvalidParametersException"/> (400) — parametri mancanti o non validi</item>
/// </list>
/// </para>
/// <para>
/// Per aggiungere un nuovo tipo di errore: creare una sottoclasse che passa una chiave di risorsa
/// e lo status code; aggiungere la chiave nei file <c>Resources/SharedResource*.resx</c>.
/// </para>
/// </remarks>
public class ApiException : Exception
{
    /// <summary>
    /// Codice HTTP da restituire al client.
    /// </summary>
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

/// <summary>
/// Rappresenta un errore 401 per credenziali assenti, non valide o sessione non autenticata.
/// </summary>
/// <remarks>
/// Uso tipico: <c>throw new UnauthorizedException("error_invalid_credentials")</c> quando la
/// verifica delle credenziali in un controller di login fallisce. L'handler lo converte in un
/// ProblemDetails 401, coerente con il resto della gerarchia.
/// </remarks>
public class UnauthorizedException : ApiException
{
    /// <summary>
    /// Inizializza l'eccezione con la chiave del messaggio da mostrare.
    /// </summary>
    /// <param name="messageKey">Chiave di risorsa del motivo. Tenerla generica per non rivelare quale campo e' errato.</param>
    public UnauthorizedException(string messageKey = "error_unauthorized")
        : base(messageKey, 401)
    {
    }
}

/// <summary>
/// Rappresenta un errore 404 per una risorsa richiesta ma non trovata o non leggibile.
/// </summary>
/// <remarks>
/// Uso tipico: <c>throw new NotFoundException("profilo")</c> quando un file JSON o un record
/// non esiste. Il nome della risorsa riempie il segnaposto del messaggio localizzato.
/// </remarks>
public class NotFoundException : ApiException
{
    /// <summary>
    /// Inizializza l'eccezione specificando il nome logico della risorsa mancante.
    /// </summary>
    /// <param name="dataName">Descrizione della risorsa che non e' stato possibile leggere.</param>
    public NotFoundException(string dataName = "richieste")
        : base("error_not_found", 404, dataName)
    {
    }
}

/// <summary>
/// Rappresenta un errore 400 dovuto a contenuti non decodificabili.
/// </summary>
/// <remarks>
/// Uso tipico: il body della richiesta o un file di dati non e' nel formato atteso
/// (es. JSON malformato, encoding non supportato).
/// </remarks>
public class DecodingException : ApiException
{
    /// <summary>
    /// Inizializza l'eccezione con la chiave del messaggio di errore di decodifica.
    /// </summary>
    public DecodingException()
        : base("error_decoding", 400)
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
    /// <summary>
    /// Inizializza l'eccezione con la chiave del messaggio di dato non disponibile.
    /// </summary>
    public DataNotFoundException()
        : base("error_data_not_found", 404)
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
    /// <summary>
    /// Inizializza l'eccezione con la chiave del messaggio di parametri non validi.
    /// </summary>
    public InvalidParametersException()
        : base("error_invalid_parameters", 400)
    {
    }
}
