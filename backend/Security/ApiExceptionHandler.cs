using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Br1WebEngine.Models;

namespace Br1WebEngine.Security;

/// <summary>
/// Traduce le <see cref="ApiException"/> applicative in risposte Problem Details coerenti.
/// </summary>
/// <remarks>
/// <para>
/// Questo handler e' il punto di raccordo tra la logica dei controller e la risposta HTTP.
/// Nel template, i controller non catturano eccezioni e non costruiscono risposte di errore:
/// lanciano un'eccezione della gerarchia <see cref="ApiException"/> e questo handler la
/// converte automaticamente in un payload JSON strutturato secondo RFC 9457 (Problem Details).
/// </para>
/// <para>
/// Il flusso completo e':
/// <list type="number">
/// <item>Un controller lancia <c>throw new NotFoundException("profilo")</c></item>
/// <item>L'eccezione risale la pipeline fino al middleware <c>UseExceptionHandler()</c></item>
/// <item>ASP.NET la passa a questo handler tramite <see cref="TryHandleAsync"/></item>
/// <item>L'handler verifica che sia una nostra <see cref="ApiException"/></item>
/// <item>Se si': imposta lo status code (es. 404) e scrive il ProblemDetails</item>
/// <item>Se no': restituisce false, e ASP.NET usa il suo handler di default</item>
/// </list>
/// </para>
/// <para>
/// Il vantaggio e' duplice:
/// <list type="bullet">
/// <item>I controller restano puliti: <c>throw</c> e basta, niente try/catch, niente
///   costruzione manuale di <c>IActionResult</c> di errore.</item>
/// <item>Il frontend riceve sempre lo stesso formato JSON (status + detail), che
///   <c>NotificationService</c> sa gia' come parsare e mostrare all'utente.
///   Se il backend manda un messaggio specifico (es. "Profilo non trovato"),
///   lo mostra cosi' com'e'. Se manda solo uno status code, il frontend cerca
///   una traduzione i18n (es. <c>errore404Desc</c>). Come ultimo fallback,
///   mostra un errore generico tradotto.</item>
/// </list>
/// </para>
/// <para>
/// Le eccezioni NON appartenenti alla gerarchia <see cref="ApiException"/> (es.
/// <c>NullReferenceException</c>, errori di database) vengono ignorate da questo handler
/// e gestite dal comportamento di default di ASP.NET, che restituisce un 500 generico
/// senza esporre dettagli interni (sicurezza).
/// </para>
/// </remarks>
public class ApiExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetails;

    /// <summary>
    /// Inizializza l'handler con il servizio ASP.NET che serializza i Problem Details.
    /// </summary>
    /// <param name="problemDetails">Servizio usato per scrivere la risposta di errore.</param>
    public ApiExceptionHandler(IProblemDetailsService problemDetails)
    {
        _problemDetails = problemDetails;
    }

    /// <summary>
    /// Gestisce l'eccezione corrente solo se appartiene alla gerarchia <see cref="ApiException"/>.
    /// </summary>
    /// <param name="httpContext">Contesto HTTP associato alla richiesta.</param>
    /// <param name="exception">Eccezione sollevata dalla pipeline.</param>
    /// <param name="cancellationToken">Token di cancellazione associato alla richiesta.</param>
    /// <returns>
    /// <see langword="true"/> quando l'eccezione e' stata convertita in risposta HTTP;
    /// <see langword="false"/> quando deve essere gestita da altri handler (eccezioni non
    /// applicative, come errori di sistema, che non devono esporre dettagli al client).
    /// </returns>
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var _ = cancellationToken;

        // Solo le nostre eccezioni applicative vengono gestite.
        // Tutto il resto (NullReference, errori DB, etc.) viene lasciato
        // ad ASP.NET, che restituisce un 500 generico senza esporre
        // stack trace o dettagli interni al client.
        if (exception is not ApiException apiEx)
            return false;

        // Imposta lo status code HTTP definito nell'eccezione
        // (es. NotFoundException → 404, InvalidParametersException → 400)
        httpContext.Response.StatusCode = apiEx.StatusCode;

        // Scrive il payload ProblemDetails JSON con lo status code e il messaggio.
        // Il frontend leggera' il campo "detail" per mostrare l'errore all'utente.
        return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = apiEx.StatusCode,
                Detail = apiEx.Message
            },
            Exception = exception
        });
    }
}
