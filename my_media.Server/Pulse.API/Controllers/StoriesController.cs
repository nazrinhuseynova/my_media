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

    [HttpGet("/api/stories/archive")]
    public async Task<IActionResult> StoryArchive()
    {
        var me = DtoMapper.GetUserId(User);
        var stories = await _db.Stories
            .Where(s => s.UserId == me)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync();
        return Ok(stories.Select(s => new
        {
            id = s.Id.ToString(),
            mediaUrl = s.MediaUrl,
            mediaType = s.MediaType,
            text = s.Text ?? "",
            createdAt = DateTime.SpecifyKind(s.CreatedAt, DateTimeKind.Utc)
        }));
    }

    [HttpPost("/api/highlights")]
    public async Task<IActionResult> SaveHighlight([FromBody] HighlightBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var name = (body.Name ?? "").Trim();
        var pieces = NormalizeItems(body);
        if (name.Length == 0 || pieces.Count == 0)
            return BadRequest(new { message = "Ad ve hekaye lazimdir" });

        var coverUrl = string.IsNullOrWhiteSpace(body.CoverUrl) ? pieces[^1].MediaUrl : body.CoverUrl.Trim();
        Highlight? highlight = null;
        if (!string.IsNullOrWhiteSpace(body.HighlightId) && Guid.TryParse(body.HighlightId, out var hid))
            highlight = await _db.Highlights.Include(h => h.Items).FirstOrDefaultAsync(h => h.Id == hid && h.UserId == me);
        highlight ??= await _db.Highlights.Include(h => h.Items).FirstOrDefaultAsync(h => h.UserId == me && h.Name == name);

        if (highlight == null)
        {
            highlight = new Highlight { UserId = me, Name = name, CoverUrl = coverUrl };
            _db.Highlights.Add(highlight);
            await _db.SaveChangesAsync();
        }
        else if (!string.IsNullOrWhiteSpace(body.CoverUrl))
        {
            highlight.CoverUrl = coverUrl;
            highlight.UpdatedAt = DateTime.UtcNow;
        }

        var added = 0;
        foreach (var piece in pieces)
        {
            if (highlight.Items.Any(i => i.MediaUrl == piece.MediaUrl)) continue;
            var item = new HighlightItem
            {
                HighlightId = highlight.Id,
                MediaUrl = piece.MediaUrl,
                MediaType = piece.MediaType,
                Text = piece.Text
            };
            _db.HighlightItems.Add(item);
            _db.Entry(item).State = EntityState.Added;
            highlight.Items.Add(item);
            added++;
        }

        if (string.IsNullOrWhiteSpace(highlight.CoverUrl))
            highlight.CoverUrl = highlight.Items.OrderBy(i => i.CreatedAt).LastOrDefault()?.MediaUrl ?? coverUrl;

        await _db.SaveChangesAsync();
        return StatusCode(added > 0 ? 201 : 200, MapHighlight(highlight));
    }

    [HttpPatch("/api/highlights/{id:guid}")]
    public async Task<IActionResult> UpdateHighlight(Guid id, [FromBody] HighlightUpdateBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var highlight = await _db.Highlights.Include(h => h.Items).FirstOrDefaultAsync(h => h.Id == id && h.UserId == me);
        if (highlight == null) return NotFound();

        var name = (body.Name ?? "").Trim();
        if (name.Length > 0) highlight.Name = name;
        if (body.CoverUrl != null)
        {
            var cover = body.CoverUrl.Trim();
            highlight.CoverUrl = cover.Length > 0
                ? cover
                : highlight.Items.OrderBy(i => i.CreatedAt).LastOrDefault()?.MediaUrl ?? "";
        }
        highlight.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(MapHighlight(highlight));
    }

    [HttpPost("/api/highlights/{id:guid}/items")]
    public async Task<IActionResult> AddHighlightItems(Guid id, [FromBody] HighlightItemsBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var highlight = await _db.Highlights.Include(h => h.Items).FirstOrDefaultAsync(h => h.Id == id && h.UserId == me);
        if (highlight == null) return NotFound();
        var pieces = (body.Items ?? new List<HighlightItemInput>())
            .Where(i => !string.IsNullOrWhiteSpace(i.MediaUrl))
            .Select(i => new HighlightItemInput
            {
                MediaUrl = i.MediaUrl.Trim(),
                MediaType = string.IsNullOrWhiteSpace(i.MediaType) ? "image" : i.MediaType!,
                Text = i.Text ?? ""
            })
            .ToList();
        if (pieces.Count == 0) return BadRequest(new { message = "Hekaye sec" });

        foreach (var piece in pieces)
        {
            if (highlight.Items.Any(i => i.MediaUrl == piece.MediaUrl)) continue;
            var item = new HighlightItem
            {
                HighlightId = highlight.Id,
                MediaUrl = piece.MediaUrl,
                MediaType = piece.MediaType ?? "image",
                Text = piece.Text ?? ""
            };
            _db.HighlightItems.Add(item);
            _db.Entry(item).State = EntityState.Added;
            highlight.Items.Add(item);
        }

        if (string.IsNullOrWhiteSpace(highlight.CoverUrl))
            highlight.CoverUrl = highlight.Items.OrderBy(i => i.CreatedAt).LastOrDefault()?.MediaUrl ?? "";
        highlight.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(MapHighlight(highlight));
    }

    [HttpDelete("/api/highlights/{id:guid}/items/{itemId:guid}")]
    public async Task<IActionResult> RemoveHighlightItem(Guid id, Guid itemId)
    {
        var me = DtoMapper.GetUserId(User);
        var highlight = await _db.Highlights.Include(h => h.Items).FirstOrDefaultAsync(h => h.Id == id && h.UserId == me);
        if (highlight == null) return NotFound();
        var item = highlight.Items.FirstOrDefault(i => i.Id == itemId);
        if (item == null) return NotFound();
        _db.HighlightItems.Remove(item);
        highlight.Items.Remove(item);
        if (highlight.Items.Count == 0)
        {
            _db.Highlights.Remove(highlight);
            await _db.SaveChangesAsync();
            return Ok(new { deleted = true });
        }
        if (string.IsNullOrWhiteSpace(highlight.CoverUrl) || highlight.CoverUrl == item.MediaUrl)
            highlight.CoverUrl = highlight.Items.OrderBy(i => i.CreatedAt).Last().MediaUrl;
        highlight.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(MapHighlight(highlight));
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
        var list = await _db.Highlights.Include(h => h.Items).Where(h => h.UserId == user.Id)
            .OrderByDescending(h => h.UpdatedAt ?? h.CreatedAt)
            .ToListAsync();
        return Ok(list.Select(MapHighlight));
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

    private static object MapHighlight(Highlight h)
    {
        var items = h.Items.OrderBy(i => i.CreatedAt).Select(i => new
        {
            id = i.Id.ToString(),
            mediaUrl = i.MediaUrl,
            mediaType = i.MediaType,
            text = i.Text
        }).ToList();
        var cover = string.IsNullOrWhiteSpace(h.CoverUrl)
            ? items.LastOrDefault()?.mediaUrl ?? ""
            : h.CoverUrl;
        return new
        {
            id = h.Id.ToString(),
            name = h.Name,
            coverUrl = cover,
            items
        };
    }

    private static List<HighlightItemInput> NormalizeItems(HighlightBody body)
    {
        var list = new List<HighlightItemInput>();
        if (body.Items != null)
        {
            foreach (var i in body.Items)
            {
                if (string.IsNullOrWhiteSpace(i.MediaUrl)) continue;
                list.Add(new HighlightItemInput
                {
                    MediaUrl = i.MediaUrl.Trim(),
                    MediaType = string.IsNullOrWhiteSpace(i.MediaType) ? "image" : i.MediaType!,
                    Text = i.Text ?? ""
                });
            }
        }
        if (!string.IsNullOrWhiteSpace(body.MediaUrl))
        {
            list.Add(new HighlightItemInput
            {
                MediaUrl = body.MediaUrl.Trim(),
                MediaType = string.IsNullOrWhiteSpace(body.MediaType) ? "image" : body.MediaType!,
                Text = body.Text ?? ""
            });
        }
        return list
            .GroupBy(i => i.MediaUrl)
            .Select(g => g.First())
            .ToList();
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
    public string? HighlightId { get; set; }
    public string? Name { get; set; }
    public string? CoverUrl { get; set; }
    public string? MediaUrl { get; set; }
    public string? MediaType { get; set; }
    public string? Text { get; set; }
    public List<HighlightItemInput>? Items { get; set; }
}

public class HighlightUpdateBody
{
    public string? Name { get; set; }
    public string? CoverUrl { get; set; }
}

public class HighlightItemsBody
{
    public List<HighlightItemInput>? Items { get; set; }
}

public class HighlightItemInput
{
    public string MediaUrl { get; set; } = "";
    public string? MediaType { get; set; }
    public string? Text { get; set; }
}
