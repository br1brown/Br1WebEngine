namespace Backend.Diagnostics;

// Periferia del sottosistema ErrorReporting in un solo file: lo snapshot immutabile e il
// contratto del servizio. La chiamata HTTP verso il webhook resta in EngineErrorReporting.cs.
// Stesso schema di Mail/Notifications/Delivery/Tasks.

/// <summary>
/// Istantanea immutabile di un errore da segnalare. Costruita SINCRONAMENTE dentro
/// <see cref="Backend.Security.ApiExceptionHandler"/> prima di accodare la segnalazione: mai la
/// <c>HttpContext</c> live, che Kestrel ricicla subito dopo la risposta e non è sicura da leggere
/// da un task in background (stesso principio di <c>BackgroundQueue</c> altrove nel template).
/// </summary>
public sealed record ErrorReport
{
    /// <summary><c>Exception.Message</c> dell'errore originale.</summary>
    public required string Message { get; init; }

    /// <summary>Nome completo del tipo dell'eccezione (es. <c>System.NullReferenceException</c>).</summary>
    public required string ExceptionType { get; init; }

    /// <summary>Status HTTP associato (500 per un'eccezione non applicativa, altrimenti quello dell'<c>ApiException</c>).</summary>
    public int StatusCode { get; init; }

    /// <summary>Path della richiesta che ha generato l'errore (es. <c>/api/v1/orders</c>).</summary>
    public string? Path { get; init; }

    /// <summary>Metodo HTTP della richiesta (es. <c>POST</c>).</summary>
    public string? Method { get; init; }

    /// <summary>Stack trace, se disponibile. Nessun troncamento qui: lo decide l'implementazione in base al trasporto.</summary>
    public string? StackTrace { get; init; }

    /// <summary><c>"server"</c> (default, bug lato API) o <c>"client"</c> (eccezione JS non gestita
    /// nel browser di un visitatore, vedi <see cref="Backend.Controllers.EngineClientErrorController"/>)
    /// — distingue le due fonti nello stesso canale di allerta, senza due sistemi separati.</summary>
    public string Source { get; init; } = "server";
}

/// <summary>
/// Payload inviato dal browser per un'eccezione JavaScript non gestita — vedi
/// <see cref="Backend.Controllers.EngineClientErrorController"/> e, lato frontend,
/// <c>frontend/README.md</c> § Error Tracking. Tutti i campi opzionali: un <c>Error</c> del
/// browser non garantisce sempre uno stack o un nome tipizzato.
/// </summary>
public sealed record ClientErrorReport
{
    /// <summary><c>Error.message</c> dell'eccezione originale.</summary>
    public string? Message { get; init; }

    /// <summary><c>Error.name</c> (es. <c>TypeError</c>).</summary>
    public string? ExceptionType { get; init; }

    /// <summary>Percorso della pagina (<c>location.pathname</c>) in cui l'errore si è verificato.</summary>
    public string? Path { get; init; }

    /// <summary><c>Error.stack</c>, se disponibile.</summary>
    public string? StackTrace { get; init; }
}

/// <summary>
/// Segnalazione errori dell'Engine: un punto d'ingresso unico, iniettato in DI (singleton), al
/// posto di un provider di monitoring integrato a mano progetto per progetto. Superficie minima
/// apposta — niente SDK di terze parti nell'Engine, un webhook HTTP generico (vedi
/// <see cref="Backend.Models.Configuration.ErrorReportingOptions"/>): non è un sostituto di un
/// vero APM (Sentry, Bugsnag...), è "avvisami quando qualcosa si rompe" senza dipendenze aggiuntive.
/// </summary>
/// <remarks>
/// Chiamato da <see cref="Backend.Security.ApiExceptionHandler"/> per ogni eccezione non
/// applicativa (bug veri, sempre un bug) o applicativa con status ≥500 (upstream/infrastruttura):
/// mai per un 4xx applicativo (401/404/422...), che è traffico normale, non un errore da segnalare.
/// La chiamata è accodata su <c>IBackgroundTaskQueue</c>, non attesa nella risposta HTTP: un
/// webhook lento o giù non deve mai rallentare (o far fallire) la risposta di errore al client.
/// </remarks>
public interface IErrorReportingService
{
    /// <summary><see langword="true"/> se un webhook è configurato (vedi <see cref="Backend.Models.Configuration.ErrorReportingOptions.IsConfigured"/>).</summary>
    bool IsEnabled { get; }

    /// <summary>
    /// Invia la segnalazione al webhook configurato. Non lancia mai: un fallimento di rete o
    /// dell'endpoint remoto viene loggato internamente, non deve mai propagare (segnalare un
    /// errore non deve poter generarne un altro).
    /// </summary>
    Task ReportAsync(ErrorReport report, CancellationToken cancellationToken = default);
}
