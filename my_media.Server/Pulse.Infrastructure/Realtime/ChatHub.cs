using System.Collections.Concurrent;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Pulse.Infrastructure.Persistence;

namespace Pulse.Infrastructure.Realtime;

[Authorize]
public class ChatHub : Hub
{
    private static readonly ConcurrentDictionary<Guid, int> Connections = new();
    private readonly AppDbContext _db;

    public ChatHub(AppDbContext db)
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

    public override async Task OnConnectedAsync()
    {
        var id = GetUserId();
        Connections.AddOrUpdate(id, 1, (_, count) => count + 1);
        var user = await _db.Users.FindAsync(id);
        if (user != null)
        {
            user.IsOnline = true;
            await _db.SaveChangesAsync();
        }

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var id = GetUserId();
        var left = Connections.AddOrUpdate(id, 0, (_, count) => Math.Max(0, count - 1));
        if (left == 0)
        {
            var user = await _db.Users.FindAsync(id);
            if (user != null)
            {
                user.IsOnline = false;
                user.LastSeenAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
        }

        await base.OnDisconnectedAsync(exception);
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
        return await _db.ConversationMembers.AnyAsync(m => m.ConversationId == id && m.UserId == me);
    }
}
