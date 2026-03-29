using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Br1WebEngine.Security;

/// <summary>
/// Definisce i nomi condivisi dallo schema di autenticazione API key del template.
/// </summary>
/// <remarks>
/// L'API key e' il "biglietto d'ingresso" del template: ogni client che vuole parlare
/// con il backend deve presentare una chiave valida nell'header <c>X-Api-Key</c>.
/// Non identifica un utente specifico (per quello c'e' JWT), ma certifica che il client
/// e' autorizzato a usare le API. E' la prima linea di difesa: senza chiave valida,
/// la richiesta non arriva nemmeno ai controller.
/// </remarks>
public static class SecurityDefaults
{
	/// <summary>
	/// Nome logico dello schema di autenticazione usato con ASP.NET.
	/// </summary>
	public const string ApiKeyAuthenticationScheme = "ApiKey";

	/// <summary>
	/// Nome dell'header HTTP in cui il client deve inviare la API key.
	/// </summary>
	public const string ApiKeyHeaderName = "X-Api-Key";

	/// <summary>
	/// Nome della policy di autorizzazione che richiede API key + JWT + ruolo.
	/// Usata da ProtectedController con <c>[Authorize(Policy = ...)]</c>.
	/// </summary>
	public const string RequireLoginPolicy = "RequireLogin";

	/// <summary>
	/// Ruolo assegnato da <c>AuthService.GenerateToken</c> e richiesto dalla
	/// policy <see cref="RequireLoginPolicy"/>. Case-sensitive.
	/// </summary>
	public const string AuthenticatedRole = "Authenticated";

	/// <summary>
	/// Nome della policy di rate limiting applicata all'endpoint di login.
	/// Usata da AuthController con <c>[EnableRateLimiting(...)]</c>.
	/// </summary>
	public const string LoginRateLimitPolicy = "login";
}

/// <summary>
/// Opzioni dello schema API key, in particolare l'elenco delle chiavi considerate valide.
/// </summary>
public class ApiKeySchemeOptions : AuthenticationSchemeOptions
{
	/// <summary>
	/// Collezione delle API key ammesse, confrontate in modo case-insensitive.
	/// </summary>
	public HashSet<string> ValidKeys { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

/// <summary>
/// Handler ASP.NET che autentica una richiesta tramite header <c>X-Api-Key</c>.
/// </summary>
/// <remarks>
/// <para>
/// Questo handler implementa il controllo del "biglietto d'ingresso". Ogni richiesta HTTP
/// (tranne OPTIONS) deve presentare una chiave API valida, cioe' una stringa presente
/// nell'array <c>Security.ApiKeys</c> di <c>appsettings.json</c>.
/// </para>
/// <para>
/// Le richieste <c>OPTIONS</c> vengono lasciate passare senza controllo. Questo e' necessario
/// perche' il browser invia automaticamente una richiesta OPTIONS (preflight) prima di ogni
/// chiamata cross-origin con header custom (come <c>X-Api-Key</c> stesso). Se bloccassimo
/// le OPTIONS, il browser non riceverebbe mai la risposta CORS e la richiesta vera non
/// partirebbe nemmeno.
/// </para>
/// <para>
/// Quando la chiave e' valida, l'handler crea un'identita' minima con il claim
/// <c>ApiKeyValidated=true</c>. Questa identita' non rappresenta un utente, ma segnala
/// al resto della pipeline che il client ha superato il primo livello di autenticazione.
/// Il JWT Bearer handler (se attivo) arricchira' poi questa identita' con i dati dell'utente.
/// </para>
/// </remarks>
public class ApiKeyHandler : AuthenticationHandler<ApiKeySchemeOptions>
{
	/// <summary>
	/// Inizializza l'handler dello schema API key.
	/// </summary>
	/// <param name="options">Monitor delle opzioni dello schema.</param>
	/// <param name="logger">Factory per il logging ASP.NET.</param>
	/// <param name="encoder">Encoder usato dalla base class per le challenge.</param>
	public ApiKeyHandler(
		IOptionsMonitor<ApiKeySchemeOptions> options,
		ILoggerFactory logger,
		UrlEncoder encoder)
		: base(options, logger, encoder)
	{
	}

	/// <summary>
	/// Valida la richiesta corrente controllando la presenza e la correttezza della API key.
	/// </summary>
	/// <returns>Esito dell'autenticazione per la richiesta corrente.</returns>
	protected override Task<AuthenticateResult> HandleAuthenticateAsync()
	{
		// Le OPTIONS passano sempre: il browser le manda come preflight CORS
		// prima della richiesta vera. NoResult() dice "non ho opinioni su questa
		// richiesta" — il middleware CORS la gestira' da solo.
		// (Success con identita' finta marcherebbe la richiesta come autenticata
		// senza che nessuna chiave sia stata presentata.)
		if (Request.Method == HttpMethods.Options)
			return Task.FromResult(AuthenticateResult.NoResult());

		// Legge l'header X-Api-Key dalla richiesta.
		var apiKey = Request.Headers[SecurityDefaults.ApiKeyHeaderName].FirstOrDefault();

		// Header mancante: il client non ha presentato il biglietto d'ingresso.
		if (string.IsNullOrEmpty(apiKey))
			return Task.FromResult(AuthenticateResult.Fail("Header " + SecurityDefaults.ApiKeyHeaderName + " mancante."));

		// Chiave non presente nella whitelist configurata.
		if (!Options.ValidKeys.Contains(apiKey.Trim()))
			return Task.FromResult(AuthenticateResult.Fail("API key non valida."));

		// Chiave valida: crea un'identita' minima che certifica il superamento
		// del primo livello di autenticazione. Non e' un utente, e' un client
		// autorizzato. Il JWT Bearer (se attivo) aggiungera' l'identita' utente.
		var identity = new ClaimsIdentity(Scheme.Name);
		identity.AddClaim(new Claim("ApiKeyValidated", "true"));
		var principal = new ClaimsPrincipal(identity);
		var authTicket = new AuthenticationTicket(principal, Scheme.Name);

		return Task.FromResult(AuthenticateResult.Success(authTicket));
	}

	/// <summary>
	/// Restituisce una challenge in formato ProblemDetails quando la API key manca o non e' valida.
	/// </summary>
	/// <param name="properties">Proprieta' opzionali della challenge ASP.NET.</param>
	/// <returns>Task che completa la scrittura della risposta di errore.</returns>
	/// <remarks>
	/// 401 Unauthorized: il client non ha dimostrato la propria identita'.
	/// 403 Forbidden andrebbe usato quando l'identita' e' nota ma i permessi insufficienti.
	/// </remarks>
	protected override async Task HandleChallengeAsync(AuthenticationProperties properties)
	{
		Response.StatusCode = 401;

		var problemDetailsService = Context.RequestServices.GetRequiredService<IProblemDetailsService>();
		await problemDetailsService.WriteAsync(new ProblemDetailsContext
		{
			HttpContext = Context,
			ProblemDetails = new ProblemDetails
			{
				Status = 401,
				Title = "Unauthorized",
				Detail = "API key non valida o mancante."
			}
		});
	}
}
