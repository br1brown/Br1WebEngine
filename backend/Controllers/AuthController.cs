using Backend.Security;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Backend.Services;

namespace Backend.Controllers;

/// <summary>
/// Controller concreto del progetto per l'autenticazione.
/// </summary>
/// <remarks>
/// Eredita il placeholder di login dall'engine.
/// Il template base risponde con 501 Not Implemented finche' non si implementa la verifica
/// reale delle credenziali. Quando la password e' corretta, restituire
/// <c>Ok(new LoginResult(true, Token: Auth.GenerateToken()))</c>.
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
    /// Endpoint di login. Nel template base e' un placeholder che risponde 501 Not Implemented.
    /// Sovrascrivere questo metodo per validare le credenziali e generare il token JWT
    /// tramite <c>Auth.GenerateToken()</c>.
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

        return StatusCode(
            StatusCodes.Status501NotImplemented,
            new LoginResult(false, Error: "Login applicativo non implementato nel template base."));
        // Esempio minimo quando il login va a buon fine:
        // return Ok(new LoginResult(true, Token: Auth.GenerateToken()));
    }
}
