using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Options;
using Backend.Models.Configuration;
using Backend.Infrastructure;
using Backend.Security;
using Backend.Services;

var builder = WebApplication.CreateBuilder(args);

// ── CONFIGURAZIONE ──────────────────────────────────────────────────
//
// Le opzioni di sicurezza vengono lette da appsettings.json (sezione "Security")
// e rese disponibili sia come IOptions<SecurityOptions> (via DI) sia come
// istanza diretta per la configurazione dei servizi qui sotto.
//
builder.Services.Configure<SecurityOptions>(
    builder.Configuration.GetSection("Security"));

var security = builder.Configuration
    .GetSection("Security")
    .Get<SecurityOptions>() ?? new SecurityOptions();

// ── SERVIZI APPLICATIVI ─────────────────────────────────────────────
//
// IContentStore: astrae l'accesso ai dati (engine).
// L'implementazione attuale (FileContentStore) e' nella zona custom del progetto.
// Sostituibile con database o CMS senza toccare controller o servizi.
//
// SiteService: logica di business del progetto (custom).
//
// AuthService: infrastruttura JWT dell'engine. Registrato SOLO se il login
// e' abilitato (Token.SecretKey valorizzata).
//
builder.Services.AddSingleton<IContentStore, FileContentStore>();
builder.Services.AddScoped<SiteService>();

if (security.LoginEnabled)
    builder.Services.AddSingleton<AuthService>();

builder.Services
    .AddControllers()
    .ConfigureApplicationPartManager(manager =>
    {
        manager.FeatureProviders.Add(
            new TemplateControllerFeatureProvider(security.LoginEnabled));
    })
    .AddJsonOptions(options =>
    {
        // Campi null vengono omessi dal JSON (risposte piu' leggere).
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        // Enum serializzati come stringa, non come numero (piu' leggibili nelle risposte).
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

// ── LOCALIZZAZIONE ──────────────────────────────────────────────────
//
// Le lingue supportate vengono lette da appsettings.json (sezione "Localization").
// La lingua della richiesta viene poi risolta dall'header Accept-Language
// inviato dal frontend (impostato dall'interceptor Angular).
//
var langCodes = builder.Configuration
    .GetSection("Localization:SupportedLanguages")
    .Get<string[]>() ?? ["it"];
var defaultLang = builder.Configuration["Localization:DefaultLanguage"] ?? langCodes[0];

builder.Services.Configure<RequestLocalizationOptions>(options =>
{
    var supported = langCodes.Select(l => new CultureInfo(l)).ToArray();
    options.DefaultRequestCulture = new RequestCulture(defaultLang);
    options.SupportedCultures = supported;
    options.SupportedUICultures = supported;
    options.ApplyCurrentCultureToResponseHeaders = true;
    options.RequestCultureProviders = [new AcceptLanguageHeaderRequestCultureProvider()];
});

// ── SICUREZZA ───────────────────────────────────────────────────────
//
// Una sola chiamata registra TUTTI i servizi di sicurezza del template:
// API key, JWT (se configurato), CORS, rate limiting, security headers
// e gestione centralizzata degli errori (ProblemDetails).
//
builder.Services.AddTemplateSecurity(security);

// Health check — GET /health (senza autenticazione)
builder.Services.AddHealthChecks();

var app = builder.Build();

// ── PIPELINE HTTP ───────────────────────────────────────────────────
//
// L'ORDINE E' CRITICO. La pipeline viene attraversata dall'alto al basso
// per ogni richiesta, e dal basso all'alto per ogni risposta.
//
// UseTemplateSecurity() registra (in ordine):
//   1. ForwardedHeaders  → ricostruisce IP reale (solo se BehindProxy = true)
//   2. CORS              → gestisce preflight OPTIONS senza consumare rate limit
//   3. RateLimiter       → 100 req/min globali, 5/min su login (fail fast)
//   4. SecurityHeaders   → header anti-clickjacking/XSS su ogni risposta
//   5. HSTS              → forza HTTPS
//   6. ExceptionHandler  → ApiException → ProblemDetails JSON
//
// Poi, dopo UseTemplateSecurity():
//   7. RequestLocalization → legge Accept-Language per localizzare i dati
//   8. Authentication      → valida API key e (se configurato) JWT
//   9. Authorization       → applica policy "RequireLogin" sui controller protetti
//   10. MapControllers     → smista la richiesta al controller corretto
//
app.UseTemplateSecurity(security);

app.UseRequestLocalization(
    app.Services.GetRequiredService<IOptions<RequestLocalizationOptions>>().Value);

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health").AllowAnonymous();

app.Run();
