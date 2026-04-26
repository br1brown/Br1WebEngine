using Microsoft.AspNetCore.Mvc;

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
}
