using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.IdentityModel.Tokens;
using Backend.Models.Configuration;

namespace Backend.Security;

/// <summary>
/// Estensioni che registrano e applicano la sicurezza del template (defense in depth).
/// L'ordine di registrazione e applicazione è fisso. Vedi DEVELOPMENT.md → "Pipeline HTTP".
/// </summary>
public static class SecurityExtensions
{
    /// <summary>
    /// Registra autenticazione, autorizzazione, CORS, rate limiting e gestione errori.
    /// </summary>
    /// <param name="services">Collezione DI da configurare.</param>
    /// <param name="security">Opzioni tipizzate lette da <c>global-settings.json</c>.</param>
    /// <returns>La stessa collezione servizi, per consentire il chaining della configurazione.</returns>
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
                    // Chiavi accettate, lette da Security.ApiKeys in global-settings.json.
                    // Confronto ORDINALE (case-sensitive): una API key è un segreto,
                    // ignorare il case ne dimezzerebbe l'entropia.
                    options.ValidKeys = new HashSet<string>(security.ApiKeys, StringComparer.Ordinal);
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
        // CorsOrigins vuoto = AllowAnyOrigin deliberato: la protezione reale è l'API key.
        // Valorizzare Security.CorsOrigins solo per domini admin separati o multi-tenant.
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
    /// <param name="security">Opzioni tipizzate lette da <c>global-settings.json</c>.</param>
    /// <returns>La stessa applicazione, per consentire il chaining della pipeline.</returns>
    public static WebApplication UseTemplateSecurity(
        this WebApplication app,
        SecurityOptions security)
    {
        // BehindProxy: legge X-Forwarded-For e sovrascrive RemoteIpAddress con l'IP reale.
        // Necessario perché il rate limiter partiziona per RemoteIpAddress.
        // Se false, il middleware non viene registrato: nessuno può spoofarlo con X-Forwarded-For.
        if (security.BehindProxy)
        {
            var fwdOptions = new ForwardedHeadersOptions
            {
                ForwardedHeaders = ForwardedHeaders.XForwardedFor
                    | ForwardedHeaders.XForwardedProto
            };

            // Trusted solo da reti private RFC 1918 (range Docker).
            // IP pubblici → X-Forwarded-For ignorato → rate limiter vede l'IP reale.
            fwdOptions.KnownNetworks.Clear();
            fwdOptions.KnownProxies.Clear();
            fwdOptions.KnownNetworks.Add(new IPNetwork(System.Net.IPAddress.Parse("10.0.0.0"), 8));
            fwdOptions.KnownNetworks.Add(new IPNetwork(System.Net.IPAddress.Parse("172.16.0.0"), 12));
            fwdOptions.KnownNetworks.Add(new IPNetwork(System.Net.IPAddress.Parse("192.168.0.0"), 16));

            app.UseForwardedHeaders(fwdOptions);
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

        // Header di sicurezza rivolti al browser, definiti in Security.Headers di
        // global-settings.json e condivisi col frontend Node SSR. Nel default il backend
        // è interno e l'SSR è l'unico layer che parla col browser, ma quando backend.public
        // è attivo il backend diventa raggiungibile dal browser: applicarli qui rende
        // l'esposizione sicura a prescindere dal reverse proxy. Content-Security-Policy
        // viene saltata: il backend serve solo JSON, su cui la CSP non ha effetto nel
        // browser (e conterrebbe il placeholder per-nonce, gestito solo dall'SSR).
        if (security.Headers.Count > 0)
        {
            var browserHeaders = security.Headers
                .Where(h => !string.Equals(h.Key, "Content-Security-Policy", StringComparison.OrdinalIgnoreCase))
                .ToArray();

            app.Use(async (context, next) =>
            {
                context.Response.OnStarting(() =>
                {
                    foreach (var (name, value) in browserHeaders)
                        context.Response.Headers[name] = value;
                    return Task.CompletedTask;
                });
                await next();
            });
        }

        app.UseHsts();

        // Gestione centralizzata errori: ApiException → ProblemDetails JSON.
        app.UseExceptionHandler();
        app.UseStatusCodePages();

        return app;
    }
}
