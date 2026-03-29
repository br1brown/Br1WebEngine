using Br1WebEngine.Models.Legal;

namespace Br1WebEngine.Infrastructure;

/// <summary>
/// Definisce il contratto di accesso ai contenuti persistenti del sito.
/// </summary>
/// <remarks>
/// L'obiettivo dell'interfaccia e' isolare il resto del backend dal tipo di storage usato.
/// e i controller dipendono soltanto da questo contratto.
/// </remarks>
public interface IContentStore
{
    /// <summary>
    /// Recupera il profilo legale dell'organizzazione nella lingua richiesta.
    /// </summary>
    /// <param name="language">
    /// Codice lingua da usare per la risoluzione dei campi localizzati, ad esempio <c>it</c> o <c>en</c>.
    /// </param>
    /// <returns>
    /// Un modello legale completo, gia' risolto nella lingua richiesta e pronto per essere esposto dall'API.
    /// </returns>
    Task<UniversalLegalModel> GetProfileAsync(string language);

    /// <summary>
    /// Recupera i link ai social network configurati per il sito.
    /// </summary>
    /// <returns>
    /// Una mappa in cui la chiave rappresenta il nome logico del social e il valore l'URL finale da esporre.
    /// </returns>
    Task<Dictionary<string, string>> GetSocialAsync();
}
