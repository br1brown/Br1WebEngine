using Backend.Models;
using Backend.Security;
using Backend.Services;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Backend.Controllers;

/// <summary>
/// Controller concreto del progetto per l'autenticazione.
/// </summary>
/// <remarks>
/// MVP: verifica credenziali fisse hardcoded e, se corrette, emette un token JWT via
/// <see cref="EngineAuthController.Auth"/>. Sostituire la verifica con un Identity Provider o un DB
/// in produzione. Le credenziali errate lanciano <see cref="Backend.Models.UnauthorizedException"/>,
/// che l'handler converte in un ProblemDetails 401.
/// </remarks>
[Route("auth")]
public class AuthController : EngineAuthController
{
    private readonly IValidator<LoginRequest> _validator;

    /// <summary>
    /// Inizializza il controller con il servizio JWT, il logger e il validator FluentValidation.
    /// </summary>
    public AuthController(AuthService auth, ILogger<AuthController> logger, IValidator<LoginRequest> validator)
        : base(auth, logger)
    {
        _validator = validator;
    }

    /// <summary>
    /// Endpoint di login. Valida le credenziali e restituisce un token JWT.
    /// </summary>
    [HttpPost("login")]
    [EnableRateLimiting(SecurityDefaults.LoginRateLimitPolicy)]
    public async Task<ActionResult<LoginResult>> Login([FromBody] LoginRequest request)
    {
        var validation = await _validator.ValidateAsync(request);
        if (!validation.IsValid)
        {
            foreach (var error in validation.Errors)
                ModelState.AddModelError(error.PropertyName, error.ErrorMessage);
            return ValidationProblem();
        }

        // MVP: credenziali fisse. Sostituire con un Identity Provider o DB in produzione.
        const string validUsername = "admin";
        const string validPassword = "Password1!";

        if (!string.Equals(request.Username, validUsername, StringComparison.OrdinalIgnoreCase)
            || request.Pwd != validPassword)
        {
            Logger.LogWarning("Tentativo di login fallito per username '{Username}'.", request.Username);
            // Chiave generica: non riveliamo se a sbagliare e' username o password. L'handler la localizza.
            throw new UnauthorizedException("error_invalid_credentials");
        }

        Logger.LogInformation("Login riuscito per username '{Username}'.", request.Username);

        // Payload di sessione del progetto: serializzato nel claim "session" del token,
        // poi rileggibile via User.GetSession<SessionInfo>() e lato frontend.
        // Sostituire i valori demo con quelli reali (id utente, ruoli, ecc.).
        var session = new SessionInfo
        {
            UserId = validUsername,
            DisplayName = "Amministratore",
            Roles = new[] { "admin" }
        };

        return Ok(new LoginResult(true, Token: Auth.GenerateToken(new[] { SessionPayload.Claim(session) })));
    }
}
