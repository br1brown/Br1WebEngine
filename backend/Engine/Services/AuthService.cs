using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Backend.Models.Configuration;
using Backend.Security;

namespace Backend.Services;

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
        // Claim minimi garantiti in ogni token:
        // - Role "Authenticated": richiesto dalla policy RequireLogin su ProtectedController.
        //   Senza di questo il middleware di autorizzazione rifiuta anche token firmati correttamente.
        // - loginTime: timestamp Unix dell'emissione, utile per audit e per scadenze applicative
        //   custom (es. "sessione non più valida se login > X ore fa") senza toccare il middleware.
        var claims = new List<Claim>
        {
            new(ClaimTypes.Role, SecurityDefaults.AuthenticatedRole),
            new("loginTime", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString())
        };

        // Aggiunge eventuali claim extra passati dal controller chiamante,
        // ad esempio l'id utente, un ruolo specifico, un tenant, ecc.
        // Il metodo non li valida: il chiamante è responsabile del loro contenuto.
        if (additionalClaims != null)
            claims.AddRange(additionalClaims);

        // JwtSecurityTokenHandler è il componente di System.IdentityModel che
        // sa costruire e serializzare token JWT nel formato compatto (header.payload.signature).
        var tokenHandler = new JwtSecurityTokenHandler();

        // SecurityTokenDescriptor è il "progetto" del token:
        // - Subject: identità con i claim raccolti sopra.
        // - Expires: scadenza assoluta UTC calcolata dalla configurazione (_expirationSeconds).
        //   Il middleware JWT Bearer la controlla automaticamente a ogni richiesta.
        // - SigningCredentials: accoppia la chiave simmetrica con l'algoritmo HMAC-SHA256.
        //   Chiunque tentasse di modificare il payload (es. aggiungere ruoli) invaliderebbe
        //   la firma, e il middleware rifiuterebbe il token.
        var descriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddSeconds(_expirationSeconds),
            SigningCredentials = new SigningCredentials(_signingKey, SecurityAlgorithms.HmacSha256Signature)
        };

        // CreateToken costruisce l'oggetto SecurityToken in memoria.
        // WriteToken lo serializza nel formato stringa compatta JWT (base64url × 3 separati da '.').
        var token = tokenHandler.CreateToken(descriptor);
        return tokenHandler.WriteToken(token);
    }
}
