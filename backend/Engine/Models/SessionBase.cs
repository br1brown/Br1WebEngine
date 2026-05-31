namespace Backend.Models;

/// <summary>
/// Contratto MINIMO di sessione garantito dall'engine: ogni sessione autenticata
/// identifica il proprio principale tramite <see cref="UserId"/>.
/// </summary>
/// <remarks>
/// È la parte universale del payload del claim "session". Il progetto la estende
/// con i propri campi di dominio (vedi <c>SessionInfo</c>). L'engine può leggere il
/// solo <see cref="SessionBase"/> via <c>User.GetSession&lt;SessionBase&gt;()</c> per
/// ottenere l'identità del principale senza conoscere la forma specifica del progetto.
///
/// Specchio lato frontend: <c>core/engine/models/session-base.model.ts</c>.
/// </remarks>
public record SessionBase
{
    /// <summary>Identificativo stabile del principale autenticato.</summary>
    public string UserId { get; init; } = "";
}
