using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

/// <summary>
/// Radice astratta comune a tutti i controller dell'engine.
/// </summary>
/// <remarks>
/// Centralizza gli attributi di sicurezza (<c>[ApiController]</c>, <c>[Authorize]</c>)
/// e il logger condiviso, eliminando duplicazioni nelle classi derivate.
/// Ogni classe engine specializzata eredita da qui aggiungendo solo
/// le dipendenze e i vincoli che la distinguono.
/// Il routing (<c>[Route]</c>) resta responsabilità del controller concreto.
/// </remarks>
[ApiController]
[Authorize]
public abstract class EngineApiController : ControllerBase
{
    /// <summary>Logger condiviso con tutti i controller derivati.</summary>
    protected readonly ILogger Logger;

    /// <inheritdoc cref="EngineApiController"/>
    protected EngineApiController(ILogger logger)
    {
        Logger = logger;
    }
}
