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
public class ReelsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly INotificationService _notes;
    private readonly IFileStorageService _files;

    public ReelsController(AppDbContext db, INotificationService notes, IFileStorageService files)
    {
        _db = db;
        _notes = notes;
        _files = files;
    }

    [AllowAnonymous]
    [HttpGet("/api/reels")]
    public async Task<IActionResult> List([FromQuery] int page = 1, [FromQuery] int pageSize = 8, [FromQuery] Guid? focus = null)
    {
        var paging = Paging.Normalize(page, pageSize, 8, 20);
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var hidden = new List<Guid>();
        var followed = new List<Guid>();
        if (me.HasValue)
        {
            var viewer = me.Value;
            hidden = await _db.Blocks.AsNoTracking().Where(b => b.BlockerId == viewer || b.BlockedId == viewer)
                .Select(b => b.BlockerId == viewer ? b.BlockedId : b.BlockerId).ToListAsync();
            followed = await _db.Follows.AsNoTracking().Where(f => f.FollowerId == viewer).Select(f => f.FollowingId).ToListAsync();
            hidden.AddRange(await _db.UserMutes.AsNoTracking().Where(m => m.UserId == viewer).Select(m => m.MutedId).ToListAsync());
        }
        var viewerId = me ?? Guid.Empty;
        var query = _db.Reels.AsNoTracking()
            .Where(r => !r.IsDeleted && !hidden.Contains(r.UserId) && r.User.IsActive && !r.User.IsBanned
                && (!r.User.IsPrivate || r.UserId == viewerId || followed.Contains(r.UserId)));
        var pageRows = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize + 1)
            .Select(r => new
            {
                r.Id,
                r.UserId,
                r.VideoUrl,
                r.VideoExtension,
                r.Caption,
                r.Music,
                r.Effect,
                r.CreatedAt,
                Username = r.User.UserName,
                FullName = r.User.FullName,
                Avatar = r.User.AvatarUrl,
                IsPrivate = r.User.IsPrivate,
                IsOnline = r.User.IsOnline
            })
            .ToListAsync();
        var hasMore = pageRows.Count > paging.PageSize;
        var rows = pageRows.Take(paging.PageSize).ToList();
        if (focus.HasValue && rows.All(r => r.Id != focus.Value))
        {
            var extra = await query.Where(r => r.Id == focus.Value)
                .Select(r => new
                {
                    r.Id,
                    r.UserId,
                    r.VideoUrl,
                    r.VideoExtension,
                    r.Caption,
                    r.Music,
                    r.Effect,
                    r.CreatedAt,
                    Username = r.User.UserName,
                    FullName = r.User.FullName,
                    Avatar = r.User.AvatarUrl,
                    IsPrivate = r.User.IsPrivate,
                    IsOnline = r.User.IsOnline
                })
                .FirstOrDefaultAsync();
            if (extra != null) rows.Insert(0, extra);
        }
        var ids = rows.Select(r => r.Id).ToList();
        var likeCounts = ids.Count == 0
            ? new Dictionary<Guid, int>()
            : await _db.ReelLikes.AsNoTracking().Where(l => ids.Contains(l.ReelId))
                .GroupBy(l => l.ReelId).Select(g => new { Id = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Id, x => x.Count);
        var commentCounts = ids.Count == 0
            ? new Dictionary<Guid, int>()
            : await _db.ReelComments.AsNoTracking().Where(c => ids.Contains(c.ReelId))
                .GroupBy(c => c.ReelId).Select(g => new { Id = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Id, x => x.Count);
        var mine = me.HasValue && ids.Count > 0
            ? await _db.ReelLikes.AsNoTracking().Where(l => l.UserId == me && ids.Contains(l.ReelId)).ToListAsync()
            : new List<ReelLike>();
        var savedIds = me.HasValue && ids.Count > 0
            ? (await _db.SavedReels.AsNoTracking().Where(s => s.UserId == me && ids.Contains(s.ReelId)).Select(s => s.ReelId).ToListAsync()).ToHashSet()
            : new HashSet<Guid>();
        var items = rows.Select(r =>
        {
            var my = mine.FirstOrDefault(l => l.ReelId == r.Id);
            var likeCount = likeCounts.GetValueOrDefault(r.Id);
            return (object)new
            {
                id = r.Id.ToString(),
                userId = r.UserId.ToString(),
                videoUrl = r.VideoUrl,
                videoExtension = r.VideoExtension,
                caption = r.Caption,
                music = r.Music,
                effect = r.Effect,
                likeCount,
                commentCount = commentCounts.GetValueOrDefault(r.Id),
                liked = my != null,
                myReaction = my?.Reaction ?? "",
                reactionCount = likeCount,
                saved = savedIds.Contains(r.Id),
                createdAt = r.CreatedAt,
                user = DtoMapper.MapUser(new AppUser
                {
                    Id = r.UserId,
                    UserName = r.Username,
                    FullName = r.FullName ?? "",
                    AvatarUrl = r.Avatar,
                    IsPrivate = r.IsPrivate,
                    IsOnline = r.IsOnline,
                    IsActive = true
                })
            };
        }).ToList();
        var total = (paging.Page - 1) * paging.PageSize + items.Count + (hasMore ? 1 : 0);
        return Ok(PagedResult<object>.Create(items, paging.Page, paging.PageSize, total, hasMore));
    }

    [HttpPost("/api/reels")]
    public async Task<IActionResult> Create([FromBody] ReelBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var (videoUrl, videoExtension) = await StoredMedia.ResolveAsync(_files, body.VideoUrl, body.VideoExtension, "videos");
        if (string.IsNullOrWhiteSpace(videoUrl)) return BadRequest(new { message = "Video lazimdir" });
        var reel = new Reel
        {
            UserId = me,
            VideoUrl = videoUrl,
            VideoExtension = videoExtension,
            Caption = body.Caption ?? "",
            Music = body.Music,
            Effect = body.Effect ?? "none"
        };
        _db.Reels.Add(reel);
        await _db.SaveChangesAsync();
        await MentionHelper.NotifyAsync(_db, _notes, me, reel.Caption, reel.Id.ToString(), "Seni reelde isareledi");
        return StatusCode(201, new { id = reel.Id.ToString(), reel.VideoUrl, videoExtension = reel.VideoExtension, reel.Caption, reel.Music, reel.Effect });
    }

    [AllowAnonymous]
    [HttpGet("/api/reels/{id:guid}/comments")]
    public async Task<IActionResult> Comments(Guid id)
    {
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var reel = await _db.Reels.Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
        if (reel == null || !await CanSeeReel(reel, me)) return NotFound();
        var items = await _db.ReelComments.Include(c => c.User).Include(c => c.Likes).ThenInclude(l => l.User)
            .Where(c => c.ReelId == id)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();
        return Ok(items.Select(c => MapReelComment(c, me)));
    }

    [HttpPost("/api/reels/{id:guid}/comments")]
    public async Task<IActionResult> Comment(Guid id, [FromBody] CommentBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var reel = await _db.Reels.Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
        if (reel == null || !await CanSeeReel(reel, me)) return NotFound();
        var text = (body.Text ?? "").Trim();
        if (text.Length == 0) return BadRequest(new { message = "Serh yazin" });
        Guid? parent = Guid.TryParse(body.ParentId, out var pid) ? pid : null;
        if (parent.HasValue && !await _db.ReelComments.AnyAsync(c => c.Id == parent && c.ReelId == id))
            return BadRequest(new { message = "Cavab tapilmadi" });
        var c = new ReelComment { ReelId = id, UserId = me, Text = text, ParentId = parent, Likes = new List<ReelCommentLike>() };
        _db.ReelComments.Add(c);
        await _db.SaveChangesAsync();
        if (parent.HasValue)
        {
            var parentAuthor = await _db.ReelComments.AsNoTracking().Where(x => x.Id == parent).Select(x => x.UserId).FirstOrDefaultAsync();
            if (parentAuthor != Guid.Empty && parentAuthor != me && parentAuthor != reel.UserId)
                await _notes.AddAsync(parentAuthor, me, "comment", id.ToString(), "reel şərhinə cavab yazdı");
        }
        if (reel.UserId != me)
            await _notes.AddAsync(reel.UserId, me, "comment", id.ToString(), parent.HasValue ? "reel şərhinə cavab yazdı" : "reelinə şərh yazdı");
        await MentionHelper.NotifyAsync(_db, _notes, me, text, id.ToString(), "Seni reel serhinde isareledi");
        var user = await _db.Users.FindAsync(me);
        c.User = user!;
        return StatusCode(201, MapReelComment(c, me));
    }

    [HttpPost("/api/reel-comments/{id:guid}/react")]
    public async Task<IActionResult> ReactComment(Guid id, [FromBody] ReelReactionBody body)
    {
        if (!PostReactions.Allowed(body?.Reaction)) return BadRequest(new { message = "Reaksiya secilmedi" });
        var reaction = PostReactions.Normalize(body!.Reaction);
        var me = DtoMapper.GetUserId(User);
        var comment = await _db.ReelComments.Include(c => c.Reel).ThenInclude(r => r.User).FirstOrDefaultAsync(c => c.Id == id);
        if (comment?.Reel == null || !await CanSeeReel(comment.Reel, me)) return NotFound();
        var existing = await _db.ReelCommentLikes.FirstOrDefaultAsync(x => x.CommentId == id && x.UserId == me);
        if (existing != null && PostReactions.Normalize(existing.Reaction) == reaction) _db.ReelCommentLikes.Remove(existing);
        else if (existing != null) existing.Reaction = reaction;
        else
        {
            var item = new ReelCommentLike { CommentId = id, UserId = me, Reaction = reaction };
            _db.ReelCommentLikes.Add(item);
            _db.Entry(item).State = EntityState.Added;
            if (comment.UserId != me)
                await _notes.AddAsync(comment.UserId, me, "like", comment.ReelId.ToString(), "reel şərhinə reaksiya verdi");
        }
        await _db.SaveChangesAsync();
        var likes = await _db.ReelCommentLikes.Include(x => x.User).Where(x => x.CommentId == id).ToListAsync();
        return Ok(DtoMapper.SummarizeReactions(likes, me));
    }

    [HttpPatch("/api/reel-comments/{id:guid}")]
    public async Task<IActionResult> EditComment(Guid id, [FromBody] CommentBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var comment = await _db.ReelComments.Include(c => c.User).Include(c => c.Likes).ThenInclude(l => l.User).FirstOrDefaultAsync(c => c.Id == id);
        if (comment == null || comment.UserId != me) return StatusCode(403, new { message = "Redakte icazesi yoxdur" });
        var text = (body.Text ?? "").Trim();
        if (text.Length == 0) return BadRequest(new { message = "Serh bos ola bilmez" });
        comment.Text = text;
        await _db.SaveChangesAsync();
        return Ok(MapReelComment(comment, me));
    }

    [HttpDelete("/api/reel-comments/{id:guid}")]
    public async Task<IActionResult> DeleteComment(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var comment = await _db.ReelComments.FindAsync(id);
        if (comment == null) return NotFound();
        var reelOwner = await _db.Reels.Where(r => r.Id == comment.ReelId).Select(r => r.UserId).FirstOrDefaultAsync();
        if (comment.UserId != me && reelOwner != me && !User.IsInRole("Admin")) return StatusCode(403, new { message = "Silmek olmaz" });
        var family = await _db.ReelComments.Where(c => c.ReelId == comment.ReelId).ToListAsync();
        var drop = new List<ReelComment>();
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
        var likes = await _db.ReelCommentLikes.Where(l => dropIds.Contains(l.CommentId)).ToListAsync();
        _db.ReelCommentLikes.RemoveRange(likes);
        _db.ReelComments.RemoveRange(drop);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi" });
    }

    [HttpPost("/api/reels/{id:guid}/save")]
    public async Task<IActionResult> Save(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var reel = await _db.Reels.Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
        if (reel == null || !await CanSeeReel(reel, me)) return NotFound();
        var existing = await _db.SavedReels.FirstOrDefaultAsync(s => s.ReelId == id && s.UserId == me);
        if (existing != null) _db.SavedReels.Remove(existing);
        else
        {
            var row = new SavedReel { ReelId = id, UserId = me };
            _db.SavedReels.Add(row);
            _db.Entry(row).State = EntityState.Added;
        }
        await _db.SaveChangesAsync();
        return Ok(new { saved = existing == null });
    }

    [HttpPost("/api/reels/{id:guid}/like")]
    public Task<IActionResult> Like(Guid id) => React(id, new ReelReactionBody { Reaction = "like" });

    [HttpPost("/api/reels/{id:guid}/react")]
    public async Task<IActionResult> React(Guid id, [FromBody] ReelReactionBody body)
    {
        if (!PostReactions.Allowed(body?.Reaction)) return BadRequest(new { message = "Reaksiya secilmedi" });
        var reaction = PostReactions.Normalize(body!.Reaction);
        var me = DtoMapper.GetUserId(User);
        var reel = await _db.Reels.Include(r => r.User).FirstOrDefaultAsync(r => r.Id == id);
        if (reel == null || !await CanSeeReel(reel, me)) return NotFound();
        var existing = await _db.ReelLikes.FirstOrDefaultAsync(x => x.ReelId == id && x.UserId == me);
        if (existing != null && PostReactions.Normalize(existing.Reaction) == reaction) _db.ReelLikes.Remove(existing);
        else if (existing != null) existing.Reaction = reaction;
        else
        {
            var item = new ReelLike { ReelId = id, UserId = me, Reaction = reaction };
            _db.ReelLikes.Add(item);
            _db.Entry(item).State = EntityState.Added;
            if (reel.UserId != me)
                await _notes.AddAsync(reel.UserId, me, "like", id.ToString(), "reelinə reaksiya verdi");
        }
        await _db.SaveChangesAsync();
        var likes = await _db.ReelLikes.Include(x => x.User).Where(x => x.ReelId == id).ToListAsync();
        return Ok(DtoMapper.SummarizeReactions(likes, me));
    }

    private static object MapReelComment(ReelComment c, Guid? me)
    {
        var reactions = DtoMapper.SummarizeReactions(c.Likes, me);
        return new
        {
            id = c.Id.ToString(),
            reelId = c.ReelId.ToString(),
            userId = c.UserId.ToString(),
            text = c.Text,
            parentId = c.ParentId?.ToString(),
            likeCount = reactions.LikeCount,
            liked = reactions.Liked,
            myReaction = reactions.MyReaction,
            reactionCount = reactions.ReactionCount,
            reactions = reactions.Reactions,
            createdAt = c.CreatedAt,
            user = c.User == null ? null : DtoMapper.MapUser(c.User)
        };
    }

    [HttpDelete("/api/reels/{id:guid}")]
    public async Task<IActionResult> Remove(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var reel = await _db.Reels.FirstOrDefaultAsync(r => r.Id == id && !r.IsDeleted);
        if (reel == null) return NotFound();
        if (reel.UserId != me && !User.IsInRole("Admin")) return StatusCode(403, new { message = "Silmek olmaz" });
        reel.IsDeleted = true;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Silindi" });
    }

    private async Task<bool> CanSeeReel(Reel reel, Guid? me)
    {
        if (reel.IsDeleted) return false;
        var owner = reel.User ?? await _db.Users.FindAsync(reel.UserId);
        if (owner == null || !owner.IsActive || owner.IsBanned) return false;
        if (me.HasValue && reel.UserId == me.Value) return true;
        if (me.HasValue && await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == reel.UserId) || (b.BlockerId == reel.UserId && b.BlockedId == me)))
            return false;
        if (!owner.IsPrivate) return true;
        return me.HasValue && await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == reel.UserId);
    }
}

public class ReelReactionBody { public string Reaction { get; set; } = ""; }

public class ReelBody
{
    public string VideoUrl { get; set; } = string.Empty;
    public string? VideoExtension { get; set; }
    public string? Caption { get; set; }
    public string? Music { get; set; }
    public string? Effect { get; set; }
}
