namespace Backend.Services;

/// <summary>Body JSON della richiesta di login.</summary>
/// <param name="Username">Nome utente fornito dal client.</param>
/// <param name="Pwd">Password in chiaro inviata dal client.</param>
public record LoginRequest(string? Username, string? Pwd);

/// <summary>Esito positivo della richiesta di login esposto al client.</summary>
/// <remarks>
/// Gli errori di autenticazione si lanciano come <see cref="Backend.Models.UnauthorizedException"/>
/// e l'handler li traduce in ProblemDetails.
/// </remarks>
/// <param name="Valid"><see langword="true"/> se le credenziali sono valide e il token e' stato emesso.</param>
/// <param name="Token">Token JWT serializzato.</param>
public record LoginResult(bool Valid, string? Token = null);
