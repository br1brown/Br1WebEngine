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
/// Nella forma attuale e' un endpoint dimostrativo: la verifica credenziali reale deve essere implementata
/// prima di usare questo codice in produzione.
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
    /// Endpoint dimostrativo per il login che restituisce un token JWT.
    /// </summary>
    /// <param name="pwd">
    /// Password ricevuta dal form.
    /// Il parametro e' presente per mostrare il punto in cui inserire la validazione reale delle credenziali.
    /// </param>
    /// <returns>
    /// Una risposta HTTP 200 con l'esito della generazione del token.
    /// </returns>
    /// <remarks>
    /// Il metodo non esegue ancora una verifica effettiva delle credenziali.
    /// Prima dell'uso reale va sostituito con la logica di autenticazione corretta
    /// e la chiamata a <see cref="AuthService.GenerateToken"/>
    /// deve avvenire solo dopo un controllo positivo.
    /// </remarks>
    /// <response code="200">Token generato.</response>
    /// <response code="401">API key assente o non valida.</response>
    /// <response code="429">Rate limit superato per i tentativi di login.</response>
    [HttpPost("login")]
    [EnableRateLimiting(SecurityDefaults.LoginRateLimitPolicy)]
    public IActionResult Login([FromForm] string pwd)
    {
        var _ = pwd;
        var result = _auth.GenerateToken();
        return Ok(new { valid = result.Valid, token = result.Token, error = result.Error });
    }
}
