using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Br1WebEngine.Models.Configuration;
using Br1WebEngine.Security;

namespace Br1WebEngine.Services;

/// <summary>
/// Descrive l'esito della generazione di un token JWT.
/// </summary>
/// <param name="Valid"><see langword="true"/> se il token e' stato generato correttamente.</param>
/// <param name="Token">Token JWT serializzato da restituire al client quando l'operazione ha successo.</param>
/// <param name="Error">Messaggio di errore applicativo, valorizzato solo in caso di fallimento.</param>
public record TokenResult(bool Valid, string? Token = null, string? Error = null);

/// <summary>
/// Descrive l'esito della validazione di un token JWT gia' esistente.
/// </summary>
/// <param name="Valid"><see langword="true"/> se il token risulta valido e non scaduto.</param>
/// <param name="Error">Messaggio sintetico per distinguere token scaduti o non validi.</param>
/// <param name="Code">Codice HTTP suggerito da restituire al client in base all'esito della validazione.</param>
public record TokenValidation(bool Valid, string? Error = null, int Code = 200);

/// <summary>
/// Fornisce l'infrastruttura JWT del template: generazione e validazione dei token di login.
/// </summary>
/// <remarks>
/// Il servizio non verifica credenziali utente.
/// Quella responsabilita' resta al chiamante, tipicamente un controller che decide quando invocare
/// <see cref="GenerateToken"/>.
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
    /// <returns>Un <see cref="TokenResult"/> contenente il token serializzato pronto per la risposta HTTP.</returns>
    /// <remarks>
    /// Questo metodo deve essere chiamato solo dopo che il chiamante ha gia' validato le credenziali.
    /// Il token risultante e' compatibile con la policy <c>RequireLogin</c> configurata nel backend.
    /// </remarks>
    public TokenResult GenerateToken(IEnumerable<Claim>? additionalClaims = null)
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
        return new TokenResult(true, Token: tokenHandler.WriteToken(token));
    }

    /// <summary>
    /// Verifica che un token JWT sia valido, firmato correttamente e non scaduto.
    /// </summary>
    /// <param name="token">Token JWT serializzato da controllare.</param>
    /// <returns>
    /// Un <see cref="TokenValidation"/> con esito booleano, messaggio sintetico e codice HTTP suggerito.
    /// </returns>
    /// <remarks>
    /// Nella pipeline standard il controllo viene gia' eseguito dal middleware JwtBearer.
    /// Questo metodo resta utile solo quando un endpoint o un servizio devono validare un token in modo esplicito.
    /// </remarks>
    public TokenValidation ValidateToken(string token)
    {
        try
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            tokenHandler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = _signingKey,
                ValidateIssuer = false,
                ValidateAudience = false,
                ClockSkew = TimeSpan.Zero
            }, out _);
            return new TokenValidation(true);
        }
        catch (SecurityTokenExpiredException)
        {
            return new TokenValidation(false, "Token scaduto.", 401);
        }
        catch
        {
            return new TokenValidation(false, "Token non valido.", 401);
        }
    }
}
