using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Infrastructure.Persistence;
using Pulse.Infrastructure.Realtime;

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
        var since = DateTime.UtcNow.AddHours(-4);
        var rooms = await _db.LiveRooms.AsNoTracking()
            .Where(r => r.EndedAt == null && r.CreatedAt >= since)
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
            var host = room.Seats.OrderBy(s => s.SortOrder).FirstOrDefault();
            if (host == null || !host.IsActive || host.IsBanned || hidden.Contains(host.UserId))
                return null;
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
        }).Where(room => room != null && room.people.Count > 0);
        return Ok(items);
    }

    [HttpGet("/api/lives/{id:guid}")]
    public async Task<IActionResult> Get(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var since = DateTime.UtcNow.AddHours(-4);
        var room = await _db.LiveRooms.AsNoTracking()
            .Include(r => r.Seats).ThenInclude(s => s.User)
            .FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null && r.CreatedAt >= since);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        var people = room.Seats.OrderBy(s => s.SortOrder)
            .Where(s => s.User != null && s.User.IsActive && !s.User.IsBanned)
            .Select(s => new
            {
                id = s.UserId.ToString(),
                username = s.User!.UserName,
                fullName = s.User.FullName,
                avatar = s.User.AvatarUrl,
                host = s.SortOrder == 0,
                sortOrder = s.SortOrder
            }).ToList();
        return Ok(new
        {
            id = room.Id.ToString(),
            title = room.Title,
            people,
            isHost = people.Any(p => p.id == me.ToString() && p.host),
            inRoom = people.Any(p => p.id == me.ToString()),
            seatsLeft = Math.Max(0, LiveHub.MaxSeats - people.Count)
        });
    }

    [HttpPost("/api/lives")]
    public async Task<IActionResult> Start([FromBody] LiveStartBody? body)
    {
        body ??= new LiveStartBody();
        var me = DtoMapper.GetUserId(User);
        var since = DateTime.UtcNow.AddHours(-4);
        var open = await _db.LiveRooms.Include(r => r.Seats)
            .FirstOrDefaultAsync(r => r.EndedAt == null && r.CreatedAt >= since && r.Seats.Any(s => s.UserId == me && s.SortOrder == 0));
        if (open != null) return Ok(new { id = open.Id.ToString(), title = open.Title });
        var title = (body.Title ?? "").Trim();
        if (title.Length == 0) title = "Canlı";
        if (title.Length > 80) title = title[..80];
        var room = new Pulse.Domain.Entities.LiveRoom { Title = title };
        room.Seats.Add(new Pulse.Domain.Entities.LiveSeat { UserId = me, SortOrder = 0 });
        _db.LiveRooms.Add(room);
        await _db.SaveChangesAsync();
        return StatusCode(201, new { id = room.Id.ToString(), title = room.Title });
    }

    [HttpPost("/api/lives/{id:guid}/join")]
    public async Task<IActionResult> Join(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (room.Seats.Any(s => s.UserId == me)) return Ok(new { id = room.Id.ToString(), joined = true });
        if (room.Seats.Count >= LiveHub.MaxSeats)
            return StatusCode(403, new { message = $"Bir yayımda ən çox {LiveHub.MaxSeats} nəfər ola bilər" });
        var host = room.Seats.OrderBy(s => s.SortOrder).FirstOrDefault();
        if (host == null) return NotFound(new { message = "Canlı yayım bitib" });
        var hostUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == host.UserId);
        if (hostUser == null || !hostUser.IsActive || hostUser.IsBanned)
            return NotFound(new { message = "Canlı yayım bitib" });
        if (await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == host.UserId) || (b.BlockerId == host.UserId && b.BlockedId == me)))
            return StatusCode(403, new { message = "Bu profil baglidir" });
        var seat = new Pulse.Domain.Entities.LiveSeat { RoomId = room.Id, UserId = me, SortOrder = room.Seats.Count };
        _db.LiveSeats.Add(seat);
        await _db.SaveChangesAsync();
        return Ok(new { id = room.Id.ToString(), joined = true });
    }

    [HttpPost("/api/lives/{id:guid}/leave")]
    public async Task<IActionResult> Leave(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await _db.LiveRooms.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        var mine = room.Seats.FirstOrDefault(s => s.UserId == me);
        if (mine == null) return Ok(new { left = true });
        var host = mine.SortOrder == 0;
        room.Seats.Remove(mine);
        _db.LiveSeats.Remove(mine);
        if (host || room.Seats.Count == 0) room.EndedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { left = true, ended = room.EndedAt != null });
    }

    [HttpPost("/api/lives/{id:guid}/end")]
    public async Task<IActionResult> End(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await _db.LiveRooms.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!room.Seats.Any(s => s.UserId == me && s.SortOrder == 0))
            return StatusCode(403, new { message = "Yayımı yalnız aparıcı bitirə bilər" });
        room.EndedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(new { ended = true });
    }

    private Task<Pulse.Domain.Entities.LiveRoom?> OpenRoom(Guid id)
    {
        var since = DateTime.UtcNow.AddHours(-4);
        return _db.LiveRooms.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null && r.CreatedAt >= since);
    }
}

public class LiveStartBody
{
    public string? Title { get; set; }
}
