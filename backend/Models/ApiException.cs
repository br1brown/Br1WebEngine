namespace Br1WebEngine.Models;

/// <summary>
/// Eccezione base per gli errori API che devono essere tradotti in una risposta HTTP controllata.
/// </summary>
/// <remarks>
/// <para>
/// Questa classe e' il punto d'ingresso del pattern "lancia e basta" usato nel template.
/// Invece di catturare errori nei controller e costruire manualmente risposte di errore,
/// i controller lanciano un'eccezione di questa gerarchia. Il middleware
/// <see cref="Br1WebEngine.Security.ApiExceptionHandler"/> la intercetta automaticamente
/// e la converte in un payload ProblemDetails (RFC 9457) con lo status code corretto.
/// </para>
/// <para>
/// Ogni sottoclasse rappresenta uno scenario di errore specifico con il suo codice HTTP:
/// <list type="bullet">
/// <item><see cref="NotFoundException"/> (404) — la risorsa non esiste o non e' leggibile</item>
/// <item><see cref="DataNotFoundException"/> (404) — i dati esistono ma sono vuoti</item>
/// <item><see cref="DecodingException"/> (400) — il payload non e' decodificabile</item>
/// <item><see cref="InvalidParametersException"/> (400) — parametri mancanti o non validi</item>
/// </list>
/// </para>
/// <para>
/// Per aggiungere un nuovo tipo di errore, basta creare una nuova sottoclasse
/// con il messaggio e lo status code desiderati. L'handler li gestira' automaticamente.
/// </para>
/// </remarks>
public class ApiException : Exception
{
    /// <summary>
    /// Codice HTTP da restituire al client.
    /// </summary>
    public int StatusCode { get; }

    /// <summary>
    /// Inizializza l'eccezione con messaggio e codice HTTP associato.
    /// </summary>
    /// <param name="message">Messaggio da esporre nel campo "detail" del Problem Details restituito al client.</param>
    /// <param name="statusCode">Codice HTTP da usare nella risposta (es. 400, 404, 422).</param>
    public ApiException(string message, int statusCode)
        : base(message)
    {
        StatusCode = statusCode;
    }
}

/// <summary>
/// Rappresenta un errore 404 per una risorsa richiesta ma non trovata o non leggibile.
/// </summary>
/// <remarks>
/// Uso tipico: <c>throw new NotFoundException("profilo")</c> quando un file JSON
/// o un record non esiste. Il messaggio risultante sara' "Impossibile leggere le informazioni profilo".
/// </remarks>
public class NotFoundException : ApiException
{
    /// <summary>
    /// Inizializza l'eccezione specificando il nome logico della risorsa mancante.
    /// </summary>
    /// <param name="dataName">Descrizione della risorsa che non e' stato possibile leggere.</param>
    public NotFoundException(string dataName = "richieste")
        : base($"Impossibile leggere le informazioni {dataName}", 404)
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
    /// Inizializza l'eccezione con il messaggio standard di errore di decodifica.
    /// </summary>
    public DecodingException()
        : base("Errore nella decodifica", 400)
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
    /// Inizializza l'eccezione con il messaggio standard di dato non disponibile.
    /// </summary>
    public DataNotFoundException()
        : base("Dati non trovati", 404)
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
    /// Inizializza l'eccezione con il messaggio standard di parametri non validi.
    /// </summary>
    public InvalidParametersException()
        : base("Parametri non validi o mancanti", 400)
    {
    }
}
