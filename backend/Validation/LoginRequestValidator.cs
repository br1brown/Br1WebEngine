using Backend.Engine.Validation;
using Microsoft.Extensions.Localization;

namespace Backend.Validation;

/// <summary>
/// Validator concreto per <see cref="Backend.Services.LoginRequest"/>.
/// </summary>
/// <remarks>
/// Eredita le regole base da <see cref="LoginRequestValidatorBase"/>.
/// Aggiungere qui le regole specifiche del progetto (es. whitelist username, policy password).
/// </remarks>
public class LoginRequestValidator : LoginRequestValidatorBase
{
    /// <inheritdoc cref="LoginRequestValidator"/>
    public LoginRequestValidator(IStringLocalizer<SharedResource> localizer) : base(localizer) { }
}
