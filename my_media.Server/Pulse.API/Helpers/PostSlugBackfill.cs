using Microsoft.EntityFrameworkCore;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Helpers;

public static class PostSlugBackfill
{
    public static async Task Run(AppDbContext db)
    {
        var missing = await db.Posts.Where(p => p.Slug == "").ToListAsync();
        if (missing.Count == 0) return;
        var used = (await db.Posts.Where(p => p.Slug != "").Select(p => p.Slug).ToListAsync())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var post in missing)
            post.Slug = SlugText.Unique(string.IsNullOrWhiteSpace(post.Caption) ? post.PollQuestion : post.Caption, post.Id, used);
        await db.SaveChangesAsync();
    }
}
