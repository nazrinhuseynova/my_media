using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text.Json;
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
            throw new InvalidOperationException(provider == "apple" ? "Apple ilə daxil olmaq alınmadı" : "Google ilə daxil olmaq alınmadı");

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
            throw new InvalidOperationException(google ? "Google ilə daxil olmaq alınmadı" : "Apple ilə daxil olmaq alınmadı");
        }

        var email = principal.FindFirst("email")?.Value?.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
            throw new InvalidOperationException("Bu hesabın emaili görünmür");

        var verified = principal.FindFirst("email_verified")?.Value;
        if (google && !string.Equals(verified, "true", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Google emaili təsdiqlənməyib");

        var name = principal.FindFirst("name")?.Value;
        return new ProviderIdentity(email, string.IsNullOrWhiteSpace(name) ? null : name.Trim());
    }

    public static async Task<ProviderIdentity> ReadFacebookAsync(string? accessToken, string? appId, string? appSecret)
    {
        if (string.IsNullOrWhiteSpace(appId))
            throw new InvalidOperationException("Facebook ilə daxil olmaq hazırda mümkün deyil");
        if (string.IsNullOrWhiteSpace(accessToken))
            throw new InvalidOperationException("Facebook ilə daxil olmaq alınmadı");

        try
        {
            if (!string.IsNullOrWhiteSpace(appSecret))
            {
                var debugUrl = "https://graph.facebook.com/debug_token?input_token="
                    + Uri.EscapeDataString(accessToken)
                    + "&access_token=" + Uri.EscapeDataString(appId + "|" + appSecret);
                using var debugResponse = await Http.GetAsync(debugUrl);
                if (!debugResponse.IsSuccessStatusCode)
                    throw new InvalidOperationException("Facebook ilə daxil olmaq alınmadı");
                using var debugDoc = JsonDocument.Parse(await debugResponse.Content.ReadAsStringAsync());
                if (!debugDoc.RootElement.TryGetProperty("data", out var data))
                    throw new InvalidOperationException("Facebook ilə daxil olmaq alınmadı");
                var valid = data.TryGetProperty("is_valid", out var validNode) && validNode.ValueKind == JsonValueKind.True;
                var app = data.TryGetProperty("app_id", out var appNode) ? appNode.GetString() : "";
                if (!valid || !string.Equals(app, appId, StringComparison.Ordinal))
                    throw new InvalidOperationException("Facebook ilə daxil olmaq alınmadı");
            }

            var meUrl = "https://graph.facebook.com/me?fields=id,name,email&access_token=" + Uri.EscapeDataString(accessToken);
            using var meResponse = await Http.GetAsync(meUrl);
            if (!meResponse.IsSuccessStatusCode)
                throw new InvalidOperationException("Facebook ilə daxil olmaq alınmadı");
            using var me = JsonDocument.Parse(await meResponse.Content.ReadAsStringAsync());
            var email = me.RootElement.TryGetProperty("email", out var emailNode) ? emailNode.GetString()?.Trim().ToLowerInvariant() : null;
            if (string.IsNullOrWhiteSpace(email) || !email.Contains('@'))
                throw new InvalidOperationException("Bu hesabın emaili görünmür");
            var person = me.RootElement.TryGetProperty("name", out var nameNode) ? nameNode.GetString() : null;
            return new ProviderIdentity(email, string.IsNullOrWhiteSpace(person) ? null : person.Trim());
        }
        catch (InvalidOperationException)
        {
            throw;
        }
        catch
        {
            throw new InvalidOperationException("Facebook ilə daxil olmaq alınmadı");
        }
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
            throw new InvalidOperationException(google ? "Google ilə daxil olmaq alınmadı" : "Apple ilə daxil olmaq alınmadı");
        }
        finally
        {
            Gate.Release();
        }
    }
}
