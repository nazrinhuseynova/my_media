using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Application.Files;
using Pulse.Application.Files.Interfaces;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;
using Pulse.Infrastructure.Realtime;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize]
public class UsersController : ControllerBase
{
    private static readonly string[] Languages =
    [
        "az", "en", "tr", "ru", "de", "fr", "es", "it", "pt", "uk",
        "pl", "nl", "sv", "el", "ar", "fa", "hi", "zh-CN", "ja", "ko"
    ];

    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;
    private readonly INotificationService _notes;
    private readonly IFileStorageService _files;
    private readonly PresenceTracker _presence;

    public UsersController(AppDbContext db, UserManager<AppUser> users, INotificationService notes, IFileStorageService files, PresenceTracker presence)
    {
        _db = db;
        _users = users;
        _notes = notes;
        _files = files;
        _presence = presence;
    }

    [HttpGet("/api/users/{username}")]
    public async Task<IActionResult> Get(string username, [FromQuery] int page = 1, [FromQuery] int pageSize = 12)
    {
        var user = await _users.Users.FirstOrDefaultAsync(u => u.UserName == username);
        if (user == null || await _users.IsInRoleAsync(user, "Admin")) return NotFound(new { message = "Istifadeci tapilmadi" });
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        if ((user.IsBanned || !user.IsActive) && me != user.Id)
            return NotFound(new { message = "Istifadeci tapilmadi" });

        var followers = await _db.Follows.CountAsync(f => f.FollowingId == user.Id);
        var following = await _db.Follows.CountAsync(f => f.FollowerId == user.Id);
        var restricted = me.HasValue && await _db.Blocks.AnyAsync(b =>
            (b.BlockerId == me && b.BlockedId == user.Id) || (b.BlockerId == user.Id && b.BlockedId == me));
        var canSee = !restricted && (!user.IsPrivate || (me.HasValue && (me == user.Id || await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == user.Id))));
        var now = DateTime.UtcNow;
        var paging = Paging.Normalize(page, pageSize, 12, 24);
        var postQuery = _db.Posts.AsNoTracking().Where(p =>
            p.UserId == user.Id && !p.IsDeleted && !p.IsArchived && !p.IsDraft
            && (me == user.Id || p.ScheduledAt == null || p.ScheduledAt <= now));
        var postTotal = canSee ? await postQuery.CountAsync() : 0;
        var postIds = canSee
            ? await postQuery
                .OrderByDescending(p => p.IsPinned)
                .ThenByDescending(p => p.ScheduledAt ?? p.CreatedAt)
                .Skip((paging.Page - 1) * paging.PageSize)
                .Take(paging.PageSize)
                .Select(p => p.Id)
                .ToListAsync()
            : new List<Guid>();
        var posts = postIds.Count == 0
            ? new List<Post>()
            : await _db.Posts.AsNoTracking().AsSplitQuery()
                .Include(p => p.User).Include(p => p.Media).Include(p => p.Likes).ThenInclude(l => l.User).Include(p => p.Comments)
                .Include(p => p.Tags).ThenInclude(t => t.User)
                .Include(p => p.PollOptions).ThenInclude(o => o.Votes)
                .Where(p => postIds.Contains(p.Id))
                .ToListAsync();
        var rank = postIds.Select((id, index) => (id, index)).ToDictionary(x => x.id, x => x.index);
        posts = posts.OrderBy(p => rank[p.Id]).ToList();
        if (canSee && me.HasValue && me != user.Id)
        {
            var sharesVisits = await _users.Users.Where(u => u.Id == me).Select(u => u.ProfileViewHistory).FirstOrDefaultAsync();
            if (sharesVisits)
            {
                var seen = await _db.ProfileViews.FirstOrDefaultAsync(v => v.ProfileId == user.Id && v.ViewerId == me);
                if (seen == null)
                {
                    var view = new ProfileView { ProfileId = user.Id, ViewerId = me.Value };
                    _db.ProfileViews.Add(view);
                    _db.Entry(view).State = EntityState.Added;
                }
                else seen.CreatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
            await _db.ProfileViews.Where(v => v.CreatedAt < DateTime.UtcNow.AddDays(-7)).ExecuteDeleteAsync();
        }

        var relation = "none";
        if (me == user.Id) relation = "self";
        else if (me.HasValue && await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == user.Id)) relation = "following";
        else if (me.HasValue && await _db.FollowRequests.AnyAsync(r => r.FromId == me && r.ToId == user.Id && r.Status == "pending")) relation = "requested";

        var role = await DtoMapper.GetRole(_users, user);
        var savedIds = me.HasValue && postIds.Count > 0
            ? (await _db.SavedPosts.AsNoTracking().Where(s => s.UserId == me.Value && postIds.Contains(s.PostId)).Select(s => s.PostId).ToListAsync()).ToHashSet()
            : new HashSet<Guid>();
        var postPage = PagedResult<object>.Create(
            posts.Select(p => DtoMapper.MapPost(p, me, _db, savedIds)).ToList(),
            paging.Page,
            paging.PageSize,
            postTotal);
        var live = _presence.IsOnline(user.Id) || user.IsOnline;
        var presence = me.HasValue
            ? await PrivacyRules.PresenceForViewerAsync(_db, user, me.Value, live)
            : PresenceView.Hidden;
        return Ok(new
        {
            user = DtoMapper.MapUser(user, role, presence: presence),
            followers,
            following,
            posts = postPage,
            relation,
            blocked = me.HasValue && await _db.Blocks.AnyAsync(b => b.BlockerId == me && b.BlockedId == user.Id),
            restricted,
            muted = me.HasValue && await _db.UserMutes.AnyAsync(m => m.UserId == me && m.MutedId == user.Id),
            closeFriend = me.HasValue && await _db.CloseFriends.AnyAsync(c => c.OwnerId == me && c.FriendId == user.Id)
        });
    }

    [HttpGet("/api/users/{username}/followers")]
    public async Task<IActionResult> Followers(string username)
    {
        var user = await _users.Users.FirstOrDefaultAsync(u => u.UserName == username);
        if (user == null) return NotFound();
        if (!await CanListPeople(user)) return Ok(Array.Empty<object>());
        var ids = await _db.Follows.Where(f => f.FollowingId == user.Id).Select(f => f.FollowerId).ToListAsync();
        var list = await _users.Users.Where(u => ids.Contains(u.Id) && u.IsActive && !u.IsBanned).ToListAsync();
        return Ok(await MapPeoplePresenceAsync(list));
    }

    [HttpGet("/api/users/{username}/following")]
    public async Task<IActionResult> Following(string username)
    {
        var user = await _users.Users.FirstOrDefaultAsync(u => u.UserName == username);
        if (user == null) return NotFound();
        if (!await CanListPeople(user)) return Ok(Array.Empty<object>());
        var ids = await _db.Follows.Where(f => f.FollowerId == user.Id).Select(f => f.FollowingId).ToListAsync();
        var list = await _users.Users.Where(u => ids.Contains(u.Id) && u.IsActive && !u.IsBanned).ToListAsync();
        return Ok(await MapPeoplePresenceAsync(list));
    }

    private async Task<List<object>> MapPeoplePresenceAsync(List<AppUser> list)
    {
        var me = DtoMapper.GetUserId(User);
        var result = new List<object>(list.Count);
        foreach (var person in list)
        {
            var live = _presence.IsOnline(person.Id) || person.IsOnline;
            var presence = await PrivacyRules.PresenceForViewerAsync(_db, person, me, live);
            result.Add(DtoMapper.MapUser(person, presence: presence));
        }
        return result;
    }

    [HttpPost("/api/users/{id:guid}/follow")]
    public async Task<IActionResult> Follow(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        if (id == me) return BadRequest(new { message = "Ozunu izleye bilmersen" });
        var target = await _users.FindByIdAsync(id.ToString());
        if (target == null || !target.IsActive || target.IsBanned) return NotFound(new { message = "Istifadeci tapilmadi" });
        if (await _db.Blocks.AnyAsync(b => (b.BlockerId == me && b.BlockedId == id) || (b.BlockerId == id && b.BlockedId == me)))
            return StatusCode(403, new { message = "Bu profil baglidir" });
        var exists = await _db.Follows.FirstOrDefaultAsync(f => f.FollowerId == me && f.FollowingId == id);
        if (exists != null)
        {
            _db.Follows.Remove(exists);
            await _db.SaveChangesAsync();
            return Ok(new { status = "none" });
        }

        if (target.IsPrivate)
        {
            var pending = await _db.FollowRequests.FirstOrDefaultAsync(r => r.FromId == me && r.ToId == id && r.Status == "pending");
            if (pending != null)
            {
                _db.FollowRequests.Remove(pending);
                await _db.SaveChangesAsync();
                return Ok(new { status = "none" });
            }
            _db.FollowRequests.Add(new FollowRequest { FromId = me, ToId = id, Status = "pending" });
            await _notes.AddAsync(id, me, "follow", me.ToString(), "izləmə sorğusu göndərdi");
            await _db.SaveChangesAsync();
            return Ok(new { status = "requested" });
        }

        _db.Follows.Add(new Follow { FollowerId = me, FollowingId = id });
        await _notes.AddAsync(id, me, "follow", me.ToString(), "səni izləməyə başladı");
        await _db.SaveChangesAsync();
        return Ok(new { status = "following" });
    }

    [HttpPost("/api/users/{id:guid}/block")]
    public async Task<IActionResult> Block(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        if (id == me) return BadRequest(new { message = "Ozunu bloklaya bilmersen" });
        var exists = await _db.Blocks.FirstOrDefaultAsync(b => b.BlockerId == me && b.BlockedId == id);
        if (exists != null) _db.Blocks.Remove(exists);
        else
        {
            _db.Blocks.Add(new Block { BlockerId = me, BlockedId = id });
            var follows = _db.Follows.Where(f =>
                (f.FollowerId == me && f.FollowingId == id) || (f.FollowerId == id && f.FollowingId == me));
            _db.Follows.RemoveRange(follows);
            var requests = _db.FollowRequests.Where(r =>
                (r.FromId == me && r.ToId == id) || (r.FromId == id && r.ToId == me));
            _db.FollowRequests.RemoveRange(requests);
        }
        await _db.SaveChangesAsync();
        return Ok(new { blocked = exists == null });
    }

    [HttpPatch("/api/profile")]
    public async Task<IActionResult> Profile([FromBody] ProfileBody body)
    {
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        if (user == null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(body.Username) is false && body.Username != user.UserName)
        {
            var taken = await _users.Users.AnyAsync(u => u.Id != user.Id && u.NormalizedUserName == body.Username.Trim().ToUpperInvariant());
            if (taken) return BadRequest(new { message = "Bu username artiq movcuddur" });
            var setName = await _users.SetUserNameAsync(user, body.Username.Trim());
            if (!setName.Succeeded) return BadRequest(new { message = setName.Errors.First().Description });
        }
        if (body.FullName != null) user.FullName = body.FullName.Trim();
        if (body.Bio != null) user.Bio = body.Bio;
        if (body.Website != null) user.Website = body.Website.Trim();
        if (body.Avatar != null)
        {
            if (string.IsNullOrWhiteSpace(body.Avatar))
            {
                user.AvatarUrl = "";
                user.AvatarExtension = "";
            }
            else
            {
                var (url, extension) = await StoredMedia.ResolveAsync(_files, body.Avatar, body.AvatarExtension, "images");
                user.AvatarUrl = url;
                user.AvatarExtension = extension;
            }
        }
        if (body.IsPrivate.HasValue) user.IsPrivate = body.IsPrivate.Value;
        if (body.ProfileViewHistory.HasValue && body.ProfileViewHistory.Value != user.ProfileViewHistory)
        {
            user.ProfileViewHistory = body.ProfileViewHistory.Value;
            if (!user.ProfileViewHistory)
                await _db.ProfileViews.Where(v => v.ViewerId == user.Id).ExecuteDeleteAsync();
        }
        if (body.ShowActivityStatus != null) user.ShowActivityStatus = PrivacyRules.NormalizeCircle(body.ShowActivityStatus);
        if (body.WhoCanMessage != null) user.WhoCanMessage = PrivacyRules.NormalizeCircle(body.WhoCanMessage);
        if (body.WhoCanTag != null) user.WhoCanTag = PrivacyRules.NormalizeCircle(body.WhoCanTag);
        if (body.WhoCanMention != null) user.WhoCanMention = PrivacyRules.NormalizeCircle(body.WhoCanMention);
        if (body.ReadReceipts.HasValue) user.ReadReceipts = body.ReadReceipts.Value;
        if (body.AllowStoryReplies.HasValue) user.AllowStoryReplies = body.AllowStoryReplies.Value;
        if (body.AllowStorySharing.HasValue) user.AllowStorySharing = body.AllowStorySharing.Value;
        user.UpdatedAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);
        var role = await DtoMapper.GetRole(_users, user);
        return Ok(DtoMapper.MapUser(user, role, includePrivacy: true));
    }

    [HttpPatch("/api/profile/note")]
    public async Task<IActionResult> SetNote([FromBody] NoteBody body)
    {
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        if (user == null) return Unauthorized();
        var text = (body.Text ?? "").Trim();
        if (text.Length == 0)
        {
            user.NoteText = null;
            user.NoteKind = "text";
            user.NoteAt = null;
        }
        else
        {
            if (text.Length > 60) text = text[..60];
            var kind = (body.Kind ?? "text").Trim().ToLowerInvariant();
            if (kind is not ("text" or "music" or "location" or "emoji")) kind = "text";
            user.NoteText = text;
            user.NoteKind = kind;
            user.NoteAt = DateTime.UtcNow;
        }
        user.UpdatedAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);
        var role = await DtoMapper.GetRole(_users, user);
        return Ok(DtoMapper.MapUser(user, role, includePrivacy: true));
    }

    [HttpPatch("/api/profile/language")]
    public async Task<IActionResult> SetLanguage([FromBody] LanguageBody body)
    {
        var code = (body.Language ?? "").Trim();
        var match = Languages.FirstOrDefault(item => item.Equals(code, StringComparison.OrdinalIgnoreCase));
        if (match == null) return BadRequest(new { message = "Bu dil seçilə bilməz" });
        var user = await _users.FindByIdAsync(DtoMapper.GetUserId(User).ToString());
        if (user == null) return Unauthorized();
        user.Language = match;
        user.UpdatedAt = DateTime.UtcNow;
        await _users.UpdateAsync(user);
        var role = await DtoMapper.GetRole(_users, user);
        return Ok(DtoMapper.MapUser(user, role));
    }

    [HttpGet("/api/follow-requests")]
    public async Task<IActionResult> Requests()
    {
        var me = DtoMapper.GetUserId(User);
        var list = await _db.FollowRequests.Include(r => r.From)
            .Where(r => r.ToId == me && r.Status == "pending").ToListAsync();
        return Ok(list.Select(r => new
        {
            id = r.Id.ToString(),
            fromId = r.FromId.ToString(),
            toId = r.ToId.ToString(),
            status = r.Status,
            from = DtoMapper.MapUser(r.From)
        }));
    }

    [HttpPost("/api/follow-requests/{id:guid}/accept")]
    public async Task<IActionResult> Accept(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var req = await _db.FollowRequests.FirstOrDefaultAsync(r => r.Id == id && r.ToId == me && r.Status == "pending");
        if (req == null) return NotFound();
        if (await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == req.FromId) || (b.BlockerId == req.FromId && b.BlockedId == me)))
            return StatusCode(403, new { message = "Bu profil baglidir" });
        req.Status = "accepted";
        var already = await _db.Follows.AnyAsync(f => f.FollowerId == req.FromId && f.FollowingId == me);
        if (!already) _db.Follows.Add(new Follow { FollowerId = req.FromId, FollowingId = me });
        await _db.SaveChangesAsync();
        await _notes.AddAsync(req.FromId, me, "follow", me.ToString(), "izləmə sorğusunu qəbul etdi");
        return Ok(new { status = req.Status });
    }

    [HttpPost("/api/follow-requests/{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var req = await _db.FollowRequests.FirstOrDefaultAsync(r => r.Id == id && r.ToId == me && r.Status == "pending");
        if (req == null) return NotFound();
        req.Status = "rejected";
        await _db.SaveChangesAsync();
        return Ok(new { status = req.Status });
    }

    [HttpPost("/api/users/{id:guid}/mute")]
    public async Task<IActionResult> Mute(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        if (id == me) return BadRequest(new { message = "Ozunu sessize ala bilmersen" });
        var row = await _db.UserMutes.FirstOrDefaultAsync(m => m.UserId == me && m.MutedId == id);
        if (row != null) _db.UserMutes.Remove(row);
        else
        {
            var mute = new UserMute { UserId = me, MutedId = id };
            _db.UserMutes.Add(mute);
            _db.Entry(mute).State = EntityState.Added;
        }
        await _db.SaveChangesAsync();
        return Ok(new { muted = row == null });
    }

    [HttpGet("/api/close-friends")]
    public async Task<IActionResult> CloseFriends()
    {
        var me = DtoMapper.GetUserId(User);
        var ids = await _db.CloseFriends.Where(c => c.OwnerId == me).Select(c => c.FriendId).ToListAsync();
        var users = await _users.Users.Where(u => ids.Contains(u.Id)).ToListAsync();
        return Ok(users.Select(u => DtoMapper.MapUser(u)));
    }

    [HttpPost("/api/close-friends/{id:guid}")]
    public async Task<IActionResult> ToggleClose(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        if (id == me) return BadRequest();
        var row = await _db.CloseFriends.FirstOrDefaultAsync(c => c.OwnerId == me && c.FriendId == id);
        if (row != null) _db.CloseFriends.Remove(row);
        else
        {
            var friend = new CloseFriend { OwnerId = me, FriendId = id };
            _db.CloseFriends.Add(friend);
            _db.Entry(friend).State = EntityState.Added;
        }
        await _db.SaveChangesAsync();
        return Ok(new { closeFriend = row == null });
    }

    [HttpGet("/api/suggestions")]
    public async Task<IActionResult> Suggestions()
    {
        var me = DtoMapper.GetUserId(User);
        var following = await _db.Follows.Where(f => f.FollowerId == me).Select(f => f.FollowingId).ToListAsync();
        following.Add(me);
        var blocked = await _db.Blocks.Where(b => b.BlockerId == me).Select(b => b.BlockedId).ToListAsync();
        blocked.AddRange(await _db.Blocks.Where(b => b.BlockedId == me).Select(b => b.BlockerId).ToListAsync());
        var adminIds = (await _users.GetUsersInRoleAsync("Admin")).Select(a => a.Id).ToList();
        var people = await _users.Users.Where(u => !adminIds.Contains(u.Id) && !following.Contains(u.Id) && !blocked.Contains(u.Id) && u.IsActive && !u.IsBanned).Take(8).ToListAsync();
        return Ok(people.Select(u => DtoMapper.MapUser(u)));
    }

    [HttpGet("/api/profile/views")]
    public async Task<IActionResult> Views()
    {
        var me = DtoMapper.GetUserId(User);
        var cutoff = DateTime.UtcNow.AddDays(-7);
        await _db.ProfileViews.Where(v => v.CreatedAt < cutoff).ExecuteDeleteAsync();
        var enabled = await _users.Users.Where(u => u.Id == me).Select(u => u.ProfileViewHistory).FirstOrDefaultAsync();
        if (!enabled) return Ok(new { enabled = false, items = Array.Empty<object>() });
        var rows = await _db.ProfileViews.AsNoTracking()
            .Include(v => v.Viewer)
            .Where(v => v.ProfileId == me && v.CreatedAt >= cutoff && v.Viewer.ProfileViewHistory && v.Viewer.IsActive && !v.Viewer.IsBanned)
            .OrderByDescending(v => v.CreatedAt)
            .Take(50)
            .ToListAsync();
        return Ok(new { enabled = true, items = rows.Select(v => new { user = DtoMapper.MapUser(v.Viewer), seenAt = v.CreatedAt }) });
    }

    [HttpPost("/api/hashtags/{tag}/follow")]
    public async Task<IActionResult> FollowTag(string tag)
    {
        var me = DtoMapper.GetUserId(User);
        var name = tag.Trim().TrimStart('#').ToLower();
        if (name.Length == 0) return BadRequest(new { message = "Etiket yaz" });
        var row = await _db.HashtagFollows.FirstOrDefaultAsync(h => h.UserId == me && h.Tag == name);
        if (row != null) _db.HashtagFollows.Remove(row);
        else
        {
            var follow = new HashtagFollow { UserId = me, Tag = name };
            _db.HashtagFollows.Add(follow);
            _db.Entry(follow).State = EntityState.Added;
        }
        await _db.SaveChangesAsync();
        return Ok(new { following = row == null, tag = name });
    }

    private async Task<bool> CanListPeople(AppUser user)
    {
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        if (me == user.Id) return true;
        if (me.HasValue && await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == user.Id) || (b.BlockerId == user.Id && b.BlockedId == me)))
            return false;
        if (!user.IsPrivate) return true;
        return me.HasValue && await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == user.Id);
    }
}

public class LanguageBody
{
    public string? Language { get; set; }
}

public class ProfileBody
{
    public string? FullName { get; set; }
    public string? Username { get; set; }
    public string? Bio { get; set; }
    public string? Website { get; set; }
    public string? Avatar { get; set; }
    public string? AvatarExtension { get; set; }
    public bool? IsPrivate { get; set; }
    public bool? ProfileViewHistory { get; set; }
    public string? ShowActivityStatus { get; set; }
    public string? WhoCanMessage { get; set; }
    public string? WhoCanTag { get; set; }
    public string? WhoCanMention { get; set; }
    public bool? ReadReceipts { get; set; }
    public bool? AllowStoryReplies { get; set; }
    public bool? AllowStorySharing { get; set; }
}

public class NoteBody
{
    public string? Text { get; set; }
    public string? Kind { get; set; }
}
