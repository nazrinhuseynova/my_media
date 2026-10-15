using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Pulse.Infrastructure.Persistence;

namespace Pulse.Infrastructure.Realtime;

[Authorize]
public class ChatHub : Hub
{
    private readonly AppDbContext _db;
    private readonly PresenceTracker _presence;

    public ChatHub(AppDbContext db, PresenceTracker presence)
    {
        _db = db;
        _presence = presence;
    }

    private Guid GetUserId()
    {
        var raw = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? Context.User?.FindFirstValue("sub")
            ?? Context.User?.FindFirstValue("nameid");
        return Guid.Parse(raw!);
    }

    public override async Task OnConnectedAsync()
    {
        var id = GetUserId();
        _presence.Connected(id, Context.ConnectionId);
        var user = await _db.Users.FindAsync(id);
        if (user != null && !user.IsOnline)
        {
            user.IsOnline = true;
            await _db.SaveChangesAsync();
        }

        if (user?.ShowActivityStatus != "nobody")
        {
            await Clients.Others.SendAsync("presence", new { userId = id.ToString(), online = true });
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var id = GetUserId();
        var wentOffline = _presence.Disconnected(id, Context.ConnectionId);
        if (wentOffline)
        {
            var user = await _db.Users.FindAsync(id);
            if (user != null)
            {
                user.IsOnline = false;
                user.LastSeenAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
                if (user.ShowActivityStatus != "nobody")
                    await Clients.Others.SendAsync("presence", new { userId = id.ToString(), online = false, lastSeenAt = user.LastSeenAt });
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task Heartbeat()
    {
        var id = GetUserId();
        _presence.Heartbeat(id);
        if (!_presence.IsOnline(id))
        {
            _presence.Connected(id, Context.ConnectionId);
            var user = await _db.Users.FindAsync(id);
            if (user != null)
            {
                user.IsOnline = true;
                await _db.SaveChangesAsync();
            }
        }
        await Task.CompletedTask;
    }

    public async Task JoinConversation(string conversationId)
    {
        if (!await InConversation(conversationId)) return;
        await Groups.AddToGroupAsync(Context.ConnectionId, conversationId);
    }

    public async Task Typing(string conversationId)
    {
        if (!await InConversation(conversationId)) return;
        await Clients.OthersInGroup(conversationId).SendAsync("typing", new
        {
            conversationId,
            userId = GetUserId()
        });
    }

    private async Task<bool> InConversation(string conversationId)
    {
        if (!Guid.TryParse(conversationId, out var id)) return false;
        var me = GetUserId();
        var conv = await _db.Conversations.AsNoTracking().Include(c => c.Members).FirstOrDefaultAsync(c => c.Id == id);
        if (conv == null || conv.Members.All(m => m.UserId != me)) return false;
        if (conv.IsGroup) return true;
        var others = conv.Members.Select(m => m.UserId).Where(x => x != me).ToList();
        var blocked = await _db.Blocks.AnyAsync(b =>
            (b.BlockerId == me && others.Contains(b.BlockedId)) || (b.BlockedId == me && others.Contains(b.BlockerId)));
        return !blocked;
    }
}
