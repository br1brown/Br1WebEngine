using Microsoft.Extensions.Localization;

// L'assembly si chiama "backend" (minuscolo) ma il root namespace è "Backend". Senza questo
// attributo IStringLocalizer comporrebbe il prefisso delle risorse dal nome assembly e non
// troverebbe i .resx (ricadendo sulla chiave). L'attributo allinea il prefisso al namespace.
[assembly: RootNamespace("Backend")]

namespace Backend;

/// <summary>
/// Tipo-ancora per <see cref="IStringLocalizer{T}"/>.
/// </summary>
/// <remarks>
/// Non contiene logica: il suo nome individua i file di risorse condivisi
/// <c>Resources/SharedResource.resx</c> (fallback/inglese) e <c>Resources/SharedResource.it.resx</c>.
/// Sta nel namespace radice <c>Backend</c> e fuori dalla cartella <c>Resources/</c>: con
/// <c>ResourcesPath = "Resources"</c> il nome logico delle risorse diventa
/// <c>Backend.Resources.SharedResource</c>, che combacia con il percorso fisico dei .resx.
/// Iniettare <c>IStringLocalizer&lt;SharedResource&gt;</c> dove servono messaggi localizzati
/// (validatori, exception handler, controller).
/// </remarks>
public sealed class SharedResource
{
}
