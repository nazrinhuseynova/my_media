using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Infrastructure.Persistence;

namespace Pulse.Infrastructure.Realtime;

[Authorize]
public class LiveHub : Hub
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notes;

    public LiveHub(AppDbContext db, INotificationService notes)
    {
        _db = db;
        _notes = notes;
    }

    private Guid GetUserId()
    {
        var raw = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? Context.User?.FindFirstValue("sub")
            ?? Context.User?.FindFirstValue("nameid");
        return Guid.Parse(raw!);
    }

    public async Task JoinLive(string roomId)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        var me = GetUserId();
        var since = DateTime.UtcNow.AddHours(-4);
        var room = await _db.LiveRooms.AsNoTracking().Include(r => r.Seats)
            .FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null && r.CreatedAt >= since);
        if (room == null) return;

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        if (user == null || !user.IsActive || user.IsBanned) return;
        if (LivePresence.IsKicked(id, me))
        {
            await Clients.Caller.SendAsync("liveKicked", new { roomId, userId = me.ToString(), reason = "kick" });
            return;
        }
        var hostId = room.Seats.OrderBy(s => s.SortOrder).Select(s => s.UserId).FirstOrDefault();
        if (hostId != Guid.Empty && await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == hostId) || (b.BlockerId == hostId && b.BlockedId == me)))
        {
            await Clients.Caller.SendAsync("liveKicked", new { roomId, userId = me.ToString(), reason = "block" });
            return;
        }

        var onSeat = room.Seats.Any(s => s.UserId == me);
        var isHostUser = hostId != Guid.Empty && hostId == me;
        LivePresence.UpsertViewer(id, me, Context.ConnectionId, user.UserName ?? "", user.FullName ?? "", user.AvatarUrl ?? "");
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(id));

        var profile = new
        {
            roomId,
            userId = me.ToString(),
            username = user.UserName ?? "",
            fullName = user.FullName ?? "",
            avatar = user.AvatarUrl ?? "",
            connectionId = Context.ConnectionId,
            onSeat
        };

        await Clients.OthersInGroup(GroupName(id)).SendAsync("liveViewerJoined", profile);
        // Host öz yayımına «qoşuldu» yazmasın
        if (!isHostUser)
        {
            await Clients.Group(GroupName(id)).SendAsync("liveActivity", new
            {
                roomId,
                kind = "join",
                userId = me.ToString(),
                username = user.UserName ?? "",
                text = $"@{user.UserName} qoşuldu",
                at = DateTime.UtcNow
            });
        }
        await Clients.Group(GroupName(id)).SendAsync("liveViewers", new
        {
            roomId,
            viewers = LivePresence.ViewerList(id, hostId == Guid.Empty ? null : hostId),
            count = LivePresence.ViewerCount(id, hostId == Guid.Empty ? null : hostId)
        });

        // Joiner (host/guest) mövcud peerlərə offer göndərsin — izləyici əvvəl giribsə video qalmasın.
        await Clients.Caller.SendAsync("liveExistingPeers", new
        {
            roomId,
            peers = LivePresence.OtherPeers(id, Context.ConnectionId)
        });
        // Seat holders push their media to everyone (including pure viewers).
        await Clients.OthersInGroup(GroupName(id)).SendAsync("livePeerJoined", profile);
    }

    public async Task LeaveLive(string roomId)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        var me = GetUserId();
        var leftFully = LivePresence.RemoveConnection(id, me, Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(id));
        await Clients.OthersInGroup(GroupName(id)).SendAsync("livePeerLeft", new
        {
            roomId,
            userId = me.ToString(),
            connectionId = Context.ConnectionId
        });
        if (leftFully)
        {
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
            await Clients.Group(GroupName(id)).SendAsync("liveViewerLeft", new
            {
                roomId,
                userId = me.ToString(),
                username = user?.UserName ?? ""
            });
            var hostId = await _db.LiveSeats.AsNoTracking()
                .Where(s => s.RoomId == id && s.SortOrder == 0)
                .Select(s => (Guid?)s.UserId)
                .FirstOrDefaultAsync();
            await Clients.Group(GroupName(id)).SendAsync("liveViewers", new
            {
                roomId,
                viewers = LivePresence.ViewerList(id, hostId),
                count = LivePresence.ViewerCount(id, hostId)
            });
        }
    }

    public async Task PromoteLive(string roomId)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        var me = GetUserId();
        var since = DateTime.UtcNow.AddHours(-4);
        var room = await _db.LiveRooms.AsNoTracking().Include(r => r.Seats)
            .FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null && r.CreatedAt >= since);
        if (room == null || !room.Seats.Any(s => s.UserId == me)) return;
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        var profile = new
        {
            roomId,
            userId = me.ToString(),
            username = user?.UserName ?? "",
            fullName = user?.FullName ?? "",
            avatar = user?.AvatarUrl ?? "",
            connectionId = Context.ConnectionId,
            onSeat = true
        };
        await Clients.OthersInGroup(GroupName(id)).SendAsync("livePeerPromoted", profile);
        await Clients.Group(GroupName(id)).SendAsync("liveActivity", new
        {
            roomId,
            kind = "seat",
            userId = me.ToString(),
            username = user?.UserName ?? "",
            text = $"@{user?.UserName} kameraya qoşuldu",
            at = DateTime.UtcNow
        });
    }

    public async Task Invite(string roomId, string targetUserId)
    {
        if (!Guid.TryParse(roomId, out var id) || !Guid.TryParse(targetUserId, out var target)) return;
        var me = GetUserId();
        var since = DateTime.UtcNow.AddHours(-4);
        var room = await _db.LiveRooms.AsNoTracking().Include(r => r.Seats)
            .FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null && r.CreatedAt >= since);
        if (room == null) return;
        if (!room.Seats.Any(s => s.UserId == me && s.SortOrder == 0)) return;
        if (room.Seats.Any(s => s.UserId == target)) return;
        var maxSeats = room.MaxSeats <= 1 ? 1 : room.MaxSeats == 2 ? 2 : 4;
        if (room.Seats.Count >= maxSeats)
        {
            await Clients.Caller.SendAsync("liveInviteFailed", new
            {
                roomId,
                message = maxSeats <= 1 ? "Bu yayım tək aparıcı üçündür" : $"Yer doludur ({maxSeats})"
            });
            return;
        }

        var mutual = await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == target)
            && await _db.Follows.AnyAsync(f => f.FollowerId == target && f.FollowingId == me);
        if (!mutual)
        {
            await Clients.Caller.SendAsync("liveInviteFailed", new
            {
                roomId,
                message = "Yalnız qarşılıqlı izlədiyin insanları dəvət edə bilərsən"
            });
            return;
        }

        LivePresence.Invite(id, target);
        var host = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        var invitePayload = new
        {
            roomId,
            title = room.Title,
            fromUserId = me.ToString(),
            fromUsername = host?.UserName ?? "",
            fromFullName = host?.FullName ?? "",
            targetUserId = target.ToString(),
            maxSeats = room.MaxSeats
        };
        await Clients.User(target.ToString()).SendAsync("liveInvite", invitePayload);
        await Clients.Group(GroupName(id)).SendAsync("liveInvite", invitePayload);
        await _notes.AddAsync(target, me, "live_invite", id.ToString(), "səni canlı yayına dəvət etdi");
        await Clients.Caller.SendAsync("liveActivity", new
        {
            roomId,
            kind = "invite",
            userId = target.ToString(),
            username = "",
            text = "Dəvət göndərildi",
            at = DateTime.UtcNow
        });
    }

    public async Task Like(string roomId)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        var me = GetUserId();
        if (!LivePresence.IsInRoom(id, me) || LivePresence.IsKicked(id, me)) return;
        var room = await _db.LiveRooms.Include(r => r.Seats).FirstOrDefaultAsync(r => r.Id == id && r.EndedAt == null);
        if (room == null) return;
        if (room.Seats.Any(s => s.UserId == me && s.SortOrder == 0))
        {
            await Clients.Caller.SendAsync("liveLikeDenied", new { roomId, message = "Öz yayınını bəyənə bilməzsən" });
            return;
        }
        if (!LivePresence.TryLike(id, me)) return;
        room.LikeCount += 1;
        room.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        await Clients.Group(GroupName(id)).SendAsync("liveLiked", new
        {
            roomId,
            likeCount = room.LikeCount,
            userId = me.ToString(),
            username = user?.UserName ?? "",
            already = false
        });
        if (LivePresence.ShouldAnnounceLike(id, me))
        {
            await Clients.Group(GroupName(id)).SendAsync("liveActivity", new
            {
                roomId,
                kind = "like",
                userId = me.ToString(),
                username = user?.UserName ?? "",
                text = $"@{user?.UserName} canlı yayımı bəyənir",
                at = DateTime.UtcNow
            });
        }
    }

    public async Task Share(string roomId)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        var me = GetUserId();
        if (!LivePresence.IsInRoom(id, me) || LivePresence.IsKicked(id, me)) return;
        var since = DateTime.UtcNow.AddHours(-4);
        var alive = await _db.LiveRooms.AsNoTracking()
            .AnyAsync(r => r.Id == id && r.EndedAt == null && r.CreatedAt >= since);
        if (!alive) return;
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        await Clients.Group(GroupName(id)).SendAsync("liveActivity", new
        {
            roomId,
            kind = "share",
            userId = me.ToString(),
            username = user?.UserName ?? "",
            text = $"@{user?.UserName} paylaşdı",
            at = DateTime.UtcNow
        });
    }

    public async Task Signal(string roomId, string targetConnectionId, string kind, string payload)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        if (string.IsNullOrWhiteSpace(targetConnectionId) || string.IsNullOrWhiteSpace(kind)) return;
        var me = GetUserId();
        if (!LivePresence.IsInRoom(id, me) || LivePresence.IsKicked(id, me)) return;
        await Clients.Client(targetConnectionId).SendAsync("liveSignal", new
        {
            roomId,
            fromConnectionId = Context.ConnectionId,
            fromUserId = me.ToString(),
            kind,
            payload
        });
    }

    public async Task BroadcastSignal(string roomId, string kind, string payload)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        var me = GetUserId();
        if (!LivePresence.IsInRoom(id, me) || LivePresence.IsKicked(id, me)) return;
        await Clients.OthersInGroup(GroupName(id)).SendAsync("liveSignal", new
        {
            roomId,
            fromConnectionId = Context.ConnectionId,
            fromUserId = me.ToString(),
            kind,
            payload
        });
    }

    public async Task Chat(string roomId, string text)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        var body = (text ?? "").Trim();
        if (body.Length == 0) return;
        if (body.Length > 80) body = body[..80];
        var me = GetUserId();
        if (!LivePresence.IsInRoom(id, me) || LivePresence.IsKicked(id, me))
        {
            if (LivePresence.IsKicked(id, me))
                await Clients.Caller.SendAsync("liveKicked", new { roomId, reason = "kick" });
            return;
        }
        if (LivePresence.IsMuted(id, me))
        {
            await Clients.Caller.SendAsync("liveMuted", new { roomId, minutes = LivePresence.MuteMinutesLeft(id, me) });
            return;
        }
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == me);
        await Clients.Group(GroupName(id)).SendAsync("liveChat", new
        {
            roomId,
            userId = me.ToString(),
            username = user?.UserName ?? "",
            fullName = user?.FullName ?? "",
            text = body,
            at = DateTime.UtcNow
        });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Guid me;
        try { me = GetUserId(); }
        catch { await base.OnDisconnectedAsync(exception); return; }

        foreach (var roomId in LivePresence.RoomIds())
        {
            var map = LivePresence.RoomViewers(roomId);
            if (!map.TryGetValue(me, out var row)) continue;
            bool has;
            lock (row.Connections) has = row.Connections.Contains(Context.ConnectionId);
            if (!has) continue;

            var leftFully = LivePresence.RemoveConnection(roomId, me, Context.ConnectionId);
            await Clients.OthersInGroup(GroupName(roomId)).SendAsync("livePeerLeft", new
            {
                roomId = roomId.ToString(),
                userId = me.ToString(),
                connectionId = Context.ConnectionId
            });
            if (leftFully)
            {
                var hostId = await _db.LiveSeats.AsNoTracking()
                    .Where(s => s.RoomId == roomId && s.SortOrder == 0)
                    .Select(s => (Guid?)s.UserId)
                    .FirstOrDefaultAsync();
                await Clients.Group(GroupName(roomId)).SendAsync("liveViewers", new
                {
                    roomId = roomId.ToString(),
                    viewers = LivePresence.ViewerList(roomId, hostId),
                    count = LivePresence.ViewerCount(roomId, hostId)
                });
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    public static string GroupName(Guid id) => $"live:{id}";
}
