using FluentValidation;
using Microsoft.Extensions.Localization;
using Backend.Services;

namespace Backend.Engine.Validation;

/// <summary>
/// Validator base per <see cref="LoginRequest"/>: regole minime condivise da tutti i progetti.
/// </summary>
/// <remarks>
/// Estendere questa classe nel progetto figlio per aggiungere regole specifiche
/// (es. formato email, complessità password, policy aziendali).
/// I messaggi sono localizzati: la lambda di <c>WithMessage</c> interroga
/// <see cref="IStringLocalizer{T}"/> a ogni validazione, così risolve la lingua corrente
/// della richiesta anche se il validator è registrato come singleton.
/// </remarks>
public abstract class LoginRequestValidatorBase : AbstractValidator<LoginRequest>
{
    /// <inheritdoc cref="LoginRequestValidatorBase"/>
    protected LoginRequestValidatorBase(IStringLocalizer<SharedResource> localizer)
    {
        RuleFor(x => x.Username)
            .NotEmpty().WithMessage(_ => localizer["username_required"].Value);

        RuleFor(x => x.Pwd)
            .NotEmpty().WithMessage(_ => localizer["pwd_required"].Value)
            .MinimumLength(8).WithMessage(_ => localizer["pwd_length"].Value);
    }
}
