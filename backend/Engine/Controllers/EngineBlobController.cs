using Microsoft.AspNetCore.Mvc;
using SkiaSharp;

namespace Backend.Controllers;

/// <summary>
/// Base astratta per i controller che servono file binari.
/// Aggiunge a <see cref="EngineApiController"/> la capacità di ottimizzare immagini per il web.
/// </summary>
public abstract class EngineBlobController : EngineApiController
{
    // image/gif escluso: SkiaSharp decodifica solo il primo frame e produce un WebP statico,
    // perdendo l'animazione senza errore. Le GIF vengono servite così come sono.
    private static readonly HashSet<string> _imageContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/jpeg", "image/png", "image/webp", "image/bmp", "image/avif"
    };

    /// <inheritdoc cref="EngineBlobController"/>
    protected EngineBlobController(ILogger logger) : base(logger) { }

    /// <summary>
    /// Indica se il content-type corrisponde a un formato immagine gestito.
    /// </summary>
    protected static bool IsImage(string contentType) => _imageContentTypes.Contains(contentType);

    /// <summary>
    /// Genera uno slug univoco per un file da caricare, includendo l'estensione originale.
    /// </summary>
    /// <param name="extension">Estensione del file, con o senza punto iniziale (es. <c>.jpg</c> o <c>jpg</c>).</param>
    protected static string GenerateBlobSlug(string extension)
    {
        var dot = extension.StartsWith('.') ? string.Empty : ".";
        return $"{Guid.NewGuid():N}{dot}{extension}";
    }

    /// <summary>
    /// Dato uno stream immagine, restituisce un <see cref="FileContentResult"/> con il lato più lungo
    /// ridimensionato a <paramref name="maxSide"/> pixel mantenendo le proporzioni originali.
    /// Se l'immagine è già entro i limiti non viene riscalata.
    /// </summary>
    /// <param name="imageStream">Stream del file immagine da elaborare.</param>
    /// <param name="contentType">MIME type dell'immagine; determina il formato di output.</param>
    /// <param name="maxSide">Dimensione massima in pixel del lato più lungo (default 1920).</param>
    protected static FileContentResult ResizeImageForWeb(Stream imageStream, string contentType, int maxSide = 1920)
    {
        using var original = SKBitmap.Decode(imageStream);

        int newWidth, newHeight;
        if (original.Width <= maxSide && original.Height <= maxSide)
        {
            newWidth = original.Width;
            newHeight = original.Height;
        }
        else
        {
            var ratio = Math.Min((double)maxSide / original.Width, (double)maxSide / original.Height);
            newWidth = (int)(original.Width * ratio);
            newHeight = (int)(original.Height * ratio);
        }

        using var resized = original.Resize(new SKImageInfo(newWidth, newHeight), new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        using var skImage = SKImage.FromBitmap(resized);
        using var data = skImage.Encode(SKEncodedImageFormat.Webp, quality: 85);
        return new FileContentResult(data.ToArray(), "image/webp");
    }
}
