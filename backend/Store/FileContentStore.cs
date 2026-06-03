using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Backend.Models;
using Backend.Models.Configuration;
using Backend.Models.Legal;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Caching.Memory;
using Backend.Engine;

namespace Backend.Store;

/// <summary>
/// Implementa <see cref="IContentStore"/> leggendo i contenuti da file JSON nella cartella <c>data/</c>.
/// </summary>
/// <remarks>
/// Questa implementazione centralizza due responsabilita':
/// la lettura fisica dei file e la risoluzione dei campi localizzati presenti nei JSON.
/// In questo modo controller e servizi restano indipendenti dal formato di persistenza.
/// </remarks>
public class FileContentStore : IContentStore
{
    private readonly string _dataPath;
    private readonly IMemoryCache _cache;
    private readonly HashSet<string> _supportedLanguages;
    private readonly string _defaultLanguage;

    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    /// <summary>
    /// Inizializza lo store file-based partendo dalla root dell'applicazione ASP.NET.
    /// </summary>
    /// <param name="env">
    /// Ambiente host usato per ricavare il percorso assoluto della cartella <c>data</c>.
    /// </param>
    /// <param name="localizationOptions">
    /// Opzioni di localizzazione tipizzate (lingue supportate e lingua predefinita).
    /// </param>
    public FileContentStore(IWebHostEnvironment env, IOptions<LocalizationOptions> localizationOptions, IMemoryCache cache)
    {
        _cache = cache;
        _dataPath = Path.Combine(env.ContentRootPath, "data");
        _jsonOptions.Converters.Add(new JsonStringEnumConverter());

        var loc = localizationOptions.Value;

        // CultureInfo.GetCultureInfo valida ogni codice secondo lo standard BCP-47 e lancia
        // CultureNotFoundException al boot se un tag non è riconosciuto (es. "ita" invece di "it").
        // TwoLetterISOLanguageName normalizza tag complessi (es. "it-IT" → "it") per il confronto con le chiavi JSON.
        _supportedLanguages = new HashSet<string>(
            loc.SupportedLanguages.Select(l => CultureInfo.GetCultureInfo(l).TwoLetterISOLanguageName),
            StringComparer.OrdinalIgnoreCase);

        _defaultLanguage = CultureInfo.GetCultureInfo(loc.DefaultLanguage).TwoLetterISOLanguageName;
    }

    /// <summary>
    /// Recupera il profilo legale localizzato dal file <c>irl.json</c>.
    /// </summary>
    /// <param name="language">
    /// Lingua richiesta dal livello applicativo, tipicamente derivata da <c>Accept-Language</c>.
    /// </param>
    /// <returns>
    /// Un <see cref="UniversalLegalModel"/> con i campi localizzati risolti.
    /// L'arricchimento con i social e' responsabilita' del livello applicativo (<c>SiteService</c>),
    /// cosi' lo store resta pure-storage e non conosce regole di business.
    /// </returns>
    /// <remarks>
    /// Il file <c>irl.json</c> puo' contenere oggetti localizzati del tipo <c>{ "it": ..., "en": ... }</c>.
    /// La risoluzione effettiva e' delegata a <see cref="LocalizedJsonDeserializer"/>.
    /// </remarks>
    public async Task<UniversalLegalModel> GetProfileAsync(string language)
    {
        var json = await FileUtils.ReadStaticFileAsync("irl", _dataPath, _cache);
        return new FileUtils.LocalizedJsonDeserializer(_defaultLanguage).Deserialize<UniversalLegalModel>(json, language, _supportedLanguages);
    }

    /// <summary>
    /// Recupera la configurazione completa dei social dal file <c>social.json</c>.
    /// </summary>
    /// <returns>
    /// Una mappa nome-URL pronta per essere filtrata o esposta dai servizi applicativi.
    /// </returns>
    public async Task<Dictionary<string, string>> GetSocialAsync()
    {
        var json = await FileUtils.ReadStaticFileAsync("social", _dataPath, _cache);
        return JsonSerializer.Deserialize<Dictionary<string, string>>(json, _jsonOptions)
            ?? throw new DecodingException();
    }

}
