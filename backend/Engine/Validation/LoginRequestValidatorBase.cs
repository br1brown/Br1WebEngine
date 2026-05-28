using FluentValidation;
using Backend.Services;

namespace Backend.Engine.Validation;

/// <summary>
/// Validator base per <see cref="LoginRequest"/>: regole minime condivise da tutti i progetti.
/// </summary>
/// <remarks>
/// Estendere questa classe nel progetto figlio per aggiungere regole specifiche
/// (es. formato email, complessità password, policy aziendali).
/// Le regole base garantiscono che il campo non sia vuoto e rispetti la lunghezza minima.
/// </remarks>
public abstract class LoginRequestValidatorBase : AbstractValidator<LoginRequest>
{
    /// <inheritdoc cref="LoginRequestValidatorBase"/>
    protected LoginRequestValidatorBase()
    {
        RuleFor(x => x.Pwd)
            .NotEmpty().WithMessage("La password è obbligatoria.")
            .MinimumLength(8).WithMessage("La password deve contenere almeno 8 caratteri.");
    }
}
