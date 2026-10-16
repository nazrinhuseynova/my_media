using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;
using Pulse.Infrastructure.Realtime;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;
    private readonly PresenceTracker _presence;
    private readonly INotificationService _notes;
    private readonly IHubContext<LiveHub> _liveHub;

    public AdminController(AppDbContext db, UserManager<AppUser> users, PresenceTracker presence, INotificationService notes, IHubContext<LiveHub> liveHub)
    {
        _db = db;
        _users = users;
        _presence = presence;
        _notes = notes;
        _liveHub = liveHub;
    }

    [HttpGet("/api/admin/stats")]
    public async Task<IActionResult> Stats()
    {
        await LiftExpiredBans();
        var storyFrom = DateTime.UtcNow.AddHours(-24);
        var liveFrom = DateTime.UtcNow.AddHours(-4);
        return Ok(new
        {
            users = await _users.Users.CountAsync(u => u.IsActive),
            online = _presence.OnlineCount(),
            banned = await _users.Users.CountAsync(u => u.IsBanned),
            posts = await _db.Posts.CountAsync(p => !p.IsDeleted),
            shares = await _db.Posts.CountAsync(p => !p.IsDeleted && p.RepostOfId != null),
            comments = await _db.Comments.CountAsync() + await _db.ReelComments.CountAsync(),
            reels = await _db.Reels.CountAsync(r => !r.IsDeleted),
            stories = await _db.Stories.CountAsync(s => s.CreatedAt >= storyFrom),
            lives = await _db.LiveRooms.CountAsync(r => r.EndedAt == null && r.CreatedAt >= liveFrom),
            reports = await _db.Reports.CountAsync(r => r.Status == "open")
        });
    }

    /// <summary>Yalnız real Socket bağlantısı olan onlayn izləyicilər (sticky DB bayrağı deyil).</summary>
    [HttpGet("/api/admin/online")]
    public async Task<IActionResult> Online()
    {
        var me = DtoMapper.GetUserId(User);
        var ids = _presence.OnlineUserIds().Where(id => id != me).ToList();
        if (ids.Count == 0) return Ok(Array.Empty<object>());
        var people = await _users.Users.AsNoTracking()
            .Where(u => ids.Contains(u.Id) && u.IsActive && !u.IsBanned)
            .OrderBy(u => u.UserName)
            .Take(100)
            .ToListAsync();
        return Ok(people.Select(u => new
        {
            id = u.Id.ToString(),
            username = u.UserName,
            fullName = u.FullName,
            avatar = u.AvatarUrl,
            isOnline = true,
            lastSeenAt = u.LastSeenAt
        }));
    }

    [HttpGet("/api/admin/users")]
    public async Task<IActionResult> Users([FromQuery] string q = "")
    {
        await LiftExpiredBans();
        var needle = (q ?? "").Trim();
        var query = _users.Users.AsNoTracking().Where(u => u.IsActive || u.IsBanned);
        if (needle.Length > 0)
        {
            query = query.Where(u =>
                (u.UserName ?? "").Contains(needle)
                || u.FullName.Contains(needle)
                || (u.Email ?? "").Contains(needle));
        }

        var list = await query.OrderByDescending(u => u.CreatedAt).Take(60).ToListAsync();
        var ids = list.Select(u => u.Id).ToList();
        var posts = await _db.Posts.AsNoTracking()
            .Where(p => ids.Contains(p.UserId) && !p.IsDeleted)
            .GroupBy(p => p.UserId)
            .Select(g => new { id = g.Key, count = g.Count() })
            .ToListAsync();
        var counts = posts.ToDictionary(x => x.id, x => x.count);
        var result = new List<object>();
        foreach (var user in list)
        {
            var role = await DtoMapper.GetRole(_users, user);
            var live = _presence.IsOnline(user.Id);
            result.Add(new
            {
                id = user.Id.ToString(),
                username = user.UserName,
                fullName = user.FullName,
                email = user.Email,
                avatar = user.AvatarUrl,
                role,
                isActive = user.IsActive,
                isOnline = live,
                isBanned = user.IsBanned,
                bannedUntil = user.BannedUntil,
                posts = counts.GetValueOrDefault(user.Id),
                createdAt = user.CreatedAt
            });
        }
        return Ok(result);
    }

    [HttpGet("/api/admin/posts")]
    public async Task<IActionResult> Posts([FromQuery] string q = "")
    {
        var needle = (q ?? "").Trim();
        var query = _db.Posts.AsNoTracking()
            .Include(p => p.User)
            .Include(p => p.Media)
            .Include(p => p.Comments)
            .Include(p => p.Likes)
            .Where(p => !p.IsDeleted);
        if (needle.Length > 0)
        {
            query = query.Where(p =>
                p.Caption.Contains(needle)
                || (p.Location ?? "").Contains(needle)
                || (p.User.UserName ?? "").Contains(needle)
                || p.User.FullName.Contains(needle));
        }

        var rows = await query.OrderByDescending(p => p.CreatedAt).Take(60).ToListAsync();
        var ids = rows.Select(p => p.Id).ToList();
        var shares = await _db.Posts.AsNoTracking()
            .Where(p => p.RepostOfId != null && ids.Contains(p.RepostOfId.Value) && !p.IsDeleted)
            .GroupBy(p => p.RepostOfId)
            .Select(g => new { id = g.Key, count = g.Count() })
            .ToListAsync();
        var shareMap = shares.ToDictionary(x => x.id!.Value, x => x.count);
        return Ok(rows.Select(p =>
        {
            var media = p.Media.OrderBy(m => m.SortOrder).FirstOrDefault();
            return new
            {
                id = p.Id.ToString(),
                slug = p.Slug,
                caption = p.Caption,
                location = p.Location ?? "",
                username = p.User.UserName,
                fullName = p.User.FullName,
                createdAt = p.CreatedAt,
                comments = p.Comments.Count,
                likes = p.Likes.Count,
                shares = shareMap.GetValueOrDefault(p.Id),
                isDraft = p.IsDraft,
                isArchived = p.IsArchived,
                isShare = p.RepostOfId != null,
                mediaUrl = media?.Url ?? "",
                mediaType = media?.Type ?? ""
            };
        }));
    }

    [HttpGet("/api/admin/comments")]
    public async Task<IActionResult> Comments([FromQuery] string q = "")
    {
        var needle = (q ?? "").Trim();
        var posts = _db.Comments.AsNoTracking().Include(c => c.User).Include(c => c.Post)
            .Where(c => needle.Length == 0 || c.Text.Contains(needle) || (c.User.UserName ?? "").Contains(needle));
        var reels = _db.ReelComments.AsNoTracking().Include(c => c.User).Include(c => c.Reel)
            .Where(c => needle.Length == 0 || c.Text.Contains(needle) || (c.User.UserName ?? "").Contains(needle));
        var postRows = await posts.OrderByDescending(c => c.CreatedAt).Take(40).ToListAsync();
        var reelRows = await reels.OrderByDescending(c => c.CreatedAt).Take(40).ToListAsync();
        var merged = postRows.Select(c => new
        {
            id = c.Id.ToString(),
            kind = "post",
            text = c.Text,
            username = c.User.UserName,
            createdAt = c.CreatedAt,
            target = c.Post?.Caption ?? "",
            targetId = c.PostId.ToString()
        }).Concat(reelRows.Select(c => new
        {
            id = c.Id.ToString(),
            kind = "reel",
            text = c.Text,
            username = c.User.UserName,
            createdAt = c.CreatedAt,
            target = c.Reel?.Caption ?? "",
            targetId = c.ReelId.ToString()
        })).OrderByDescending(c => c.createdAt).Take(60);
        return Ok(merged);
    }

    [HttpGet("/api/admin/reels")]
    public async Task<IActionResult> Reels([FromQuery] string q = "")
    {
        var needle = (q ?? "").Trim();
        var query = _db.Reels.AsNoTracking().Include(r => r.User).Include(r => r.Comments).Include(r => r.Likes)
            .Where(r => !r.IsDeleted);
        if (needle.Length > 0)
        {
            query = query.Where(r =>
                r.Caption.Contains(needle)
                || (r.User.UserName ?? "").Contains(needle)
                || r.User.FullName.Contains(needle));
        }

        var rows = await query.OrderByDescending(r => r.CreatedAt).Take(60).ToListAsync();
        return Ok(rows.Select(r => new
        {
            id = r.Id.ToString(),
            caption = r.Caption,
            username = r.User.UserName,
            fullName = r.User.FullName,
            videoUrl = r.VideoUrl,
            createdAt = r.CreatedAt,
            comments = r.Comments.Count,
            likes = r.Likes.Count
        }));
    }

    [HttpGet("/api/admin/stories")]
    public async Task<IActionResult> Stories([FromQuery] string q = "")
    {
        var needle = (q ?? "").Trim();
        var from = DateTime.UtcNow.AddHours(-24);
        var query = _db.Stories.AsNoTracking().Include(s => s.User).Include(s => s.Views)
            .Where(s => s.CreatedAt >= from);
        if (needle.Length > 0)
        {
            query = query.Where(s =>
                (s.Text ?? "").Contains(needle)
                || (s.User.UserName ?? "").Contains(needle)
                || s.User.FullName.Contains(needle));
        }

        var rows = await query.OrderByDescending(s => s.CreatedAt).Take(60).ToListAsync();
        return Ok(rows.Select(s => new
        {
            id = s.Id.ToString(),
            username = s.User.UserName,
            text = s.Text ?? "",
            mediaUrl = s.MediaUrl,
            mediaType = s.MediaType,
            views = s.Views.Count,
            createdAt = s.CreatedAt
        }));
    }

    [HttpGet("/api/admin/lives")]
    public async Task<IActionResult> Lives([FromQuery] string q = "")
    {
        var needle = (q ?? "").Trim();
        var from = DateTime.UtcNow.AddHours(-4);
        var rows = await _db.LiveRooms.AsNoTracking()
            .Include(r => r.Seats).ThenInclude(s => s.User)
            .Where(r => r.EndedAt == null && r.CreatedAt >= from)
            .OrderByDescending(r => r.CreatedAt)
            .Take(40)
            .ToListAsync();
        if (needle.Length > 0)
        {
            rows = rows.Where(r =>
                r.Title.Contains(needle, StringComparison.OrdinalIgnoreCase)
                || r.Seats.Any(s => (s.User.UserName ?? "").Contains(needle, StringComparison.OrdinalIgnoreCase)
                    || s.User.FullName.Contains(needle, StringComparison.OrdinalIgnoreCase))).ToList();
        }

        return Ok(rows.Select(r =>
        {
            var host = r.Seats.OrderBy(s => s.SortOrder).FirstOrDefault();
            return new
            {
                id = r.Id.ToString(),
                title = r.Title,
                username = host?.User.UserName ?? "",
                seats = r.Seats.Count,
                createdAt = r.CreatedAt
            };
        }));
    }

    [HttpGet("/api/admin/reports")]
    public async Task<IActionResult> Reports([FromQuery] string q = "", [FromQuery] string status = "")
    {
        var needle = (q ?? "").Trim();
        var state = (status ?? "").Trim().ToLowerInvariant();
        var query = _db.Reports.AsNoTracking().AsQueryable();
        if (state.Length > 0 && state != "all") query = query.Where(r => r.Status == state);
        if (needle.Length > 0)
        {
            query = query.Where(r => r.Reason.Contains(needle) || r.TargetType.Contains(needle));
        }

        var list = await query
            .OrderBy(r => r.Status == "open" ? 0 : 1)
            .ThenByDescending(r => r.CreatedAt)
            .Take(80)
            .ToListAsync();
        var fromIds = list.Select(r => r.FromId).Distinct().ToList();
        var people = await _users.Users.AsNoTracking()
            .Where(u => fromIds.Contains(u.Id))
            .Select(u => new { u.Id, u.UserName })
            .ToListAsync();
        var names = people.ToDictionary(u => u.Id, u => u.UserName ?? "");
        var postIds = Guids(list, "post");
        var reelIds = Guids(list, "reel");
        var commentIds = Guids(list, "comment");
        var userIds = Guids(list, "user");
        var storyIds = Guids(list, "story");
        var posts = await _db.Posts.AsNoTracking().Include(p => p.User).Include(p => p.Media).Where(p => postIds.Contains(p.Id)).ToListAsync();
        var reels = await _db.Reels.AsNoTracking().Include(r => r.User).Where(r => reelIds.Contains(r.Id)).ToListAsync();
        var comments = await _db.Comments.AsNoTracking().Include(c => c.User).Where(c => commentIds.Contains(c.Id)).ToListAsync();
        var reelComments = await _db.ReelComments.AsNoTracking().Include(c => c.User).Where(c => commentIds.Contains(c.Id)).ToListAsync();
        var stories = await _db.Stories.AsNoTracking().Include(s => s.User).Where(s => storyIds.Contains(s.Id)).ToListAsync();
        var targets = await _users.Users.AsNoTracking().Where(u => userIds.Contains(u.Id)).ToListAsync();

        return Ok(list.Select(r =>
        {
            var label = "";
            var owner = "";
            var mediaUrl = "";
            var mediaType = "";
            var gone = false;
            if (Guid.TryParse(r.TargetId, out var id))
            {
                if (r.TargetType == "post")
                {
                    var post = posts.FirstOrDefault(p => p.Id == id);
                    label = post?.Caption ?? "";
                    owner = post?.User.UserName ?? "";
                    var media = post?.Media.OrderBy(m => m.SortOrder).FirstOrDefault();
                    mediaUrl = media?.Url ?? "";
                    mediaType = media?.Type ?? "";
                    gone = post == null || post.IsDeleted;
                }
                else if (r.TargetType == "reel")
                {
                    var reel = reels.FirstOrDefault(x => x.Id == id);
                    label = reel?.Caption ?? "";
                    owner = reel?.User.UserName ?? "";
                    mediaUrl = reel?.VideoUrl ?? "";
                    mediaType = "video";
                    gone = reel == null || reel.IsDeleted;
                }
                else if (r.TargetType == "comment")
                {
                    var comment = comments.FirstOrDefault(c => c.Id == id);
                    var reelComment = reelComments.FirstOrDefault(c => c.Id == id);
                    label = comment?.Text ?? reelComment?.Text ?? "";
                    owner = comment?.User.UserName ?? reelComment?.User.UserName ?? "";
                    gone = comment == null && reelComment == null;
                }
                else if (r.TargetType == "story")
                {
                    var story = stories.FirstOrDefault(s => s.Id == id);
                    label = story?.Text ?? "";
                    owner = story?.User.UserName ?? "";
                    mediaUrl = story?.MediaUrl ?? "";
                    mediaType = story?.MediaType ?? "";
                    gone = story == null || story.CreatedAt < DateTime.UtcNow.AddHours(-24);
                }
                else if (r.TargetType == "user")
                {
                    var person = targets.FirstOrDefault(u => u.Id == id);
                    label = person?.FullName ?? "";
                    owner = person?.UserName ?? "";
                    gone = person == null || !person.IsActive;
                }
            }

            return new
            {
                id = r.Id.ToString(),
                from = names.GetValueOrDefault(r.FromId, ""),
                targetType = r.TargetType,
                targetId = r.TargetId,
                reason = r.Reason,
                status = r.Status,
                createdAt = r.CreatedAt,
                label,
                owner,
                mediaUrl,
                mediaType,
                gone
            };
        }));
    }

    [HttpPost("/api/admin/users/{id:guid}/ban")]
    public async Task<IActionResult> Ban(Guid id, [FromBody] BanBody body)
    {
        var mode = (body.Mode ?? "permanent").Trim().ToLowerInvariant();
        var (result, closed, user) = await ApplyBan(id, mode);
        if (result is not OkObjectResult || user == null) return result;
        if (user.IsBanned)
        {
            await NotifyReporters(closed, "ban", mode);
            await _notes.AddAsync(user.Id, null, "moderation", user.Id.ToString(), OwnerDecisionText("ban", "user", mode));
        }
        return result;
    }

    [HttpDelete("/api/admin/users/{id:guid}")]
    public async Task<IActionResult> DeleteUser(Guid id)
    {
        var user = await _users.FindByIdAsync(id.ToString());
        if (user == null) return NotFound(new { message = "İstifadəçi tapılmadı" });
        if (id == DtoMapper.GetUserId(User) || await _users.IsInRoleAsync(user, "Admin"))
            return BadRequest(new { message = "Admin hesabı silinmir" });

        var stamp = user.Id.ToString("N")[..8];
        user.IsActive = false;
        user.IsBanned = false;
        user.BannedUntil = null;
        user.FullName = "Silinmis hesab";
        user.Bio = "";
        user.Website = "";
        user.AvatarUrl = "";
        user.PhoneNumber = null;
        user.UpdatedAt = DateTime.UtcNow;
        await _users.SetEmailAsync(user, $"deleted_{stamp}@pulse.invalid");
        await _users.SetUserNameAsync(user, $"deleted_{stamp}");
        await _users.UpdateAsync(user);
        await DropSessions(user);
        var closed = await CloseTargetReports("user", user.Id, "remove");
        await _db.SaveChangesAsync();
        await NotifyReporters(closed, "remove", null);
        return Ok(new { id = id.ToString() });
    }

    [HttpDelete("/api/admin/posts/{id:guid}")]
    public async Task<IActionResult> DeletePost(Guid id)
    {
        var post = await _db.Posts.FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        if (post == null) return NotFound(new { message = "Paylaşım tapılmadı" });
        var ownerId = post.UserId;
        post.IsDeleted = true;
        post.UpdatedAt = DateTime.UtcNow;
        var closed = await CloseTargetReports("post", id, "remove");
        await _db.SaveChangesAsync();
        await NotifyReporters(closed, "remove", null);
        await _notes.AddAsync(ownerId, null, "moderation", id.ToString(), OwnerDecisionText("remove", "post", null));
        return Ok(new { id = id.ToString() });
    }

    [HttpDelete("/api/admin/reels/{id:guid}")]
    public async Task<IActionResult> DeleteReel(Guid id)
    {
        var reel = await _db.Reels.FirstOrDefaultAsync(r => r.Id == id && !r.IsDeleted);
        if (reel == null) return NotFound(new { message = "Reel tapılmadı" });
        var ownerId = reel.UserId;
        reel.IsDeleted = true;
        reel.UpdatedAt = DateTime.UtcNow;
        var closed = await CloseTargetReports("reel", id, "remove");
        await _db.SaveChangesAsync();
        await NotifyReporters(closed, "remove", null);
        await _notes.AddAsync(ownerId, null, "moderation", id.ToString(), OwnerDecisionText("remove", "reel", null));
        return Ok(new { id = id.ToString() });
    }

    [HttpDelete("/api/admin/stories/{id:guid}")]
    public async Task<IActionResult> DeleteStory(Guid id)
    {
        var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == id);
        if (story == null) return NotFound(new { message = "Hekayə tapılmadı" });
        var ownerId = story.UserId;
        await RemoveStory(story);
        var closed = await CloseTargetReports("story", id, "remove");
        await _db.SaveChangesAsync();
        await NotifyReporters(closed, "remove", null);
        await _notes.AddAsync(ownerId, null, "moderation", id.ToString(), OwnerDecisionText("remove", "story", null));
        return Ok(new { id = id.ToString() });
    }

    [HttpPost("/api/admin/lives/{id:guid}/end")]
    public async Task<IActionResult> EndLive(Guid id)
    {
        var room = await _db.LiveRooms.FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        room.EndedAt = DateTime.UtcNow;
        room.UpdatedAt = DateTime.UtcNow;
        LivePresence.ClearRoom(id);
        await _db.SaveChangesAsync();
        await _liveHub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveEnded", new { roomId = id.ToString() });
        return Ok(new { id = id.ToString(), ended = true });
    }

    [HttpDelete("/api/admin/comments/{kind}/{id:guid}")]
    public async Task<IActionResult> DeleteComment(string kind, Guid id)
    {
        Guid? ownerId = null;
        if (kind == "post")
        {
            var comment = await _db.Comments.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
            ownerId = comment?.UserId;
        }
        else if (kind == "reel")
        {
            var comment = await _db.ReelComments.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
            ownerId = comment?.UserId;
        }
        var gone = kind == "reel" ? await DeleteReelComment(id) : kind == "post" ? await DeletePostComment(id) : false;
        if (!gone) return NotFound(new { message = "Şərh tapılmadı" });
        var closed = await CloseTargetReports("comment", id, "remove");
        await _db.SaveChangesAsync();
        await NotifyReporters(closed, "remove", null);
        if (ownerId.HasValue)
            await _notes.AddAsync(ownerId.Value, null, "moderation", id.ToString(), OwnerDecisionText("remove", "comment", null));
        return Ok(new { id = id.ToString() });
    }

    [HttpPost("/api/admin/reports/{id:guid}/resolve")]
    public async Task<IActionResult> Resolve(Guid id, [FromBody] ResolveReportBody body)
    {
        var report = await _db.Reports.FirstOrDefaultAsync(r => r.Id == id);
        if (report == null) return NotFound(new { message = "Şikayət tapılmadı" });
        if (report.Status != "open") return BadRequest(new { message = "Şikayət artıq bağlanıb" });
        var action = (body.Action ?? "").Trim().ToLowerInvariant();
        if (action is not ("dismissed" or "remove" or "ban"))
            return BadRequest(new { message = "Əməliyyat tanınmır" });
        var mode = string.IsNullOrWhiteSpace(body.Mode) ? "permanent" : body.Mode.Trim().ToLowerInvariant();

        var related = await _db.Reports
            .Where(r => r.Status == "open" && r.TargetType == report.TargetType && r.TargetId == report.TargetId)
            .ToListAsync();
        if (related.All(r => r.Id != report.Id)) related.Add(report);

        Guid? ownerId = null;
        if (Guid.TryParse(report.TargetId, out var targetId))
        {
            if (report.TargetType == "post")
            {
                var post = await _db.Posts.FirstOrDefaultAsync(p => p.Id == targetId && !p.IsDeleted);
                ownerId = post?.UserId;
                if (action == "remove" && post != null)
                {
                    post.IsDeleted = true;
                    post.UpdatedAt = DateTime.UtcNow;
                }
            }
            else if (report.TargetType == "reel")
            {
                var reel = await _db.Reels.FirstOrDefaultAsync(r => r.Id == targetId && !r.IsDeleted);
                ownerId = reel?.UserId;
                if (action == "remove" && reel != null)
                {
                    reel.IsDeleted = true;
                    reel.UpdatedAt = DateTime.UtcNow;
                }
            }
            else if (report.TargetType == "comment")
            {
                var comment = await _db.Comments.FirstOrDefaultAsync(c => c.Id == targetId);
                if (comment != null)
                {
                    ownerId = comment.UserId;
                    if (action == "remove") await DeletePostComment(comment.Id);
                }
                else
                {
                    var reelComment = await _db.ReelComments.FirstOrDefaultAsync(c => c.Id == targetId);
                    ownerId = reelComment?.UserId;
                    if (action == "remove" && reelComment != null) await DeleteReelComment(reelComment.Id);
                }
            }
            else if (report.TargetType == "story")
            {
                var story = await _db.Stories.FirstOrDefaultAsync(s => s.Id == targetId);
                ownerId = story?.UserId;
                if (action == "remove" && story != null) await RemoveStory(story);
            }
            else if (report.TargetType == "user")
            {
                ownerId = targetId;
                if (action == "remove")
                {
                    var gone = await DeleteUser(targetId);
                    if (gone is not OkObjectResult) return gone;
                    return Ok(new { id = report.Id.ToString(), status = "remove" });
                }
            }
            else if (report.TargetType == "live")
            {
                var room = await _db.LiveRooms.Include(r => r.Seats)
                    .FirstOrDefaultAsync(r => r.Id == targetId);
                var hostSeat = room?.Seats.OrderBy(s => s.SortOrder).FirstOrDefault();
                ownerId = hostSeat?.UserId;
                if (action == "remove" && room != null && room.EndedAt == null)
                {
                    room.EndedAt = DateTime.UtcNow;
                    room.UpdatedAt = DateTime.UtcNow;
                    LivePresence.ClearRoom(targetId);
                    await _liveHub.Clients.Group(LiveHub.GroupName(targetId))
                        .SendAsync("liveEnded", new { roomId = targetId.ToString() });
                }
            }
        }

        if (action == "ban")
        {
            if (!ownerId.HasValue) return BadRequest(new { message = "Bloklanacaq hesab tapılmadı" });
            var (banned, closed, _) = await ApplyBan(ownerId.Value, mode);
            if (banned is not OkObjectResult) return banned;
            foreach (var row in related.Where(r => r.Status == "open"))
            {
                row.Status = "ban";
                row.UpdatedAt = DateTime.UtcNow;
            }
            await _db.SaveChangesAsync();
            var reporters = related.Concat(closed).GroupBy(r => r.FromId).Select(g => g.First()).ToList();
            await NotifyReporters(reporters, "ban", mode);
            await _notes.AddAsync(ownerId.Value, null, "moderation", report.TargetId, OwnerDecisionText("ban", report.TargetType, mode));
            return Ok(new { id = report.Id.ToString(), status = "ban" });
        }

        var now = DateTime.UtcNow;
        if (action == "dismissed")
        {
            report.Status = "dismissed";
            report.UpdatedAt = now;
            related = new List<Report> { report };
        }
        else
        {
            foreach (var row in related)
            {
                row.Status = action;
                row.UpdatedAt = now;
            }
        }

        await _db.SaveChangesAsync();
        await NotifyReporters(related, action, mode);
        if (action == "remove" && ownerId.HasValue && report.TargetType != "user")
            await _notes.AddAsync(ownerId.Value, null, "moderation", report.TargetId, OwnerDecisionText("remove", report.TargetType, null));
        return Ok(new { id = report.Id.ToString(), status = report.Status });
    }

    private static List<Guid> Guids(List<Report> rows, string type)
    {
        return rows.Where(r => r.TargetType == type)
            .Select(r => Guid.TryParse(r.TargetId, out var id) ? id : Guid.Empty)
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();
    }

    private async Task<bool> DeletePostComment(Guid id)
    {
        var comment = await _db.Comments.FirstOrDefaultAsync(c => c.Id == id);
        if (comment == null) return false;
        var family = await _db.Comments.Where(c => c.PostId == comment.PostId).ToListAsync();
        var drop = new List<Comment>();
        void Collect(Guid root)
        {
            foreach (var child in family.Where(c => c.ParentId == root))
            {
                Collect(child.Id);
                drop.Add(child);
            }
        }
        Collect(id);
        drop.Add(comment);
        var ids = drop.Select(c => c.Id).ToList();
        _db.CommentLikes.RemoveRange(await _db.CommentLikes.Where(l => ids.Contains(l.CommentId)).ToListAsync());
        _db.Comments.RemoveRange(drop);
        return true;
    }

    private async Task<bool> DeleteReelComment(Guid id)
    {
        var comment = await _db.ReelComments.FirstOrDefaultAsync(c => c.Id == id);
        if (comment == null) return false;
        var family = await _db.ReelComments.Where(c => c.ReelId == comment.ReelId).ToListAsync();
        var drop = new List<ReelComment>();
        void Collect(Guid root)
        {
            foreach (var child in family.Where(c => c.ParentId == root))
            {
                Collect(child.Id);
                drop.Add(child);
            }
        }
        Collect(id);
        drop.Add(comment);
        var ids = drop.Select(c => c.Id).ToList();
        _db.ReelCommentLikes.RemoveRange(await _db.ReelCommentLikes.Where(l => ids.Contains(l.CommentId)).ToListAsync());
        _db.ReelComments.RemoveRange(drop);
        return true;
    }

    private async Task RemoveStory(Story story)
    {
        var views = await _db.StoryViews.Where(v => v.StoryId == story.Id).ToListAsync();
        var replies = await _db.StoryReplies.Where(r => r.StoryId == story.Id).ToListAsync();
        _db.StoryViews.RemoveRange(views);
        _db.StoryReplies.RemoveRange(replies);
        _db.Stories.Remove(story);
    }

    private async Task<(IActionResult result, List<Report> closed, AppUser? user)> ApplyBan(Guid id, string mode)
    {
        var user = await _users.FindByIdAsync(id.ToString());
        if (user == null) return (NotFound(new { message = "İstifadəçi tapılmadı" }), new List<Report>(), null);
        if (id == DtoMapper.GetUserId(User) || await _users.IsInRoleAsync(user, "Admin"))
            return (BadRequest(new { message = "Admin hesabı bloklanmır" }), new List<Report>(), null);
        if (mode is not ("lift" or "day" or "week" or "month" or "permanent"))
            return (BadRequest(new { message = "Blok müddəti səhvdir" }), new List<Report>(), null);

        if (mode == "lift")
        {
            user.IsBanned = false;
            user.BannedUntil = null;
        }
        else if (mode == "day")
        {
            user.IsBanned = true;
            user.BannedUntil = DateTime.UtcNow.AddDays(1);
        }
        else if (mode == "week")
        {
            user.IsBanned = true;
            user.BannedUntil = DateTime.UtcNow.AddDays(7);
        }
        else if (mode == "month")
        {
            user.IsBanned = true;
            user.BannedUntil = DateTime.UtcNow.AddDays(30);
        }
        else
        {
            user.IsBanned = true;
            user.BannedUntil = null;
        }

        user.UpdatedAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);
        var closed = new List<Report>();
        if (user.IsBanned)
        {
            await DropSessions(user);
            closed = await CloseTargetReports("user", user.Id, "ban");
            await _db.SaveChangesAsync();
        }
        else
        {
            await _db.SaveChangesAsync();
        }

        return (Ok(new
        {
            id = user.Id.ToString(),
            isBanned = user.IsBanned,
            bannedUntil = user.BannedUntil
        }), closed, user);
    }

    private async Task<List<Report>> CloseTargetReports(string type, Guid id, string status)
    {
        var key = id.ToString();
        var rows = await _db.Reports.Where(r => r.Status == "open" && r.TargetType == type && r.TargetId == key).ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var row in rows)
        {
            row.Status = status;
            row.UpdatedAt = now;
        }
        return rows;
    }

    private async Task NotifyReporters(IEnumerable<Report> rows, string status, string? mode)
    {
        var text = ReporterDecisionText(status, mode);
        var seen = new HashSet<Guid>();
        foreach (var row in rows)
        {
            if (!seen.Add(row.FromId)) continue;
            await _notes.AddAsync(row.FromId, null, "report", row.Id.ToString(), text);
        }
    }

    private static string ReporterDecisionText(string status, string? mode)
    {
        if (status == "dismissed") return "Şikayətinə baxıldı. Qayda pozuntusu tapılmadı.";
        if (status == "remove") return "Şikayətinə baxıldı. Uyğunsuz kontent götürüldü.";
        if (status == "ban")
        {
            return mode switch
            {
                "day" => "Şikayətinə baxıldı. Hesab 1 gün məhdudlaşdırıldı.",
                "week" => "Şikayətinə baxıldı. Hesab 7 gün məhdudlaşdırıldı.",
                "month" => "Şikayətinə baxıldı. Hesab 30 gün məhdudlaşdırıldı.",
                _ => "Şikayətinə baxıldı. Hesab həmişəlik məhdudlaşdırıldı."
            };
        }
        return "Şikayətinə baxıldı.";
    }

    private static string OwnerDecisionText(string action, string targetType, string? mode)
    {
        if (action == "remove")
        {
            return targetType switch
            {
                "comment" => "Şərhin qaydalarımıza uyğun olmadığı üçün silindi.",
                "story" => "Hekayən qaydalarımıza uyğun olmadığı üçün götürüldü.",
                "reel" => "Reelin qaydalarımıza uyğun olmadığı üçün götürüldü.",
                "user" => "Hesabın qaydalarımıza uyğun olmadığı üçün bağlandı.",
                _ => "Paylaşımın qaydalarımıza uyğun olmadığı üçün götürüldü."
            };
        }

        return mode switch
        {
            "day" => "Hesabın 1 gün müddətinə məhdudlaşdırıldı.",
            "week" => "Hesabın 7 gün müddətinə məhdudlaşdırıldı.",
            "month" => "Hesabın 30 gün müddətinə məhdudlaşdırıldı.",
            _ => "Hesabın həmişəlik məhdudlaşdırıldı."
        };
    }

    private async Task LiftExpiredBans()
    {
        var now = DateTime.UtcNow;
        var expired = await _db.Users.Where(u => u.IsBanned && u.BannedUntil != null && u.BannedUntil <= now).ToListAsync();
        if (expired.Count == 0) return;
        foreach (var user in expired)
        {
            user.IsBanned = false;
            user.BannedUntil = null;
            user.UpdatedAt = now;
        }
        await _db.SaveChangesAsync();
    }

    private async Task DropSessions(AppUser user)
    {
        await _users.UpdateSecurityStampAsync(user);
        var rows = await _db.RefreshTokens.Where(t => t.UserId == user.Id && !t.IsRevoked && !t.IsDeleted).ToListAsync();
        var now = DateTime.UtcNow;
        foreach (var row in rows)
        {
            row.IsRevoked = true;
            row.RevokedAt = now;
        }
        if (rows.Count > 0) await _db.SaveChangesAsync();
    }
}

public class BanBody
{
    public string Mode { get; set; } = "permanent";
}

public class ResolveReportBody
{
    public string Action { get; set; } = "dismissed";
    public string Mode { get; set; } = "permanent";
}
