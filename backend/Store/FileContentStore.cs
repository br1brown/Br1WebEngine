using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Backend.Models;
using Backend.Models.Legal;
using Backend.Infrastructure;
using Microsoft.Extensions.Configuration;

namespace Backend.Infrastructure;

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
    private readonly ConcurrentDictionary<string, string> _fileCache = new();
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
    /// <param name="configuration">
    /// Configurazione dell'applicazione usata per estrarre le lingue supportate.
    /// </param>
    public FileContentStore(IWebHostEnvironment env, IConfiguration configuration)
    {
        _dataPath = Path.Combine(env.ContentRootPath, "data");
        _jsonOptions.Converters.Add(new JsonStringEnumConverter());

        // Si legge unicamente dalla configurazione, nessun fallback statico sull'italiano "it".
        var langCodes = configuration.GetSection("Localization:SupportedLanguages").Get<string[]>()
            ?? throw new InvalidOperationException("Configurazione mancante: 'Localization:SupportedLanguages' è obbligatorio.");

        _supportedLanguages = new HashSet<string>(langCodes.Select(l => l.ToLowerInvariant()), StringComparer.OrdinalIgnoreCase);

        // Si legge unicamente dalla configurazione.
        _defaultLanguage = configuration["Localization:DefaultLanguage"]
            ?? throw new InvalidOperationException("Configurazione mancante: 'Localization:DefaultLanguage' è obbligatorio.");
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
        var json = await ReadStaticFileAsync("irl");
        return new LocalizedJsonDeserializer(_defaultLanguage).Deserialize<UniversalLegalModel>(json, language, _supportedLanguages);
    }

    /// <summary>
    /// Recupera la configurazione completa dei social dal file <c>social.json</c>.
    /// </summary>
    /// <returns>
    /// Una mappa nome-URL pronta per essere filtrata o esposta dai servizi applicativi.
    /// </returns>
    public async Task<Dictionary<string, string>> GetSocialAsync()
    {
        var json = await ReadStaticFileAsync("social");
        return JsonSerializer.Deserialize<Dictionary<string, string>>(json, _jsonOptions)
            ?? throw new DecodingException();
    }

    /// <summary>
    /// Legge il contenuto testuale di un file JSON dalla cartella dati, con cache in memoria.
    /// </summary>
    /// <remarks>
    /// Il risultato viene memorizzato al primo accesso e riutilizzato per tutta la vita del processo.
    /// Le classi derivate possono chiamare questo metodo per aggiungere nuovi file JSON
    /// senza dover reimplementare la logica di caching.
    /// </remarks>
    /// <param name="name">Nome logico del file senza estensione, ad esempio <c>social</c> o <c>irl</c>.</param>
    /// <returns>Il contenuto completo del file richiesto.</returns>
    /// <exception cref="NotFoundException">
    /// Sollevata quando il file richiesto non esiste nella cartella <c>data</c>.
    /// </exception>
    private async Task<string> ReadStaticFileAsync(string name)
    {
        if (_fileCache.TryGetValue(name, out var cached))
            return cached;

        var filePath = Path.Combine(_dataPath, $"{name}.json");
        if (!File.Exists(filePath))
            throw new NotFoundException(name);

        var content = await File.ReadAllTextAsync(filePath);
        _fileCache.TryAdd(name, content);
        return content;
    }

    /// <summary>
    /// Risolve strutture JSON localizzate del tipo <c>{ "it": ..., "en": ... }</c>.
    /// </summary>
    /// <remarks>
    /// Le regole sono sempre le stesse:
    /// scegliere la lingua richiesta quando disponibile, ripiegare su una lingua di fallback
    /// e scartare nodi vuoti per evitare di serializzare oggetti o array privi di contenuto utile.
    /// </remarks>
    private class LocalizedJsonDeserializer
    {
        private readonly string _defaultLanguage;
        public LocalizedJsonDeserializer(string defaultLanguage)
        {
            _defaultLanguage = defaultLanguage;
        }

        private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

        /// <summary>
        /// Converte un JSON localizzato in un modello .NET gia' risolto nella lingua effettiva.
        /// </summary>
        /// <typeparam name="T">Tipo finale in cui deserializzare il documento risolto.</typeparam>
        /// <param name="json">Contenuto JSON sorgente.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="supportedLanguages">Set delle lingue supportate dal sistema.</param>
        /// <returns>Un'istanza del modello richiesto con soli campi utili e localizzati.</returns>
        public T Deserialize<T>(string json, string language, HashSet<string> supportedLanguages)
            where T : class
        {
            var root = JsonNode.Parse(json) ?? throw new DecodingException();
            var resolved = this.ResolveNode(root, NormalizeLanguage(language), supportedLanguages);

            return resolved?.Deserialize<T>(JsonOptions) ?? throw new DecodingException();
        }

        /// <summary>
        /// Normalizza una lingua in un codice a due lettere compatibile con i file del template.
        /// </summary>
        /// <param name="language">Valore sorgente, ad esempio <c>it-IT,it;q=0.9</c>.</param>
        /// <returns>Il codice lingua normalizzato, ad esempio <c>it</c> o <c>en</c>.</returns>
        private string NormalizeLanguage(string? language)
        {
            if (string.IsNullOrWhiteSpace(language))
                return this._defaultLanguage;

            // Un header Accept-Language tipico ha questo formato:
            //   "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7"
            //
            // Passo 1 — Split(',')[0] → prende solo la prima preferenza: "it-IT"
            //           (l'utente indica la più desiderata per prima)
            // Passo 2 — Trim()        → rimuove spazi accidentali attorno al tag
            // Passo 3 — Split('-')[0] → estrae solo il codice lingua, senza il paese: "it"
            //           (i file JSON usano chiavi brevi "it"/"en", non "it-IT"/"en-US")
            // Passo 4 — Trim()        → sicurezza extra per spazi residui
            // Passo 5 — ToLowerInvariant() → normalizza al minuscolo per il confronto con le chiavi JSON
            var normalized = language.Split(',')[0].Trim().Split('-')[0].Trim().ToLowerInvariant();

            // Accetta il codice solo se è esattamente a 2 caratteri (es. "it", "en", "fr").
            // Valori anomali come stringhe vuote o tag non standard cadono sul fallback.
            return normalized.Length == 2 ? normalized : this._defaultLanguage;
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
        /// <param name="supportedLanguages">Set delle lingue supportate dal sistema.</param>
        /// <returns>Una copia del nodo risolto oppure <see langword="null"/> se il nodo e' vuoto.</returns>
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

        /// <summary>
        /// Risolve un oggetto JSON applicando la localizzazione solo quando l'oggetto rappresenta un dizionario lingua-valore.
        /// </summary>
        /// <param name="obj">Oggetto da analizzare.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="supportedLanguages">Set delle lingue supportate dal sistema.</param>
        /// <returns>
        /// Un nuovo oggetto contenente soltanto i campi significativi, oppure <see langword="null"/> se l'oggetto si svuota.
        /// </returns>
        private JsonNode? ResolveObject(JsonObject obj, string language, HashSet<string> supportedLanguages)
        {
            // CASO 1 — L'oggetto è un dizionario lingua→valore puro (es. { "it": "Ciao", "en": "Hello" }).
            // TryResolveLocalizedObject sceglie il ramo corretto e lo restituisce come nodo singolo.
            // Poi si chiama ricorsivamente ResolveNode sul valore scelto: quel valore potrebbe a sua
            // volta contenere oggetti localizzati annidati, quindi deve essere risolto allo stesso modo.
            if (TryResolveLocalizedObject(obj, language, supportedLanguages, out var localizedValue))
                return ResolveNode(localizedValue, language, supportedLanguages);

            // CASO 2 — L'oggetto ha chiavi di dominio normali (es. "name", "url", "items").
            // Si costruisce un nuovo oggetto copiando solo i campi che sopravvivono alla localizzazione.
            var resolvedObject = new JsonObject();

            foreach (var (key, value) in obj)
            {
                // Risolve ogni campo figlio ricorsivamente (potrebbe contenere blocchi i18n annidati).
                var resolvedValue = ResolveNode(value, language, supportedLanguages);

                // Se il campo è diventato vuoto dopo la risoluzione (stringa "", array [],
                // oggetto {} o null), viene saltato: non ha senso serializzarlo nel modello finale.
                if (IsEmptyNode(resolvedValue))
                    continue;

                resolvedObject[key] = resolvedValue;
            }

            // Se tutti i campi erano vuoti, l'oggetto intero non porta informazione utile:
            // si restituisce null in modo che il chiamante possa scartarlo.
            return resolvedObject.Count == 0 ? null : resolvedObject;
        }

        /// <summary>
        /// Risolve tutti gli elementi di un array JSON scartando quelli che diventano vuoti dopo la localizzazione.
        /// </summary>
        /// <param name="array">Array da processare.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="supportedLanguages">Set delle lingue supportate dal sistema.</param>
        /// <returns>Un nuovo array filtrato oppure <see langword="null"/> se tutti gli elementi risultano vuoti.</returns>
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

        /// <summary>
        /// Verifica se un oggetto rappresenta una struttura localizzata pura e ne estrae il valore migliore.
        /// </summary>
        /// <param name="obj">Oggetto da verificare.</param>
        /// <param name="language">Lingua richiesta.</param>
        /// <param name="supportedLanguages">Set delle lingue supportate dal sistema.</param>
        /// <param name="localizedValue">
        /// Valore selezionato secondo l'ordine: lingua richiesta, default, primo valore non vuoto.
        /// </param>
        /// <returns>
        /// <see langword="true"/> se l'oggetto contiene solo chiavi lingua e puo' quindi essere trattato come localizzato.
        /// </returns>
        private bool TryResolveLocalizedObject(
            JsonObject obj,
            string language,
            HashSet<string> supportedLanguages,
            out JsonNode? localizedValue)
        {
            localizedValue = null;

            // Controlla se l'oggetto è un dizionario lingua→valore puro.
            // Condizioni di esclusione (= non è un oggetto localizzato):
            // - L'oggetto è vuoto: nessuna chiave da analizzare.
            // - Almeno una chiave non ha il formato lingua supportata (es. "fr" se non supportato, o "name", "url"):
            //   significa che è un oggetto normale del dominio, non un blocco i18n.
            // In entrambi i casi si restituisce false e il chiamante elabora l'oggetto normalmente.
            if (obj.Count == 0 || obj.Any(property => !IsLanguageKey(property.Key, supportedLanguages)))
                return false;

            // Arrivati qui, tutte le chiavi sono tag lingua (es. "it", "en").
            // Sceglie il valore più adatto con priorità decrescente:
            //   1. obj[language]         → lingua richiesta (es. "it"): caso ideale.
            //   2. obj[_defaultLanguage] → lingua di riserva (es. "it"): se la richiesta non c'è.
            //   3. FirstOrDefault(...)   → primo valore non vuoto trovato: ultimo tentativo
            //                             quando nemmeno il default è presente nel file.
            // L'operatore ?? cortocircuita: se il primo non è null si usa quello.
            localizedValue =
                obj[language]
                ?? obj[this._defaultLanguage]
                ?? obj.FirstOrDefault(property => !IsEmptyNode(property.Value)).Value;

            return true;
        }

        /// <summary>
        /// Determina se una chiave ha il formato atteso per un codice lingua semplice o lingua-paese.
        /// </summary>
        /// <param name="key">Chiave da verificare.</param>
        /// <param name="supportedLanguages">Set delle lingue supportate dal sistema.</param>
        /// <returns>
        /// <see langword="true"/> se la lingua principale fa parte delle lingue supportate dell'app.
        /// </returns>
        private bool IsLanguageKey(string key, HashSet<string> supportedLanguages)
        {
            // Divide la chiave sul trattino, ignorando parti vuote e spazi.
            // Esempi: "it" → ["it"]   |   "it-IT" → ["it", "IT"]   |   "name" → ["name"]
            var parts = key.Split('-', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            if (parts.Length == 0)
                return false;

            // Consideriamo la lingua principale (es. "it" da "it-IT").
            // Se la lingua base fa parte delle lingue supportate dall'applicazione, allora è considerata una chiave di traduzione.
            var baseLang = parts[0].ToLowerInvariant();
            return supportedLanguages.Contains(baseLang);
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
