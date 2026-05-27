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

// ── OPENTELEMETRY ───────────────────────────────────────────────────
//
// Attivato solo se OpenTelemetry:Endpoint è valorizzato in appsettings.
// Esporta trace e metriche verso il collector OTLP (es. Jaeger, Tempo, Datadog).
// Se l'endpoint è vuoto l'app funziona senza telemetria, zero dipendenze esterne.
//
var otlpEndpoint = builder.Configuration["OpenTelemetry:Endpoint"];
if (!string.IsNullOrWhiteSpace(otlpEndpoint))
{
    builder.Services.AddOpenTelemetry()
        .ConfigureResource(r => r.AddService(
            serviceName: builder.Configuration["OpenTelemetry:ServiceName"] ?? "backend",
            serviceVersion: builder.Configuration["OpenTelemetry:ServiceVersion"] ?? "1.0.0"))
        .WithTracing(tracing => tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddOtlpExporter(opts => opts.Endpoint = new Uri(otlpEndpoint)))
        .WithMetrics(metrics => metrics
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddOtlpExporter(opts => opts.Endpoint = new Uri(otlpEndpoint)));
}

var app = builder.Build();

// ── PIPELINE HTTP ───────────────────────────────────────────────────
// L'ordine è critico. Vedi DEVELOPMENT.md → "Ordine della pipeline HTTP".
app.UseTemplateSecurity(security);

app.UseRequestLocalization(
    app.Services.GetRequiredService<IOptions<RequestLocalizationOptions>>().Value);

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health").AllowAnonymous();

app.Run();
