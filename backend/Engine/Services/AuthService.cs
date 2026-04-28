using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Backend.Models.Configuration;
using Backend.Security;

namespace Backend.Services;

/// <summary>Body JSON della richiesta di login.</summary>
/// <param name="Pwd">Password in chiaro inviata dal client.</param>
public record LoginRequest(string? Pwd);

/// <summary>
/// Esito della richiesta di login esposto al client.
/// </summary>
/// <param name="Valid"><see langword="true"/> se le credenziali sono valide e il token e' stato emesso.</param>
/// <param name="Token">Token JWT serializzato, valorizzato solo quando <paramref name="Valid"/> e' <see langword="true"/>.</param>
/// <param name="Error">Messaggio di errore applicativo, valorizzato solo in caso di fallimento.</param>
public record LoginResult(bool Valid, string? Token = null, string? Error = null);

/// <summary>
/// Fornisce l'infrastruttura JWT del template: generazione dei token di login.
/// </summary>
/// <remarks>
/// Il servizio non verifica credenziali utente.
/// Quella responsabilita' resta al chiamante, tipicamente un controller che decide quando invocare
/// <see cref="GenerateToken"/>. La validazione del token in ingresso e' gestita dal middleware
/// JWT Bearer di ASP.NET, configurato in <c>SecurityExtensions.AddTemplateSecurity</c>.
/// </remarks>
public class AuthService
{
    private readonly SymmetricSecurityKey _signingKey;
    private readonly int _expirationSeconds;

    /// <summary>
    /// Inizializza il servizio leggendo la configurazione tipizzata della sicurezza.
    /// </summary>
    /// <param name="options">Opzioni che contengono secret key e durata dei token.</param>
    public AuthService(IOptions<SecurityOptions> options)
    {
        var tokenOpts = options.Value.Token;
        _signingKey = tokenOpts.GetSigningKey();
        _expirationSeconds = tokenOpts.ExpirationSeconds;
    }

    /// <summary>
    /// Genera un token JWT firmato con il ruolo <c>Authenticated</c> e claim opzionali.
    /// </summary>
    /// <param name="additionalClaims">
    /// Claim aggiuntivi da includere nel token, ad esempio identificativi utente o ruoli specifici.
    /// Il ruolo <c>Authenticated</c> viene aggiunto comunque in modo automatico.
    /// </param>
    /// <returns>Il token JWT serializzato, pronto per essere restituito al client.</returns>
    public string GenerateToken(IEnumerable<Claim>? additionalClaims = null)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.Role, SecurityDefaults.AuthenticatedRole),
            new("loginTime", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString())
        };

        if (additionalClaims != null)
            claims.AddRange(additionalClaims);

        var tokenHandler = new JwtSecurityTokenHandler();
        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddSeconds(_expirationSeconds),
            SigningCredentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(descriptor);
        return tokenHandler.WriteToken(token);
    }
}
