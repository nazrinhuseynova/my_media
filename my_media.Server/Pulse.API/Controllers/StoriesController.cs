using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Application.Files;
using Pulse.Application.Files.Interfaces;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize]
public class StoriesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notes;
    private readonly IFileStorageService _files;

    public StoriesController(AppDbContext db, INotificationService notes, IFileStorageService files)
    {
        _db = db;
        _notes = notes;
        _files = files;
    }

    [HttpGet("/api/stories")]
    public async Task<IActionResult> List()
    {
        var me = DtoMapper.GetUserId(User);
        var following = await _db.Follows.Where(f => f.FollowerId == me).Select(f => f.FollowingId).ToListAsync();
        following.Add(me);
        var from = DateTime.UtcNow.AddHours(-24);
        var closeIds = await _db.CloseFriends.Where(c => c.FriendId == me).Select(c => c.OwnerId).ToListAsync();
        var muted = await _db.UserMutes.Where(m => m.UserId == me).Select(m => m.MutedId).ToListAsync();
        var hidden = await HiddenUserIds(me);
        var stories = await _db.Stories.Include(s => s.User).Include(s => s.Views)
            .Where(s => following.Contains(s.UserId) && s.CreatedAt >= from && s.User.IsActive && !s.User.IsBanned)
            .Where(s => !muted.Contains(s.UserId) && !hidden.Contains(s.UserId))
            .Where(s => s.Audience != "close" || s.UserId == me || closeIds.Contains(s.UserId))
            .ToListAsync();

        var groups = stories.GroupBy(s => s.UserId).Select(g =>
        {
            var user = g.First().User;
            return new
            {
                user = DtoMapper.MapUser(user),
                stories = g.OrderBy(s => s.CreatedAt).Select(s => new
                {
                    id = s.Id.ToString(),
                    userId = s.UserId.ToString(),
                    mediaUrl = s.MediaUrl,
                    mediaExtension = s.MediaExtension,
                    mediaType = s.MediaType,
                    text = s.Text ?? "",
                    sticker = s.Sticker ?? "",
                    music = s.Music ?? "",
                    audience = s.Audience,
                    viewers = s.UserId == me ? s.Views.Select(v => v.UserId.ToString()).ToList() : new List<string>(),
                    createdAt = DateTime.SpecifyKind(s.CreatedAt, DateTimeKind.Utc)
                }).ToList(),
                seen = g.Key == me || g.All(s => s.Views.Any(v => v.UserId == me)),
                latest = g.Max(s => s.CreatedAt),
                isMe = g.Key == me
            };
        })
        .OrderByDescending(g => g.isMe)
        .ThenByDescending(g => g.latest)
        .Select(g => new { g.user, g.stories, g.seen });

        return Ok(groups);
    }

    [HttpPost("/api/stories")]
    public async Task<IActionResult> Create([FromBody] StoryBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var mediaType = body.MediaType ?? "image";
        var (mediaUrl, mediaExtension) = await StoredMedia.ResolveAsync(
            _files, body.MediaUrl, body.MediaExtension, mediaType == "video" ? "videos" : "images");
        if (string.IsNullOrWhiteSpace(mediaUrl)) return BadRequest(new { message = "Sekil ve ya video lazimdir" });
        var story = new Story
        {
            UserId = me,
            MediaUrl = mediaUrl,
            MediaExtension = mediaExtension,
            MediaType = mediaType,
            Text = body.Text,
            Sticker = body.Sticker,
            Music = body.Music,
            Audience = body.Audience == "close" ? "close" : "all"
        };
        _db.Stories.Add(story);
        await _db.SaveChangesAsync();
        await MentionHelper.NotifyAsync(_db, _notes, me, story.Text, story.Id.ToString(), "Seni storyde isareledi");
        return StatusCode(201, new { id = story.Id.ToString(), story.MediaUrl, mediaExtension = story.MediaExtension, story.Text, story.Sticker, story.Music, createdAt = story.CreatedAt });
    }

    [HttpPost("/api/stories/{id:guid}/view")]
    public async Task<IActionResult> ViewStory(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var story = await _db.Stories.Include(s => s.Views).FirstOrDefaultAsync(s => s.Id == id);
        if (story == null || !await CanSeeStory(story, me)) return NotFound();
        if (story.UserId != me && story.Views.All(v => v.UserId != me))
        {
            var view = new StoryView { StoryId = id, UserId = me };
            _db.StoryViews.Add(view);
            _db.Entry(view).State = EntityState.Added;
            await _db.SaveChangesAsync();
        }

        if (story.UserId != me) return Ok(new { viewers = Array.Empty<object>() });
        var viewers = await _db.StoryViews.Include(v => v.User)
            .Where(v => v.StoryId == id && v.User != null)
            .Select(v => v.User)
            .ToListAsync();
        return Ok(new { viewers = viewers.Select(u => DtoMapper.MapUser(u)).ToList() });
    }

    [HttpPost("/api/stories/{id:guid}/reply")]
    public async Task<IActionResult> Reply(Guid id, [FromBody] StoryReplyBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == id);
        if (story == null || !await CanSeeStory(story, me)) return NotFound();
        var text = (body.Text ?? "").Trim();
        if (text.Length == 0) return BadRequest(new { message = "Cavab yaz" });
        var reply = new StoryReply { StoryId = id, FromId = me, Text = text };
        _db.StoryReplies.Add(reply);
        _db.Entry(reply).State = EntityState.Added;
        await _db.SaveChangesAsync();
        if (story.UserId != me)
            await _notes.AddAsync(story.UserId, me, "story", id.ToString(), "hekayənə cavab yazdı");
        return StatusCode(201, new { id = reply.Id.ToString(), text });
    }

    [HttpGet("/api/stories/{id:guid}/replies")]
    public async Task<IActionResult> Replies(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == id && s.UserId == me);
        if (story == null) return NotFound();
        var items = await _db.StoryReplies.Include(r => r.From).Where(r => r.StoryId == id).OrderBy(r => r.CreatedAt).ToListAsync();
        return Ok(items.Select(r => new { id = r.Id.ToString(), text = r.Text, user = DtoMapper.MapUser(r.From), createdAt = r.CreatedAt }));
    }

    [HttpPost("/api/highlights")]
    public async Task<IActionResult> SaveHighlight([FromBody] HighlightBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var name = (body.Name ?? "").Trim();
        if (name.Length == 0 || string.IsNullOrWhiteSpace(body.MediaUrl))
            return BadRequest(new { message = "Ad ve sekil lazimdir" });
        var highlight = await _db.Highlights.Include(h => h.Items).FirstOrDefaultAsync(h => h.UserId == me && h.Name == name);
        if (highlight == null)
        {
            highlight = new Highlight { UserId = me, Name = name, CoverUrl = body.MediaUrl };
            _db.Highlights.Add(highlight);
            await _db.SaveChangesAsync();
        }
        if (highlight.Items.Any(i => i.MediaUrl == body.MediaUrl))
            return Ok(new { id = highlight.Id.ToString(), highlight.Name });
        var piece = new HighlightItem { HighlightId = highlight.Id, MediaUrl = body.MediaUrl, MediaType = body.MediaType ?? "image", Text = body.Text ?? "" };
        _db.HighlightItems.Add(piece);
        _db.Entry(piece).State = EntityState.Added;
        await _db.SaveChangesAsync();
        return StatusCode(201, new { id = highlight.Id.ToString(), highlight.Name });
    }

    [AllowAnonymous]
    [HttpGet("/api/users/{username}/highlights")]
    public async Task<IActionResult> Highlights(string username)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.UserName == username);
        if (user == null) return NotFound();
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        if ((user.IsBanned || !user.IsActive) && me != user.Id) return NotFound();
        if (me != user.Id)
        {
            if (me.HasValue && await _db.Blocks.AnyAsync(b =>
                    (b.BlockerId == me && b.BlockedId == user.Id) || (b.BlockerId == user.Id && b.BlockedId == me)))
                return Ok(Array.Empty<object>());
            if (user.IsPrivate && !(me.HasValue && await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == user.Id)))
                return Ok(Array.Empty<object>());
        }
        var list = await _db.Highlights.Include(h => h.Items).Where(h => h.UserId == user.Id).ToListAsync();
        return Ok(list.Select(h => new
        {
            id = h.Id.ToString(),
            name = h.Name,
            coverUrl = h.CoverUrl,
            items = h.Items.Select(i => new { id = i.Id.ToString(), mediaUrl = i.MediaUrl, mediaType = i.MediaType, text = i.Text })
        }));
    }

    [HttpDelete("/api/highlights/{id:guid}")]
    public async Task<IActionResult> DeleteHighlight(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var highlight = await _db.Highlights.Include(h => h.Items).FirstOrDefaultAsync(h => h.Id == id && h.UserId == me);
        if (highlight == null) return NotFound();
        _db.HighlightItems.RemoveRange(highlight.Items);
        _db.Highlights.Remove(highlight);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi" });
    }

    private async Task<List<Guid>> HiddenUserIds(Guid me)
    {
        var ids = await _db.Blocks.Where(b => b.BlockerId == me).Select(b => b.BlockedId).ToListAsync();
        ids.AddRange(await _db.Blocks.Where(b => b.BlockedId == me).Select(b => b.BlockerId).ToListAsync());
        return ids.Distinct().ToList();
    }

    private async Task<bool> CanSeeStory(Story story, Guid me)
    {
        if (story.UserId == me) return true;
        if (story.CreatedAt < DateTime.UtcNow.AddHours(-24)) return false;
        var owner = story.User ?? await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == story.UserId);
        if (owner == null || !owner.IsActive || owner.IsBanned) return false;
        if (await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == story.UserId) || (b.BlockerId == story.UserId && b.BlockedId == me)))
            return false;
        var follows = await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == story.UserId);
        if (!follows) return false;
        if (story.Audience == "close")
            return await _db.CloseFriends.AnyAsync(c => c.OwnerId == story.UserId && c.FriendId == me);
        return true;
    }
}

public class StoryBody
{
    public string MediaUrl { get; set; } = string.Empty;
    public string? MediaExtension { get; set; }
    public string? MediaType { get; set; }
    public string? Text { get; set; }
    public string? Sticker { get; set; }
    public string? Music { get; set; }
    public string? Audience { get; set; }
}

public class StoryReplyBody { public string? Text { get; set; } }

public class HighlightBody
{
    public string? Name { get; set; }
    public string MediaUrl { get; set; } = "";
    public string? MediaType { get; set; }
    public string? Text { get; set; }
}
