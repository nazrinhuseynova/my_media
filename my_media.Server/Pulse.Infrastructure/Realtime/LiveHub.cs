using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Pulse.Infrastructure.Persistence;

namespace Pulse.Infrastructure.Realtime;

[Authorize]
public class LiveHub : Hub
{
    public const int MaxSeats = 4;
    private readonly AppDbContext _db;

    public LiveHub(AppDbContext db)
    {
        _db = db;
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
        if (!room.Seats.Any(s => s.UserId == me) && room.Seats.Count >= MaxSeats) return;
        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(id));
        await Clients.OthersInGroup(GroupName(id)).SendAsync("livePeerJoined", new
        {
            roomId,
            userId = me.ToString(),
            connectionId = Context.ConnectionId
        });
    }

    public async Task LeaveLive(string roomId)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupName(id));
        await Clients.OthersInGroup(GroupName(id)).SendAsync("livePeerLeft", new
        {
            roomId,
            userId = GetUserId().ToString(),
            connectionId = Context.ConnectionId
        });
    }

    public async Task Signal(string roomId, string targetConnectionId, string kind, string payload)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        if (string.IsNullOrWhiteSpace(targetConnectionId) || string.IsNullOrWhiteSpace(kind)) return;
        await Clients.Client(targetConnectionId).SendAsync("liveSignal", new
        {
            roomId,
            fromConnectionId = Context.ConnectionId,
            fromUserId = GetUserId().ToString(),
            kind,
            payload
        });
    }

    public async Task BroadcastSignal(string roomId, string kind, string payload)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        await Clients.OthersInGroup(GroupName(id)).SendAsync("liveSignal", new
        {
            roomId,
            fromConnectionId = Context.ConnectionId,
            fromUserId = GetUserId().ToString(),
            kind,
            payload
        });
    }

    public async Task Chat(string roomId, string text)
    {
        if (!Guid.TryParse(roomId, out var id)) return;
        var body = (text ?? "").Trim();
        if (body.Length == 0) return;
        if (body.Length > 280) body = body[..280];
        await Clients.Group(GroupName(id)).SendAsync("liveChat", new
        {
            roomId,
            userId = GetUserId().ToString(),
            text = body,
            at = DateTime.UtcNow
        });
    }

    private static string GroupName(Guid id) => $"live:{id}";
}
