using FluentValidation;
using Microsoft.Extensions.Localization;
using Backend.Services;

namespace Backend.Validation;

/// <summary>
/// Validator per <see cref="LoginRequest"/>. Adatta le regole alle policy del progetto.
/// </summary>
public class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator(IStringLocalizer<SharedResource> localizer)
    {
        RuleFor(x => x.Username)
            .NotEmpty().WithMessage(_ => localizer["username_required"].Value);

        RuleFor(x => x.Pwd)
            .NotEmpty().WithMessage(_ => localizer["pwd_required"].Value)
            .MinimumLength(8).WithMessage(_ => localizer["pwd_length"].Value);
    }
}
