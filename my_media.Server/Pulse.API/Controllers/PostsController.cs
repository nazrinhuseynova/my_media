using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Application.Files;
using Pulse.Application.Files.Interfaces;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize]
public class PostsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IFileStorageService _files;
    private readonly INotificationService _notes;

    public PostsController(AppDbContext db, IFileStorageService files, INotificationService notes)
    {
        _db = db;
        _files = files;
        _notes = notes;
    }

    private IQueryable<Post> ReadPosts()
        => PostsQuery().AsNoTracking();

    private IQueryable<Post> PostsQuery()
        => _db.Posts.AsSplitQuery().Where(p => !p.IsDeleted)
            .Include(p => p.User)
            .Include(p => p.Media)
            .Include(p => p.Likes).ThenInclude(l => l.User)
            .Include(p => p.Comments)
            .Include(p => p.Tags).ThenInclude(t => t.User)
            .Include(p => p.PollOptions).ThenInclude(o => o.Votes)
            .Include(p => p.RepostOf).ThenInclude(r => r.Media)
            .Include(p => p.RepostOf).ThenInclude(r => r.User);

    private IQueryable<Post> LivePosts()
    {
        var now = DateTime.UtcNow;
        return PostsQuery().Where(p => !p.IsArchived && !p.IsDraft && (p.ScheduledAt == null || p.ScheduledAt <= now));
    }

    private static bool IsLive(Post post)
        => post.ScheduledAt == null || post.ScheduledAt <= DateTime.UtcNow;

    [HttpGet("/api/feed")]
    public async Task<IActionResult> Feed([FromQuery] int page = 1, [FromQuery] int limit = 5)
    {
        if (page < 1) page = 1;
        if (limit < 1) limit = 5;
        if (limit > 20) limit = 20;

        var me = DtoMapper.GetUserId(User);
        var now = DateTime.UtcNow;
        var following = await _db.Follows.AsNoTracking().Where(f => f.FollowerId == me).Select(f => f.FollowingId).ToListAsync();
        following.Add(me);
        var skip = await _db.UserMutes.AsNoTracking().Where(m => m.UserId == me).Select(m => m.MutedId).ToListAsync();
        skip.AddRange(await HiddenUserIds(me));
        var hidden = skip.ToHashSet();
        var authors = following.Where(id => !hidden.Contains(id)).Distinct().ToList();
        var window = page * limit + 1;

        var followedRows = await _db.Posts.AsNoTracking()
            .Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft
                && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && authors.Contains(p.UserId)
                && p.User.IsActive && !p.User.IsBanned)
            .OrderByDescending(p => p.ScheduledAt ?? p.CreatedAt)
            .Select(p => new { p.Id, When = p.ScheduledAt ?? p.CreatedAt })
            .Take(window)
            .ToListAsync();

        var tags = await _db.HashtagFollows.AsNoTracking().Where(h => h.UserId == me).Select(h => h.Tag).ToListAsync();
        var taggedRows = new List<(Guid Id, DateTime When)>();
        foreach (var tag in tags.Select(t => t.Trim().TrimStart('#').ToLowerInvariant()).Where(t => t.Length > 0).Distinct())
        {
            var needle = "," + tag + ",";
            var rows = await _db.Posts.AsNoTracking()
                .Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft
                    && (p.ScheduledAt == null || p.ScheduledAt <= now)
                    && !p.User.IsPrivate && p.User.IsActive && !p.User.IsBanned
                    && p.Hashtags != null && p.Hashtags != ""
                    && !authors.Contains(p.UserId)
                    && !hidden.Contains(p.UserId)
                    && ("," + p.Hashtags.ToLower() + ",").Contains(needle))
                .OrderByDescending(p => p.ScheduledAt ?? p.CreatedAt)
                .Select(p => new { p.Id, When = p.ScheduledAt ?? p.CreatedAt })
                .Take(window)
                .ToListAsync();
            taggedRows.AddRange(rows.Select(p => (p.Id, p.When)));
        }

        var merged = followedRows.Select(p => (p.Id, p.When)).Concat(taggedRows)
            .GroupBy(p => p.Id)
            .Select(g => g.First())
            .OrderByDescending(p => p.When)
            .Skip((page - 1) * limit)
            .Take(limit + 1)
            .ToList();
        var hasMore = merged.Count > limit;
        var pageIds = merged.Take(limit).Select(p => p.Id).ToList();
        var total = await _db.Posts.AsNoTracking()
            .Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft
                && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && authors.Contains(p.UserId)
                && p.User.IsActive && !p.User.IsBanned)
            .CountAsync();
        if (pageIds.Count == 0)
            return Ok(PagedResult<object>.Create(new List<object>(), page, limit, total, false));

        var savedIds = (await _db.SavedPosts.AsNoTracking()
            .Where(s => s.UserId == me && pageIds.Contains(s.PostId))
            .Select(s => s.PostId)
            .ToListAsync()).ToHashSet();
        var items = await LoadFeedCards(pageIds, me, savedIds);
        return Ok(PagedResult<object>.Create(items, page, limit, Math.Max(total, (page - 1) * limit + items.Count), hasMore));
    }

    private async Task<List<object>> LoadFeedCards(List<Guid> pageIds, Guid me, HashSet<Guid> savedIds)
    {
        var posts = await _db.Posts.AsNoTracking()
            .Where(p => pageIds.Contains(p.Id))
            .Select(p => new
            {
                p.Id,
                p.UserId,
                p.Caption,
                p.Hashtags,
                p.Location,
                p.Mentions,
                p.CreatedAt,
                p.ScheduledAt,
                p.IsPinned,
                p.IsArchived,
                p.IsDraft,
                p.PollQuestion,
                p.RepostOfId,
                Username = p.User.UserName,
                FullName = p.User.FullName,
                Avatar = p.User.AvatarUrl,
                IsPrivate = p.User.IsPrivate
            })
            .ToListAsync();

        var media = await _db.PostMedia.AsNoTracking()
            .Where(m => pageIds.Contains(m.PostId))
            .OrderBy(m => m.SortOrder)
            .Select(m => new { m.PostId, m.Type, m.Url, m.Extension, m.Filter })
            .ToListAsync();

        var likes = await _db.PostLikes.AsNoTracking()
            .Where(l => pageIds.Contains(l.PostId))
            .Select(l => new
            {
                l.PostId,
                l.UserId,
                l.Reaction,
                Username = l.User.UserName,
                FullName = l.User.FullName,
                Avatar = l.User.AvatarUrl
            })
            .ToListAsync();

        var commentCounts = await _db.Comments.AsNoTracking()
            .Where(c => pageIds.Contains(c.PostId))
            .GroupBy(c => c.PostId)
            .Select(g => new { PostId = g.Key, Count = g.Count() })
            .ToListAsync();

        var tags = await _db.PostTags.AsNoTracking()
            .Where(t => pageIds.Contains(t.PostId))
            .Select(t => new { t.PostId, t.UserId, Username = t.User.UserName, FullName = t.User.FullName, Avatar = t.User.AvatarUrl })
            .ToListAsync();

        var options = await _db.PollOptions.AsNoTracking()
            .Where(o => pageIds.Contains(o.PostId))
            .OrderBy(o => o.SortOrder)
            .Select(o => new { o.Id, o.PostId, o.Text })
            .ToListAsync();
        var optionIds = options.Select(o => o.Id).ToList();
        var votes = optionIds.Count == 0
            ? new List<(Guid OptionId, Guid UserId)>()
            : (await _db.PollVotes.AsNoTracking()
                .Where(v => optionIds.Contains(v.OptionId))
                .Select(v => new { v.OptionId, v.UserId })
                .ToListAsync())
                .Select(v => (v.OptionId, v.UserId))
                .ToList();

        var repostIds = posts.Where(p => p.RepostOfId.HasValue).Select(p => p.RepostOfId!.Value).Distinct().ToList();
        var reposts = new List<(Guid Id, string Caption, string? Username, List<object> Media)>();
        if (repostIds.Count > 0)
        {
            var rows = await _db.Posts.AsNoTracking()
                .Where(p => repostIds.Contains(p.Id))
                .Select(p => new
                {
                    p.Id,
                    p.Caption,
                    p.UserId,
                    p.IsDeleted,
                    p.IsArchived,
                    p.IsDraft,
                    p.ScheduledAt,
                    IsPrivate = p.User.IsPrivate,
                    Active = p.User.IsActive,
                    Banned = p.User.IsBanned,
                    Username = p.User.UserName
                })
                .ToListAsync();
            var repostMedia = await _db.PostMedia.AsNoTracking()
                .Where(m => repostIds.Contains(m.PostId))
                .OrderBy(m => m.SortOrder)
                .Select(m => new { m.PostId, m.Type, m.Url })
                .ToListAsync();
            var now = DateTime.UtcNow;
            reposts = rows.Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft && p.Active && !p.Banned
                    && (p.ScheduledAt == null || p.ScheduledAt <= now || p.UserId == me)
                    && (!p.IsPrivate || p.UserId == me))
                .Select(p => (
                p.Id,
                p.Caption,
                Username: p.Username,
                Media: repostMedia.Where(m => m.PostId == p.Id).Select(m => (object)new { m.Type, m.Url }).ToList()
            )).ToList();
        }

        var order = pageIds.Select((id, index) => (id, index)).ToDictionary(x => x.id, x => x.index);
        return posts.OrderBy(p => order[p.Id]).Select(p =>
        {
            var postLikes = likes.Where(l => l.PostId == p.Id).Select(l => new PostLike
            {
                PostId = l.PostId,
                UserId = l.UserId,
                Reaction = l.Reaction,
                User = new AppUser { Id = l.UserId, UserName = l.Username, FullName = l.FullName ?? "", AvatarUrl = l.Avatar }
            }).ToList();
            var reactions = DtoMapper.SummarizeReactions(postLikes, me);
            var pollOptions = options.Where(o => o.PostId == p.Id).ToList();
            object? poll = null;
            if (!string.IsNullOrWhiteSpace(p.PollQuestion))
            {
                var mine = pollOptions.FirstOrDefault(o => votes.Any(v => v.OptionId == o.Id && v.UserId == me));
                poll = new
                {
                    question = p.PollQuestion,
                    votedOptionId = mine?.Id.ToString(),
                    options = pollOptions.Select(o => new
                    {
                        id = o.Id.ToString(),
                        text = o.Text,
                        count = votes.Count(v => v.OptionId == o.Id)
                    })
                };
            }
            var repost = p.RepostOfId.HasValue ? reposts.FirstOrDefault(r => r.Id == p.RepostOfId) : default;
            return (object)new
            {
                id = p.Id.ToString(),
                userId = p.UserId.ToString(),
                media = media.Where(m => m.PostId == p.Id).Select(m => new { type = m.Type, url = m.Url, extension = m.Extension, filter = m.Filter }).ToList(),
                caption = p.Caption,
                hashtags = string.IsNullOrWhiteSpace(p.Hashtags) ? new List<string>() : p.Hashtags.Split(',').ToList(),
                location = p.Location ?? "",
                mentions = string.IsNullOrWhiteSpace(p.Mentions) ? new List<string>() : p.Mentions.Split(',').ToList(),
                likes = postLikes.Select(x => x.UserId.ToString()).ToList(),
                likeCount = reactions.ReactionCount,
                commentCount = commentCounts.FirstOrDefault(c => c.PostId == p.Id)?.Count ?? 0,
                liked = reactions.Liked,
                myReaction = reactions.MyReaction,
                reactionCount = reactions.ReactionCount,
                reactions = reactions.Reactions,
                saved = savedIds.Contains(p.Id),
                createdAt = p.CreatedAt,
                scheduledAt = p.ScheduledAt.HasValue ? DateTime.SpecifyKind(p.ScheduledAt.Value, DateTimeKind.Utc) : (DateTime?)null,
                isPinned = p.IsPinned,
                isArchived = p.IsArchived,
                isDraft = p.IsDraft,
                tags = tags.Where(t => t.PostId == p.Id).Select(t => new
                {
                    id = t.UserId.ToString(),
                    username = t.Username,
                    fullName = t.FullName,
                    avatar = t.Avatar
                }).ToList(),
                poll,
                repost = p.RepostOfId.HasValue && repost.Id != Guid.Empty ? new
                {
                    id = repost.Id.ToString(),
                    caption = repost.Caption,
                    user = new { username = repost.Username },
                    media = repost.Media
                } : null,
                user = DtoMapper.MapUser(new AppUser
                {
                    Id = p.UserId,
                    UserName = p.Username,
                    FullName = p.FullName ?? "",
                    AvatarUrl = p.Avatar,
                    IsPrivate = p.IsPrivate,
                    IsActive = true
                })
            };
        }).ToList();
    }

    [AllowAnonymous]
    [HttpGet("/api/explore")]
    public async Task<IActionResult> Explore([FromQuery] int page = 1, [FromQuery] int pageSize = 12)
    {
        var paging = Paging.Normalize(page, pageSize, 12, 24);
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var hidden = me.HasValue ? await HiddenUserIds(me.Value) : new List<Guid>();
        var muted = me.HasValue
            ? await _db.UserMutes.AsNoTracking().Where(m => m.UserId == me).Select(m => m.MutedId).ToListAsync()
            : new List<Guid>();
        var now = DateTime.UtcNow;
        var query = _db.Posts.AsNoTracking()
            .Where(p => !p.IsDeleted && !p.IsArchived && !p.IsDraft
                && (p.ScheduledAt == null || p.ScheduledAt <= now)
                && !p.User.IsPrivate && !p.User.IsBanned && p.User.IsActive
                && !hidden.Contains(p.UserId) && !muted.Contains(p.UserId));
        var total = await query.CountAsync();
        var ids = await query
            .OrderByDescending(p => p.CreatedAt)
            .Select(p => p.Id)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToListAsync();
        var savedIds = me.HasValue && ids.Count > 0
            ? (await _db.SavedPosts.AsNoTracking().Where(s => s.UserId == me.Value && ids.Contains(s.PostId)).Select(s => s.PostId).ToListAsync()).ToHashSet()
            : new HashSet<Guid>();
        var items = ids.Count == 0
            ? new List<object>()
            : await LoadFeedCards(ids, me ?? Guid.Empty, savedIds);
        return Ok(PagedResult<object>.Create(items, paging.Page, paging.PageSize, total));
    }

    [HttpPost("/api/posts")]
    public async Task<IActionResult> Create([FromBody] CreatePostBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var media = (body.Media ?? new List<MediaBody>())
            .Where(m => !string.IsNullOrWhiteSpace(m.Url))
            .ToList();
        var isDraft = body.IsDraft;
        var pollOptions = (body.Poll?.Options ?? new List<string>()).Where(x => !string.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).Distinct().Take(4).ToList();
        var hasPoll = body.Poll != null && !string.IsNullOrWhiteSpace(body.Poll.Question) && pollOptions.Count >= 2;
        if (media.Count == 0 && !isDraft && !hasPoll && body.RepostOfId == null)
        {
            return BadRequest(new { message = "Sekil ve ya video elave edin" });
        }
        if (body.RepostOfId.HasValue)
        {
            var source = await _db.Posts.Include(p => p.User).FirstOrDefaultAsync(p => p.Id == body.RepostOfId && !p.IsDeleted);
            if (source == null || source.IsDraft || source.IsArchived || !IsLive(source) || !await CanSee(source, me))
                return BadRequest(new { message = "Bu paylasimi yeniden paylasmaq olmaz" });
            if (source.User.IsPrivate)
                return BadRequest(new { message = "Gizli paylasimi yeniden paylasmaq olmaz" });
        }

        DateTime? scheduled = null;
        if (body.ScheduledAt.HasValue)
        {
            var when = body.ScheduledAt.Value;
            if (when.Kind == DateTimeKind.Unspecified) when = DateTime.SpecifyKind(when, DateTimeKind.Utc);
            when = when.ToUniversalTime();
            if (when <= DateTime.UtcNow.AddMinutes(-1))
                return BadRequest(new { message = "Plan vaxti kecib" });
            if (when > DateTime.UtcNow.AddMinutes(1)) scheduled = when;
        }

        var post = new Post
        {
            UserId = me,
            Caption = body.Caption ?? "",
            Location = body.Location,
            Mentions = body.Mentions != null ? string.Join(',', body.Mentions) : "",
            Hashtags = ExtractTags(body.Caption ?? ""),
            ScheduledAt = scheduled,
            MentionsSent = false,
            IsDraft = isDraft,
            PollQuestion = hasPoll ? body.Poll!.Question.Trim() : "",
            RepostOfId = body.RepostOfId
        };
        var usedSlugs = (await _db.Posts.AsNoTracking().Where(p => p.Slug != "").Select(p => p.Slug).ToListAsync())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        post.Slug = SlugText.Unique(string.IsNullOrWhiteSpace(post.Caption) ? post.PollQuestion : post.Caption, post.Id, usedSlugs);
        if (hasPoll)
        {
            var n = 0;
            foreach (var option in pollOptions)
            {
                post.PollOptions.Add(new PollOption { Text = option, SortOrder = n++ });
            }
        }
        if (body.Tags != null)
        {
            foreach (var name in body.Tags.Select(x => x.Trim().TrimStart('@')).Where(x => x.Length > 0).Distinct())
            {
                var tagged = await _db.Users.FirstOrDefaultAsync(u => u.UserName == name);
                if (tagged != null && tagged.Id != me)
                    post.Tags.Add(new PostTag { UserId = tagged.Id });
            }
        }

        var i = 0;
        foreach (var m in media)
        {
            var type = m.Type ?? "image";
            var (url, extension) = await StoredMedia.ResolveAsync(
                _files, m.Url, m.Extension, type == "video" ? "videos" : "images");

            post.Media.Add(new PostMedia
            {
                Type = type,
                Url = url,
                Extension = extension,
                Filter = m.Filter ?? "none",
                SortOrder = i++
            });
        }

        _db.Posts.Add(post);
        await _db.SaveChangesAsync();
        if (scheduled == null && !isDraft)
        {
            await MentionHelper.NotifyAsync(_db, _notes, me, post.Caption, post.Id.ToString(), "Seni paylasimda isareledi");
            if (body.Mentions != null)
            {
                await MentionHelper.NotifyAsync(_db, _notes, me, string.Join(" ", body.Mentions.Select(x => x.StartsWith("@") ? x : "@" + x)), post.Id.ToString(), "Seni paylasimda isareledi");
            }
            post.MentionsSent = true;
            await _db.SaveChangesAsync();
        }
        await _db.Entry(post).Reference(x => x.User).LoadAsync();
        return StatusCode(201, DtoMapper.MapPost(post, me, _db));
    }

    [AllowAnonymous]
    [HttpGet("/api/posts/{key}")]
    public async Task<IActionResult> One(string key)
    {
        if (string.Equals(key, "drafts", StringComparison.OrdinalIgnoreCase) || string.Equals(key, "archived", StringComparison.OrdinalIgnoreCase))
            return NotFound(new { message = "Paylasim tapilmadi" });
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var post = Guid.TryParse(key, out var postId)
            ? await PostsQuery().FirstOrDefaultAsync(p => p.Id == postId)
            : await PostsQuery().FirstOrDefaultAsync(p => p.Slug == key.Trim().ToLowerInvariant());
        if (post == null || !await CanSee(post, me)) return NotFound(new { message = "Paylasim tapilmadi" });

        var comments = await _db.Comments.Include(c => c.User).Include(c => c.Likes).ThenInclude(l => l.User)
            .Where(c => c.PostId == post.Id).OrderBy(c => c.CreatedAt).ToListAsync();
        var reactions = DtoMapper.SummarizeReactions(post.Likes, me);

        return Ok(new Dictionary<string, object?>
        {
            ["id"] = post.Id.ToString(),
            ["slug"] = post.Slug ?? "",
            ["userId"] = post.UserId.ToString(),
            ["media"] = post.Media.OrderBy(m => m.SortOrder).Select(m => new { type = m.Type, url = m.Url, extension = m.Extension, filter = m.Filter }),
            ["caption"] = post.Caption,
            ["hashtags"] = (post.Hashtags ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries),
            ["location"] = post.Location ?? "",
            ["mentions"] = (post.Mentions ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries),
            ["likeCount"] = reactions.LikeCount,
            ["commentCount"] = comments.Count,
            ["liked"] = reactions.Liked,
            ["myReaction"] = reactions.MyReaction,
            ["reactionCount"] = reactions.ReactionCount,
            ["reactions"] = reactions.Reactions,
            ["saved"] = me.HasValue && await _db.SavedPosts.AnyAsync(x => x.PostId == post.Id && x.UserId == me),
            ["createdAt"] = post.CreatedAt,
            ["scheduledAt"] = post.ScheduledAt.HasValue ? DateTime.SpecifyKind(post.ScheduledAt.Value, DateTimeKind.Utc) : null,
            ["isPinned"] = post.IsPinned,
            ["isArchived"] = post.IsArchived,
            ["isDraft"] = post.IsDraft,
            ["tags"] = post.Tags.Where(t => t.User != null).Select(t => new { id = t.UserId.ToString(), username = t.User.UserName, fullName = t.User.FullName, avatar = t.User.AvatarUrl }),
            ["poll"] = DtoMapper.MapPoll(post, me),
            ["repost"] = DtoMapper.ShowNested(post.RepostOf, me) ? new
            {
                id = post.RepostOf!.Id.ToString(),
                slug = post.RepostOf.Slug ?? "",
                caption = post.RepostOf.Caption,
                user = post.RepostOf.User == null ? null : DtoMapper.MapUser(post.RepostOf.User),
                media = post.RepostOf.Media.OrderBy(m => m.SortOrder).Select(m => new { type = m.Type, url = m.Url })
            } : null,
            ["user"] = DtoMapper.MapUser(post.User),
            ["comments"] = comments.Select(c => MapComment(c, me))
        });
    }

    [AllowAnonymous]
    [HttpGet("/api/posts/{id:guid}/comments")]
    public async Task<IActionResult> Comments(Guid id)
    {
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var exists = await _db.Posts.Include(p => p.User).FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        if (exists == null || !await CanSee(exists, me)) return NotFound(new { message = "Paylasim tapilmadi" });
        var comments = await _db.Comments.Include(c => c.User).Include(c => c.Likes).ThenInclude(l => l.User)
            .Where(c => c.PostId == id).OrderBy(c => c.CreatedAt).ToListAsync();
        return Ok(comments.Select(c => MapComment(c, me)));
    }

    [HttpPatch("/api/posts/{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CreatePostBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var post = await PostsQuery().FirstOrDefaultAsync(p => p.Id == id);
        if (post == null || post.UserId != me) return StatusCode(403, new { message = "Redakte icazesi yoxdur" });
        var previousCaption = post.Caption;
        post.Caption = body.Caption ?? post.Caption;
        post.Location = body.Location ?? post.Location;
        post.Hashtags = ExtractTags(post.Caption);
        if (body.ClearSchedule) post.ScheduledAt = null;
        else if (body.ScheduledAt.HasValue)
        {
            var when = body.ScheduledAt.Value;
            if (when.Kind == DateTimeKind.Unspecified) when = DateTime.SpecifyKind(when, DateTimeKind.Utc);
            when = when.ToUniversalTime();
            if (when <= DateTime.UtcNow) return BadRequest(new { message = "Plan vaxti kecib" });
            post.ScheduledAt = when;
        }
        if (body.PublishDraft)
        {
            var ready = post.Media.Any() || !string.IsNullOrWhiteSpace(post.PollQuestion) || post.RepostOfId != null;
            if (!ready) return BadRequest(new { message = "Paylasmaq ucun sekil, sorgu ve ya yeniden paylasim lazimdir" });
            post.IsDraft = false;
            post.IsArchived = false;
            post.ScheduledAt = null;
            if (!post.MentionsSent)
            {
                await MentionHelper.NotifyAsync(_db, _notes, me, post.Caption, post.Id.ToString(), "Seni paylasimda isareledi");
                if (!string.IsNullOrWhiteSpace(post.Mentions))
                    await MentionHelper.NotifyAsync(_db, _notes, me, string.Join(" ", post.Mentions.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => x.StartsWith("@") ? x : "@" + x)), post.Id.ToString(), "Seni paylasimda isareledi");
                post.MentionsSent = true;
            }
        }
        else if (body.Caption != null && post.MentionsSent && !post.IsDraft && IsLive(post))
        {
            var known = MentionHelper.Names(previousCaption).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var added = MentionHelper.Names(post.Caption).Where(name => !known.Contains(name)).ToList();
            if (added.Count > 0)
                await MentionHelper.NotifyAsync(_db, _notes, me, string.Join(" ", added.Select(name => "@" + name)), post.Id.ToString(), "Seni paylasimda isareledi");
        }
        await _db.SaveChangesAsync();
        return Ok(DtoMapper.MapPost(post, me, _db));
    }

    [HttpDelete("/api/posts/{id:guid}")]
    public async Task<IActionResult> Remove(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var post = await _db.Posts.FindAsync(id);
        if (post == null) return NotFound();
        var isAdmin = User.IsInRole("Admin");
        if (post.UserId != me && !isAdmin) return StatusCode(403, new { message = "Silmek olmaz" });
        post.IsDeleted = true;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi" });
    }

    [HttpPost("/api/posts/{id:guid}/like")]
    public Task<IActionResult> Like(Guid id) => ApplyReaction(id, "like");

    [HttpPost("/api/posts/{id:guid}/react")]
    public Task<IActionResult> React(Guid id, [FromBody] ReactionBody body)
        => ApplyReaction(id, body?.Reaction);

    private async Task<IActionResult> ApplyReaction(Guid id, string? raw)
    {
        if (!PostReactions.Allowed(raw)) return BadRequest(new { message = "Reaksiya secilmedi" });
        var reaction = PostReactions.Normalize(raw);
        var me = DtoMapper.GetUserId(User);
        var post = await _db.Posts.Include(p => p.User).Include(p => p.Likes).FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        if (post == null || !await CanSee(post, me)) return NotFound(new { message = "Paylasim tapilmadi" });

        var existing = post.Likes.FirstOrDefault(x => x.UserId == me);
        if (existing != null && PostReactions.Normalize(existing.Reaction) == reaction)
        {
            _db.PostLikes.Remove(existing);
        }
        else if (existing != null)
        {
            existing.Reaction = reaction;
        }
        else
        {
            var item = new PostLike { PostId = id, UserId = me, Reaction = reaction };
            _db.PostLikes.Add(item);
            _db.Entry(item).State = EntityState.Added;
            if (post.UserId != me)
                await _notes.AddAsync(post.UserId, me, "like", id.ToString(), "sənin paylaşımına reaksiya verdi");
        }

        await _db.SaveChangesAsync();
        var likes = await _db.PostLikes.Include(x => x.User).Where(x => x.PostId == id).ToListAsync();
        return Ok(DtoMapper.SummarizeReactions(likes, me));
    }

    [HttpPost("/api/posts/{id:guid}/save")]
    public async Task<IActionResult> Save(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var target = await _db.Posts.Include(p => p.User).FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        if (target == null || !await CanSee(target, me)) return NotFound(new { message = "Paylasim tapilmadi" });
        var existing = await _db.SavedPosts.FirstOrDefaultAsync(x => x.PostId == id && x.UserId == me);
        if (existing != null) _db.SavedPosts.Remove(existing);
        else _db.SavedPosts.Add(new SavedPost { PostId = id, UserId = me });
        await _db.SaveChangesAsync();
        return Ok(new { saved = existing == null });
    }

    [HttpPost("/api/posts/{id:guid}/comments")]
    public async Task<IActionResult> Comment(Guid id, [FromBody] CommentBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var text = (body.Text ?? "").Trim();
        if (string.IsNullOrWhiteSpace(text)) return BadRequest(new { message = "Serh yazin" });
        var post = await _db.Posts.Include(p => p.User).FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        if (post == null || !await CanSee(post, me)) return NotFound(new { message = "Paylasim tapilmadi" });
        Guid? parent = Guid.TryParse(body.ParentId, out var pid) ? pid : null;
        if (parent.HasValue && !await _db.Comments.AnyAsync(c => c.Id == parent && c.PostId == id))
            return BadRequest(new { message = "Cavab tapilmadi" });
        var c = new Comment { PostId = id, UserId = me, Text = text, ParentId = parent };
        _db.Comments.Add(c);
        await _db.SaveChangesAsync();
        if (parent.HasValue)
        {
            var parentAuthor = await _db.Comments.AsNoTracking().Where(x => x.Id == parent).Select(x => x.UserId).FirstOrDefaultAsync();
            if (parentAuthor != Guid.Empty && parentAuthor != me && parentAuthor != post.UserId)
                await _notes.AddAsync(parentAuthor, me, "comment", id.ToString(), "şərhinə cavab yazdı");
        }
        if (post.UserId != me)
            await _notes.AddAsync(post.UserId, me, "comment", id.ToString(), parent.HasValue ? "şərhinə cavab yazdı" : "şərh yazdı");
        await MentionHelper.NotifyAsync(_db, _notes, me, text, id.ToString(), "Seni serhde isareledi");
        var user = await _db.Users.FindAsync(me);
        c.User = user!;
        c.Likes = new List<CommentLike>();
        return StatusCode(201, MapComment(c, me));
    }

    [HttpPost("/api/comments/{id:guid}/like")]
    public Task<IActionResult> LikeComment(Guid id) => ReactComment(id, new ReactionBody { Reaction = "like" });

    [HttpPost("/api/comments/{id:guid}/react")]
    public async Task<IActionResult> ReactComment(Guid id, [FromBody] ReactionBody body)
    {
        if (!PostReactions.Allowed(body?.Reaction)) return BadRequest(new { message = "Reaksiya secilmedi" });
        var reaction = PostReactions.Normalize(body!.Reaction);
        var me = DtoMapper.GetUserId(User);
        var comment = await _db.Comments.Include(c => c.Post).ThenInclude(p => p.User).FirstOrDefaultAsync(c => c.Id == id);
        if (comment?.Post == null || !await CanSee(comment.Post, me)) return NotFound();
        var existing = await _db.CommentLikes.FirstOrDefaultAsync(x => x.CommentId == id && x.UserId == me);
        if (existing != null && PostReactions.Normalize(existing.Reaction) == reaction) _db.CommentLikes.Remove(existing);
        else if (existing != null) existing.Reaction = reaction;
        else
        {
            var item = new CommentLike { CommentId = id, UserId = me, Reaction = reaction };
            _db.CommentLikes.Add(item);
            _db.Entry(item).State = EntityState.Added;
            if (comment.UserId != me)
                await _notes.AddAsync(comment.UserId, me, "like", comment.PostId.ToString(), "şərhinə reaksiya verdi");
        }
        await _db.SaveChangesAsync();
        var likes = await _db.CommentLikes.Include(x => x.User).Where(x => x.CommentId == id).ToListAsync();
        return Ok(DtoMapper.SummarizeReactions(likes, me));
    }

    [HttpPatch("/api/comments/{id:guid}")]
    public async Task<IActionResult> EditComment(Guid id, [FromBody] CommentBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var comment = await _db.Comments.Include(c => c.User).Include(c => c.Likes).ThenInclude(l => l.User).FirstOrDefaultAsync(c => c.Id == id);
        if (comment == null || comment.UserId != me) return StatusCode(403, new { message = "Redakte icazesi yoxdur" });
        var text = (body.Text ?? "").Trim();
        if (text.Length == 0) return BadRequest(new { message = "Serh bos ola bilmez" });
        comment.Text = text;
        await _db.SaveChangesAsync();
        return Ok(MapComment(comment, me));
    }

    [HttpDelete("/api/comments/{id:guid}")]
    public async Task<IActionResult> DeleteComment(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var comment = await _db.Comments.FindAsync(id);
        if (comment == null) return NotFound();
        var postOwner = await _db.Posts.Where(p => p.Id == comment.PostId).Select(p => p.UserId).FirstOrDefaultAsync();
        if (comment.UserId != me && postOwner != me && !User.IsInRole("Admin")) return StatusCode(403, new { message = "Silmek olmaz" });
        var family = await _db.Comments.Where(c => c.PostId == comment.PostId).ToListAsync();
        var drop = new List<Comment>();
        void Collect(Guid root)
        {
            foreach (var child in family.Where(c => c.ParentId == root))
            {
                Collect(child.Id);
                drop.Add(child);
            }
        }
        Collect(id);
        drop.Add(comment);
        var dropIds = drop.Select(c => c.Id).ToList();
        var likes = await _db.CommentLikes.Where(l => dropIds.Contains(l.CommentId)).ToListAsync();
        _db.CommentLikes.RemoveRange(likes);
        _db.Comments.RemoveRange(drop);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi" });
    }

    [HttpGet("/api/saved")]
    public async Task<IActionResult> Saved([FromQuery] int page = 1, [FromQuery] int pageSize = 12)
    {
        var paging = Paging.Normalize(page, pageSize, 12, 24);
        var me = DtoMapper.GetUserId(User);
        var now = DateTime.UtcNow;
        var savedQuery = _db.SavedPosts.AsNoTracking().Where(x => x.UserId == me
            && _db.Posts.Any(p => p.Id == x.PostId && !p.IsDeleted && !p.IsArchived && !p.IsDraft
                && (p.ScheduledAt == null || p.ScheduledAt <= now)));
        var total = await savedQuery.CountAsync();
        var ids = await savedQuery
            .OrderByDescending(x => x.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(x => x.PostId)
            .ToListAsync();
        var posts = await LoadFeedCards(ids, me, ids.ToHashSet());
        var paged = PagedResult<object>.Create(posts, paging.Page, paging.PageSize, total);
        var collections = await _db.Collections.AsNoTracking().Include(c => c.Items).Where(c => c.UserId == me).ToListAsync();
        return Ok(new
        {
            posts = paged.Items,
            page = paged.Page,
            pageSize = paged.PageSize,
            totalCount = paged.TotalCount,
            totalPages = paged.TotalPages,
            hasMore = paged.HasMore,
            collections = collections.Select(c => new
            {
                id = c.Id.ToString(),
                name = c.Name,
                items = c.Items.Select(i => new { i.Type, id = i.ItemId })
            })
        });
    }

    [HttpGet("/api/liked")]
    public async Task<IActionResult> Liked([FromQuery] int page = 1, [FromQuery] int pageSize = 12)
    {
        var paging = Paging.Normalize(page, pageSize, 12, 24);
        var me = DtoMapper.GetUserId(User);
        var now = DateTime.UtcNow;
        var likeQuery = _db.PostLikes.AsNoTracking().Where(x => x.UserId == me
            && _db.Posts.Any(p => p.Id == x.PostId && !p.IsDeleted && !p.IsArchived && !p.IsDraft
                && (p.ScheduledAt == null || p.ScheduledAt <= now)));
        var postTotal = await likeQuery.CountAsync();
        var ids = await likeQuery
            .OrderByDescending(x => x.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(x => x.PostId)
            .ToListAsync();
        var savedIds = ids.Count == 0
            ? new HashSet<Guid>()
            : (await _db.SavedPosts.AsNoTracking().Where(s => s.UserId == me && ids.Contains(s.PostId)).Select(s => s.PostId).ToListAsync()).ToHashSet();
        var posts = await LoadFeedCards(ids, me, savedIds);
        var reelQuery = _db.ReelLikes.AsNoTracking().Where(l => l.UserId == me
            && _db.Reels.Any(r => r.Id == l.ReelId && !r.IsDeleted));
        var reelTotal = await reelQuery.Select(l => l.ReelId).Distinct().CountAsync();
        var reelIds = await reelQuery
            .GroupBy(l => l.ReelId)
            .OrderByDescending(g => g.Max(l => l.CreatedAt))
            .Select(g => g.Key)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToListAsync();
        var reels = await _db.Reels.AsNoTracking()
            .Where(r => reelIds.Contains(r.Id) && !r.IsDeleted)
            .Select(r => new
            {
                id = r.Id.ToString(),
                kind = "reel",
                videoUrl = r.VideoUrl,
                videoExtension = r.VideoExtension,
                caption = r.Caption,
                createdAt = r.CreatedAt,
                user = new { id = r.UserId.ToString(), username = r.User.UserName, fullName = r.User.FullName, avatar = r.User.AvatarUrl }
            })
            .ToListAsync();
        var postPage = PagedResult<object>.Create(posts, paging.Page, paging.PageSize, postTotal);
        return Ok(new
        {
            posts = postPage.Items,
            reels,
            page = paging.Page,
            pageSize = paging.PageSize,
            totalCount = postTotal + reelTotal,
            hasMore = postPage.HasMore || paging.Page * paging.PageSize < reelTotal
        });
    }

    [HttpPost("/api/collections")]
    public async Task<IActionResult> CreateCollection([FromBody] CollectionBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var name = (body.Name ?? "").Trim();
        if (name.Length == 0) return BadRequest(new { message = "Kolleksiya adi yaz" });
        var col = new Collection { UserId = me, Name = name };
        _db.Collections.Add(col);
        await _db.SaveChangesAsync();
        return StatusCode(201, new { id = col.Id.ToString(), name = col.Name, items = Array.Empty<object>() });
    }

    [HttpPost("/api/collections/{id:guid}/add")]
    public async Task<IActionResult> AddToCollection(Guid id, [FromBody] CollectionItemBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var col = await _db.Collections.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id && c.UserId == me);
        if (col == null) return NotFound(new { message = "Kolleksiya tapilmadi" });
        var type = string.Equals(body.Type, "reel", StringComparison.OrdinalIgnoreCase) ? "reel" : "post";
        var itemId = (body.Id ?? "").Trim();
        if (!Guid.TryParse(itemId, out var itemGuid)) return BadRequest(new { message = "Paylasim secilmedi" });
        if (type == "reel")
        {
            var reel = await _db.Reels.AsNoTracking().Include(r => r.User).FirstOrDefaultAsync(r => r.Id == itemGuid && !r.IsDeleted);
            if (reel?.User == null || !reel.User.IsActive || reel.User.IsBanned) return BadRequest(new { message = "Paylasim tapilmadi" });
            if (reel.User.IsPrivate && reel.UserId != me && !await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == reel.UserId))
                return BadRequest(new { message = "Paylasim tapilmadi" });
        }
        else
        {
            var target = await _db.Posts.AsNoTracking().Include(p => p.User).FirstOrDefaultAsync(p => p.Id == itemGuid);
            if (target == null || !await CanSee(target, me)) return BadRequest(new { message = "Paylasim tapilmadi" });
        }
        if (col.Items.Any(i => i.Type == type && i.ItemId == itemId))
        {
            return Ok(new { id = col.Id.ToString(), name = col.Name, items = col.Items.Select(i => new { i.Type, id = i.ItemId }) });
        }

        var item = new CollectionItem { CollectionId = col.Id, Type = type, ItemId = itemId };
        _db.CollectionItems.Add(item);
        _db.Entry(item).State = EntityState.Added;
        await _db.SaveChangesAsync();
        var rows = col.Items.Select(i => new { i.Type, id = i.ItemId }).ToList();
        if (!rows.Any(i => i.Type == type && i.id == itemId)) rows.Add(new { Type = type, id = itemId });
        return Ok(new { id = col.Id.ToString(), name = col.Name, items = rows });
    }

    [HttpDelete("/api/collections/{id:guid}")]
    public async Task<IActionResult> DeleteCollection(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var col = await _db.Collections.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id && c.UserId == me);
        if (col == null) return NotFound(new { message = "Kolleksiya tapilmadi" });
        _db.CollectionItems.RemoveRange(col.Items);
        _db.Collections.Remove(col);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi" });
    }

    [HttpDelete("/api/collections/{id:guid}/items")]
    public async Task<IActionResult> RemoveCollectionItem(Guid id, [FromQuery] string type, [FromQuery] string itemId)
    {
        var me = DtoMapper.GetUserId(User);
        var col = await _db.Collections.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id && c.UserId == me);
        if (col == null) return NotFound(new { message = "Kolleksiya tapilmadi" });
        var item = col.Items.FirstOrDefault(i => i.Type == type && i.ItemId == itemId);
        if (item != null) _db.CollectionItems.Remove(item);
        await _db.SaveChangesAsync();
        return Ok(new { id = col.Id.ToString(), name = col.Name, items = col.Items.Where(i => i.Id != item?.Id).Select(i => new { i.Type, id = i.ItemId }) });
    }

    [HttpGet("/api/posts/drafts")]
    public Task<IActionResult> Drafts([FromQuery] int page = 1, [FromQuery] int pageSize = 12)
        => PageOwnPosts(page, pageSize, draft: true);

    [HttpGet("/api/posts/archived")]
    public Task<IActionResult> Archived([FromQuery] int page = 1, [FromQuery] int pageSize = 12)
        => PageOwnPosts(page, pageSize, draft: false);

    private async Task<IActionResult> PageOwnPosts(int page, int pageSize, bool draft)
    {
        var paging = Paging.Normalize(page, pageSize, 12, 24);
        var me = DtoMapper.GetUserId(User);
        var query = _db.Posts.AsNoTracking().Where(p => p.UserId == me && !p.IsDeleted && (draft ? p.IsDraft && !p.IsArchived : p.IsArchived));
        var total = await query.CountAsync();
        var ids = await query
            .OrderByDescending(p => p.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .Select(p => p.Id)
            .ToListAsync();
        var loaded = ids.Count == 0
            ? new List<Post>()
            : await PostsQuery().Where(p => ids.Contains(p.Id)).ToListAsync();
        var rank = ids.Select((id, index) => (id, index)).ToDictionary(x => x.id, x => x.index);
        var items = loaded.OrderBy(p => rank[p.Id]).Select(p => DtoMapper.MapPost(p, me, _db)).ToList();
        return Ok(PagedResult<object>.Create(items, paging.Page, paging.PageSize, total));
    }

    [HttpPost("/api/posts/{id:guid}/pin")]
    public async Task<IActionResult> Pin(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var post = await _db.Posts.FirstOrDefaultAsync(p => p.Id == id && p.UserId == me && !p.IsDeleted);
        if (post == null) return NotFound();
        var pinned = !post.IsPinned;
        var mine = await _db.Posts.Where(p => p.UserId == me && p.IsPinned).ToListAsync();
        foreach (var item in mine) item.IsPinned = false;
        post.IsPinned = pinned;
        await _db.SaveChangesAsync();
        return Ok(new { isPinned = post.IsPinned });
    }

    [HttpPost("/api/posts/{id:guid}/archive")]
    public async Task<IActionResult> Archive(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var post = await _db.Posts.FirstOrDefaultAsync(p => p.Id == id && p.UserId == me && !p.IsDeleted);
        if (post == null) return NotFound();
        post.IsArchived = !post.IsArchived;
        if (post.IsArchived) post.IsPinned = false;
        await _db.SaveChangesAsync();
        return Ok(new { isArchived = post.IsArchived });
    }

    [HttpPost("/api/posts/{id:guid}/repost")]
    public async Task<IActionResult> Repost(Guid id, [FromBody] CreatePostBody? body)
    {
        var me = DtoMapper.GetUserId(User);
        var source = await _db.Posts.Include(p => p.User).FirstOrDefaultAsync(p => p.Id == id && !p.IsDeleted);
        if (source == null || source.IsDraft || source.IsArchived || !IsLive(source) || !await CanSee(source, me)) return NotFound();
        if (source.User.IsPrivate) return BadRequest(new { message = "Gizli paylasimi yeniden paylasmaq olmaz" });
        var post = new Post
        {
            UserId = me,
            Caption = body?.Caption ?? "",
            RepostOfId = source.RepostOfId ?? source.Id,
            Hashtags = ExtractTags(body?.Caption ?? ""),
            MentionsSent = true
        };
        _db.Posts.Add(post);
        await _db.SaveChangesAsync();
        await MentionHelper.NotifyAsync(_db, _notes, me, post.Caption, post.Id.ToString(), "Seni paylasimda isareledi");
        return StatusCode(201, new { id = post.Id.ToString() });
    }

    [HttpPost("/api/posts/{id:guid}/vote")]
    public async Task<IActionResult> Vote(Guid id, [FromBody] VoteBody body)
    {
        var me = DtoMapper.GetUserId(User);
        if (!Guid.TryParse(body.OptionId, out var optionId)) return BadRequest(new { message = "Secim yanlisdir" });
        var option = await _db.PollOptions
            .Include(o => o.Post).ThenInclude(p => p.User)
            .Include(o => o.Post).ThenInclude(p => p.PollOptions).ThenInclude(o => o.Votes)
            .FirstOrDefaultAsync(o => o.Id == optionId && o.PostId == id);
        if (option?.Post == null || !await CanSee(option.Post, me)) return NotFound();
        var allVotes = option.Post.PollOptions.SelectMany(o => o.Votes).Where(v => v.UserId == me).ToList();
        var same = allVotes.Any(v => v.OptionId == option.Id);
        _db.PollVotes.RemoveRange(allVotes);
        if (!same)
        {
            var vote = new PollVote { OptionId = option.Id, UserId = me };
            _db.PollVotes.Add(vote);
            _db.Entry(vote).State = EntityState.Added;
        }
        await _db.SaveChangesAsync();
        var fresh = await PostsQuery().FirstAsync(p => p.Id == id);
        return Ok(DtoMapper.MapPoll(fresh, me));
    }

    [HttpPost("/api/reports")]
    public async Task<IActionResult> Report([FromBody] ReportBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var type = (body.TargetType ?? "").Trim().ToLowerInvariant();
        var reason = (body.Reason ?? "").Trim();
        if (reason.Length == 0 || !Guid.TryParse(body.TargetId, out var targetId))
            return BadRequest(new { message = "Sikayet melumati natamamdir" });
        if (type == "user" && targetId == me)
            return BadRequest(new { message = "Öz hesabına şikayət olunmur" });
        if (type == "user" && await IsDeskAdmin(targetId))
            return BadRequest(new { message = "Admin hesabına şikayət olunmur" });
        var storyFrom = DateTime.UtcNow.AddHours(-24);
        var exists = type switch
        {
            "post" => await _db.Posts.AnyAsync(p => p.Id == targetId && !p.IsDeleted),
            "reel" => await _db.Reels.AnyAsync(r => r.Id == targetId && !r.IsDeleted),
            "user" => await _db.Users.AnyAsync(u => u.Id == targetId && u.IsActive && !u.IsBanned),
            "comment" => await _db.Comments.AnyAsync(c => c.Id == targetId) || await _db.ReelComments.AnyAsync(c => c.Id == targetId),
            "story" => await _db.Stories.AnyAsync(s => s.Id == targetId && s.CreatedAt >= storyFrom),
            _ => false
        };
        if (!exists) return BadRequest(new { message = "Sikayet olunan tapilmadi" });
        var key = targetId.ToString();
        if (await _db.Reports.AnyAsync(r => r.FromId == me && r.Status == "open" && r.TargetType == type && r.TargetId == key))
            return BadRequest(new { message = "Bu şikayət artıq növbədədir" });
        _db.Reports.Add(new Report { FromId = me, TargetType = type, TargetId = key, Reason = reason });
        await _db.SaveChangesAsync();
        return Ok(new { message = "Sikayet gonderildi" });
    }

    [HttpGet("/api/reports/mine")]
    public async Task<IActionResult> MyReports()
    {
        var me = DtoMapper.GetUserId(User);
        var list = await _db.Reports.AsNoTracking()
            .Where(r => r.FromId == me)
            .OrderByDescending(r => r.CreatedAt)
            .Take(30)
            .Select(r => new
            {
                id = r.Id.ToString(),
                targetType = r.TargetType,
                targetId = r.TargetId,
                reason = r.Reason,
                status = r.Status,
                createdAt = r.CreatedAt,
                updatedAt = r.UpdatedAt
            })
            .ToListAsync();
        return Ok(list);
    }

    private static object MapComment(Comment c, Guid? me)
    {
        var reactions = DtoMapper.SummarizeReactions(c.Likes, me);
        return new
        {
            id = c.Id.ToString(),
            postId = c.PostId.ToString(),
            userId = c.UserId.ToString(),
            text = c.Text,
            parentId = c.ParentId?.ToString(),
            likes = (c.Likes ?? new List<CommentLike>()).Select(l => l.UserId.ToString()).ToList(),
            likeCount = reactions.LikeCount,
            liked = reactions.Liked,
            myReaction = reactions.MyReaction,
            reactionCount = reactions.ReactionCount,
            reactions = reactions.Reactions,
            createdAt = c.CreatedAt,
            user = c.User == null ? null : DtoMapper.MapUser(c.User)
        };
    }

    private async Task<List<Guid>> HiddenUserIds(Guid me)
    {
        var ids = await _db.Blocks.Where(b => b.BlockerId == me).Select(b => b.BlockedId).ToListAsync();
        ids.AddRange(await _db.Blocks.Where(b => b.BlockedId == me).Select(b => b.BlockerId).ToListAsync());
        return ids.Distinct().ToList();
    }

    private async Task<bool> CanSee(Post post, Guid? me)
    {
        if (post.IsDeleted) return false;
        if (me == post.UserId) return true;
        if (post.IsArchived || post.IsDraft || !IsLive(post)) return false;
        if (post.User != null && (post.User.IsBanned || !post.User.IsActive)) return false;
        if (me.HasValue && await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == post.UserId) || (b.BlockerId == post.UserId && b.BlockedId == me)))
            return false;
        if (post.User?.IsPrivate == true)
            return me.HasValue && await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == post.UserId);
        return true;
    }

    private static string ExtractTags(string caption)
    {
        return string.Join(',', caption.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.StartsWith('#') && w.Length > 1)
            .Select(w => new string(w.TrimStart('#').Where(ch => char.IsLetterOrDigit(ch) || ch == '_').ToArray()).ToLower())
            .Where(w => w.Length > 0)
            .Distinct());
    }

    private Task<bool> IsDeskAdmin(Guid userId)
    {
        return (
            from userRole in _db.UserRoles
            join role in _db.Roles on userRole.RoleId equals role.Id
            where userRole.UserId == userId && role.Name == "Admin"
            select userRole
        ).AnyAsync();
    }
}

public class CreatePostBody
{
    public string? Caption { get; set; }
    public string? Location { get; set; }
    public List<string>? Mentions { get; set; }
    public List<MediaBody>? Media { get; set; }
    public DateTime? ScheduledAt { get; set; }
    public bool IsDraft { get; set; }
    public bool ClearSchedule { get; set; }
    public bool PublishDraft { get; set; }
    public Guid? RepostOfId { get; set; }
    public List<string>? Tags { get; set; }
    public PollBody? Poll { get; set; }
}

public class PollBody
{
    public string Question { get; set; } = "";
    public List<string> Options { get; set; } = new();
}

public class VoteBody
{
    public string OptionId { get; set; } = "";
}

public class ReactionBody
{
    public string Reaction { get; set; } = "";
}

public class MediaBody
{
    public string? Type { get; set; }
    public string? Url { get; set; }
    public string? Extension { get; set; }
    public string? Filter { get; set; }
}

public class CommentBody
{
    public string Text { get; set; } = string.Empty;
    public string? ParentId { get; set; }
}

public class CollectionBody { public string Name { get; set; } = string.Empty; }
public class CollectionItemBody { public string Type { get; set; } = "post"; public string Id { get; set; } = string.Empty; }
public class ReportBody { public string TargetType { get; set; } = ""; public string TargetId { get; set; } = ""; public string Reason { get; set; } = ""; }
