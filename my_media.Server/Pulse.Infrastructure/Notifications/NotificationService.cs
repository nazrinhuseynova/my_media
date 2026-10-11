using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;
using Pulse.Infrastructure.Realtime;

namespace Pulse.Infrastructure.Notifications;

public class NotificationService : INotificationService
{
    private readonly AppDbContext _db;
    private readonly IHubContext<NotificationHub> _hub;

    public NotificationService(AppDbContext db, IHubContext<NotificationHub> hub)
    {
        _db = db;
        _hub = hub;
    }

    public async Task AddAsync(Guid userId, Guid? fromId, string type, string entityId, string text)
    {
        if (fromId.HasValue && fromId.Value == userId)
        {
            return;
        }

        var settings = await _db.NotificationSettings.FirstOrDefaultAsync(x => x.UserId == userId);
        if (settings != null)
        {
            var allowed = type switch
            {
                "like" => settings.Like,
                "comment" => settings.Comment,
                "follow" => settings.Follow,
                "mention" => settings.Mention,
                "dm" => settings.Dm,
                _ => true
            };
            if (!allowed)
            {
                return;
            }
        }

        var item = new Notification
        {
            UserId = userId,
            FromId = fromId,
            Type = type,
            EntityId = entityId,
            Text = text,
            CreatedAt = DateTime.UtcNow
        };

        if (fromId.HasValue)
        {
            var actor = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == fromId.Value);
            var name = actor?.UserName ?? "";
            if (!string.IsNullOrWhiteSpace(name) && (string.IsNullOrWhiteSpace(text) || !text.StartsWith(name, StringComparison.OrdinalIgnoreCase)))
            {
                item.Text = $"{name} {text}".Trim();
            }
        }

        _db.Notifications.Add(item);
        await _db.SaveChangesAsync();

        var payload = new
        {
            id = item.Id.ToString(),
            type,
            text = item.Text,
            entityId,
            fromId = fromId?.ToString(),
            createdAt = item.CreatedAt
        };

        await _hub.Clients.User(userId.ToString()).SendAsync("notify", payload);
        await _hub.Clients.Group(userId.ToString()).SendAsync("notify", payload);
    }
}
