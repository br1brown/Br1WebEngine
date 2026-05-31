namespace Backend.Models.Configuration;

/// <summary>
/// Raccoglie la configurazione OpenTelemetry letta da <c>global-settings.json</c>.
/// </summary>
/// <remarks>
/// Se <see cref="Endpoint"/> è vuoto, la telemetria non viene attivata
/// e l'app funziona senza alcuna dipendenza esterna di osservabilità.
/// </remarks>
public class OpenTelemetryOptions
{
    /// <summary>URL del collector OTLP (es. "http://jaeger:4318"). Vuoto = disabilitato.</summary>
    public string Endpoint { get; set; } = "";

    /// <summary>Nome del servizio riportato nelle trace (es. "backend").</summary>
    public string ServiceName { get; set; } = "backend";

    /// <summary>Versione del servizio riportata nelle trace (es. "1.0.0").</summary>
    public string ServiceVersion { get; set; } = "1.0.0";
}
