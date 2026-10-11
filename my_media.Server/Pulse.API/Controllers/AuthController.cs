using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.IdentityModel.Tokens;
using Pulse.API.Helpers;
using Pulse.Application.Auth.DTOs;
using Pulse.Application.Auth.Interfaces;
using Pulse.Application.Mail;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly UserManager<AppUser> _users;
    private readonly ITokenService _tokens;
    private readonly AppDbContext _db;
    private readonly IOtpSender _otp;
    private readonly IHostEnvironment _env;
    private readonly IConfiguration _config;

    public AuthController(UserManager<AppUser> users, ITokenService tokens, AppDbContext db, IOtpSender otp, IHostEnvironment env, IConfiguration config)
    {
        _users = users;
        _tokens = tokens;
        _db = db;
        _otp = otp;
        _env = env;
        _config = config;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var username = (request.Username ?? "").Trim();
        var contact = (request.Contact ?? "").Trim();
        var fullName = (request.FullName ?? "").Trim();
        var passwordError = PasswordProblem(request.Password);
        if (username.Length < 3 || username.Length > 20 || username.Any(c => !char.IsLetterOrDigit(c) && c is not '.' and not '_'))
        {
            return BadRequest(new { message = "İstifadəçi adı 3-20 simvol, hərf, rəqəm, . və _ ola bilər" });
        }

        if (fullName.Length < 2)
        {
            return BadRequest(new { message = "Ad və soyad daxil edin" });
        }

        if (passwordError != null)
        {
            return BadRequest(new { message = passwordError });
        }

        if (await _users.FindByNameAsync(username) != null)
        {
            return BadRequest(new { message = "Bu istifadəçi artıq mövcuddur" });
        }

        var isEmail = contact.Contains('@');
        if (isEmail)
        {
            contact = contact.ToLowerInvariant();
            var emailTaken = await _users.FindByEmailAsync(contact);
            if (emailTaken != null)
            {
                return BadRequest(new { message = "Bu email artıq istifadə olunur" });
            }
        }
        else
        {
            contact = contact.Replace(" ", "");
            if (contact.Length < 9)
            {
                return BadRequest(new { message = "Düzgün telefon yazın" });
            }

            if (await _users.Users.AnyAsync(u => u.PhoneNumber == contact))
            {
                return BadRequest(new { message = "Bu nömrə artıq istifadə olunur" });
            }
        }

        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            UserName = username,
            Email = isEmail ? contact : $"{username}@pulse.local",
            PhoneNumber = isEmail ? null : contact,
            FullName = fullName,
            AvatarUrl = $"https://i.pravatar.cc/300?u={username}",
            EmailConfirmed = false,
            Provider = "email"
        };

        var result = await _users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = IdentityMessage(result) });
        }

        await _users.AddToRoleAsync(user, "User");

        var code = await IssueOtpAsync(user, contact, "register");
        return Ok(new { message = "Kod göndərildi", previewCode = Preview(code), userId = user.Id });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var user = await FindUserAsync(request.Contact);
        if (user == null || !await _users.CheckPasswordAsync(user, request.Password ?? ""))
        {
            return Unauthorized(new { message = "İstifadəçi adı və ya şifrə yanlışdır" });
        }

        if (!user.EmailConfirmed)
        {
            var code = await IssueOtpAsync(user, request.Contact ?? user.Email ?? user.UserName ?? "", "register");
            return StatusCode(403, new
            {
                message = "Əvvəlcə kodu təsdiqləyin",
                needsOtp = true,
                userId = user.Id,
                previewCode = Preview(code)
            });
        }

        var blocked = CheckAccount(user);
        if (blocked != null) return blocked;

        return Ok(await BuildLogin(user));
    }

    [HttpPost("google")]
    [HttpPost("apple")]
    public async Task<IActionResult> Social(SocialLoginRequest request)
    {
        var provider = Request.Path.Value!.Contains("google") ? "google" : "apple";
        if (string.IsNullOrWhiteSpace(request.Email) || !request.Email.Contains('@'))
        {
            return BadRequest(new { message = "Düzgün email yazın" });
        }

        var email = request.Email.Trim().ToLowerInvariant();
        var user = await _users.FindByEmailAsync(email);
        if (user != null)
        {
            var current = string.IsNullOrWhiteSpace(user.Provider) ? "email" : user.Provider;
            if (!current.Equals(provider, StringComparison.OrdinalIgnoreCase))
            {
                var via = current.ToLowerInvariant() switch
                {
                    "google" => "Google",
                    "apple" => "Apple",
                    _ => "şifrə"
                };
                return Conflict(new { message = $"Bu email artıq {via} ilə qeydiyyatdadır. Həmin üsulla daxil ol." });
            }
        }
        else
        {
            var baseName = MakeUserName(email);
            var username = baseName;
            var n = 0;
            while (await _users.FindByNameAsync(username) != null)
            {
                n += 1;
                username = $"{baseName}{n}";
            }

            user = new AppUser
            {
                Id = Guid.NewGuid(),
                UserName = username,
                Email = email,
                FullName = string.IsNullOrWhiteSpace(request.FullName)
                    ? (provider == "google" ? "Google Istifadeci" : "Apple Istifadeci")
                    : request.FullName.Trim(),
                Provider = provider,
                AvatarUrl = $"https://i.pravatar.cc/300?u={email}",
                EmailConfirmed = true
            };
            var created = await _users.CreateAsync(user, Guid.NewGuid().ToString("N") + "aA1");
            if (!created.Succeeded)
            {
                return BadRequest(new { message = IdentityMessage(created) });
            }

            await _users.AddToRoleAsync(user, "User");
        }

        var blocked = CheckAccount(user);
        if (blocked != null) return blocked;

        return Ok(await BuildLogin(user));
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> Forgot(ForgotRequest request)
    {
        var user = await FindUserAsync(request.Contact);
        if (user == null)
        {
            return NotFound(new { message = "İstifadəçi tapılmadı" });
        }

        var contact = (request.Contact ?? "").Trim();
        var code = await IssueOtpAsync(user, contact, "reset");
        return Ok(new { message = "Kod göndərildi", previewCode = Preview(code), userId = user.Id });
    }

    [HttpPost("resend-otp")]
    public async Task<IActionResult> Resend(ResendOtpRequest request)
    {
        var user = await _users.FindByIdAsync(request.UserId.ToString());
        if (user == null)
        {
            return NotFound(new { message = "İstifadəçi tapılmadı" });
        }

        var type = request.Type == "reset" ? "reset" : "register";
        var contact = string.IsNullOrWhiteSpace(user.PhoneNumber) ? user.Email ?? user.UserName ?? "" : user.PhoneNumber;
        var code = await IssueOtpAsync(user, contact, type);
        return Ok(new { message = "Kod yenidən göndərildi", previewCode = Preview(code) });
    }

    [HttpPost("verify-otp")]
    public async Task<IActionResult> VerifyOtp(OtpRequest request)
    {
        var otp = await _db.OtpCodes
            .Where(x => x.UserId == request.UserId && x.Code == request.Code)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync();

        if (otp == null || DateTime.UtcNow - otp.CreatedAt > TimeSpan.FromMinutes(10))
        {
            return BadRequest(new { message = "Kod yanlışdır və ya vaxtı bitib" });
        }

        var user = await _users.FindByIdAsync(request.UserId.ToString());
        if (user == null)
        {
            return NotFound(new { message = "İstifadəçi tapılmadı" });
        }

        user.EmailConfirmed = true;
        await _users.UpdateAsync(user);
        _db.OtpCodes.Remove(otp);
        await _db.SaveChangesAsync();

        if (otp.Type == "register")
        {
            return Ok(await BuildLogin(user));
        }

        var reset = await _tokens.CreateAccessTokenAsync(user);
        return Ok(new { resetToken = reset.Token, message = "Kod tesdiqlendi" });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> Reset(ResetPasswordRequest request)
    {
        var passwordError = PasswordProblem(request.Password);
        if (passwordError != null)
        {
            return BadRequest(new { message = passwordError });
        }

        var key = _config["Jwt:Key"] ?? "";
        var handler = new JwtSecurityTokenHandler();
        System.Security.Claims.ClaimsPrincipal principal;
        try
        {
            principal = handler.ValidateToken(request.ResetToken, new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = _config["Jwt:Issuer"],
                ValidAudience = _config["Jwt:Audience"],
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
                NameClaimType = System.Security.Claims.ClaimTypes.NameIdentifier
            }, out _);
        }
        catch
        {
            return BadRequest(new { message = "Şifrə kodu yanlışdır və ya vaxtı bitib" });
        }
        var id = principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (string.IsNullOrWhiteSpace(id)) return BadRequest(new { message = "Şifrə kodu yanlışdır və ya vaxtı bitib" });
        var user = await _users.FindByIdAsync(id);
        if (user == null)
        {
            return NotFound(new { message = "İstifadəçi tapılmadı" });
        }

        var token = await _users.GeneratePasswordResetTokenAsync(user);
        var result = await _users.ResetPasswordAsync(user, token, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = result.Errors.First().Description });
        }

        return Ok(new { message = "Şifrə yeniləndi" });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        var role = await DtoMapper.GetRole(_users, user!);
        return Ok(DtoMapper.MapUser(user!, role));
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        if (user == null) return Unauthorized();
        var result = await _users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = IdentityMessage(result) });
        }

        return Ok(new { message = "Sifre deyisdirildi" });
    }

    [Authorize]
    [HttpPost("deactivate")]
    public async Task<IActionResult> Deactivate()
    {
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        if (user == null) return Unauthorized();
        user.IsActive = false;
        user.UpdatedAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);
        return Ok(new { message = "Hesab deaktiv edildi" });
    }

    [Authorize]
    [HttpDelete("account")]
    public async Task<IActionResult> DeleteAccount()
    {
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        if (user == null) return Unauthorized();
        var stamp = user.Id.ToString("N")[..8];
        user.IsActive = false;
        user.FullName = "Silinmis hesab";
        user.Bio = "";
        user.Website = "";
        user.AvatarUrl = "";
        user.PhoneNumber = null;
        user.UpdatedAt = DateTime.UtcNow;
        await _users.SetEmailAsync(user, $"deleted_{stamp}@pulse.invalid");
        await _users.SetUserNameAsync(user, $"deleted_{stamp}");
        await _users.UpdateAsync(user);
        return Ok(new { message = "Hesab silindi" });
    }

    private async Task<AppUser?> FindUserAsync(string? raw)
    {
        var contact = (raw ?? "").Trim();
        if (contact.Length == 0) return null;

        var byName = await _users.FindByNameAsync(contact);
        if (byName != null) return byName;

        if (contact.Contains('@'))
        {
            var byEmail = await _users.FindByEmailAsync(contact);
            if (byEmail != null) return byEmail;
        }

        var phone = contact.Replace(" ", "");
        return await _users.Users.FirstOrDefaultAsync(u =>
            u.PhoneNumber == contact || u.PhoneNumber == phone);
    }

    private static string MakeUserName(string email)
    {
        var raw = email.Split('@')[0];
        var chars = raw.Select(c => char.IsLetterOrDigit(c) || c is '.' or '_' ? c : '_').ToArray();
        var cleaned = new string(chars).Trim('.', '_');
        if (cleaned.Length < 3)
        {
            cleaned = "user" + Random.Shared.Next(1000, 9999);
        }

        return cleaned.Length > 20 ? cleaned[..20] : cleaned;
    }

    private IActionResult? CheckAccount(AppUser user)
    {
        if (!user.IsActive) return StatusCode(403, new { message = "Hesab deaktivdir" });
        if (user.IsBanned) return StatusCode(403, new { message = "Hesab dayandırılıb" });
        return null;
    }

    private async Task<string> IssueOtpAsync(AppUser user, string contact, string type)
    {
        var old = await _db.OtpCodes.Where(x => x.UserId == user.Id && x.Type == type).ToListAsync();
        if (old.Count > 0)
        {
            _db.OtpCodes.RemoveRange(old);
        }

        var code = Random.Shared.Next(100000, 999999).ToString();
        _db.OtpCodes.Add(new OtpCode
        {
            UserId = user.Id,
            Contact = contact,
            Code = code,
            Type = type
        });
        await _db.SaveChangesAsync();
        await _otp.SendAsync(contact, code);
        return code;
    }

    private string? Preview(string code)
    {
        if (_env.IsDevelopment() || !string.IsNullOrWhiteSpace(_config["Smtp:PickupDirectory"]))
        {
            return code;
        }

        return null;
    }

    private static string? PasswordProblem(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < 8)
        {
            return "Şifrə ən az 8 simvol olmalıdır";
        }

        if (!password.Any(char.IsLower) || !password.Any(char.IsDigit))
        {
            return "Şifrədə kiçik hərf və rəqəm olmalıdır";
        }

        return null;
    }

    private static string IdentityMessage(IdentityResult result)
    {
        var code = result.Errors.FirstOrDefault()?.Code ?? "";
        return code switch
        {
            "DuplicateUserName" => "Bu istifadəçi artıq mövcuddur",
            "DuplicateEmail" => "Bu email artıq istifadə olunur",
            "PasswordMismatch" => "Cari şifrə yanlışdır",
            "PasswordTooShort" => "Şifrə ən az 8 simvol olmalıdır",
            "PasswordRequiresDigit" => "Şifrədə rəqəm olmalıdır",
            "PasswordRequiresLower" => "Şifrədə kiçik hərf olmalıdır",
            "PasswordRequiresUpper" => "Şifrədə böyük hərf olmalıdır",
            _ => result.Errors.First().Description
        };
    }

    private async Task<object> BuildLogin(AppUser user)
    {
        var access = await _tokens.CreateAccessTokenAsync(user);
        var refresh = _tokens.CreateRefreshToken();
        _db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            Token = refresh.Token,
            ExpiresAt = refresh.ExpiresAt
        });
        await _db.SaveChangesAsync();
        var role = await DtoMapper.GetRole(_users, user);
        return new
        {
            token = access.Token,
            user = DtoMapper.MapUser(user, role)
        };
    }
}
