using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize]
public class LivesController : ControllerBase
{
    private readonly AppDbContext _db;

    public LivesController(AppDbContext db)
    {
        _db = db;
    }

    [HttpGet("/api/lives")]
    public async Task<IActionResult> List()
    {
        var me = DtoMapper.GetUserId(User);
        var hidden = await _db.Blocks.Where(b => b.BlockerId == me || b.BlockedId == me)
            .Select(b => b.BlockerId == me ? b.BlockedId : b.BlockerId)
            .ToListAsync();
        var rooms = await _db.LiveRooms.AsNoTracking()
            .Where(r => r.EndedAt == null)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                r.Title,
                Seats = r.Seats.OrderBy(s => s.SortOrder).Select(s => new
                {
                    s.UserId,
                    s.SortOrder,
                    s.User.UserName,
                    s.User.FullName,
                    s.User.AvatarUrl,
                    s.User.IsActive,
                    s.User.IsBanned
                }).ToList()
            })
            .ToListAsync();
        var items = rooms.Select(room =>
        {
            var people = room.Seats
                .Where(s => s.IsActive && !s.IsBanned && !hidden.Contains(s.UserId))
                .Select(s => new
                {
                    id = s.UserId.ToString(),
                    username = s.UserName,
                    fullName = s.FullName,
                    avatar = s.AvatarUrl
                })
                .ToList();
            return new { id = room.Id.ToString(), title = room.Title, people };
        }).Where(room => room.people.Count > 0);
        return Ok(items);
    }
}
