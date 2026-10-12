using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Hosted;

public class ScheduledPostNotifier : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;

    public ScheduledPostNotifier(IServiceScopeFactory scopes)
    {
        _scopes = scopes;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Tick(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch
            {
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task Tick(CancellationToken cancellationToken)
    {
        using var scope = _scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var notes = scope.ServiceProvider.GetRequiredService<INotificationService>();
        var now = DateTime.UtcNow;
        var due = await db.Posts
            .Where(p => !p.MentionsSent && !p.IsDeleted && !p.IsDraft && !p.IsArchived
                && p.ScheduledAt != null && p.ScheduledAt <= now)
            .ToListAsync(cancellationToken);
        foreach (var post in due)
        {
            await MentionHelper.NotifyAsync(db, notes, post.UserId, post.Caption, post.Id.ToString(), "Seni paylasimda isareledi");
            if (!string.IsNullOrWhiteSpace(post.Mentions))
            {
                var text = string.Join(" ", post.Mentions.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => x.StartsWith('@') ? x : "@" + x));
                await MentionHelper.NotifyAsync(db, notes, post.UserId, text, post.Id.ToString(), "Seni paylasimda isareledi");
            }
            post.MentionsSent = true;
        }
        if (due.Count > 0)
            await db.SaveChangesAsync(cancellationToken);
    }
}
