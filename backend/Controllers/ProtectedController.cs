using Microsoft.AspNetCore.Mvc;
using Backend.Models;
using Backend.Security;

namespace Backend.Controllers;

/// <summary>
/// Controller concreto del progetto per gli endpoint protetti da login JWT.
/// Richiede API key valida + token JWT con ruolo <c>Authenticated</c>.
/// Aggiungere qui gli endpoint riservati agli utenti autenticati.
/// </summary>
[Route("")]
public class ProtectedController : EngineProtectedController
{
    /// <summary>
    /// Inizializza il controller con il logger dell'engine.
    /// </summary>
    public ProtectedController(ILogger<ProtectedController> logger) : base(logger) { }

    /// <summary>Health check per endpoint protetti da JWT (utile anche per i test di integrazione).</summary>
    [HttpGet("ping")]
    public IActionResult Ping()
    {
        // Il middleware ha già validato il token: qui rileggiamo il payload di sessione
        // che il progetto ha messo nel claim "session" durante il login.
        var session = User.GetSession<SessionInfo>();
        return Ok(new { status = "ok", session });
    }
}
