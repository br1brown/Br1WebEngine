using Backend.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

/// <summary>
/// Base astratta dell'engine per gli endpoint protetti da login JWT.
/// </summary>
/// <remarks>
/// Aggiunge il requisito JWT (<c>[Authorize(Policy = RequireLoginPolicy)]</c>)
/// all'autenticazione API key ereditata da <see cref="EngineApiController"/>.
/// Il routing resta responsabilità del controller concreto.
/// </remarks>
[Authorize(Policy = SecurityDefaults.RequireLoginPolicy)]
public abstract class EngineProtectedController : EngineApiController
{
    /// <inheritdoc cref="EngineProtectedController"/>
    protected EngineProtectedController(ILogger logger)
        : base(logger)
    {
    }
}
