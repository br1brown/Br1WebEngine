using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Backend.Diagnostics;

namespace Backend.Controllers;

/// <summary>
/// Riceve le eccezioni JavaScript non gestite dal browser e le inoltra allo stesso
/// <see cref="IErrorReportingService"/> usato per gli errori server (vedi
/// <see cref="Backend.Security.ApiExceptionHandler"/>): un solo canale di allerta per l'intera
/// applicazione — <see cref="ErrorReport.Source"/> distingue le due fonti, non servono due sistemi.
/// </summary>
/// <remarks>
/// Eredita da <see cref="EngineApiController"/>: richiede la sola API key (sempre iniettata dal
/// proxy, vedi <see cref="EngineNotificationStreamController"/> per lo stesso schema), NON il
/// login — un errore JS può capitare anche a un visitatore anonimo su una pagina pubblica.
/// </remarks>
[Route("diagnostics/ui-fault")]
public sealed class EngineClientErrorController : EngineApiController
{
    private readonly IErrorReportingService _errorReporting;

    /// <inheritdoc cref="EngineClientErrorController"/>
    public EngineClientErrorController(IErrorReportingService errorReporting, ILogger<EngineClientErrorController> logger)
        : base(logger)
    {
        _errorReporting = errorReporting;
    }

    /// <summary>
    /// Accoda la segnalazione di un'eccezione JS non gestita. Risponde sempre 202 — anche a
    /// payload incompleto o col webhook spento: chi chiama è il browser di un visitatore che ha
    /// già avuto un errore, non deve mai vederne un secondo per averlo segnalato.
    /// </summary>
    [HttpPost]
    public IActionResult Report([FromBody] ClientErrorReport report)
    {
        if (_errorReporting.IsEnabled)
        {
            // Stesso schema di ApiExceptionHandler: snapshot costruito qui, poi accodato — un
            // webhook lento o giù non deve mai far aspettare la risposta al browser chiamante.
            var stackTrace = report.StackTrace;
            if (stackTrace is { Length: > 4000 })
                stackTrace = stackTrace[..4000] + "\n… (troncato)";

            var errorReport = new ErrorReport
            {
                Message = string.IsNullOrWhiteSpace(report.Message) ? "(nessun messaggio)" : report.Message,
                ExceptionType = string.IsNullOrWhiteSpace(report.ExceptionType) ? "ClientError" : report.ExceptionType,
                Path = report.Path,
                StackTrace = stackTrace,
                Source = "client",
            };
            BackgroundQueue.TryEnqueue((services, ct) =>
                services.GetRequiredService<IErrorReportingService>().ReportAsync(errorReport, ct));
        }

        return Accepted();
    }
}
