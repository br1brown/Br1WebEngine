using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Backend.Models;

namespace Backend.Controllers;

/// <summary>
/// Espone i file caricati dagli utenti, salvati nel volume persistente <c>/app/uploads</c>.
/// </summary>
/// <remarks>
/// L'accesso richiede API key (ereditata da <see cref="EngineApiController"/>), ma nessuna autenticazione utente.
/// Il file viene identificato dal suo slug univoco assegnato al momento dell'upload.
/// </remarks>
[Route("blob")]
public class BlobController : EngineApiController
{
    private readonly string _uploadsPath;
    private static readonly FileExtensionContentTypeProvider _contentTypeProvider = new();

    public BlobController(IWebHostEnvironment env, ILogger<BlobController> logger)
        : base(logger)
    {
        _uploadsPath = Path.Combine(env.ContentRootPath, "uploads");
    }

    /// <summary>
    /// Restituisce il file corrispondente allo slug fornito.
    /// </summary>
    /// <param name="slug">Identificativo univoco del file, inclusa l'estensione (es. <c>abc123.jpg</c>).</param>
    [HttpGet("{slug}")]
    public IActionResult Get(string slug)
    {
        var filePath = Path.GetFullPath(Path.Combine(_uploadsPath, slug));

        if (!filePath.StartsWith(_uploadsPath, StringComparison.OrdinalIgnoreCase))
            throw new InvalidParametersException();

        if (!System.IO.File.Exists(filePath))
            throw new NotFoundException("blob");

        Logger.LogInformation("Blob richiesto: {Slug}", slug);

        if (!_contentTypeProvider.TryGetContentType(filePath, out var contentType))
            contentType = "application/octet-stream";

        var stream = System.IO.File.OpenRead(filePath);
        return File(stream, contentType, enableRangeProcessing: true);
    }
}
