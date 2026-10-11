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

        var names = MentionRx.Matches(text)
            .Select(m => m.Groups[1].Value)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var name in names)
        {
            var user = await db.Users.FirstOrDefaultAsync(u => u.NormalizedUserName == name.ToUpperInvariant() || u.UserName == name);
            if (user != null)
            {
                await notes.AddAsync(user.Id, fromId, "mention", entityId, message);
            }
        }
    }
}
