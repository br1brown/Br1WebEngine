using System.Net.Http.Json;
using Microsoft.Extensions.Options;
using Backend.Models.Configuration;

namespace Backend.Diagnostics;

/// <summary>
/// Implementazione di riferimento di <see cref="IErrorReportingService"/>: un <c>POST</c> JSON
/// verso <see cref="ErrorReportingOptions.WebhookUrl"/>, via <see cref="HttpClient"/> tipizzato
/// (<c>IHttpClientFactory</c>, stesso schema del mailer — nessun pacchetto NuGet aggiuntivo, solo BCL).
/// </summary>
internal sealed class EngineErrorReporting : IErrorReportingService
{
    private readonly HttpClient _http;
    private readonly ErrorReportingOptions _options;
    private readonly ILogger<EngineErrorReporting> _logger;
    private readonly string _projectName;

    /// <summary>Inietta l'HttpClient tipizzato, le opzioni, il logger e legge <c>project.name</c>.</summary>
    public EngineErrorReporting(HttpClient http, IOptions<ErrorReportingOptions> options, ILogger<EngineErrorReporting> logger, IConfiguration configuration)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
        // Letto una volta sola: project.name non cambia a runtime. Serve a distinguere la
        // provenienza quando più progetti sulla stessa VPS puntano allo STESSO webhook (es. un solo
        // Sentry/relay condiviso invece di uno per progetto) — senza, i loro errori arriverebbero
        // indistinguibili sullo stesso canale.
        _projectName = configuration["project:name"] ?? "App";
    }

    /// <inheritdoc />
    public bool IsEnabled => _options.IsConfigured;

    /// <inheritdoc />
    public async Task ReportAsync(ErrorReport report, CancellationToken cancellationToken = default)
    {
        if (!_options.IsConfigured)
            return;

        try
        {
            // Stack trace troncato: un payload troppo grande rischia di essere scartato da webhook
            // con limiti di dimensione (es. Slack/Discord dietro un proxy di formattazione).
            var stackTrace = report.StackTrace;
            if (stackTrace is { Length: > 4000 })
                stackTrace = stackTrace[..4000] + "\n… (troncato)";

            var payload = new
            {
                project = _projectName,
                source = report.Source,
                message = report.Message,
                exceptionType = report.ExceptionType,
                statusCode = report.StatusCode,
                path = report.Path,
                method = report.Method,
                stackTrace,
                timestamp = DateTimeOffset.UtcNow,
            };

            var response = await _http.PostAsJsonAsync(_options.WebhookUrl, payload, cancellationToken);
            if (!response.IsSuccessStatusCode)
                _logger.LogWarning("Webhook di error reporting ha risposto {StatusCode}.", (int)response.StatusCode);
        }
        catch (OperationCanceledException)
        {
            // Shutdown in corso: non è un errore del webhook.
        }
        catch (Exception ex)
        {
            // Isolamento garantito: il fallimento della segnalazione di un errore viene 
            // soppresso per evitare crash a catena nel task in background.
            _logger.LogWarning(ex, "Invio della segnalazione errore al webhook fallito.");
        }
    }
}
