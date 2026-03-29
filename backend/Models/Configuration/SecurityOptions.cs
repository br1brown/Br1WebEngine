using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Br1WebEngine.Models.Configuration;

/// <summary>
/// Raccoglie tutta la configurazione di sicurezza letta da <c>appsettings.json</c>.
/// </summary>
public class SecurityOptions
{
    /// <summary>
    /// Elenco delle API key ammesse dal backend.
    /// </summary>
    public string[] ApiKeys { get; set; } = [];

    /// <summary>
    /// Elenco degli origin consentiti per CORS.
    /// Se vuoto, la policy risultante permette qualsiasi origin.
    /// </summary>
    public string[] CorsOrigins { get; set; } = [];

    /// <summary>
    /// Configurazione del token JWT usato per il login applicativo.
    /// </summary>
    public TokenOptions Token { get; set; } = new();

    /// <summary>
    /// Indica se l'app e' dietro un reverse proxy (es. Nginx, Cloudflare, Azure App Service).
    /// Se <c>true</c>, attiva il middleware ForwardedHeaders per ricostruire l'IP reale
    /// del client dagli header <c>X-Forwarded-For</c> e <c>X-Forwarded-Proto</c>.
    /// Se <c>false</c>, il rate limiter usa direttamente <c>RemoteIpAddress</c>.
    /// </summary>
    public bool BehindProxy { get; set; }

    /// <summary>
    /// Header HTTP di sicurezza da aggiungere a tutte le risposte.
    /// </summary>
    public Dictionary<string, string> Headers { get; set; } = [];

    /// <summary>
    /// Indica se il login JWT e' attivo.
    /// </summary>
    /// <remarks>
    /// Il valore dipende esclusivamente dalla presenza di una <see cref="TokenOptions.SecretKey"/> non vuota.
    /// </remarks>
    public bool LoginEnabled => !string.IsNullOrWhiteSpace(Token.SecretKey);
}

/// <summary>
/// Configurazione del token JWT del template.
/// </summary>
public class TokenOptions
{
    /// <summary>
    /// Chiave segreta usata per firmare i token JWT.
    /// </summary>
    public string SecretKey { get; set; } = "";

    /// <summary>
    /// Durata del token espressa in secondi.
    /// </summary>
    public int ExpirationSeconds { get; set; } = 3000;

    /// <summary>
    /// Costruisce la chiave simmetrica usata dal middleware JWT e da <c>AuthService</c>.
    /// </summary>
    /// <returns>Una <see cref="SymmetricSecurityKey"/> pronta per la firma o la validazione dei token.</returns>
    /// <exception cref="InvalidOperationException">
    /// Sollevata quando il metodo viene chiamato senza una <see cref="SecretKey"/> valida.
    /// </exception>
    /// <remarks>
    /// Se la chiave testuale e' troppo corta per l'uso diretto, viene espansa tramite SHA-256
    /// cosi' da ottenere sempre un buffer della dimensione minima richiesta da HMAC-SHA256.
    /// </remarks>
    public SymmetricSecurityKey GetSigningKey()
    {
        if (string.IsNullOrEmpty(SecretKey))
            throw new InvalidOperationException(
                "GetSigningKey() chiamato con SecretKey vuota. " +
                "Verificare SecurityOptions.LoginEnabled prima di chiamare questo metodo.");

        var keyBytes = Encoding.UTF8.GetBytes(SecretKey);
        if (keyBytes.Length < 32)
            keyBytes = SHA256.HashData(keyBytes);

        return new SymmetricSecurityKey(keyBytes);
    }
}
