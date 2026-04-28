using System.Globalization;
using Backend.Infrastructure;
using Backend.Models.Legal;

namespace Backend.Services;

/// <summary>
/// Raccoglie i casi d'uso applicativi del sito esposti dalle API pubbliche.
/// </summary>
/// <remarks>
/// Il servizio orchestra logica di dominio leggera sopra <see cref="IContentStore"/>:
/// filtri, scelta della lingua corrente e arricchimento dei modelli restituiti.
/// Non conosce il dettaglio dello storage e per questo non dipende da file, database o provider esterni.
/// </remarks>
public class SiteService
{
    private readonly IContentStore _store;

    /// <summary>
    /// Inizializza il servizio con lo store da usare per leggere i contenuti del sito.
    /// </summary>
    /// <param name="store">Astrazione di persistenza da cui recuperare contenuti e metadati.</param>
    public SiteService(IContentStore store)
    {
        _store = store;
    }

    /// <summary>
    /// Recupera i social configurati e li filtra opzionalmente per nome.
    /// </summary>
    /// <param name="nomi">
    /// Elenco opzionale dei nomi logici da mantenere.
    /// Se nullo o vuoto, il metodo restituisce tutti i social disponibili.
    /// </param>
    /// <returns>Una mappa nome-URL contenente tutti i social o solo quelli richiesti.</returns>
    /// <remarks>
    /// Il filtro e' case-insensitive, quindi richieste come <c>Facebook</c> e <c>facebook</c>
    /// vengono trattate come equivalenti.
    /// </remarks>
    public async Task<Dictionary<string, string>> GetSocialAsync(string[]? nomi = null)
    {
        var data = await _store.GetSocialAsync();

        if (nomi == null || nomi.Length == 0)
            return data;

        var filtro = nomi
            .Select(n => n.ToLowerInvariant())
            .ToHashSet();

        return data
            .Where(kv => filtro.Contains(kv.Key.ToLowerInvariant()))
            .ToDictionary(kv => kv.Key, kv => kv.Value);
    }

    /// <summary>
    /// Recupera il profilo aziendale nella lingua corrente dell'applicazione,
    /// arricchito con i social principali.
    /// </summary>
    /// <returns>
    /// Un <see cref="UniversalLegalModel"/> localizzato con la sezione social valorizzata.
    /// </returns>
    /// <remarks>
    /// La lingua effettiva viene presa da <see cref="CultureInfo.CurrentCulture"/>.
    /// </remarks>
    public async Task<UniversalLegalModel> GetProfileAsync()
    {
        var language = CultureInfo.CurrentCulture.TwoLetterISOLanguageName;
        var profile = await _store.GetProfileAsync(language);
        var social = await _store.GetSocialAsync();

        string[] principali = ["linkedin", "whatsapp", "facebook"];
        profile.Social = social
            .Where(kv => principali.Contains(kv.Key, StringComparer.OrdinalIgnoreCase))
            .ToDictionary(kv => kv.Key, kv => kv.Value);

        return profile;
    }
}
