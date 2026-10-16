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
    public async Task<IActionResult> Search(
        [FromQuery] string q = "",
        [FromQuery] string type = "all",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        q = (q ?? "").Trim().ToLower();
        if (q.Length == 0)
            return Ok(new { users = Array.Empty<object>(), hashtags = Array.Empty<string>(), locations = Array.Empty<string>(), page = 1, pageSize, hasMore = false });
        var paging = Paging.Normalize(page, pageSize, 20, 40);
        var me = DtoMapper.GetUserId(User);
        var hidden = await _db.Blocks.Where(b => b.BlockerId == me).Select(b => b.BlockedId).ToListAsync();
        hidden.AddRange(await _db.Blocks.Where(b => b.BlockedId == me).Select(b => b.BlockerId).ToListAsync());
        var adminIds = (await _users.GetUsersInRoleAsync("Admin")).Select(a => a.Id).ToList();
        var userQuery = _users.Users
            .Where(u => u.IsActive && !u.IsBanned && !hidden.Contains(u.Id) && !adminIds.Contains(u.Id) && (u.UserName!.ToLower().Contains(q) || u.FullName.ToLower().Contains(q)));
        var userPage = await userQuery
            .OrderBy(u => u.UserName)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize + 1)
            .ToListAsync();
        var usersHasMore = userPage.Count > paging.PageSize;
        var users = userPage.Take(paging.PageSize).ToList();

        var now = DateTime.UtcNow;
        var hashtags = (await _db.Posts.AsNoTracking()
            .Where(p => !p.IsDeleted && !p.IsDraft && !p.IsArchived
                && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && p.Hashtags != null && p.Hashtags.ToLower().Contains(q)
                && !hidden.Contains(p.UserId)
                && p.User.IsActive && !p.User.IsBanned && !p.User.IsPrivate)
            .Select(p => p.Hashtags)
            .Take(80)
            .ToListAsync())
            .SelectMany(h => (h ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries))
            .Distinct()
            .Where(t => t.Contains(q))
            .Take(20)
            .ToList();

        var locations = await _db.Posts
            .Where(p => !p.IsDeleted && !p.IsDraft && !p.IsArchived
                && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && p.Location != null && p.Location.ToLower().Contains(q)
                && !hidden.Contains(p.UserId)
                && p.User.IsActive && !p.User.IsBanned && !p.User.IsPrivate)
            .Select(p => p.Location!)
            .Distinct()
            .Take(20)
            .ToListAsync();

        if (type == "user")
            return Ok(new { users = users.Select(u => DtoMapper.MapUser(u)), page = paging.Page, pageSize = paging.PageSize, hasMore = usersHasMore });
        if (type == "hashtag") return Ok(new { hashtags, page = paging.Page, pageSize = paging.PageSize, hasMore = false });
        if (type == "location") return Ok(new { locations, page = paging.Page, pageSize = paging.PageSize, hasMore = false });
        return Ok(new
        {
            users = users.Select(u => DtoMapper.MapUser(u)),
            hashtags,
            locations,
            page = paging.Page,
            pageSize = paging.PageSize,
            hasMore = usersHasMore
        });
    }

    [AllowAnonymous]
    [HttpGet("/api/hashtags/{tag}")]
    public async Task<IActionResult> Hashtag(string tag, [FromQuery] int page = 1, [FromQuery] int pageSize = 12)
    {
        var paging = Paging.Normalize(page, pageSize, 12, 24);
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var now = DateTime.UtcNow;
        var needle = tag.Trim().TrimStart('#').ToLower();
        var hidden = new List<Guid>();
        var following = new List<Guid>();
        if (me.HasValue)
        {
            hidden = await _db.Blocks.AsNoTracking().Where(b => b.BlockerId == me || b.BlockedId == me)
                .Select(b => b.BlockerId == me ? b.BlockedId : b.BlockerId).ToListAsync();
            hidden.AddRange(await _db.UserMutes.AsNoTracking().Where(m => m.UserId == me).Select(m => m.MutedId).ToListAsync());
            following = await _db.Follows.AsNoTracking().Where(f => f.FollowerId == me).Select(f => f.FollowingId).ToListAsync();
        }
        var query = _db.Posts.AsNoTracking()
            .Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft && ("," + p.Hashtags + ",").Contains("," + needle + ",")
                && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && p.User.IsActive && !p.User.IsBanned && !hidden.Contains(p.UserId)
                && (!p.User.IsPrivate || p.UserId == me || following.Contains(p.UserId)));
        var total = await query.CountAsync();
        var ids = await query.OrderByDescending(p => p.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(p => p.Id)
            .ToListAsync();
        var loaded = await LoadPosts(ids);
        var savedIds = await SavedIds(me, ids);
        var followed = me.HasValue && await _db.HashtagFollows.AnyAsync(h => h.UserId == me && h.Tag == needle);
        var paged = PagedResult<object>.Create(loaded.Select(p => DtoMapper.MapPost(p, me, _db, savedIds)).ToList(), paging.Page, paging.PageSize, total);
        return Ok(new { tag, following = followed, items = paged.Items, page = paged.Page, pageSize = paged.PageSize, totalCount = paged.TotalCount, hasMore = paged.HasMore });
    }

    [AllowAnonymous]
    [HttpGet("/api/locations/{name}")]
    public async Task<IActionResult> Location(string name, [FromQuery] int page = 1, [FromQuery] int pageSize = 12)
    {
        var paging = Paging.Normalize(page, pageSize, 12, 24);
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var loc = Uri.UnescapeDataString(name);
        var now = DateTime.UtcNow;
        var hidden = new List<Guid>();
        var following = new List<Guid>();
        if (me.HasValue)
        {
            hidden = await _db.Blocks.AsNoTracking().Where(b => b.BlockerId == me || b.BlockedId == me)
                .Select(b => b.BlockerId == me ? b.BlockedId : b.BlockerId).ToListAsync();
            hidden.AddRange(await _db.UserMutes.AsNoTracking().Where(m => m.UserId == me).Select(m => m.MutedId).ToListAsync());
            following = await _db.Follows.AsNoTracking().Where(f => f.FollowerId == me).Select(f => f.FollowingId).ToListAsync();
        }
        var query = _db.Posts.AsNoTracking()
            .Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft && p.Location == loc && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && p.User.IsActive && !p.User.IsBanned && !hidden.Contains(p.UserId)
                && (!p.User.IsPrivate || p.UserId == me || following.Contains(p.UserId)));
        var total = await query.CountAsync();
        var ids = await query.OrderByDescending(p => p.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(p => p.Id)
            .ToListAsync();
        var loaded = await LoadPosts(ids);
        var savedIds = await SavedIds(me, ids);
        var paged = PagedResult<object>.Create(loaded.Select(p => DtoMapper.MapPost(p, me, _db, savedIds)).ToList(), paging.Page, paging.PageSize, total);
        return Ok(new { location = loc, items = paged.Items, page = paged.Page, pageSize = paged.PageSize, totalCount = paged.TotalCount, hasMore = paged.HasMore });
    }

    private async Task<List<Post>> LoadPosts(List<Guid> ids)
    {
        if (ids.Count == 0) return new List<Post>();
        var loaded = await _db.Posts.AsNoTracking().AsSplitQuery()
            .Include(p => p.User).Include(p => p.Media).Include(p => p.Likes).ThenInclude(l => l.User).Include(p => p.Comments)
            .Where(p => ids.Contains(p.Id))
            .ToListAsync();
        var rank = ids.Select((id, index) => (id, index)).ToDictionary(x => x.id, x => x.index);
        return loaded.OrderBy(p => rank[p.Id]).ToList();
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
