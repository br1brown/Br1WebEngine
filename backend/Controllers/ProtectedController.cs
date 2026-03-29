using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Linq;
using Br1WebEngine.Security;

namespace Br1WebEngine.Controllers;

/// <summary>
/// Controller per gli endpoint che richiedono sia API key valida sia login JWT.
/// </summary>
/// <remarks>
/// <para>
/// <c>[Authorize(Policy = SecurityDefaults.RequireLoginPolicy)]</c> usa la policy registrata in
/// <c>AddTemplateSecurity</c>, che richiede: header <c>X-Api-Key</c> valido,
/// token JWT nell'header <c>Authorization: Bearer</c>, e claim di ruolo <c>Authenticated</c>.
/// </para>
/// <para>
/// Se <c>Security.Token.SecretKey</c> e' vuota in <c>appsettings.json</c>, il JWT handler
/// non viene registrato e la policy non puo' mai essere soddisfatta: gli endpoint
/// di questo controller restano inaccessibili by design.
/// </para>
/// </remarks>
[ApiController]
[Route("api")]
[Authorize(Policy = SecurityDefaults.RequireLoginPolicy)]
public class ProtectedController(ILogger<ProtectedController> logger) : ControllerBase
{
    private readonly ILogger<ProtectedController> _logger = logger;
}
