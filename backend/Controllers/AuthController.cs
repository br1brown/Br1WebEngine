using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Br1WebEngine.Security;
using Br1WebEngine.Services;
namespace Br1WebEngine.Controllers;

/// <summary>
/// Espone gli endpoint di autenticazione del template.
/// </summary>
/// <remarks>
/// <para>
/// <c>[Authorize]</c> senza policy usa il <c>DefaultAuthenticateScheme</c> (API key):
/// per chiamare il login serve comunque l'header <c>X-Api-Key</c>.
/// Non richiede JWT perche' il login e' proprio l'endpoint che lo genera.
/// </para>
/// <para>
/// Il controller mostra il punto di integrazione per il login applicativo.
/// Nel template base l'endpoint e' solo un placeholder: non autentica nessun utente
/// e non emette token finche' non viene implementata una verifica credenziali reale.
/// </para>
/// </remarks>
[ApiController]
[Route("api/auth")]
[Authorize]
public class AuthController : ControllerBase
{
    private readonly AuthService _auth;

    /// <summary>
    /// Inizializza il controller con il servizio responsabile della generazione dei token.
    /// </summary>
    /// <param name="auth">Servizio JWT usato per creare la sessione autenticata.</param>
    public AuthController(AuthService auth)
    {
        _auth = auth;
    }
    /// <summary>
    /// Endpoint placeholder per il login applicativo.
    /// </summary>
    /// <param name="pwd">
    /// Password ricevuta dal form.
    /// Il parametro resta per mostrare il punto in cui inserire la validazione reale delle credenziali.
    /// </param>
    /// <returns>
    /// Una risposta HTTP 200 con <c>valid = false</c> finche' il progetto non implementa
    /// la verifica reale delle credenziali e la successiva emissione del token.
    /// </returns>
    /// <remarks>
    /// Il template base non accetta alcuna password e non genera alcun JWT.
    /// Quando si implementa il login reale, qui va inserita la validazione delle credenziali
    /// e solo dopo un controllo positivo va chiamato <c>AuthService.GenerateToken()</c>.
    /// </remarks>
    /// <response code="200">Login non implementato nel template base.</response>
    /// <response code="401">API key assente o non valida.</response>
    /// <response code="429">Rate limit superato per i tentativi di login.</response>
    [HttpPost("login")]
    [EnableRateLimiting(SecurityDefaults.LoginRateLimitPolicy)]
    public IActionResult Login([FromForm] string? pwd = null)
    {
        var _ = pwd;
        return Ok(new
        {
            valid = false,
            error = "Login applicativo non implementato nel template base."
        });
    }
}
