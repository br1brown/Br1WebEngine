using Microsoft.AspNetCore.Mvc;
using Backend.Infrastructure;
using Backend.Services;

namespace Backend.Controllers;

/// <summary>
/// Controller concreto del progetto che eredita la logica di base dell'engine.
/// </summary>
/// <remarks>
/// <para>
/// Eredita <see cref="EngineBaseController.GetProfile"/> e lo espone come endpoint.
/// Deve essere sovrascritto per personalizzare la logica del profilo.
/// </para>
/// <para>
/// Gli endpoint aggiuntivi di questo controller sono specifici del progetto.
/// Ad esempio <see cref="GetSocial"/> e' un endpoint dimostrativo
/// che mostra come aggiungere funzionalita' sopra la base dell'engine.
/// </para>
/// </remarks>
[Route("api")]
public class BaseController : EngineBaseController
{
    private readonly SiteService _service;

    /// <summary>
    /// Inizializza il controller con il servizio di business e le dipendenze dell'engine.
    /// </summary>
    public BaseController(SiteService service, IContentStore store, ILogger<BaseController> logger)
        : base(store, logger)
    {
        _service = service;
    }

    /// <summary>
    /// Restituisce il profilo aziendale localizzato.
    /// Sovrascrive la logica engine per usare <see cref="SiteService"/>
    /// che arricchisce il profilo con i social principali.
    /// </summary>
    [HttpGet("profile")]
    public override async Task<IActionResult> GetProfile()
    {
        Logger.LogInformation(
            "Richiesta profilo - lingua: {Lang}",
            System.Globalization.CultureInfo.CurrentCulture);

        var data = await _service.GetProfileAsync();
        return Ok(data);
    }

    /// <summary>
    /// Restituisce i social network configurati, con filtro opzionale per nome.
    /// Endpoint dimostrativo: mostra come aggiungere funzionalita'
    /// al controller ereditato dall'engine.
    /// </summary>
    [HttpGet("social")]
    public async Task<IActionResult> GetSocial([FromQuery] string[]? nomi = null)
    {
        var data = await _service.GetSocialAsync(nomi);
        return Ok(data);
    }
}
