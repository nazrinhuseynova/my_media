using System.IdentityModel.Tokens.Jwt;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
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
    private readonly IConfiguration _config;

    public AuthController(UserManager<AppUser> users, ITokenService tokens, AppDbContext db, IOtpSender otp, IConfiguration config)
    {
        _users = users;
        _tokens = tokens;
        _db = db;
        _otp = otp;
        _config = config;
    }

    [AllowAnonymous]
    [HttpGet("providers")]
    public IActionResult Providers()
    {
        return Ok(new
        {
            googleClientId = _config["Google:ClientId"] ?? "",
            appleClientId = _config["Apple:ClientId"] ?? "",
            facebookAppId = _config["Facebook:AppId"] ?? "",
            githubClientId = _config["GitHub:ClientId"] ?? "",
            microsoftClientId = _config["Microsoft:ClientId"] ?? ""
        });
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var username = (request.Username ?? "").Trim();
        var contact = (request.Contact ?? "").Trim();
        var fullName = (request.FullName ?? "").Trim();
        var passwordError = PasswordProblem(request.Password);
        if (username.Equals("admin", StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { message = "Admin ayrıca hesabdır. Yeni hesab kimi açılmır" });
        }

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
        if (!isEmail)
        {
            return BadRequest(new { message = "Qeydiyyat üçün email lazımdır" });
        }

        contact = contact.ToLowerInvariant();
        var emailTaken = await _users.FindByEmailAsync(contact);
        if (emailTaken != null)
        {
            return BadRequest(new { message = "Bu email artıq istifadə olunur" });
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
            Provider = "email",
            Language = null
        };

        var result = await _users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = IdentityMessage(result) });
        }

        await _users.AddToRoleAsync(user, "User");

        try
        {
            await IssueOtpAsync(user, contact, "register");
        }
        catch (InvalidOperationException ex) when (ex.Message == "Email mövcud deyil")
        {
            await DropPendingUserAsync(user);
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException)
        {
            return StatusCode(503, new { message = "Kod göndərilmədi. Bir az sonra yenidən cəhd et", needsOtp = true, userId = user.Id });
        }
        return Ok(new { message = "Kod emailinə göndərildi", userId = user.Id });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var user = await FindUserAsync(request.Contact);
        if (user != null && await _users.IsLockedOutAsync(user))
            return StatusCode(403, new { message = "Hesab müvəqqəti bağlıdır. Bir az sonra yenidən cəhd et" });
        if (user == null || !await _users.CheckPasswordAsync(user, request.Password ?? ""))
        {
            if (user != null) await _users.AccessFailedAsync(user);
            return Unauthorized(new { message = "İstifadəçi adı və ya şifrə yanlışdır" });
        }
        await _users.ResetAccessFailedCountAsync(user);

        if (!user.EmailConfirmed)
        {
            try
            {
                await IssueOtpAsync(user, Mailbox(user, request.Contact), "register");
                return StatusCode(403, new
            {
                message = "Əvvəlcə emailə gələn kodu təsdiqləyin",
                needsOtp = true,
                userId = user.Id
            });
            }
            catch (InvalidOperationException ex) when (ex.Message == "Email mövcud deyil")
            {
                return BadRequest(new { message = ex.Message });
            }
            catch (InvalidOperationException)
            {
                return StatusCode(503, new
                {
                    message = "Kod göndərilmədi. Bir az sonra yenidən cəhd et",
                    needsOtp = true,
                    userId = user.Id
                });
            }
        }

        var blocked = await CheckAccount(user);
        if (blocked != null) return blocked;
        var desk = await RejectDeskAttach(user, request.Adding);
        if (desk != null) return desk;

        return Ok(await BuildLogin(user, request.Device));
    }

    [HttpPost("google")]
    [HttpPost("apple")]
    [HttpPost("facebook")]
    [HttpPost("github")]
    [HttpPost("microsoft")]
    public async Task<IActionResult> Social(SocialLoginRequest request)
    {
        var path = Request.Path.Value ?? "";
        var provider = path.Contains("facebook", StringComparison.OrdinalIgnoreCase) ? "facebook"
            : path.Contains("github", StringComparison.OrdinalIgnoreCase) ? "github"
            : path.Contains("microsoft", StringComparison.OrdinalIgnoreCase) ? "microsoft"
            : path.Contains("google", StringComparison.OrdinalIgnoreCase) ? "google"
            : "apple";
        ProviderIdentity identity;
        try
        {
            identity = provider switch
            {
                "facebook" => await ProviderTokenVerifier.ReadFacebookAsync(request.IdToken, _config["Facebook:AppId"], _config["Facebook:AppSecret"]),
                "github" => await ProviderTokenVerifier.ReadGitHubAsync(request.IdToken, _config["GitHub:ClientId"], _config["GitHub:ClientSecret"], OAuthRedirectUri()),
                "microsoft" => await ProviderTokenVerifier.ReadMicrosoftAsync(request.IdToken, _config["Microsoft:ClientId"]),
                _ => await ProviderTokenVerifier.ReadAsync(provider, request.IdToken, provider == "google" ? _config["Google:ClientId"] : _config["Apple:ClientId"])
            };
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        var email = identity.Email;
        var user = await _users.FindByEmailAsync(email);
        if (user == null)
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
                    ? (string.IsNullOrWhiteSpace(identity.Name)
                        ? ProviderPerson(provider)
                        : identity.Name)
                    : request.FullName.Trim(),
                Provider = provider,
                AvatarUrl = $"https://i.pravatar.cc/300?u={email}",
                EmailConfirmed = true,
                Language = null
            };
            var created = await _users.CreateAsync(user, Guid.NewGuid().ToString("N") + "aA1");
            if (!created.Succeeded)
            {
                // Email may already exist under a different lookup — sign into that account.
                user = await _users.FindByEmailAsync(email);
                if (user == null)
                {
                    return BadRequest(new { message = IdentityMessage(created) });
                }
            }
            else
            {
                await _users.AddToRoleAsync(user, "User");
            }
        }

        if (!user.EmailConfirmed)
        {
            user.EmailConfirmed = true;
            await _users.UpdateAsync(user);
        }

        var blocked = await CheckAccount(user);
        if (blocked != null) return blocked;
        var desk = await RejectDeskAttach(user, request.Adding);
        if (desk != null) return desk;

        return Ok(await BuildLogin(user, request.Device));
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
        try
        {
            await IssueOtpAsync(user, Mailbox(user, contact), "reset");
        }
        catch (InvalidOperationException ex)
        {
            return MailProblem(ex);
        }
        return Ok(new { message = "Kod emailinə göndərildi", userId = user.Id });
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
        try
        {
            await IssueOtpAsync(user, Mailbox(user, user.Email), type);
        }
        catch (InvalidOperationException ex)
        {
            return MailProblem(ex);
        }
        return Ok(new { message = "Kod yenidən emailinə göndərildi" });
    }

    [HttpPost("verify-otp")]
    public async Task<IActionResult> VerifyOtp(OtpRequest request)
    {
        var otp = await _db.OtpCodes
            .Where(x => x.UserId == request.UserId && x.Code == request.Code)
            .OrderByDescending(x => x.CreatedAt)
            .FirstOrDefaultAsync();

        if (otp == null || otp.IsDeleted || DateTime.UtcNow - otp.CreatedAt > TimeSpan.FromMinutes(10))
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

        var blocked = await CheckAccount(user);
        if (blocked != null) return blocked;

        if (otp.Type == "register")
        {
            return Ok(await BuildLogin(user, request.Device));
        }

        return Ok(new { resetToken = CreateResetToken(user), message = "Kod tesdiqlendi" });
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
        if (principal.FindFirst("purpose")?.Value != "password-reset")
            return BadRequest(new { message = "Şifrə kodu yanlışdır və ya vaxtı bitib" });
        var id = principal.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (string.IsNullOrWhiteSpace(id)) return BadRequest(new { message = "Şifrə kodu yanlışdır və ya vaxtı bitib" });
        var user = await _users.FindByIdAsync(id);
        if (user == null)
        {
            return NotFound(new { message = "İstifadəçi tapılmadı" });
        }
        var blocked = await CheckAccount(user);
        if (blocked != null) return blocked;
        if (principal.FindFirst("sst")?.Value != user.SecurityStamp)
            return BadRequest(new { message = "Şifrə kodu yanlışdır və ya vaxtı bitib" });

        var token = await _users.GeneratePasswordResetTokenAsync(user);
        var result = await _users.ResetPasswordAsync(user, token, request.Password);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = result.Errors.First().Description });
        }

        await DropSessions(user);
        return Ok(new { message = "Şifrə yeniləndi" });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(RefreshRequest request)
    {
        var token = (request.RefreshToken ?? "").Trim();
        if (token.Length == 0) return Unauthorized(new { message = "Sessiya bitib" });
        var row = await _db.RefreshTokens.Include(t => t.User).FirstOrDefaultAsync(t => t.Token == token && !t.IsDeleted);
        if (row == null || row.IsRevoked || row.ExpiresAt <= DateTime.UtcNow)
            return Unauthorized(new { message = "Sessiya bitib" });
        var blocked = await CheckAccount(row.User);
        if (blocked != null) return blocked;
        row.IsRevoked = true;
        row.RevokedAt = DateTime.UtcNow;
        var device = string.IsNullOrWhiteSpace(request.Device) ? row.DeviceName : request.Device;
        return Ok(await BuildLogin(row.User, device));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest request)
    {
        var token = (request.RefreshToken ?? "").Trim();
        if (token.Length == 0) return Ok(new { message = "Çıxış olundu" });
        var row = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.Token == token && !t.IsDeleted);
        if (row != null && !row.IsRevoked)
        {
            row.IsRevoked = true;
            row.RevokedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
        return Ok(new { message = "Çıxış olundu" });
    }

    [Authorize]
    [HttpGet("sessions")]
    public async Task<IActionResult> Sessions()
    {
        var userId = DtoMapper.GetUserId(User);
        var now = DateTime.UtcNow;
        var current = User.FindFirst("sid")?.Value;
        var rows = await _db.RefreshTokens
            .Where(t => t.UserId == userId && !t.IsRevoked && !t.IsDeleted && t.ExpiresAt > now)
            .OrderByDescending(t => t.LastUsedAt)
            .ToListAsync();
        return Ok(rows.Select(t => new
        {
            id = t.Id,
            device = string.IsNullOrWhiteSpace(t.DeviceName) ? "Naməlum cihaz" : t.DeviceName,
            createdAt = t.CreatedAt,
            lastUsedAt = t.LastUsedAt,
            current = string.Equals(current, t.Id.ToString(), StringComparison.OrdinalIgnoreCase)
        }));
    }

    [Authorize]
    [HttpDelete("sessions/{id:guid}")]
    public async Task<IActionResult> RevokeSession(Guid id)
    {
        var userId = DtoMapper.GetUserId(User);
        var row = await _db.RefreshTokens.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId && !t.IsDeleted);
        if (row == null) return NotFound(new { message = "Sessiya tapılmadı" });
        if (!row.IsRevoked)
        {
            row.IsRevoked = true;
            row.RevokedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
        var current = string.Equals(User.FindFirst("sid")?.Value, id.ToString(), StringComparison.OrdinalIgnoreCase);
        return Ok(new { message = "Sessiya bağlandı", current });
    }

    [Authorize]
    [HttpPost("sessions/revoke-others")]
    public async Task<IActionResult> RevokeOtherSessions()
    {
        var userId = DtoMapper.GetUserId(User);
        var current = User.FindFirst("sid")?.Value;
        Guid.TryParse(current, out var sid);
        var rows = await _db.RefreshTokens
            .Where(t => t.UserId == userId && !t.IsRevoked && !t.IsDeleted && t.Id != sid)
            .ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var row in rows)
        {
            row.IsRevoked = true;
            row.RevokedAt = now;
        }
        if (rows.Count > 0) await _db.SaveChangesAsync();
        return Ok(new { message = "Digər sessiyalar bağlandı", count = rows.Count });
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        var role = await DtoMapper.GetRole(_users, user!);
        return Ok(DtoMapper.MapUser(user!, role, includePrivacy: true));
    }

    [Authorize]
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        if (user == null) return Unauthorized();
        var passwordError = PasswordProblem(request.NewPassword);
        if (passwordError != null) return BadRequest(new { message = passwordError });
        var result = await _users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!result.Succeeded)
        {
            return BadRequest(new { message = IdentityMessage(result) });
        }

        await DropSessions(user);
        return Ok(await BuildLogin(user, null));
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
        await DropSessions(user);
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
        await DropSessions(user);
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

    private string OAuthRedirectUri()
    {
        var origin = Request.Headers.Origin.FirstOrDefault();
        if (string.IsNullOrWhiteSpace(origin))
        {
            var referer = Request.Headers.Referer.FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(referer) && Uri.TryCreate(referer, UriKind.Absolute, out var uri))
                origin = uri.GetLeftPart(UriPartial.Authority);
        }
        if (string.IsNullOrWhiteSpace(origin))
            origin = _config["Client:Origin"] ?? "https://localhost:53464";
        return origin.TrimEnd('/') + "/oauth-callback.html";
    }

    private static string ProviderPerson(string provider) => provider switch
    {
        "google" => "Google istifadəçisi",
        "apple" => "Apple istifadəçisi",
        "facebook" => "Facebook istifadəçisi",
        "github" => "GitHub istifadəçisi",
        "microsoft" => "Microsoft istifadəçisi",
        _ => "İstifadəçi"
    };

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

    private async Task DropSessions(AppUser user)
    {
        await _users.UpdateSecurityStampAsync(user);
        var rows = await _db.RefreshTokens.Where(t => t.UserId == user.Id && !t.IsRevoked && !t.IsDeleted).ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var row in rows)
        {
            row.IsRevoked = true;
            row.RevokedAt = now;
        }
        if (rows.Count > 0) await _db.SaveChangesAsync();
    }

    private async Task<IActionResult?> RejectDeskAttach(AppUser user, bool adding)
    {
        if (!adding || !await _users.IsInRoleAsync(user, "Admin")) return null;
        return StatusCode(403, new { message = "Admin ayrıca hesabdır. Başqa hesabın üstündən açılmır" });
    }

    private async Task<IActionResult?> CheckAccount(AppUser user)
    {
        if (!user.IsActive) return StatusCode(403, new { message = "Hesab deaktivdir" });
        if (user.IsBanned && user.BannedUntil.HasValue && user.BannedUntil.Value <= DateTime.UtcNow)
        {
            user.IsBanned = false;
            user.BannedUntil = null;
            user.UpdatedAt = DateTime.UtcNow;
            await _users.UpdateAsync(user);
        }
        if (user.IsBanned)
        {
            var message = user.BannedUntil.HasValue
                ? $"Hesab {user.BannedUntil.Value:dd.MM.yyyy HH:mm} UTC tarixinədək dayandırılıb"
                : "Hesab dayandırılıb";
            return StatusCode(403, new { message });
        }
        return null;
    }

    private IActionResult MailProblem(InvalidOperationException ex)
    {
        if (ex.Message == "Email mövcud deyil")
            return BadRequest(new { message = ex.Message });
        return StatusCode(503, new { message = "Kodu göndərmək alınmadı. Bir az sonra yenidən cəhd et" });
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

    private static string Mailbox(AppUser user, string? contact)
    {
        var raw = (contact ?? "").Trim();
        if (raw.Contains('@') && !raw.EndsWith("@pulse.local", StringComparison.OrdinalIgnoreCase))
            return raw.ToLowerInvariant();
        var email = user.Email ?? "";
        if (email.Contains('@') && !email.EndsWith("@pulse.local", StringComparison.OrdinalIgnoreCase))
            return email.ToLowerInvariant();
        return raw;
    }

    private async Task DropPendingUserAsync(AppUser user)
    {
        var codes = await _db.OtpCodes.Where(x => x.UserId == user.Id).ToListAsync();
        if (codes.Count > 0) _db.OtpCodes.RemoveRange(codes);
        await _db.SaveChangesAsync();
        await _users.DeleteAsync(user);
    }

    private string CreateResetToken(AppUser user)
    {
        var key = _config["Jwt:Key"] ?? "";
        var claims = new List<System.Security.Claims.Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new("purpose", "password-reset"),
            new("sst", user.SecurityStamp ?? "")
        };
        var jwt = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(15),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
                SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(jwt);
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
            _ => "Məlumat qəbul olunmadı"
        };
    }

    private async Task<object> BuildLogin(AppUser user, string? device)
    {
        var refresh = _tokens.CreateRefreshToken();
        var row = new RefreshToken
        {
            UserId = user.Id,
            Token = refresh.Token,
            ExpiresAt = refresh.ExpiresAt,
            DeviceName = CleanDevice(device),
            LastUsedAt = DateTime.UtcNow
        };
        _db.RefreshTokens.Add(row);
        await _db.SaveChangesAsync();
        var access = await _tokens.CreateAccessTokenAsync(user, row.Id);
        var role = await DtoMapper.GetRole(_users, user);
        return new
        {
            token = access.Token,
            refreshToken = refresh.Token,
            user = DtoMapper.MapUser(user, role, includePrivacy: true)
        };
    }

    private string CleanDevice(string? raw)
    {
        var text = (raw ?? "").Trim();
        if (text.Length == 0) text = DescribeAgent(Request.Headers.UserAgent.ToString());
        return text.Length > 80 ? text[..80] : text;
    }

    private static string DescribeAgent(string ua)
    {
        if (string.IsNullOrWhiteSpace(ua)) return "Naməlum cihaz";
        var os = ua.Contains("iPhone", StringComparison.OrdinalIgnoreCase) || ua.Contains("iPad", StringComparison.OrdinalIgnoreCase) ? "iPhone"
            : ua.Contains("Android", StringComparison.OrdinalIgnoreCase) ? "Android"
            : ua.Contains("Windows", StringComparison.OrdinalIgnoreCase) ? "Windows"
            : ua.Contains("Mac", StringComparison.OrdinalIgnoreCase) ? "Mac"
            : "Cihaz";
        var browser = ua.Contains("Edg/", StringComparison.Ordinal) ? "Edge"
            : ua.Contains("Chrome/", StringComparison.Ordinal) ? "Chrome"
            : ua.Contains("Firefox/", StringComparison.Ordinal) ? "Firefox"
            : ua.Contains("Safari/", StringComparison.Ordinal) ? "Safari"
            : "Brauzer";
        return $"{browser} · {os}";
    }
}
