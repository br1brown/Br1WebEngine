using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Br1WebEngine.Models;
using Br1WebEngine.Models.Legal;

namespace Br1WebEngine.Infrastructure;

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
    public FileContentStore(IWebHostEnvironment env)
    {
        _dataPath = Path.Combine(env.ContentRootPath, "data");
        _jsonOptions.Converters.Add(new JsonStringEnumConverter());
    }

    /// <summary>
    /// Recupera il profilo legale localizzato e lo arricchisce con i social principali del template.
    /// </summary>
    /// <param name="language">
    /// Lingua richiesta dal livello applicativo, tipicamente derivata da <c>Accept-Language</c>.
    /// </param>
    /// <returns>
    /// Un <see cref="UniversalLegalModel"/> con i campi localizzati risolti e la sezione social valorizzata.
    /// </returns>
    /// <remarks>
    /// Il file <c>irl.json</c> puo' contenere oggetti localizzati del tipo <c>{ "it": ..., "en": ... }</c>.
    /// La risoluzione effettiva e' delegata a <see cref="LocalizedJsonDeserializer"/>.
    /// </remarks>
    public async Task<UniversalLegalModel> GetProfileAsync(string language)
    {
        var socialPrincipali = new List<string>
        {
            "linkedin",
            "whatsapp",
            "facebook",
        };

        var json = await ReadFileAsync("irl");
        var profile = LocalizedJsonDeserializer.Deserialize<UniversalLegalModel>(json, language, "it");
        var social = await GetSocialAsync();

        profile.Social = social
            .Where(item => socialPrincipali.Contains(item.Key))
            .ToDictionary();

        return profile;
    }

    /// <summary>
    /// Recupera la configurazione completa dei social dal file <c>social.json</c>.
    /// </summary>
    /// <returns>
    /// Una mappa nome-URL pronta per essere filtrata o esposta dai servizi applicativi.
    /// </returns>
    public async Task<Dictionary<string, string>> GetSocialAsync()
    {
        var json = await ReadFileAsync("social");
        return JsonSerializer.Deserialize<Dictionary<string, string>>(json, _jsonOptions)
            ?? throw new DecodingException();
    }

    /// <summary>
    /// Legge il contenuto testuale di un file JSON dalla cartella dati.
    /// </summary>
    /// <param name="name">Nome logico del file senza estensione, ad esempio <c>social</c> o <c>irl</c>.</param>
    /// <returns>Il contenuto completo del file richiesto.</returns>
    /// <exception cref="NotFoundException">
    /// Sollevata quando il file richiesto non esiste nella cartella <c>data</c>.
    /// </exception>
    private async Task<string> ReadFileAsync(string name)
    {
        var filePath = Path.Combine(_dataPath, $"{name}.json");
        if (!File.Exists(filePath))
            throw new NotFoundException(name);

        return await File.ReadAllTextAsync(filePath);
    }

    /// <summary>
    /// Risolve strutture JSON localizzate del tipo <c>{ "it": ..., "en": ... }</c>.
    /// </summary>
    /// <remarks>
    /// Le regole sono sempre le stesse:
    /// scegliere la lingua richiesta quando disponibile, ripiegare su una lingua di fallback
    /// e scartare nodi vuoti per evitare di serializzare oggetti o array privi di contenuto utile.
    /// </remarks>
    private static class LocalizedJsonDeserializer
    {
        private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

        /// <summary>
        /// Converte un JSON localizzato in un modello .NET gia' risolto nella lingua effettiva.
        /// </summary>
        /// <typeparam name="T">Tipo finale in cui deserializzare il documento risolto.</typeparam>
        /// <param name="json">Contenuto JSON sorgente.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="fallbackLanguage">Lingua di riserva da usare se quella richiesta non e' disponibile.</param>
        /// <returns>Un'istanza del modello richiesto con soli campi utili e localizzati.</returns>
        public static T Deserialize<T>(string json, string language, string fallbackLanguage = "it")
            where T : class
        {
            var root = JsonNode.Parse(json) ?? throw new DecodingException();
            var resolved = ResolveNode(root, NormalizeLanguage(language), NormalizeLanguage(fallbackLanguage));

            return resolved?.Deserialize<T>(JsonOptions) ?? throw new DecodingException();
        }

        /// <summary>
        /// Normalizza una lingua in un codice a due lettere compatibile con i file del template.
        /// </summary>
        /// <param name="language">Valore sorgente, ad esempio <c>it-IT,it;q=0.9</c>.</param>
        /// <param name="fallback">Valore da usare se l'input non e' valido.</param>
        /// <returns>Il codice lingua normalizzato, ad esempio <c>it</c> o <c>en</c>.</returns>
        private static string NormalizeLanguage(string? language, string fallback = "it")
        {
            if (string.IsNullOrWhiteSpace(language))
                return fallback;

            var normalized = language.Split(',')[0].Trim().Split('-')[0].Trim().ToLowerInvariant();
            return normalized.Length == 2 ? normalized : fallback;
        }

        /// <summary>
        /// Crea le opzioni JSON condivise per la deserializzazione dei modelli localizzati.
        /// </summary>
        /// <returns>Un set di opzioni coerente con il resto dell'applicazione.</returns>
        private static JsonSerializerOptions CreateJsonOptions()
        {
            var options = new JsonSerializerOptions(JsonSerializerDefaults.Web)
            {
                WriteIndented = true
            };

            options.Converters.Add(new JsonStringEnumConverter());
            return options;
        }

        /// <summary>
        /// Risolve ricorsivamente un nodo JSON scegliendo il ramo localizzato corretto.
        /// </summary>
        /// <param name="node">Nodo da risolvere.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="fallbackLanguage">Lingua di fallback.</param>
        /// <returns>Una copia del nodo risolto oppure <see langword="null"/> se il nodo e' vuoto.</returns>
        private static JsonNode? ResolveNode(JsonNode? node, string language, string fallbackLanguage)
        {
            return node switch
            {
                null => null,
                JsonObject obj => ResolveObject(obj, language, fallbackLanguage),
                JsonArray array => ResolveArray(array, language, fallbackLanguage),
                JsonValue value => IsEmptyValue(value) ? null : value.DeepClone(),
                _ => node.DeepClone()
            };
        }

        /// <summary>
        /// Risolve un oggetto JSON applicando la localizzazione solo quando l'oggetto rappresenta un dizionario lingua-valore.
        /// </summary>
        /// <param name="obj">Oggetto da analizzare.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="fallbackLanguage">Lingua di fallback.</param>
        /// <returns>
        /// Un nuovo oggetto contenente soltanto i campi significativi, oppure <see langword="null"/> se l'oggetto si svuota.
        /// </returns>
        private static JsonNode? ResolveObject(JsonObject obj, string language, string fallbackLanguage)
        {
            if (TryResolveLocalizedObject(obj, language, fallbackLanguage, out var localizedValue))
                return ResolveNode(localizedValue, language, fallbackLanguage);

            var resolvedObject = new JsonObject();

            foreach (var (key, value) in obj)
            {
                var resolvedValue = ResolveNode(value, language, fallbackLanguage);
                if (IsEmptyNode(resolvedValue))
                    continue;

                resolvedObject[key] = resolvedValue;
            }

            return resolvedObject.Count == 0 ? null : resolvedObject;
        }

        /// <summary>
        /// Risolve tutti gli elementi di un array JSON scartando quelli che diventano vuoti dopo la localizzazione.
        /// </summary>
        /// <param name="array">Array da processare.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="fallbackLanguage">Lingua di fallback.</param>
        /// <returns>Un nuovo array filtrato oppure <see langword="null"/> se tutti gli elementi risultano vuoti.</returns>
        private static JsonNode? ResolveArray(JsonArray array, string language, string fallbackLanguage)
        {
            var resolvedArray = new JsonArray();

            foreach (var item in array)
            {
                var resolvedItem = ResolveNode(item, language, fallbackLanguage);
                if (IsEmptyNode(resolvedItem))
                    continue;

                resolvedArray.Add(resolvedItem);
            }

            return resolvedArray.Count == 0 ? null : resolvedArray;
        }

        /// <summary>
        /// Verifica se un oggetto rappresenta una struttura localizzata pura e ne estrae il valore migliore.
        /// </summary>
        /// <param name="obj">Oggetto da verificare.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="fallbackLanguage">Lingua di fallback.</param>
        /// <param name="localizedValue">
        /// Valore selezionato secondo l'ordine: lingua richiesta, fallback, primo valore non vuoto.
        /// </param>
        /// <returns>
        /// <see langword="true"/> se l'oggetto contiene solo chiavi lingua e puo' quindi essere trattato come localizzato.
        /// </returns>
        private static bool TryResolveLocalizedObject(
            JsonObject obj,
            string language,
            string fallbackLanguage,
            out JsonNode? localizedValue)
        {
            localizedValue = null;

            if (obj.Count == 0 || obj.Any(property => !IsLanguageKey(property.Key)))
                return false;

            localizedValue =
                obj[language]
                ?? obj[fallbackLanguage]
                ?? obj.FirstOrDefault(property => !IsEmptyNode(property.Value)).Value;

            return true;
        }

        /// <summary>
        /// Determina se una chiave ha il formato atteso per un codice lingua semplice o lingua-paese.
        /// </summary>
        /// <param name="key">Chiave da verificare.</param>
        /// <returns>
        /// <see langword="true"/> per valori come <c>it</c>, <c>en</c>, <c>it-IT</c> o <c>en-US</c>.
        /// </returns>
        private static bool IsLanguageKey(string key)
        {
            var parts = key.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            return parts.Length switch
            {
                1 => parts[0].Length == 2 && parts[0].All(char.IsLetter),
                2 => parts[0].Length == 2 && parts[1].Length == 2 && parts.All(part => part.All(char.IsLetter)),
                _ => false
            };
        }

        /// <summary>
        /// Determina se un nodo e' nullo oppure privo di contenuto utile dopo la risoluzione.
        /// </summary>
        /// <param name="node">Nodo da verificare.</param>
        /// <returns><see langword="true"/> quando il nodo va scartato dal documento finale.</returns>
        private static bool IsEmptyNode(JsonNode? node)
        {
            return node switch
            {
                null => true,
                JsonObject obj => obj.Count == 0,
                JsonArray array => array.Count == 0,
                JsonValue value => IsEmptyValue(value),
                _ => false
            };
        }

        /// <summary>
        /// Determina se un valore JSON testuale e' vuoto o composto solo da spazi.
        /// </summary>
        /// <param name="value">Valore da controllare.</param>
        /// <returns><see langword="true"/> se il valore deve essere considerato assente.</returns>
        private static bool IsEmptyValue(JsonValue value)
        {
            return value.TryGetValue<string>(out var text) && string.IsNullOrWhiteSpace(text);
        }
    }
}
