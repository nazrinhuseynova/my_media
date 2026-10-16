using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Helpers;

public static class MentionHelper
{
    private static readonly Regex MentionRx = new(@"@([A-Za-z0-9._]+)", RegexOptions.Compiled);

    public static async Task NotifyAsync(
        AppDbContext db,
        INotificationService notes,
        Guid fromId,
        string? text,
        string entityId,
        string message)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        foreach (var name in Names(text))
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.NormalizedUserName == name.ToUpperInvariant() || u.UserName == name);
            if (user == null) continue;
            var blocked = await db.Blocks.AnyAsync(b =>
                (b.BlockerId == fromId && b.BlockedId == user.Id) || (b.BlockerId == user.Id && b.BlockedId == fromId));
            if (blocked) continue;
            if (!await PrivacyRules.AllowsAsync(db, user, fromId, user.WhoCanMention)) continue;
            await notes.AddAsync(user.Id, fromId, "mention", entityId, message);
        }
    }

    public static List<string> Names(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return new List<string>();
        return MentionRx.Matches(text)
            .Select(m => m.Groups[1].Value)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
