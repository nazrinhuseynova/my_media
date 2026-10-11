using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

namespace Pulse.Infrastructure.Realtime;

public class PulseUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection)
        => connection.User?.FindFirstValue(ClaimTypes.NameIdentifier)
           ?? connection.User?.FindFirstValue("sub")
           ?? connection.User?.FindFirstValue("nameid");
}
