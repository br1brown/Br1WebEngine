namespace Backend.Models;

/// <summary>
/// Payload di sessione PERSONALIZZABILE dal progetto: estende il contratto universale
/// <see cref="SessionBase"/> (che garantisce <c>UserId</c>) con i campi di dominio.
/// Serializzato nel claim "session" del JWT e rileggibile nei controller protetti via
/// <c>User.GetSession&lt;SessionInfo&gt;()</c>.
/// </summary>
/// <remarks>
/// Deve rispecchiare l'interfaccia TypeScript <c>frontend/src/app/core/dto/session.dto.ts</c>:
/// tieni le due in sincronia a mano (contratto piccolo e stabile, niente codegen).
/// Solo dati NON sensibili: il JWT è leggibile dal client.
///
/// Esempio fornito col template — sostituisci i campi di dominio con quelli reali.
/// </remarks>
public record SessionInfo : SessionBase
{
    /// <summary>Nome visualizzato dell'utente.</summary>
    public string DisplayName { get; init; } = "";

    /// <summary>Ruoli applicativi (di dominio, distinti dal ruolo JWT "Authenticated").</summary>
    public string[] Roles { get; init; } = [];
}
