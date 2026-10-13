using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

namespace Pulse.API.Helpers;

public sealed record ProviderIdentity(string Email, string? Name);

public static class ProviderTokenVerifier
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(12) };
    private static readonly SemaphoreSlim Gate = new(1, 1);
    private static IList<SecurityKey> _google = new List<SecurityKey>();
    private static IList<SecurityKey> _apple = new List<SecurityKey>();
    private static DateTime _googleAt = DateTime.MinValue;
    private static DateTime _appleAt = DateTime.MinValue;

    public static async Task<ProviderIdentity> ReadAsync(string provider, string? idToken, string? audience)
    {
        if (string.IsNullOrWhiteSpace(idToken))
            throw new InvalidOperationException(provider == "apple" ? "Apple təsdiq tokeni lazımdır" : "Google təsdiq tokeni lazımdır");

        var google = provider == "google";
        var keys = await KeysAsync(google);
        var handler = new JwtSecurityTokenHandler();
        var parameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuers = google
                ? new[] { "https://accounts.google.com", "accounts.google.com" }
                : new[] { "https://appleid.apple.com" },
            ValidateAudience = !string.IsNullOrWhiteSpace(audience),
            ValidAudience = audience,
            ValidateLifetime = true,
            IssuerSigningKeys = keys,
            NameClaimType = "name"
        };

        ClaimsPrincipal principal;
        try
        {
            principal = handler.ValidateToken(idToken, parameters, out _);
        }
        catch
        {
            throw new InvalidOperationException(google ? "Google tokeni yanlışdır" : "Apple tokeni yanlışdır");
        }

        var email = principal.FindFirst("email")?.Value?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            throw new InvalidOperationException("Tokenin içində email yoxdur");

        var verified = principal.FindFirst("email_verified")?.Value;
        if (google && !string.Equals(verified, "true", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Google emaili təsdiqlənməyib");

        var name = principal.FindFirst("name")?.Value;
        return new ProviderIdentity(email, string.IsNullOrWhiteSpace(name) ? null : name.Trim());
    }

    private static async Task<IList<SecurityKey>> KeysAsync(bool google)
    {
        var cached = google ? _google : _apple;
        var at = google ? _googleAt : _appleAt;
        if (cached.Count > 0 && DateTime.UtcNow - at < TimeSpan.FromHours(6))
            return cached;

        await Gate.WaitAsync();
        try
        {
            cached = google ? _google : _apple;
            at = google ? _googleAt : _appleAt;
            if (cached.Count > 0 && DateTime.UtcNow - at < TimeSpan.FromHours(6))
                return cached;

            var url = google
                ? "https://www.googleapis.com/oauth2/v3/certs"
                : "https://appleid.apple.com/auth/keys";
            var json = await Http.GetStringAsync(url);
            var keys = new JsonWebKeySet(json).GetSigningKeys().ToList();
            if (google)
            {
                _google = keys;
                _googleAt = DateTime.UtcNow;
            }
            else
            {
                _apple = keys;
                _appleAt = DateTime.UtcNow;
            }
            return keys;
        }
        catch (InvalidOperationException)
        {
            throw;
        }
        catch
        {
            throw new InvalidOperationException(google ? "Google açarları alınmadı" : "Apple açarları alınmadı");
        }
        finally
        {
            Gate.Release();
        }
    }
}
