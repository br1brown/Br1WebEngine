using System.Globalization;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Options;
using Br1WebEngine.Models.Configuration;
using Br1WebEngine.Infrastructure;
using Br1WebEngine.Security;
using Br1WebEngine.Services;

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
// IContentStore: astrae l'accesso ai dati. L'implementazione attuale
// (FileContentStore) legge da file JSON con deserializzazione localizzata.
// Sostituibile con database o CMS senza toccare controller o servizi.
//
// SiteService: orchestrazione della logica di business del sito.
//
// AuthService: registrato SOLO se il login e' abilitato (Token.SecretKey
// valorizzata). Se non serve autenticazione, questo servizio non esiste
// a runtime e le risorse associate non vengono allocate.
//
builder.Services.AddSingleton<IContentStore, FileContentStore>();
builder.Services.AddScoped<SiteService>();

if (security.LoginEnabled)
    builder.Services.AddSingleton<AuthService>();

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        // Campi null vengono omessi dal JSON (risposte piu' leggere).
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        // Enum serializzati come stringa, non come numero (piu' leggibili nelle risposte).
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

// ── LOCALIZZAZIONE ──────────────────────────────────────────────────
//
// La lingua della richiesta viene letta dall'header Accept-Language inviato
// dal frontend (impostato dall'interceptor Angular in base alla lingua corrente).
// Supporta italiano e inglese, con fallback all'italiano.
//
builder.Services.Configure<RequestLocalizationOptions>(options =>
{
    var supported = new[] { new CultureInfo("it"), new CultureInfo("en") };
    options.DefaultRequestCulture = new RequestCulture("it");
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
// Vedi SecurityExtensions.cs per i commenti dettagliati su ogni strato.
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
