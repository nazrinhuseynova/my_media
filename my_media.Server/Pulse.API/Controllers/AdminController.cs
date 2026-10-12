using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public AdminController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    [HttpGet("/api/admin/stats")]
    public async Task<IActionResult> Stats()
    {
        return Ok(new
        {
            users = await _users.Users.CountAsync(),
            posts = await _db.Posts.CountAsync(p => !p.IsDeleted),
            reels = await _db.Reels.CountAsync(r => !r.IsDeleted),
            reports = await _db.Reports.CountAsync(),
            activeUsers = await _users.Users.CountAsync(u => u.IsActive && !u.IsBanned)
        });
    }

    [HttpGet("/api/admin/users")]
    public async Task<IActionResult> Users()
    {
        var list = await _users.Users.ToListAsync();
        var result = new List<object>();
        foreach (var u in list)
        {
            result.Add(DtoMapper.MapUser(u, await DtoMapper.GetRole(_users, u)));
        }
        return Ok(result);
    }

    [HttpGet("/api/admin/posts")]
    public async Task<IActionResult> Posts()
    {
        var me = DtoMapper.GetUserId(User);
        var posts = await _db.Posts.Include(p => p.User).Include(p => p.Media).Include(p => p.Likes).ThenInclude(l => l.User).Include(p => p.Comments)
            .Where(p => !p.IsDeleted).ToListAsync();
        return Ok(posts.Select(p => DtoMapper.MapPost(p, me, _db)));
    }

    [HttpPost("/api/admin/users/{id:guid}/ban")]
    public async Task<IActionResult> Ban(Guid id)
    {
        var user = await _users.FindByIdAsync(id.ToString());
        if (user == null) return NotFound();
        user.IsBanned = !user.IsBanned;
        await _users.UpdateAsync(user);
        await DropSessions(user);
        return Ok(DtoMapper.MapUser(user, await DtoMapper.GetRole(_users, user)));
    }

    [HttpGet("/api/admin/reports")]
    public async Task<IActionResult> Reports()
    {
        var list = await _db.Reports.OrderByDescending(r => r.CreatedAt).ToListAsync();
        return Ok(list.Select(r => new
        {
            id = r.Id.ToString(),
            fromId = r.FromId.ToString(),
            targetType = r.TargetType,
            targetId = r.TargetId,
            reason = r.Reason,
            status = r.Status,
            createdAt = r.CreatedAt
        }));
    }

    [HttpPost("/api/admin/reports/{id:guid}/resolve")]
    public async Task<IActionResult> Resolve(Guid id, [FromBody] ResolveReportBody body)
    {
        var report = await _db.Reports.FindAsync(id);
        if (report == null) return NotFound();
        var action = (body.Action ?? "dismissed").ToLowerInvariant();
        report.Status = action;

        Guid? relatedUserId = null;
        if (Guid.TryParse(report.TargetId, out var targetGuid))
        {
            if (report.TargetType == "post")
            {
                var post = await _db.Posts.FindAsync(targetGuid);
                relatedUserId = post?.UserId;
                if (action == "remove" && post != null)
                {
                    post.IsDeleted = true;
                }
            }
            else if (report.TargetType == "reel")
            {
                var reel = await _db.Reels.FindAsync(targetGuid);
                relatedUserId = reel?.UserId;
                if (action == "remove" && reel != null)
                {
                    reel.IsDeleted = true;
                }
            }
            else if (report.TargetType == "user")
            {
                relatedUserId = targetGuid;
            }
        }

        if (action == "ban" && relatedUserId.HasValue)
        {
            var user = await _users.FindByIdAsync(relatedUserId.Value.ToString());
            if (user != null)
            {
                user.IsBanned = true;
                await _users.UpdateAsync(user);
                await DropSessions(user);
            }
        }

        await _db.SaveChangesAsync();
        return Ok(new
        {
            id = report.Id.ToString(),
            report.Status,
            report.TargetType,
            report.TargetId
        });
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

public class ResolveReportBody
{
    public string Action { get; set; } = "dismissed";
}
