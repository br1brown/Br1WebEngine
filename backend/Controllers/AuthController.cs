using Backend.Security;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Backend.Services;

namespace Backend.Controllers;

/// <summary>
/// Controller concreto del progetto per l'autenticazione.
/// </summary>
/// <remarks>
/// Eredita il placeholder di login dall'engine.
/// e chiamare <c>Auth.GenerateToken()</c> dopo la validazione.
/// </remarks>
[Route("auth")]
public class AuthController : EngineAuthController
{
    /// <summary>
    /// Inizializza il controller con il servizio JWT e il logger dell'engine
    /// </summary>
    public AuthController(AuthService auth, ILogger<AuthController> logger) : base(auth, logger) { }

    /// <summary>
    /// Endpoint di login. Nel template base e' un placeholder che risponde <c>valid = false</c>.
    /// Sovrascrivere questo metodo per validare le credenziali e generare il token JWT
    /// tramite <c>Auth.GenerateToken()</c>.
    /// </summary>
    [HttpPost("login")]
    [EnableRateLimiting(SecurityDefaults.LoginRateLimitPolicy)]
    public ActionResult<TokenResult> Login([FromBody] LoginRequest request)
    {
        _ = request.Pwd;
        return Ok(new TokenResult(false, Error: "Login applicativo non implementato nel template base."));
        // Esempio minimo quando il login va a buon fine:
        // return Ok(Auth.GenerateToken());
    }
}
