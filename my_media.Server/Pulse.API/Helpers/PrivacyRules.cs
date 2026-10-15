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

    public static async Task<(bool online, DateTime? lastSeen)> PresenceForViewerAsync(
        AppDbContext db,
        AppUser target,
        Guid viewerId,
        bool liveOnline)
    {
        if (target.Id == viewerId)
            return (liveOnline, target.LastSeenAt);

        if (!await AllowsAsync(db, target, viewerId, target.ShowActivityStatus))
            return (false, null);

        return (liveOnline && target.IsOnline, target.LastSeenAt);
    }
}
