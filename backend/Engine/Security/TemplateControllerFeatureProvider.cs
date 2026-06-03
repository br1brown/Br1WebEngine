using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Controllers;
using Backend.Controllers;

namespace Backend.Security;

/// <summary>
/// Esclude dalla discovery i controller che dipendono dal login quando il login e' disabilitato.
/// </summary>
/// <remarks>
/// Il template tiene Auth e Protected controller come classi concrete sempre presenti nel progetto,
/// ma non e' detto che debbano essere esposti in tutti gli ambienti. Quando il login e' spento
/// a livello di configurazione, questi controller vengono rimossi prima che ASP.NET costruisca
/// la tabella finale degli endpoint.
/// </remarks>
public sealed class TemplateControllerFeatureProvider : IApplicationFeatureProvider<ControllerFeature>
{
    private readonly bool _loginEnabled;

    /// <summary>
    /// Inizializza il filtro dei controller del template.
    /// </summary>
    /// <param name="loginEnabled">
    /// <see langword="true"/> se i controller che dipendono dal login devono restare esposti;
    /// <see langword="false"/> se vanno esclusi dalla discovery.
    /// </param>
    public TemplateControllerFeatureProvider(bool loginEnabled)
    {
        _loginEnabled = loginEnabled;
    }

    /// <summary>
    /// Interviene sulla lista dei controller scoperti da ASP.NET e rimuove quelli non validi
    /// per la configurazione di sicurezza corrente del template.
    /// </summary>
    /// <param name="parts">Application parts caricate da ASP.NET.</param>
    /// <param name="feature">Feature che contiene l'elenco dei controller candidati.</param>
    public void PopulateFeature(
        IEnumerable<ApplicationPart> parts,
        ControllerFeature feature)
    {
        _ = parts;

        if (_loginEnabled)
            return;

        RemoveControllersDerivedFrom<EngineAuthController>(feature);
        RemoveControllersDerivedFrom<EngineProtectedController>(feature);
    }

    private static void RemoveControllersDerivedFrom<TControllerBase>(ControllerFeature feature)
        where TControllerBase : ControllerBase
    {
        // IsAssignableFrom verifica se il TypeInfo del controller concreto
        // è uguale a TControllerBase oppure eredita da esso (direttamente o transitivamente).
        // Esempio: AuthController : EngineAuthController → IsAssignableFrom ritorna true.
        //
        // .ToArray() è necessario perché non si può iterare e modificare la stessa collezione:
        // materializzando prima la lista dei candidati si evita l'eccezione "collection modified".
        var toRemove = feature.Controllers
            .Where(controller => typeof(TControllerBase).IsAssignableFrom(controller.AsType()))
            .ToArray();

        // Rimuove i controller trovati dalla feature, uno per volta.
        // Dopo questa chiamata ASP.NET non li vedrà mai come endpoint registrati:
        // non genererà rotte, non li esporrà in Swagger, non li raggiungerà alcuna richiesta.
        foreach (var controller in toRemove)
            feature.Controllers.Remove(controller);
    }
}
