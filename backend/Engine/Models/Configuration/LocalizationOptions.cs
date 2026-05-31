namespace Backend.Models.Configuration;

/// <summary>
/// Raccoglie la configurazione di localizzazione letta da <c>global-settings.json</c>.
/// </summary>
public class LocalizationOptions
{
    /// <summary>Lingua predefinita dell'applicazione (codice BCP-47, es. "it").</summary>
    public string DefaultLanguage { get; set; } = "it";

    /// <summary>Elenco delle lingue supportate (codici BCP-47, es. ["it", "en"]).</summary>
    public string[] SupportedLanguages { get; set; } = ["it", "en"];
}
