using Microsoft.EntityFrameworkCore;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Helpers;

public static class PrivacyRules
{
    private static readonly HashSet<string> Circles = new(StringComparer.OrdinalIgnoreCase)
    {
        "everyone", "followers", "nobody"
    };

    public static string NormalizeCircle(string? value, string fallback = "everyone")
    {
        var v = (value ?? "").Trim().ToLowerInvariant();
        return Circles.Contains(v) ? v : fallback;
    }

    public static async Task<bool> AllowsAsync(AppDbContext db, AppUser owner, Guid viewerId, string circle)
    {
        if (owner.Id == viewerId) return true;
        circle = NormalizeCircle(circle);
        if (circle == "everyone") return true;
        if (circle == "nobody") return false;
        return await db.Follows.AsNoTracking().AnyAsync(f => f.FollowerId == viewerId && f.FollowingId == owner.Id);
    }

    /// <summary>
    /// Visible=false → izləyici heç nə görmür (nöqtə yox).
    /// Visible=true + Online → yaşıl; Visible=true + !Online → boz.
    /// </summary>
    public static async Task<PresenceView> PresenceForViewerAsync(
        AppDbContext db,
        AppUser target,
        Guid viewerId,
        bool liveOnline)
    {
        if (target.Id == viewerId)
            return new PresenceView(true, liveOnline, liveOnline ? null : target.LastSeenAt);

        if (!await AllowsAsync(db, target, viewerId, target.ShowActivityStatus))
            return PresenceView.Hidden;

        return new PresenceView(true, liveOnline, liveOnline ? null : target.LastSeenAt);
    }
}

public readonly record struct PresenceView(bool Visible, bool Online, DateTime? LastSeen)
{
    public static PresenceView Hidden => new(false, false, null);
}
