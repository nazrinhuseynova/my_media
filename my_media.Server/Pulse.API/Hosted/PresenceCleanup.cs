using Microsoft.EntityFrameworkCore;
using Pulse.Infrastructure.Persistence;
using Pulse.Infrastructure.Realtime;

namespace Pulse.API.Hosted;

public sealed class PresenceCleanup : IHostedService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly PresenceTracker _presence;

    public PresenceCleanup(IServiceScopeFactory scopes, PresenceTracker presence)
    {
        _scopes = scopes;
        _presence = presence;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        // Sticky IsOnline bayraqlarını sıfırla — yalnız real Socket bağlantısı online sayılır
        await db.Users.Where(u => u.IsOnline).ExecuteUpdateAsync(s => s.SetProperty(u => u.IsOnline, false), cancellationToken);
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
