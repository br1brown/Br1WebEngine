using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using Backend.Models;
using Microsoft.Extensions.Caching.Memory;

namespace Backend.Engine;

/// <summary>
/// Utilità statiche per la lettura e la deserializzazione dei file JSON nella cartella <c>data/</c>.
/// </summary>
/// <remarks>
/// Raggruppa due collaboratori usati dal livello store:
/// <see cref="ReadStaticFileAsync"/> per la lettura con cache, e
/// <see cref="LocalizedJsonDeserializer"/> per la risoluzione dei campi i18n.
/// </remarks>
public static class FileUtils
{
    /// <summary>
    /// Legge il contenuto testuale di un file JSON dalla cartella dati, con cache in memoria.
    /// </summary>
    public static async Task<string> ReadStaticFileAsync(string name, string dataPath, IMemoryCache cache, TimeSpan? cacheDuration = null, bool forceReload = false, CancellationToken cancellationToken = default)
    {
        // Se è richiesta l'invalidazione, espelliamo fisicamente la chiave dalla cache.
        if (forceReload)
        {
            cache.Remove(name);
        }

        var content = await cache.GetOrCreateAsync(name, async entry =>
        {
            // Imposta la scadenza desiderata (es. 1 ora)
            entry.AbsoluteExpirationRelativeToNow = cacheDuration ?? TimeSpan.FromHours(1);

            var filePath = Path.Combine(dataPath, $"{name}.json");
            try
            {
                return await File.ReadAllTextAsync(filePath, cancellationToken);
            }
            // File assente ⇒ FileNotFoundException; se manca l'intera cartella dati (dato non
            // configurato affatto, caso legittimo) ⇒ DirectoryNotFoundException, che NON deriva da
            // FileNotFoundException. Entrambi sono "risorsa non trovata": mappati a NotFoundException,
            // così chi legge (es. l'identità) può tradurli in `null` invece di far filtrare un 500.
            catch (Exception ex) when (ex is FileNotFoundException or DirectoryNotFoundException)
            {
                throw new NotFoundException(name);
            }
        });

        return content!;
    }
    /// <summary>
    /// Risolve ricorsivamente strutture JSON localizzate del tipo <c>{ "it": ..., "en": ... }</c>,
    /// restituendo un albero JSON già "appiattito" nella lingua richiesta.
    /// </summary>
    /// <remarks>
    /// Un oggetto è considerato un blocco i18n solo se tutte le sue chiavi sono tag lingua
    /// riconosciuti da <see cref="System.Globalization.CultureInfo"/> e presenti in
    /// <c>supportedLanguages</c>. Se anche una sola chiave è un campo di dominio, l'oggetto
    /// viene attraversato ricorsivamente senza collassarlo.
    /// I valori vuoti (stringa, array o oggetto vuoto) vengono eliminati dal risultato.
    /// </remarks>
    public class LocalizedJsonDeserializer
    {
        private readonly string _defaultLanguage;

        /// <param name="defaultLanguage">
        /// Tag lingua a due lettere (BCP-47) da usare come fallback quando la lingua
        /// richiesta non è disponibile nell'oggetto JSON.
        /// </param>
        public LocalizedJsonDeserializer(string defaultLanguage)
        {
            _defaultLanguage = defaultLanguage;
        }

        /// <summary>
        /// Converte un JSON localizzato in un modello .NET gia' risolto nella lingua effettiva.
        /// </summary>
        public T Deserialize<T>(string json, string language, HashSet<string> supportedLanguages)
            where T : class
        {
            var root = JsonNode.Parse(json) ?? throw new DecodingException();
            var resolved = ResolveNode(root, NormalizeLanguage(language), supportedLanguages);

            return resolved?.Deserialize<T>(EngineJson.Web) ?? throw new DecodingException();
        }

        private string NormalizeLanguage(string? language)
        {
            if (string.IsNullOrWhiteSpace(language))
                return _defaultLanguage;

            var first = language.Split(',')[0].Trim().Split(';')[0].Trim();

            try
            {
                return CultureInfo.GetCultureInfo(first).TwoLetterISOLanguageName;
            }
            catch (CultureNotFoundException)
            {
                return _defaultLanguage;
            }
        }

        private JsonNode? ResolveNode(JsonNode? node, string language, HashSet<string> supportedLanguages)
        {
            return node switch
            {
                null => null,
                JsonObject obj => ResolveObject(obj, language, supportedLanguages),
                JsonArray array => ResolveArray(array, language, supportedLanguages),
                JsonValue value => IsEmptyValue(value) ? null : value.DeepClone(),
                _ => node.DeepClone()
            };
        }

        private JsonNode? ResolveObject(JsonObject obj, string language, HashSet<string> supportedLanguages)
        {
            if (TryResolveLocalizedObject(obj, language, supportedLanguages, out var localizedValue))
                return ResolveNode(localizedValue, language, supportedLanguages);

            var resolvedObject = new JsonObject();

            foreach (var (key, value) in obj)
            {
                var resolvedValue = ResolveNode(value, language, supportedLanguages);

                if (IsEmptyNode(resolvedValue))
                    continue;

                resolvedObject[key] = resolvedValue;
            }

            return resolvedObject.Count == 0 ? null : resolvedObject;
        }

        private JsonNode? ResolveArray(JsonArray array, string language, HashSet<string> supportedLanguages)
        {
            var resolvedArray = new JsonArray();

            foreach (var item in array)
            {
                var resolvedItem = ResolveNode(item, language, supportedLanguages);
                if (IsEmptyNode(resolvedItem))
                    continue;

                resolvedArray.Add(resolvedItem);
            }

            return resolvedArray.Count == 0 ? null : resolvedArray;
        }

        private bool TryResolveLocalizedObject(
            JsonObject obj,
            string language,
            HashSet<string> supportedLanguages,
            out JsonNode? localizedValue)
        {
            localizedValue = null;

            if (obj.Count == 0 || obj.Any(property => !IsLanguageKey(property.Key, supportedLanguages)))
                return false;

            localizedValue =
                obj[language]
                ?? obj[_defaultLanguage]
                ?? obj.FirstOrDefault(property => !IsEmptyNode(property.Value)).Value;

            return true;
        }

        private static bool IsLanguageKey(string key, HashSet<string> supportedLanguages)
        {
            if (string.IsNullOrWhiteSpace(key))
                return false;

            try
            {
                var baseLang = CultureInfo.GetCultureInfo(key).TwoLetterISOLanguageName;
                return supportedLanguages.Contains(baseLang);
            }
            catch (CultureNotFoundException)
            {
                return false;
            }
        }

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

        private static bool IsEmptyValue(JsonValue value)
        {
            return value.TryGetValue<string>(out var text) && string.IsNullOrWhiteSpace(text);
        }
    }
}
