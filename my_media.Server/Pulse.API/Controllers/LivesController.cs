using Microsoft.AspNetCore.Authorization;
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
[Authorize]
public class LivesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IHubContext<LiveHub> _hub;
    private readonly INotificationService _notes;

    public LivesController(AppDbContext db, IHubContext<LiveHub> hub, INotificationService notes)
    {
        _db = db;
        _hub = hub;
        _notes = notes;
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
                r.MaxSeats,
                r.LikeCount,
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
                    avatar = s.AvatarUrl,
                    host = s.SortOrder == 0
                })
                .ToList();
            return new
            {
                id = room.Id.ToString(),
                title = room.Title,
                maxSeats = ClampSeats(room.MaxSeats),
                likeCount = room.LikeCount,
                viewerCount = LivePresence.ViewerCount(room.Id, host.UserId),
                people
            };
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
        var maxSeats = ClampSeats(room.MaxSeats);
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
        var inSeat = people.Any(p => p.id == me.ToString());
        var isHost = people.Any(p => p.id == me.ToString() && p.host);
        var hostPerson = people.FirstOrDefault(p => p.host);
        Guid? hostExclude = Guid.TryParse(hostPerson?.id, out var hid) ? hid : null;
        var requestIds = LivePresence.RequestIds(id);
        var requestUsers = await _db.Users.AsNoTracking()
            .Where(u => requestIds.Contains(u.Id))
            .Select(u => new { id = u.Id.ToString(), username = u.UserName, fullName = u.FullName, avatar = u.AvatarUrl })
            .ToListAsync();
        return Ok(new
        {
            id = room.Id.ToString(),
            title = room.Title,
            maxSeats,
            likeCount = room.LikeCount,
            people,
            viewers = LivePresence.ViewerList(id, hostExclude),
            viewerCount = LivePresence.ViewerCount(id, hostExclude),
            requests = requestUsers,
            isHost,
            inSeat,
            inRoom = inSeat,
            invited = LivePresence.HasInvite(id, me),
            requested = LivePresence.HasRequest(id, me),
            muted = LivePresence.IsMuted(id, me),
            seatsLeft = Math.Max(0, maxSeats - people.Count)
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
        if (open != null) return Ok(new { id = open.Id.ToString(), title = open.Title, maxSeats = ClampSeats(open.MaxSeats) });
        var title = (body.Title ?? "").Trim();
        if (title.Length == 0) title = "Canlı";
        if (title.Length > 80) title = title[..80];
        var maxSeats = ClampSeats(body.MaxSeats);
        var room = new Pulse.Domain.Entities.LiveRoom { Title = title, MaxSeats = maxSeats, LikeCount = 0 };
        room.Seats.Add(new Pulse.Domain.Entities.LiveSeat { UserId = me, SortOrder = 0 });
        _db.LiveRooms.Add(room);
        await _db.SaveChangesAsync();
        return StatusCode(201, new { id = room.Id.ToString(), title = room.Title, maxSeats = room.MaxSeats });
    }

    /// <summary>İzləyici kimi bax (kamera/seat yox).</summary>
    [HttpPost("/api/lives/{id:guid}/watch")]
    public async Task<IActionResult> Watch(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (LivePresence.IsKicked(id, me))
            return StatusCode(403, new { message = "Bu yayımdan çıxarıldın" });
        var host = room.Seats.OrderBy(s => s.SortOrder).FirstOrDefault();
        if (host == null) return NotFound(new { message = "Canlı yayım bitib" });
        var hostUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == host.UserId);
        if (hostUser == null || !hostUser.IsActive || hostUser.IsBanned)
            return NotFound(new { message = "Canlı yayım bitib" });
        if (await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == host.UserId) || (b.BlockerId == host.UserId && b.BlockedId == me)))
            return StatusCode(403, new { message = "Bu profil baglidir" });
        return Ok(new { id = room.Id.ToString(), watching = true, inSeat = room.Seats.Any(s => s.UserId == me) });
    }

    /// <summary>Köhnə yol: artıq avtomatik seat vermir — watch ilə eyni.</summary>
    [HttpPost("/api/lives/{id:guid}/join")]
    public Task<IActionResult> Join(Guid id) => Watch(id);

    [HttpGet("/api/lives/{id:guid}/invite-friends")]
    public async Task<IActionResult> InviteFriends(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı dəvət edə bilər" });
        var seatIds = room.Seats.Select(s => s.UserId).ToHashSet();
        // Qarşılıqlı izləmə (mutual)
        var iFollow = await _db.Follows.AsNoTracking()
            .Where(f => f.FollowerId == me)
            .Select(f => f.FollowingId)
            .ToListAsync();
        var mutualIds = await _db.Follows.AsNoTracking()
            .Where(f => f.FollowingId == me && iFollow.Contains(f.FollowerId))
            .Select(f => f.FollowerId)
            .Where(uid => !seatIds.Contains(uid))
            .Take(80)
            .ToListAsync();
        var users = await _db.Users.AsNoTracking()
            .Where(u => mutualIds.Contains(u.Id) && u.IsActive && !u.IsBanned)
            .OrderBy(u => u.UserName)
            .Select(u => new
            {
                id = u.Id.ToString(),
                username = u.UserName,
                fullName = u.FullName,
                avatar = u.AvatarUrl,
                invited = LivePresence.HasInvite(id, u.Id)
            })
            .ToListAsync();
        return Ok(users);
    }

    [HttpPost("/api/lives/{id:guid}/invite")]
    public async Task<IActionResult> InviteUser(Guid id, [FromBody] LiveUserBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.UserId, out var target)) return BadRequest(new { message = "İstifadəçi seç" });
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı dəvət edə bilər" });
        if (room.Seats.Any(s => s.UserId == target)) return BadRequest(new { message = "Artıq kameradadır" });
        var maxSeats = ClampSeats(room.MaxSeats);
        if (maxSeats <= 1) return BadRequest(new { message = "Bu yayımda qonaq yoxdur" });
        if (room.Seats.Count >= maxSeats) return StatusCode(403, new { message = "Yer doludur" });
        var mutual = await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == target)
            && await _db.Follows.AnyAsync(f => f.FollowerId == target && f.FollowingId == me);
        if (!mutual) return StatusCode(403, new { message = "Yalnız qarşılıqlı izlədiyin insanları dəvət edə bilərsən" });
        if (await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == target) || (b.BlockerId == target && b.BlockedId == me)))
            return StatusCode(403, new { message = "Bu profil bağlıdır" });

        LivePresence.Invite(id, target);
        var host = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        var invitePayload = new
        {
            roomId = id.ToString(),
            title = room.Title,
            fromUserId = me.ToString(),
            fromUsername = host?.UserName ?? "",
            fromFullName = host?.FullName ?? "",
            targetUserId = target.ToString(),
            maxSeats
        };
        await _hub.Clients.User(target.ToString()).SendAsync("liveInvite", invitePayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveInvite", invitePayload);
        await _notes.AddAsync(target, me, "live_invite", id.ToString(), "səni canlı yayına dəvət etdi");
        return Ok(new { invited = true });
    }

    [HttpPost("/api/lives/{id:guid}/accept-invite")]
    public async Task<IActionResult> AcceptInvite(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (room.Seats.Any(s => s.UserId == me)) return Ok(new { id = room.Id.ToString(), joined = true, already = true });
        if (!LivePresence.HasInvite(id, me))
            return StatusCode(403, new { message = "Dəvət yoxdur və ya vaxtı bitib" });
        var maxSeats = ClampSeats(room.MaxSeats);
        if (room.Seats.Count >= maxSeats)
            return StatusCode(403, new { message = maxSeats <= 1
                ? "Bu yayım yalnız tək aparıcı üçündür"
                : $"Bir yayımda ən çox {maxSeats} nəfər kamerada ola bilər" });
        var host = room.Seats.OrderBy(s => s.SortOrder).FirstOrDefault();
        if (host == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == host.UserId) || (b.BlockerId == host.UserId && b.BlockedId == me)))
            return StatusCode(403, new { message = "Bu profil baglidir" });

        _db.LiveSeats.Add(new Pulse.Domain.Entities.LiveSeat { RoomId = room.Id, UserId = me, SortOrder = room.Seats.Count });
        LivePresence.ClearInvite(id, me);
        await _db.SaveChangesAsync();
        var guest = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        await _notes.AddAsync(host.UserId, me, "live_invite", id.ToString(), "canlı dəvətini qəbul etdi");
        await _hub.Clients.User(host.UserId.ToString()).SendAsync("liveInviteAccepted", new
        {
            roomId = id.ToString(),
            userId = me.ToString(),
            username = guest?.UserName ?? ""
        });
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveInviteAccepted", new
        {
            roomId = id.ToString(),
            userId = me.ToString(),
            username = guest?.UserName ?? ""
        });
        return Ok(new { id = room.Id.ToString(), joined = true });
    }

    [HttpPost("/api/lives/{id:guid}/reject-invite")]
    public async Task<IActionResult> RejectInvite(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!LivePresence.HasInvite(id, me)) return Ok(new { rejected = true });
        LivePresence.ClearInvite(id, me);
        var host = room.Seats.OrderBy(s => s.SortOrder).FirstOrDefault();
        var guest = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        if (host != null)
        {
            await _notes.AddAsync(host.UserId, me, "live_invite", id.ToString(), "canlı dəvətini rədd etdi");
            var payload = new
            {
                roomId = id.ToString(),
                userId = me.ToString(),
                username = guest?.UserName ?? ""
            };
            await _hub.Clients.User(host.UserId.ToString()).SendAsync("liveInviteRejected", payload);
            await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveInviteRejected", payload);
        }
        return Ok(new { rejected = true });
    }

    [HttpPost("/api/lives/{id:guid}/like")]
    public async Task<IActionResult> Like(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await _db.LiveRooms.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (room.Seats.Any(s => s.UserId == me && s.SortOrder == 0))
            return StatusCode(403, new { message = "Öz yayınını bəyənə bilməzsən" });
        if (!LivePresence.TryLike(id, me))
            return Ok(new { likeCount = room.LikeCount, throttled = true });
        room.LikeCount += 1;
        room.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveLiked", new
        {
            roomId = id.ToString(),
            likeCount = room.LikeCount,
            userId = me.ToString(),
            username = user?.UserName ?? "",
            already = false
        });
        if (LivePresence.ShouldAnnounceLike(id, me))
        {
            await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveActivity", new
            {
                roomId = id.ToString(),
                kind = "like",
                userId = me.ToString(),
                username = user?.UserName ?? "",
                text = $"@{user?.UserName} canlı yayımı bəyənir",
                at = DateTime.UtcNow
            });
        }
        return Ok(new { likeCount = room.LikeCount, already = false });
    }

    [HttpPost("/api/lives/{id:guid}/report")]
    public async Task<IActionResult> Report(Guid id, [FromBody] LiveReportBody? body)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (IsHost(room, me)) return BadRequest(new { message = "Öz yayınını şikayət edə bilməzsən" });
        var reason = (body?.Reason ?? "").Trim();
        if (reason.Length == 0) reason = "Uyğunsuz canlı yayım";
        if (reason.Length > 200) reason = reason[..200];
        var key = id.ToString();
        if (await _db.Reports.AnyAsync(r => r.FromId == me && r.Status == "open" && r.TargetType == "live" && r.TargetId == key))
            return BadRequest(new { message = "Bu şikayət artıq növbədədir" });
        _db.Reports.Add(new Report
        {
            FromId = me,
            TargetType = "live",
            TargetId = key,
            Reason = reason
        });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Şikayət göndərildi" });
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
        if (host || room.Seats.Count == 0)
        {
            room.EndedAt = DateTime.UtcNow;
            LivePresence.ClearRoom(id);
            await _db.SaveChangesAsync();
            await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveEnded", new { roomId = id.ToString() });
            return Ok(new { left = true, ended = true });
        }
        await _db.SaveChangesAsync();
        return Ok(new { left = true, ended = false });
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
        LivePresence.ClearRoom(id);
        await _db.SaveChangesAsync();
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveEnded", new { roomId = id.ToString() });
        return Ok(new { ended = true });
    }

    [HttpPost("/api/lives/{id:guid}/request-seat")]
    public async Task<IActionResult> RequestSeat(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (LivePresence.IsKicked(id, me)) return StatusCode(403, new { message = "Bu yayımdan çıxarıldın" });
        var maxSeats = ClampSeats(room.MaxSeats);
        if (maxSeats <= 1) return BadRequest(new { message = "Bu yayımda qonaq yoxdur" });
        if (room.Seats.Any(s => s.UserId == me)) return Ok(new { requested = false, already = true });
        if (room.Seats.Count >= maxSeats) return StatusCode(403, new { message = "Yer doludur" });
        LivePresence.RequestSeat(id, me);
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        var host = room.Seats.OrderBy(s => s.SortOrder).FirstOrDefault();
        if (host != null)
        {
            await _hub.Clients.User(host.UserId.ToString()).SendAsync("liveSeatRequest", new
            {
                roomId = id.ToString(),
                userId = me.ToString(),
                username = user?.UserName ?? "",
                fullName = user?.FullName ?? "",
                avatar = user?.AvatarUrl ?? ""
            });
            await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveSeatRequest", new
            {
                roomId = id.ToString(),
                userId = me.ToString(),
                username = user?.UserName ?? "",
                fullName = user?.FullName ?? "",
                avatar = user?.AvatarUrl ?? ""
            });
        }
        return Ok(new { requested = true });
    }

    [HttpPost("/api/lives/{id:guid}/approve-request")]
    public async Task<IActionResult> ApproveRequest(Guid id, [FromBody] LiveUserBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.UserId, out var target)) return BadRequest(new { message = "İstifadəçi seç" });
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı təsdiq edə bilər" });
        if (!LivePresence.HasRequest(id, target) && !LivePresence.HasInvite(id, target))
            return BadRequest(new { message = "Sorğu yoxdur" });
        var maxSeats = ClampSeats(room.MaxSeats);
        if (room.Seats.Any(s => s.UserId == target))
        {
            LivePresence.ClearRequest(id, target);
            return Ok(new { approved = true, already = true });
        }
        if (room.Seats.Count >= maxSeats) return StatusCode(403, new { message = "Yer doludur" });
        LivePresence.Invite(id, target);
        LivePresence.ClearRequest(id, target);
        var host = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        var invitePayload = new
        {
            roomId = id.ToString(),
            title = room.Title,
            fromUserId = me.ToString(),
            fromUsername = host?.UserName ?? "",
            fromFullName = host?.FullName ?? "",
            targetUserId = target.ToString(),
            maxSeats
        };
        await _hub.Clients.User(target.ToString()).SendAsync("liveInvite", invitePayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveInvite", invitePayload);
        await _notes.AddAsync(target, me, "live_invite", id.ToString(), "səni canlı yayına dəvət etdi");
        return Ok(new { approved = true });
    }

    [HttpPost("/api/lives/{id:guid}/reject-request")]
    public async Task<IActionResult> RejectRequest(Guid id, [FromBody] LiveUserBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.UserId, out var target)) return BadRequest(new { message = "İstifadəçi seç" });
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı rədd edə bilər" });
        LivePresence.ClearRequest(id, target);
        await _hub.Clients.User(target.ToString()).SendAsync("liveSeatRejected", new { roomId = id.ToString() });
        return Ok(new { rejected = true });
    }

    [HttpPost("/api/lives/{id:guid}/mute")]
    public async Task<IActionResult> Mute(Guid id, [FromBody] LiveMuteBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.UserId, out var target)) return BadRequest(new { message = "İstifadəçi seç" });
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı susdura bilər" });
        if (target == me) return BadRequest(new { message = "Özünü susdura bilməzsən" });
        LivePresence.Mute(id, target, body.Minutes);
        var targetUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == target);
        var mutePayload = new { roomId = id.ToString(), userId = target.ToString(), minutes = body.Minutes };
        await _hub.Clients.User(target.ToString()).SendAsync("liveMuted", mutePayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveMuted", mutePayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveActivity", new
        {
            roomId = id.ToString(),
            kind = "mute",
            userId = target.ToString(),
            username = targetUser?.UserName ?? "",
            text = $"@{targetUser?.UserName} susduruldu",
            at = DateTime.UtcNow
        });
        await BroadcastViewers(id);
        return Ok(new { muted = true });
    }

    [HttpPost("/api/lives/{id:guid}/unmute")]
    public async Task<IActionResult> Unmute(Guid id, [FromBody] LiveUserBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.UserId, out var target)) return BadRequest(new { message = "İstifadəçi seç" });
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı aça bilər" });
        LivePresence.Unmute(id, target);
        var unmutePayload = new { roomId = id.ToString(), userId = target.ToString() };
        await _hub.Clients.User(target.ToString()).SendAsync("liveUnmuted", unmutePayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveUnmuted", unmutePayload);
        await BroadcastViewers(id);
        return Ok(new { muted = false });
    }

    [HttpPost("/api/lives/{id:guid}/kick")]
    public async Task<IActionResult> Kick(Guid id, [FromBody] LiveUserBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.UserId, out var target)) return BadRequest(new { message = "İstifadəçi seç" });
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı çıxara bilər" });
        if (target == me) return BadRequest(new { message = "Özünü çıxara bilməzsən" });
        await RemoveSeatIfAny(room, target);
        LivePresence.Kick(id, target);
        await _db.SaveChangesAsync();
        var kickPayload = new { roomId = id.ToString(), userId = target.ToString(), reason = "kick" };
        await _hub.Clients.User(target.ToString()).SendAsync("liveKicked", kickPayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveKicked", kickPayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("livePeerForceLeft", new { roomId = id.ToString(), userId = target.ToString() });
        await BroadcastViewers(id);
        return Ok(new { kicked = true });
    }

    [HttpPost("/api/lives/{id:guid}/remove-guest")]
    public async Task<IActionResult> RemoveGuest(Guid id, [FromBody] LiveUserBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.UserId, out var target)) return BadRequest(new { message = "İstifadəçi seç" });
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı qonağı çıxara bilər" });
        var seat = room.Seats.FirstOrDefault(s => s.UserId == target && s.SortOrder != 0);
        if (seat == null) return NotFound(new { message = "Qonaq tapılmadı" });
        room.Seats.Remove(seat);
        _db.LiveSeats.Remove(seat);
        await _db.SaveChangesAsync();
        await _hub.Clients.User(target.ToString()).SendAsync("liveGuestRemoved", new { roomId = id.ToString() });
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("livePeerForceLeft", new { roomId = id.ToString(), userId = target.ToString() });
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveActivity", new
        {
            roomId = id.ToString(),
            kind = "seat",
            userId = target.ToString(),
            username = "",
            text = "Qonaq kameradan çıxarıldı",
            at = DateTime.UtcNow
        });
        return Ok(new { removed = true });
    }

    [HttpPost("/api/lives/{id:guid}/block-user")]
    public async Task<IActionResult> BlockUser(Guid id, [FromBody] LiveUserBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.UserId, out var target)) return BadRequest(new { message = "İstifadəçi seç" });
        var room = await OpenRoom(id);
        if (room == null) return NotFound(new { message = "Canlı yayım bitib" });
        if (!IsHost(room, me)) return StatusCode(403, new { message = "Yalnız aparıcı bloklaya bilər" });
        if (target == me) return BadRequest(new { message = "Özünü bloklaya bilməzsən" });

        var exists = await _db.Blocks.FirstOrDefaultAsync(b => b.BlockerId == me && b.BlockedId == target);
        if (exists == null)
        {
            _db.Blocks.Add(new Block { BlockerId = me, BlockedId = target });
            var follows = _db.Follows.Where(f =>
                (f.FollowerId == me && f.FollowingId == target) || (f.FollowerId == target && f.FollowingId == me));
            _db.Follows.RemoveRange(follows);
        }
        await RemoveSeatIfAny(room, target);
        LivePresence.Kick(id, target);
        await _db.SaveChangesAsync();
        var blockPayload = new { roomId = id.ToString(), userId = target.ToString(), reason = "block" };
        await _hub.Clients.User(target.ToString()).SendAsync("liveKicked", blockPayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveKicked", blockPayload);
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("livePeerForceLeft", new { roomId = id.ToString(), userId = target.ToString() });
        await BroadcastViewers(id);
        return Ok(new { blocked = true });
    }

    private async Task RemoveSeatIfAny(Pulse.Domain.Entities.LiveRoom room, Guid userId)
    {
        var seat = room.Seats.FirstOrDefault(s => s.UserId == userId && s.SortOrder != 0);
        if (seat == null) return;
        room.Seats.Remove(seat);
        _db.LiveSeats.Remove(seat);
        await Task.CompletedTask;
    }

    private async Task BroadcastViewers(Guid id)
    {
        var hostId = await _db.LiveSeats.AsNoTracking()
            .Where(s => s.RoomId == id && s.SortOrder == 0)
            .Select(s => (Guid?)s.UserId)
            .FirstOrDefaultAsync();
        await _hub.Clients.Group(LiveHub.GroupName(id)).SendAsync("liveViewers", new
        {
            roomId = id.ToString(),
            viewers = LivePresence.ViewerList(id, hostId),
            count = LivePresence.ViewerCount(id, hostId)
        });
    }

    private static bool IsHost(Pulse.Domain.Entities.LiveRoom room, Guid me) =>
        room.Seats.Any(s => s.UserId == me && s.SortOrder == 0);

    private Task<Pulse.Domain.Entities.LiveRoom?> OpenRoom(Guid id)
    {
        var since = DateTime.UtcNow.AddHours(-4);
        return _db.LiveRooms.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null && r.CreatedAt >= since);
    }

    /// <summary>1 = tək (TikTok solo), 2/4 = qonaq limiti.</summary>
    private static int ClampSeats(int value) => value switch
    {
        1 => 1,
        2 => 2,
        _ => 4
    };
}

public class LiveStartBody
{
    public string? Title { get; set; }
    public int MaxSeats { get; set; } = 4;
}

public class LiveUserBody
{
    public string UserId { get; set; } = "";
}

public class LiveMuteBody
{
    public string UserId { get; set; } = "";
    public int Minutes { get; set; }
}

public class LiveReportBody
{
    public string? Reason { get; set; }
}
