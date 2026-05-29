using System.Globalization;
using System.Text.Json.Serialization;
using FluentValidation;
using Microsoft.AspNetCore.Localization;
using Microsoft.Extensions.Options;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using OpenTelemetry.Metrics;
using Backend.Models.Configuration;
using Backend.Infrastructure;
using Backend.Security;
using Backend.Services;

var builder = WebApplication.CreateBuilder(args);

// global-settings.json è l'unica sorgente di verità per la configurazione del deployment.
// Rimuoviamo esplicitamente le configurazioni di default (global-settings.json e simili)
var defaultJsonSources = builder.Configuration.Sources.OfType<Microsoft.Extensions.Configuration.Json.JsonConfigurationSource>().ToList();
foreach (var source in defaultJsonSources)
{
    if (source.Path != null && source.Path.StartsWith("appsettings"))
    {
        builder.Configuration.Sources.Remove(source);
    }
}

// Dev: cwd=backend/ → la root del repo è un livello sopra. Si usa un path ASSOLUTO:
// AddJsonFile con path relativo "../" verrebbe rifiutato dal PhysicalFileProvider
// (la traversal ".." è bloccata), quindi in locale il file non verrebbe mai caricato.
// Docker: cwd=/app, file montato come /app/global-settings.json → global-settings.json (stesso dir).
builder.Configuration.AddJsonFile(
    Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "global-settings.json")),
    optional: true, reloadOnChange: false);
builder.Configuration.AddJsonFile("global-settings.json", optional: true, reloadOnChange: false);

// ── CONFIGURAZIONE ──────────────────────────────────────────────────
//
// Ogni sezione di global-settings.json viene registrata come IOptions<T> (DI)
// e letta una volta come istanza diretta per la configurazione dei servizi.
//
builder.Services.Configure<SecurityOptions>(
    builder.Configuration.GetSection("Security"));
builder.Services.Configure<LocalizationOptions>(
    builder.Configuration.GetSection("Localization"));
builder.Services.Configure<OpenTelemetryOptions>(
    builder.Configuration.GetSection("OpenTelemetry"));

var security = builder.Configuration
    .GetSection("Security")
    .Get<SecurityOptions>() ?? new SecurityOptions();
var localization = builder.Configuration
    .GetSection("Localization")
    .Get<LocalizationOptions>() ?? new LocalizationOptions();
var otlp = builder.Configuration
    .GetSection("OpenTelemetry")
    .Get<OpenTelemetryOptions>() ?? new OpenTelemetryOptions();

// ── SERVIZI APPLICATIVI ─────────────────────────────────────────────
// IContentStore (FileContentStore): accesso dati, sostituibile con DB senza toccare controller.
// SiteService: logica di business del progetto.
// AuthService: infrastruttura JWT, registrata solo se LoginEnabled.
builder.Services.AddSingleton<IContentStore, FileContentStore>();
builder.Services.AddScoped<SiteService>();

if (security.LoginEnabled)
    builder.Services.AddSingleton<AuthService>();

// Registra tutti i validator FluentValidation dell'assembly corrente (Validation/).
// I controller iniettano IValidator<T> ed eseguono la validazione esplicitamente.
builder.Services.AddValidatorsFromAssemblyContaining<Program>(ServiceLifetime.Singleton);

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
// Le lingue supportate vengono lette da LocalizationOptions (già registrato).
// La lingua della richiesta viene poi risolta dall'header Accept-Language
// inviato dal frontend (impostato dall'interceptor Angular).
//
// AddLocalization abilita IStringLocalizer: i messaggi (validazione ed errori applicativi)
// vivono nei file .resx sotto Resources/ e si risolvono per CurrentUICulture.
builder.Services.AddLocalization(options => options.ResourcesPath = "Resources");

builder.Services.Configure<RequestLocalizationOptions>(options =>
{
    var supported = localization.SupportedLanguages.Select(l => new CultureInfo(l)).ToArray();
    options.DefaultRequestCulture = new RequestCulture(localization.DefaultLanguage);
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

// ── OPENTELEMETRY ───────────────────────────────────────────────────
//
// Attivato solo se OpenTelemetry:Endpoint è valorizzato in appsettings.
// Esporta trace e metriche verso il collector OTLP (es. Jaeger, Tempo, Datadog).
// Se l'endpoint è vuoto l'app funziona senza telemetria, zero dipendenze esterne.
//
if (!string.IsNullOrWhiteSpace(otlp.Endpoint))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService(
            serviceName: otlp.ServiceName,
            serviceVersion: otlp.ServiceVersion))
        .WithTracing(tracing => tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddOtlpExporter(opts => opts.Endpoint = new Uri(otlp.Endpoint)))
        .WithMetrics(metrics => metrics
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddOtlpExporter(opts => opts.Endpoint = new Uri(otlp.Endpoint)));
}

var app = builder.Build();

// ── PIPELINE HTTP ───────────────────────────────────────────────────
// L'ordine è critico. Vedi README.md → "Ordine della pipeline HTTP".
app.UseTemplateSecurity(security);

app.UseRequestLocalization(
    app.Services.GetRequiredService<IOptions<RequestLocalizationOptions>>().Value);

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health").AllowAnonymous();

app.Run();
