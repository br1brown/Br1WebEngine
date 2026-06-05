using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Backend.Models;
using Backend.Security;

namespace Backend.Controllers;

/// <summary>
/// Espone i file caricati dagli utenti, salvati nel volume persistente <c>/app/uploads</c>.
/// </summary>
/// <remarks>
/// L'accesso richiede API key (ereditata da <see cref="EngineApiController"/>), ma nessuna autenticazione utente.
/// Il file viene identificato dal suo slug univoco assegnato al momento dell'upload.
/// </remarks>
[Route("blob")]
public class BlobController : EngineBlobController
{
    private readonly string _uploadsPath;
    private static readonly FileExtensionContentTypeProvider _contentTypeProvider = new();

    /// <summary>
    /// Inizializza una nuova istanza di <see cref="BlobController"/>.
    /// </summary>
    public BlobController(IWebHostEnvironment env, ILogger<BlobController> logger)
        : base(logger)
    {
        // Trailing separator: senza, "/app/uploads-public/x" supererebbe il check StartsWith("/app/uploads").
        _uploadsPath = Path.Combine(env.ContentRootPath, "uploads") + Path.DirectorySeparatorChar;
    }

    /// <summary>
    /// Restituisce il file corrispondente allo slug fornito.
    /// </summary>
    /// <param name="slug">Identificativo univoco del file, inclusa l'estensione (es. <c>abc123.jpg</c>).</param>
    /// <param name="webopt">
    /// Se <c>true</c> e il file è un'immagine, la ridimensiona alla dimensione standard web
    /// prima di restituirla (lato più lungo max 1920 px).
    /// </param>
    [HttpGet("{slug}")]
    public IActionResult Get(string slug, [FromQuery] bool webopt = false)
    {
        var filePath = Path.GetFullPath(Path.Combine(_uploadsPath, slug));

        if (!filePath.StartsWith(_uploadsPath, StringComparison.Ordinal))
            throw new InvalidParametersException();

        if (!System.IO.File.Exists(filePath))
            throw new NotFoundException("blob");

        Logger.LogInformation("Blob richiesto: {Slug}", slug);

        if (!_contentTypeProvider.TryGetContentType(filePath, out var contentType))
            contentType = "application/octet-stream";

        if (webopt && IsImage(contentType))
        {
            using var imageStream = System.IO.File.OpenRead(filePath);
            return ResizeImageForWeb(imageStream, contentType);
        }

        var stream = System.IO.File.OpenRead(filePath);
        return File(stream, contentType, enableRangeProcessing: true);
    }

    /// <summary>
    /// Utility statica per salvare un file nel volume persistente e restituire lo slug.
    /// Utilizzabile da altri controller che ricevono file nei loro form.
    /// </summary>
    public static async Task<string> SaveFileAsync(IFormFile file, string uploadsPath, ILogger? logger = null)
    {
        if (file.Length == 0)
            throw new InvalidParametersException();

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrEmpty(extension))
            throw new InvalidParametersException();

        Directory.CreateDirectory(uploadsPath);

        var slug = GenerateBlobSlug(extension);
        var filePath = Path.Combine(uploadsPath, slug);

        await using var destination = System.IO.File.Create(filePath);
        await file.CopyToAsync(destination);

        logger?.LogInformation("Blob caricato: {Slug}", slug);

        return slug;
    }

    /// <summary>
    /// Carica un file nel volume persistente e restituisce lo slug univoco con cui recuperarlo.
    /// </summary>
    /// <remarks>
    /// Richiede API key valida e token JWT (utente autenticato).
    /// Lo slug include l'estensione originale del file, necessaria alla GET per determinare il content-type.
    /// </remarks>
    [HttpPost("up")]
    [Authorize(Policy = SecurityDefaults.RequireLoginPolicy)]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB — i progetti figli possono sovrascrivere con [RequestSizeLimit] sul proprio controller
    public async Task<IActionResult> Upload(IFormFile file)
    {
        var slug = await SaveFileAsync(file, _uploadsPath, Logger);
        return Ok(new { slug });
    }
}
