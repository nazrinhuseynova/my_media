using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize]
public class SearchController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public SearchController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    [HttpGet("/api/search")]
    public async Task<IActionResult> Search([FromQuery] string q = "", [FromQuery] string type = "all")
    {
        q = (q ?? "").Trim().ToLower();
        var me = DtoMapper.GetUserId(User);
        var hidden = await _db.Blocks.Where(b => b.BlockerId == me).Select(b => b.BlockedId).ToListAsync();
        hidden.AddRange(await _db.Blocks.Where(b => b.BlockedId == me).Select(b => b.BlockerId).ToListAsync());
        var users = await _users.Users
            .Where(u => u.IsActive && !u.IsBanned && !hidden.Contains(u.Id) && (u.UserName!.ToLower().Contains(q) || u.FullName.ToLower().Contains(q)))
            .Take(20).ToListAsync();

        var hashtags = (await _db.Posts.Where(p => !p.IsDeleted && !p.IsDraft && !p.IsArchived).Select(p => p.Hashtags).ToListAsync())
            .SelectMany(h => (h ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries))
            .Distinct()
            .Where(t => t.Contains(q))
            .ToList();

        var now = DateTime.UtcNow;
        var locations = await _db.Posts
            .Where(p => !p.IsDeleted && !p.IsDraft && !p.IsArchived
                && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && p.Location != null && p.Location.ToLower().Contains(q)
                && !hidden.Contains(p.UserId)
                && p.User.IsActive && !p.User.IsBanned && !p.User.IsPrivate)
            .Select(p => p.Location!)
            .Distinct()
            .ToListAsync();

        if (type == "user") return Ok(new { users = users.Select(u => DtoMapper.MapUser(u)) });
        if (type == "hashtag") return Ok(new { hashtags });
        if (type == "location") return Ok(new { locations });
        return Ok(new { users = users.Select(u => DtoMapper.MapUser(u)), hashtags, locations });
    }

    [AllowAnonymous]
    [HttpGet("/api/hashtags/{tag}")]
    public async Task<IActionResult> Hashtag(string tag)
    {
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var now = DateTime.UtcNow;
        var needle = tag.Trim().TrimStart('#').ToLower();
        var hidden = new List<Guid>();
        var following = new List<Guid>();
        if (me.HasValue)
        {
            hidden = await _db.Blocks.Where(b => b.BlockerId == me || b.BlockedId == me)
                .Select(b => b.BlockerId == me ? b.BlockedId : b.BlockerId).ToListAsync();
            hidden.AddRange(await _db.UserMutes.Where(m => m.UserId == me).Select(m => m.MutedId).ToListAsync());
            following = await _db.Follows.Where(f => f.FollowerId == me).Select(f => f.FollowingId).ToListAsync();
        }
        var items = await _db.Posts.Include(p => p.User).Include(p => p.Media).Include(p => p.Likes).ThenInclude(l => l.User).Include(p => p.Comments)
            .Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft && ("," + p.Hashtags + ",").Contains("," + needle + ",")
                && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && p.User.IsActive && !p.User.IsBanned && !hidden.Contains(p.UserId)
                && (!p.User.IsPrivate || p.UserId == me || following.Contains(p.UserId)))
            .ToListAsync();
        var savedIds = await SavedIds(me, items.Select(p => p.Id));
        var followed = me.HasValue && await _db.HashtagFollows.AnyAsync(h => h.UserId == me && h.Tag == needle);
        return Ok(new { tag, following = followed, items = items.Select(p => DtoMapper.MapPost(p, me, _db, savedIds)) });
    }

    [AllowAnonymous]
    [HttpGet("/api/locations/{name}")]
    public async Task<IActionResult> Location(string name)
    {
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var loc = Uri.UnescapeDataString(name);
        var now = DateTime.UtcNow;
        var hidden = new List<Guid>();
        var following = new List<Guid>();
        if (me.HasValue)
        {
            hidden = await _db.Blocks.Where(b => b.BlockerId == me || b.BlockedId == me)
                .Select(b => b.BlockerId == me ? b.BlockedId : b.BlockerId).ToListAsync();
            hidden.AddRange(await _db.UserMutes.Where(m => m.UserId == me).Select(m => m.MutedId).ToListAsync());
            following = await _db.Follows.Where(f => f.FollowerId == me).Select(f => f.FollowingId).ToListAsync();
        }
        var items = await _db.Posts.Include(p => p.User).Include(p => p.Media).Include(p => p.Likes).ThenInclude(l => l.User).Include(p => p.Comments)
            .Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft && p.Location == loc && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && p.User.IsActive && !p.User.IsBanned && !hidden.Contains(p.UserId)
                && (!p.User.IsPrivate || p.UserId == me || following.Contains(p.UserId))).ToListAsync();
        var savedIds = await SavedIds(me, items.Select(p => p.Id));
        return Ok(new { location = loc, items = items.Select(p => DtoMapper.MapPost(p, me, _db, savedIds)) });
    }

    private async Task<HashSet<Guid>> SavedIds(Guid? me, IEnumerable<Guid> postIds)
    {
        if (!me.HasValue) return new HashSet<Guid>();
        var ids = postIds.ToList();
        if (ids.Count == 0) return new HashSet<Guid>();
        var saved = await _db.SavedPosts.AsNoTracking()
            .Where(s => s.UserId == me && ids.Contains(s.PostId))
            .Select(s => s.PostId)
            .ToListAsync();
        return saved.ToHashSet();
    }
}
