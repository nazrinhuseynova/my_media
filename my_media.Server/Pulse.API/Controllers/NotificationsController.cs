using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly AppDbContext _db;

    public NotificationsController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("/api/notifications")]
    public async Task<IActionResult> List()
    {
        var me = DtoMapper.GetUserId(User);
        var items = await _db.Notifications.Where(n => n.UserId == me).OrderByDescending(n => n.CreatedAt).ToListAsync();
        var fromIds = items.Where(n => n.FromId.HasValue).Select(n => n.FromId!.Value).Distinct().ToList();
        var fromUsers = await _db.Users.Where(u => fromIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id);
        return Ok(items.Select(n =>
        {
            object? actor = n.FromId.HasValue && fromUsers.TryGetValue(n.FromId.Value, out var u)
                ? DtoMapper.MapUser(u)
                : null;
            return new NotificationOut
            {
                Id = n.Id.ToString(),
                UserId = n.UserId.ToString(),
                Type = n.Type,
                FromId = n.FromId?.ToString(),
                From = actor,
                FromUser = actor,
                EntityId = n.EntityId,
                Text = n.Text,
                Read = n.IsRead,
                CreatedAt = n.CreatedAt
            };
        }));
    }

    [HttpPost("/api/notifications/read")]
    public async Task<IActionResult> Read()
    {
        var me = DtoMapper.GetUserId(User);
        var items = await _db.Notifications.Where(n => n.UserId == me).ToListAsync();
        items.ForEach(n => n.IsRead = true);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Oxundu" });
    }

    [HttpGet("/api/notifications/settings")]
    public async Task<IActionResult> GetSettings()
    {
        var me = DtoMapper.GetUserId(User);
        var s = await _db.NotificationSettings.FirstOrDefaultAsync(x => x.UserId == me);
        return Ok(s == null
            ? new { like = true, comment = true, follow = true, mention = true, dm = true }
            : new { like = s.Like, comment = s.Comment, follow = s.Follow, mention = s.Mention, dm = s.Dm });
    }

    [HttpPut("/api/notifications/settings")]
    public async Task<IActionResult> SaveSettings([FromBody] NotifSetBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var s = await _db.NotificationSettings.FirstOrDefaultAsync(x => x.UserId == me);
        if (s == null)
        {
            s = new NotificationSetting { UserId = me };
            _db.NotificationSettings.Add(s);
        }
        s.Like = body.Like;
        s.Comment = body.Comment;
        s.Follow = body.Follow;
        s.Mention = body.Mention;
        s.Dm = body.Dm;
        await _db.SaveChangesAsync();
        return Ok(new { like = s.Like, comment = s.Comment, follow = s.Follow, mention = s.Mention, dm = s.Dm });
    }
}

public class NotifSetBody
{
    public bool Like { get; set; } = true;
    public bool Comment { get; set; } = true;
    public bool Follow { get; set; } = true;
    public bool Mention { get; set; } = true;
    public bool Dm { get; set; } = true;
}

public class NotificationOut
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Type { get; set; } = "";
    public string? FromId { get; set; }
    [JsonPropertyName("from")]
    public object? From { get; set; }
    public object? FromUser { get; set; }
    public string EntityId { get; set; } = "";
    public string Text { get; set; } = "";
    public bool Read { get; set; }
    public DateTime CreatedAt { get; set; }
}
