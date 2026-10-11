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
    public async Task<IActionResult> List()
    {
        Guid? me = User.Identity?.IsAuthenticated == true ? DtoMapper.GetUserId(User) : null;
        var hidden = new List<Guid>();
        var savedIds = new List<Guid>();
        var followed = new List<Guid>();
        if (me.HasValue)
        {
            var viewer = me.Value;
            hidden = await _db.Blocks.Where(b => b.BlockerId == viewer || b.BlockedId == viewer)
                .Select(b => b.BlockerId == viewer ? b.BlockedId : b.BlockerId).ToListAsync();
            savedIds = await _db.SavedReels.Where(s => s.UserId == viewer).Select(s => s.ReelId).ToListAsync();
            followed = await _db.Follows.Where(f => f.FollowerId == viewer).Select(f => f.FollowingId).ToListAsync();
            hidden.AddRange(await _db.UserMutes.Where(m => m.UserId == viewer).Select(m => m.MutedId).ToListAsync());
        }
        var viewerId = me ?? Guid.Empty;
        var items = await _db.Reels.Include(r => r.User).Include(r => r.Likes).ThenInclude(l => l.User).Include(r => r.Comments)
            .Where(r => !hidden.Contains(r.UserId) && r.User.IsActive && !r.User.IsBanned
                && (!r.User.IsPrivate || r.UserId == viewerId || followed.Contains(r.UserId)))
            .OrderByDescending(r => r.CreatedAt).ToListAsync();
        return Ok(items.Select(r =>
        {
            var reactions = DtoMapper.SummarizeReactions(r.Likes, me);
            return new
            {
                id = r.Id.ToString(),
                userId = r.UserId.ToString(),
                videoUrl = r.VideoUrl,
                videoExtension = r.VideoExtension,
                caption = r.Caption,
                music = r.Music,
                effect = r.Effect,
                likes = r.Likes.Select(l => l.UserId.ToString()),
                likeCount = reactions.LikeCount,
                commentCount = r.Comments.Count,
                liked = reactions.Liked,
                myReaction = reactions.MyReaction,
                reactionCount = reactions.ReactionCount,
                reactions = reactions.Reactions,
                saved = savedIds.Contains(r.Id),
                createdAt = r.CreatedAt,
                user = DtoMapper.MapUser(r.User)
            };
        }));
    }

    [HttpPost("/api/reels")]
    public async Task<IActionResult> Create([FromBody] ReelBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var (videoUrl, videoExtension) = await StoredMedia.ResolveAsync(_files, body.VideoUrl, body.VideoExtension, "videos");
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
        if (comment.UserId != me && !User.IsInRole("Admin")) return StatusCode(403, new { message = "Silmek olmaz" });
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

    private async Task<bool> CanSeeReel(Reel reel, Guid? me)
    {
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
