using Microsoft.AspNetCore.Mvc;
using Backend.Infrastructure;
using Backend.Services;

namespace Backend.Controllers;

/// <summary>
/// Controller concreto del progetto per gli endpoint pubblici (API key).
/// </summary>
/// <remarks>
/// Eredita sicurezza e logger da <see cref="EngineApiController"/>.
/// Aggiungere qui gli endpoint del progetto che non richiedono autenticazione utente.
/// <see cref="GetSocial"/> e' un endpoint dimostrativo incluso nel template.
/// </remarks>
[Route("")]
public class BaseController : EngineApiController
{
    private readonly SiteService _service;
    private readonly IContentStore _store;

    /// <summary>
    /// Inizializza il controller con il servizio di business e le dipendenze dell'engine.
    /// </summary>
    public BaseController(SiteService service, IContentStore store, ILogger<BaseController> logger)
        : base(logger)
    {
        _service = service;
        _store = store;
    }

    /// <summary>
    /// Restituisce il profilo aziendale localizzato.
    /// Sovrascrive la logica engine per usare <see cref="SiteService"/>
    /// che arricchisce il profilo con i social principali.
    /// </summary>
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile()
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
