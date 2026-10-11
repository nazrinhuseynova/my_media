using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Helpers;

public static class DtoMapper
{
    public static object MapUser(AppUser u, string role = "user")
    {
        return new
        {
            id = u.Id.ToString(),
            email = u.Email,
            phone = u.PhoneNumber,
            username = u.UserName,
            fullName = u.FullName,
            bio = u.Bio ?? "",
            website = u.Website ?? "",
            avatar = u.AvatarUrl,
            avatarExtension = u.AvatarExtension,
            isPrivate = u.IsPrivate,
            isActive = u.IsActive,
            isBanned = u.IsBanned,
            role,
            provider = u.Provider,
            isOnline = u.IsOnline,
            lastSeenAt = u.LastSeenAt,
            createdAt = u.CreatedAt
        };
    }

    public static async Task<string> GetRole(UserManager<AppUser> userManager, AppUser user)
    {
        var roles = await userManager.GetRolesAsync(user);
        return roles.Contains("Admin") ? "admin" : "user";
    }

    public static object MapPost(Post p, Guid? viewerId, AppDbContext db, HashSet<Guid>? savedIds = null)
    {
        var saved = savedIds != null
            ? savedIds.Contains(p.Id)
            : viewerId.HasValue && db.SavedPosts.Any(x => x.PostId == p.Id && x.UserId == viewerId);
        var reactions = SummarizeReactions(p.Likes, viewerId);
        return new
        {
            id = p.Id.ToString(),
            userId = p.UserId.ToString(),
            media = p.Media.OrderBy(m => m.SortOrder).Select(m => new { type = m.Type, url = m.Url, extension = m.Extension, filter = m.Filter }).ToList(),
            caption = p.Caption,
            hashtags = string.IsNullOrWhiteSpace(p.Hashtags) ? new List<string>() : p.Hashtags.Split(',').ToList(),
            location = p.Location ?? "",
            mentions = string.IsNullOrWhiteSpace(p.Mentions) ? new List<string>() : p.Mentions.Split(',').ToList(),
            likes = p.Likes.Select(x => x.UserId.ToString()).ToList(),
            likeCount = reactions.ReactionCount,
            commentCount = p.Comments.Count,
            liked = reactions.Liked,
            myReaction = reactions.MyReaction,
            reactionCount = reactions.ReactionCount,
            reactions = reactions.Reactions,
            saved,
            createdAt = p.CreatedAt,
            scheduledAt = ToUtc(p.ScheduledAt),
            isPinned = p.IsPinned,
            isArchived = p.IsArchived,
            isDraft = p.IsDraft,
            tags = (p.Tags ?? new List<PostTag>()).Where(t => t.User != null).Select(t => new
            {
                id = t.UserId.ToString(),
                username = t.User.UserName,
                fullName = t.User.FullName,
                avatar = t.User.AvatarUrl
            }).ToList(),
            poll = MapPoll(p, viewerId),
            repost = p.RepostOf == null ? null : new
            {
                id = p.RepostOf.Id.ToString(),
                caption = p.RepostOf.Caption,
                user = p.RepostOf.User == null ? null : MapUser(p.RepostOf.User),
                media = p.RepostOf.Media.OrderBy(m => m.SortOrder).Select(m => new { type = m.Type, url = m.Url }).ToList()
            },
            user = p.User == null ? null : MapUser(p.User)
        };
    }

    public static object? MapPoll(Post p, Guid? viewerId)
    {
        if (string.IsNullOrWhiteSpace(p.PollQuestion)) return null;
        var options = (p.PollOptions ?? new List<PollOption>()).OrderBy(o => o.SortOrder).ToList();
        var mine = viewerId.HasValue
            ? options.FirstOrDefault(o => o.Votes != null && o.Votes.Any(v => v.UserId == viewerId))?.Id
            : null;
        return new
        {
            question = p.PollQuestion,
            votedOptionId = mine?.ToString(),
            options = options.Select(o => new
            {
                id = o.Id.ToString(),
                text = o.Text,
                count = o.Votes?.Count ?? 0
            })
        };
    }

    public static ReactionSummary SummarizeReactions(IEnumerable<PostLike>? likes, Guid? viewerId)
        => SummarizeRows(likes?.Select(x => (x.UserId, x.Reaction, x.User)), viewerId);

    public static ReactionSummary SummarizeReactions(IEnumerable<CommentLike>? likes, Guid? viewerId)
        => SummarizeRows(likes?.Select(x => (x.UserId, x.Reaction, x.User)), viewerId);

    public static ReactionSummary SummarizeReactions(IEnumerable<ReelLike>? likes, Guid? viewerId)
        => SummarizeRows(likes?.Select(x => (x.UserId, x.Reaction, x.User)), viewerId);

    private static ReactionSummary SummarizeRows(IEnumerable<(Guid UserId, string? Reaction, AppUser? User)>? rows, Guid? viewerId)
    {
        var list = rows?.ToList() ?? new List<(Guid UserId, string? Reaction, AppUser? User)>();
        var mine = viewerId.HasValue ? list.FirstOrDefault(x => x.UserId == viewerId) : default;
        var hasMine = viewerId.HasValue && list.Any(x => x.UserId == viewerId);
        var groups = PostReactions.All.Select(type =>
        {
            var people = list.Where(x => PostReactions.Normalize(x.Reaction) == type).Select(x => new ReactionUser
            {
                Id = x.UserId.ToString(),
                Username = x.User?.UserName ?? "",
                FullName = x.User?.FullName ?? "",
                Avatar = x.User?.AvatarUrl ?? ""
            }).ToList();
            return new ReactionGroup { Type = type, Count = people.Count, Users = people };
        }).Where(g => g.Count > 0).ToList();

        return new ReactionSummary
        {
            MyReaction = hasMine ? PostReactions.Normalize(mine.Reaction) : null,
            ReactionCount = list.Count,
            Liked = hasMine,
            LikeCount = list.Count,
            Reactions = groups
        };
    }

    private static DateTime? ToUtc(DateTime? value)
    {
        if (!value.HasValue) return null;
        return DateTime.SpecifyKind(value.Value, DateTimeKind.Utc);
    }

    public static Guid GetUserId(ClaimsPrincipal user)
    {
        var raw = user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub")
            ?? user.FindFirstValue("nameid");
        if (!Guid.TryParse(raw, out var id))
        {
            throw new UnauthorizedAccessException("Token istifadeci id-si yanlisdir");
        }

        return id;
    }
}

public static class PostReactions
{
    public static readonly string[] All = ["like", "celebrate", "support", "love", "insightful", "funny"];

    public static string Normalize(string? value)
    {
        var text = (value ?? "").Trim().ToLowerInvariant();
        return All.Contains(text) ? text : "like";
    }

    public static bool Allowed(string? value)
    {
        var text = (value ?? "").Trim().ToLowerInvariant();
        return All.Contains(text);
    }
}

public class ReactionSummary
{
    public string? MyReaction { get; set; }
    public int ReactionCount { get; set; }
    public bool Liked { get; set; }
    public int LikeCount { get; set; }
    public List<ReactionGroup> Reactions { get; set; } = new();
}

public class ReactionGroup
{
    public string Type { get; set; } = "";
    public int Count { get; set; }
    public List<ReactionUser> Users { get; set; } = new();
}

public class ReactionUser
{
    public string Id { get; set; } = "";
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Avatar { get; set; } = "";
}
