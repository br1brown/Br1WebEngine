using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using Backend.Models.Configuration;

namespace Backend.Security;

/// <summary>
/// Contiene le estensioni che registrano e applicano la configurazione di sicurezza del template.
/// </summary>
/// <remarks>
/// La sicurezza del template e' organizzata come una pipeline di strati concentrici.
/// Ogni richiesta HTTP attraversa tutti gli strati in ordine, e ognuno puo' bloccarla
/// prima che arrivi al controller. Questo approccio segue il principio "defense in depth":
/// anche se uno strato viene bypassato, quelli successivi continuano a proteggere.
///
/// L'ordine di registrazione in <see cref="AddTemplateSecurity"/> e l'ordine di applicazione
/// in <see cref="UseTemplateSecurity"/> sono entrambi critici e non intercambiabili.
/// </remarks>
public static class SecurityExtensions
{
    /// <summary>
    /// Registra autenticazione, autorizzazione, CORS, rate limiting e gestione errori.
    /// </summary>
    /// <param name="services">Collezione DI da configurare.</param>
    /// <param name="security">Opzioni tipizzate lette da <c>appsettings.json</c>.</param>
    /// <returns>La stessa collezione servizi, per consentire il chaining della configurazione.</returns>
    /// <remarks>
    /// I commenti inline spiegano ogni sezione. L'ordine degli schemi di autenticazione
    /// e' API key (sempre) → JWT (solo se <see cref="SecurityOptions.LoginEnabled"/>).
    /// </remarks>
    public static IServiceCollection AddTemplateSecurity(
        this IServiceCollection services,
        SecurityOptions security)
    {
        // ── AUTENTICAZIONE ──────────────────────────────────────────────
        //
        // Schema primario: API Key (header X-Api-Key).
        //
        var authBuilder = services
            .AddAuthentication(options =>
            {
                // Default per [Authorize] senza policy: basta l'API key.
                // La verifica dell'header avviene in ApiKeyHandler.
                options.DefaultAuthenticateScheme = SecurityDefaults.ApiKeyAuthenticationScheme;
                options.DefaultChallengeScheme = SecurityDefaults.ApiKeyAuthenticationScheme;
            })
            .AddScheme<ApiKeySchemeOptions, ApiKeyHandler>(
                SecurityDefaults.ApiKeyAuthenticationScheme,
                options =>
                {
                    // Chiavi accettate, lette da Security.ApiKeys in appsettings.json.
                    options.ValidKeys = new HashSet<string>(
                        security.ApiKeys,
                        StringComparer.OrdinalIgnoreCase);
                });

        // ── JWT BEARER (condizionale) ───────────────────────────────────
        //
        // Registrato solo se Security.Token.SecretKey e' valorizzata.
        // Se vuota, l'intero sistema JWT non esiste a runtime.
        //
        if (security.LoginEnabled)
        {
            authBuilder.AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    // La firma deve corrispondere alla nostra SecretKey.
                    // Se qualcuno manipola il payload, la firma non torna e il token viene rifiutato.
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = security.Token.GetSigningKey(),

                    // Issuer e Audience non vincolati: il template non sa quale sara'
                    // il dominio finale. Attivali per architetture multi-tenant.
                    ValidateIssuer = false,
                    ValidateAudience = false,

                    // Scaduto e' scaduto, nessun margine di grazia.
                    ClockSkew = TimeSpan.Zero
                };
            });
        }

        // ── AUTORIZZAZIONE ──────────────────────────────────────────────
        //
        // Policy "RequireLogin", usata da ProtectedController con
        // [Authorize(Policy = "RequireLogin")].
        //
        services.AddAuthorization(options =>
        {
            var policyBuilder = new AuthorizationPolicyBuilder(
                // Schema di partenza: API key (serve sempre).
                // BaseController e AuthController usano [Authorize] senza policy,
                // quindi si fermano qui: basta X-Api-Key valido.
                SecurityDefaults.ApiKeyAuthenticationScheme);

            if (security.LoginEnabled)
                // Se il login e' attivo, la policy richiede anche il JWT Bearer.
                policyBuilder.AddAuthenticationSchemes(JwtBearerDefaults.AuthenticationScheme);

            policyBuilder.RequireAuthenticatedUser();
            // Il token JWT deve avere il ruolo "Authenticated" (emesso da AuthService).
            // Se LoginEnabled e' false, nessun JWT handler esiste e questo requisito
            // non puo' mai essere soddisfatto: ProtectedController resta inaccessibile.
            policyBuilder.RequireRole(SecurityDefaults.AuthenticatedRole);

            options.AddPolicy(SecurityDefaults.RequireLoginPolicy, policyBuilder.Build());
        });

        // ── CORS ────────────────────────────────────────────────────────
        //
        // Controlla quali origini (domini) possono chiamare le API dal browser.
        // CORS e' rilevante solo per client browser: chiamate server-to-server,
        // app mobile e altri client non-web non sono soggetti a questa policy.
        //
        // CorsOrigins vuoto = AllowAnyOrigin: scelta deliberata per API pubbliche
        // accessibili da qualsiasi richiedente. La protezione reale e' l'API key
        // (X-Api-Key), che identifica il tipo di client indipendentemente dall'origine.
        // Valorizzare Security.CorsOrigins solo se si vuole limitare l'accesso
        // browser a domini specifici (es. pannello admin su dominio separato).
        services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
            {
                if (security.CorsOrigins.Length == 0)
                    policy.AllowAnyOrigin();
                else
                    policy.WithOrigins(security.CorsOrigins);

				// Gli header consentiti sono quelli usati dal frontend:
				// Content-Type (body JSON), Authorization (JWT), X-Api-Key, Accept-Language.
				policy.AllowAnyMethod()
                    .WithHeaders("Content-Type", "Authorization", SecurityDefaults.ApiKeyHeaderName, "Accept-Language");
            });
        });

        // ── RATE LIMITING ───────────────────────────────────────────────
        //
        // Protezione da abuso, partizionata per IP del client.
        //
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = 429;

            // Globale — 100 req/min per IP. Alto abbastanza per una SPA con prefetch,
            // basso abbastanza per bloccare script automatici e crawler.
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    // RemoteIpAddress e' gia' l'IP reale: se BehindProxy e' true,
                    // UseForwardedHeaders lo ha sovrascritto con X-Forwarded-For.
                    partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 100,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0  // Rifiuta subito, non accodare.
                    }));

            // Login — 5 req/min per IP. Applicata via [EnableRateLimiting("login")]
            // su AuthController.Login. Rende il brute force impraticabile.
            options.AddPolicy(SecurityDefaults.LoginRateLimitPolicy, context =>
                RateLimitPartition.GetFixedWindowLimiter(
                    partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                    factory: _ => new FixedWindowRateLimiterOptions
                    {
                        PermitLimit = 5,
                        Window = TimeSpan.FromMinutes(1),
                        QueueLimit = 0
                    }));
        });

        // ── GESTIONE ERRORI CENTRALIZZATA ───────────────────────────────
        //
        // I controller lanciano ApiException, ApiExceptionHandler le converte
        // in risposte ProblemDetails (RFC 9457) con status, title e detail.
        //
        services.AddProblemDetails();
        services.AddExceptionHandler<ApiExceptionHandler>();

        return services;
    }

    /// <summary>
    /// Aggiunge alla pipeline HTTP i middleware di sicurezza del template.
    /// </summary>
    /// <param name="app">Applicazione ASP.NET da configurare.</param>
    /// <param name="security">Opzioni tipizzate lette da <c>appsettings.json</c>.</param>
    /// <returns>La stessa applicazione, per consentire il chaining della pipeline.</returns>
    /// <remarks>
    /// L'ordine e' critico: ForwardedHeaders → CORS → RateLimiter → SecurityHeaders → ExceptionHandler.
    /// I commenti inline spiegano il perche' di ogni posizione.
    /// Dopo questo metodo, Program.cs chiama UseAuthentication() e UseAuthorization().
    /// </remarks>
    public static WebApplication UseTemplateSecurity(
        this WebApplication app,
        SecurityOptions security)
    {
        // Se l'app e' dietro un reverse proxy, questo middleware legge
        // l'header X-Forwarded-For e sovrascrive context.Connection.RemoteIpAddress
        // con l'IP reale del client. Questo e' fondamentale perche' il rate limiter
        // (AddRateLimiter sopra) partiziona i contatori proprio per RemoteIpAddress:
        // senza questa sovrascrittura, vedrebbe l'IP del proxy per tutti gli utenti.
        //
        // Quando BehindProxy e' false il middleware non viene registrato, cosi'
        // RemoteIpAddress resta l'IP diretto del client e nessuno puo' spoofarlo
        // mandando un X-Forwarded-For finto.
        if (security.BehindProxy)
        {
            app.UseForwardedHeaders(new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor
                    | ForwardedHeaders.XForwardedProto
            });
        }

        // CORS prima del rate limiter: i preflight OPTIONS che il browser
        // manda automaticamente prima di ogni richiesta cross-origin vengono
        // gestiti qui e non consumano il budget del rate limiter.
        app.UseCors();

        // Rate limiting per IP del client.
        // 100 req/min globali, 5 req/min su login.
        // Sta in alto nella pipeline (fail fast): se un client sta abusando,
        // viene bloccato subito senza sprecare risorse sui middleware successivi.
        app.UseRateLimiter();

        // Header di sicurezza su ogni risposta (anche errori e 429).
        // Protegge da clickjacking, XSS, MIME sniffing e abuso API browser.
        app.UseMiddleware<SecurityHeadersMiddleware>();
        app.UseHsts();

        // Gestione centralizzata errori: ApiException → ProblemDetails JSON.
        app.UseExceptionHandler();
        app.UseStatusCodePages();

        return app;
    }
}
