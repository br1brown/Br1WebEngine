using Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

/// <summary>
/// Base astratta dell'engine per l'autenticazione.
/// </summary>
/// <remarks>
/// Fornisce l'accesso al servizio JWT tramite <see cref="Auth"/>.
/// Attributi di sicurezza e logger sono ereditati da <see cref="EngineApiController"/>.
/// Il routing, la logica di login e gli attributi specifici dell'endpoint
/// restano nel controller concreto.
/// </remarks>
public abstract class EngineAuthController : EngineApiController
{
    /// <summary>Servizio JWT dell'engine per generazione e validazione token.</summary>
    protected readonly AuthService Auth;

    /// <inheritdoc cref="EngineAuthController"/>
    protected EngineAuthController(AuthService auth, ILogger logger)
        : base(logger)
    {
        Auth = auth;
    }
}
