using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Globalization;
using Br1WebEngine.Services;

namespace Br1WebEngine.Controllers;

/// <summary>
/// Espone gli endpoint pubblici del template che richiedono solo una API key valida.
/// </summary>
/// <remarks>
/// <para>
/// <c>[Authorize]</c> senza policy usa il <c>DefaultAuthenticateScheme</c> configurato
/// in <c>AddTemplateSecurity</c>, che e' <c>SecurityDefaults.ApiKeyAuthenticationScheme</c>.
/// Questo significa che basta l'header <c>X-Api-Key</c> con un valore valido:
/// la verifica avviene in <c>ApiKeyHandler</c>, non serve JWT ne' login.
/// </para>
/// <para>
/// Questa classe delega tutta la logica applicativa a <see cref="SiteService"/>.
/// Non gestisce casi d'uso che richiedono login utente: per quelli esiste <see cref="ProtectedController"/>.
/// </para>
/// </remarks>
[ApiController]
[Route("api")]
[Authorize]
public class BaseController : ControllerBase
{
    private readonly SiteService _service;
    private readonly ILogger<BaseController> _logger;

    /// <summary>
    /// Inizializza il controller con i servizi necessari per leggere i contenuti del sito.
    /// </summary>
    /// <param name="service">Servizio applicativo che incapsula i casi d'uso del sito.</param>
    /// <param name="logger">Logger usato per tracciare richieste e contesto operativo.</param>
    public BaseController(SiteService service, ILogger<BaseController> logger)
    {
        _service = service;
        _logger = logger;
    }

    /// <summary>
    /// Restituisce i social network configurati, con filtro opzionale per nome.
    /// </summary>
    /// <param name="nomi">
    /// Elenco opzionale dei nomi logici da mantenere, ad esempio <c>facebook</c> o <c>instagram</c>.
    /// Se assente, l'endpoint restituisce tutti i social configurati.
    /// </param>
    /// <returns>Una risposta HTTP 200 con una mappa nome-URL dei social richiesti.</returns>
    /// <response code="200">Social recuperati correttamente.</response>
    /// <response code="401">API key assente o non valida.</response>
    [HttpGet("social")]
    public async Task<IActionResult> GetSocial([FromQuery] string[]? nomi = null)
    {
        var data = await _service.GetSocialAsync(nomi);
        return Ok(data);
    }

    /// <summary>
    /// Restituisce il profilo aziendale localizzato in base alla lingua corrente della richiesta.
    /// </summary>
    /// <returns>
    /// Una risposta HTTP 200 contenente il <see cref="Br1WebEngine.Models.Legal.UniversalLegalModel"/> del sito.
    /// </returns>
    /// <remarks>
    /// La lingua viene derivata indirettamente da <c>Accept-Language</c> tramite la localizzazione ASP.NET.
    /// Il payload include gia' i social principali previsti dal template.
    /// </remarks>
    /// <response code="200">Profilo recuperato correttamente.</response>
    /// <response code="401">API key assente o non valida.</response>
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
    {
        _logger.LogInformation(
            "Richiesta profilo - lingua: {Lang}",
            CultureInfo.CurrentCulture);

        var data = await _service.GetProfileAsync();
        return Ok(data);
    }
}
