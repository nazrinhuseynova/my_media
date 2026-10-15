namespace Pulse.Application.Auth.DTOs;

public class RegisterRequest
{
    public string FullName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Contact { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginRequest
{
    public string Contact { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Device { get; set; }
    public bool Adding { get; set; }
}

public class OtpRequest
{
    public string Code { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string? Device { get; set; }
}

public class ResetPasswordRequest
{
    public string ResetToken { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class ChangePasswordRequest
{
    public string CurrentPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}

public class ForgotRequest
{
    public string Contact { get; set; } = string.Empty;
}

public class ResendOtpRequest
{
    public Guid UserId { get; set; }
    public string Type { get; set; } = "register";
}

public class SocialLoginRequest
{
    public string? Email { get; set; }
    public string? FullName { get; set; }
    public string? IdToken { get; set; }
    public string? Device { get; set; }
    public bool Adding { get; set; }
}

public class RefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
    public string? Device { get; set; }
}
