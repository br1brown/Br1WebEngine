using System.Security.Claims;
using System.Text.Json;

namespace Backend.Security;

/// <summary>
/// Meccanismo dell'engine per trasportare un payload di sessione tipizzato e
/// personalizzabile dal progetto dentro il JWT, come unico claim JSON ("session").
/// </summary>
/// <remarks>
/// L'engine fornisce solo il MECCANISMO (serializza/deserializza un <typeparamref name="T"/>
/// generico): non conosce la forma del payload. La FORMA la definisce il progetto
/// (es. <c>record SessionInfo</c>) e deve rispecchiare a mano l'interfaccia TypeScript
/// lato frontend (<c>frontend/src/app/core/dto/session.dto.ts</c>): è il contratto del
/// token, volutamente senza codegen.
///
/// Attenzione: il contenuto del JWT è leggibile dal client (base64, non cifrato).
/// Mettere qui solo dati NON sensibili.
/// </remarks>
public static class SessionPayload
{
    /// <summary>
    /// Opzioni JSON condivise tra scrittura e lettura: camelCase (idiomatico lato
    /// TypeScript) e case-insensitive in lettura.
    /// </summary>
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Crea il claim "session" serializzando il payload del progetto.
    /// Da passare a <c>AuthService.GenerateToken</c> tra gli <c>additionalClaims</c>.
    /// </summary>
    public static Claim Claim<T>(T value) =>
        new(SecurityDefaults.SessionClaimType, JsonSerializer.Serialize(value, Json));

    /// <summary>
    /// Rilegge il payload di sessione dal token corrente, o <c>default</c> se assente
    /// o non deserializzabile in <typeparamref name="T"/>.
    /// </summary>
    public static T? GetSession<T>(this ClaimsPrincipal user)
    {
        var raw = user.FindFirst(SecurityDefaults.SessionClaimType)?.Value;
        if (string.IsNullOrEmpty(raw)) return default;
        try { return JsonSerializer.Deserialize<T>(raw, Json); }
        catch (JsonException) { return default; }
    }
}
