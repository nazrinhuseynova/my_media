using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Pulse.API.Helpers;
using Pulse.Application.Files;
using Pulse.Application.Files.Interfaces;
using Pulse.Application.Notifications.Interfaces;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;
using Pulse.Infrastructure.Realtime;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize]
[Route("api/conversations")]
public class ConversationsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;
    private readonly INotificationService _notes;
    private readonly IHubContext<ChatHub> _hub;
    private readonly IFileStorageService _files;
    private readonly PresenceTracker _presence;

    public ConversationsController(AppDbContext db, UserManager<AppUser> users, INotificationService notes, IHubContext<ChatHub> hub, IFileStorageService files, PresenceTracker presence)
    {
        _db = db;
        _users = users;
        _notes = notes;
        _hub = hub;
        _files = files;
        _presence = presence;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var me = DtoMapper.GetUserId(User);
        var convs = await _db.Conversations
            .AsNoTracking()
            .Include(c => c.Members).ThenInclude(m => m.User)
            .Where(c => c.Members.Any(m => m.UserId == me))
            .OrderByDescending(c => c.UpdatedAtValue)
            .ToListAsync();
        var blocked = (await _db.Blocks.AsNoTracking()
            .Where(b => b.BlockerId == me || b.BlockedId == me)
            .Select(b => b.BlockerId == me ? b.BlockedId : b.BlockerId)
            .ToListAsync()).ToHashSet();
        convs = convs.Where(c => c.IsGroup || c.Members.All(m => m.UserId == me || !blocked.Contains(m.UserId))).ToList();
        var convIds = convs.Select(c => c.Id).ToList();
        var meText = me.ToString();
        var lastByConv = convIds.Count == 0
            ? new Dictionary<Guid, Message>()
            : (await _db.Messages.AsNoTracking()
                .Where(m => convIds.Contains(m.ConversationId)
                    && (m.HiddenFor == null || m.HiddenFor == "" || !m.HiddenFor.Contains(meText)))
                .GroupBy(m => m.ConversationId)
                .Select(g => g.OrderByDescending(m => m.CreatedAt).First())
                .ToListAsync())
                .ToDictionary(m => m.ConversationId);

        var result = new List<object>();
        foreach (var c in convs)
        {
            lastByConv.TryGetValue(c.Id, out var last);
            var members = new List<object>();
            foreach (var m in c.Members.Where(x => x.UserId != me && x.User != null))
            {
                var live = _presence.IsOnline(m.User.Id) || m.User.IsOnline;
                var presence = await PrivacyRules.PresenceForViewerAsync(_db, m.User, me, live);
                members.Add(DtoMapper.MapUser(m.User, presence: presence));
            }
            result.Add(new
            {
                id = c.Id.ToString(),
                isGroup = c.IsGroup,
                title = c.Title,
                memberIds = c.Members.Select(m => m.UserId.ToString()),
                updatedAt = c.UpdatedAtValue,
                last = last == null ? null : new { text = last.IsDeleted ? "Mesaj silindi" : last.Text, createdAt = last.CreatedAt, readBy = (last.ReadBy ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries) },
                members,
                unread = last != null && !(last.ReadBy ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Contains(me.ToString())
            });
        }
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] NewConvBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var rawIds = new List<Guid> { me };
        foreach (var raw in body.MemberIds ?? new List<string>())
        {
            if (string.IsNullOrWhiteSpace(raw)) continue;
            if (!Guid.TryParse(raw, out var parsed)) return BadRequest(new { message = "Istifadeci yanlisdir" });
            rawIds.Add(parsed);
        }
        rawIds = rawIds.Distinct().ToList();
        var others = rawIds.Where(x => x != me).ToList();
        if (await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && others.Contains(b.BlockedId)) || (b.BlockedId == me && others.Contains(b.BlockerId))))
            return StatusCode(403, new { message = "Bu profil baglidir" });
        if (rawIds.Count < 2)
        {
            return BadRequest(new { message = "En az bir istifadeci secin" });
        }
        var found = await _db.Users.AsNoTracking()
            .Where(u => others.Contains(u.Id) && u.IsActive && !u.IsBanned)
            .Select(u => u.Id)
            .ToListAsync();
        if (found.Count != others.Count)
            return BadRequest(new { message = "Istifadeci tapilmadi" });

        var targets = await _db.Users.AsNoTracking().Where(u => others.Contains(u.Id)).ToListAsync();
        foreach (var target in targets)
        {
            if (!await PrivacyRules.AllowsAsync(_db, target, me, target.WhoCanMessage))
                return StatusCode(403, new { message = $"@{target.UserName} mesaj qəbul etmir" });
        }

        var ids = rawIds;
        var isGroup = ids.Count > 2 || body.IsGroup;
        if (isGroup && string.IsNullOrWhiteSpace(body.Title))
        {
            return BadRequest(new { message = "Qrup adi yazin" });
        }

        if (!isGroup)
        {
            var existing = await _db.Conversations.Include(c => c.Members)
                .FirstOrDefaultAsync(c => !c.IsGroup && c.Members.Count == 2 &&
                    c.Members.All(m => ids.Contains(m.UserId)));
            if (existing != null) return Ok(new { id = existing.Id.ToString(), existing.IsGroup, existing.Title });
        }

        var conv = new Conversation { IsGroup = isGroup, Title = body.Title ?? "" };
        foreach (var id in ids)
        {
            conv.Members.Add(new ConversationMember { UserId = id });
        }

        _db.Conversations.Add(conv);
        await _db.SaveChangesAsync();
        return StatusCode(201, new { id = conv.Id.ToString(), conv.IsGroup, conv.Title, memberIds = ids.Select(x => x.ToString()) });
    }

    [HttpGet("{id:guid}/messages")]
    public async Task<IActionResult> Messages(Guid id, [FromQuery] int page = 1, [FromQuery] int pageSize = 40)
    {
        var paging = Paging.Normalize(page, pageSize, 40, 80);
        var me = DtoMapper.GetUserId(User);
        var closed = await ClosedDirect(id, me);
        if (closed == null) return NotFound();
        if (closed == true) return StatusCode(403, new { message = "Bu profil baglidir" });
        var meText = me.ToString();
        var query = _db.Messages.Where(m => m.ConversationId == id
            && (m.HiddenFor == null || m.HiddenFor == "" || !m.HiddenFor.Contains(meText)));
        var total = await query.CountAsync();
        var items = (await query.Include(m => m.Sender)
            .OrderByDescending(m => m.CreatedAt)
            .Skip((paging.Page - 1) * paging.PageSize)
            .Take(paging.PageSize)
            .ToListAsync())
            .Where(m => !HiddenFrom(m, me))
            .OrderBy(m => m.CreatedAt)
            .ToList();

        var shareReceipts = await _db.Users.AsNoTracking()
            .Where(u => u.Id == me)
            .Select(u => u.ReadReceipts)
            .FirstOrDefaultAsync();
        var marked = false;
        if (shareReceipts)
        {
            foreach (var m in items)
            {
                var parts = (m.ReadBy ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
                if (!parts.Contains(me.ToString()))
                {
                    parts.Add(me.ToString());
                    m.ReadBy = string.Join(',', parts);
                    marked = true;
                }
            }
            await _db.SaveChangesAsync();
            if (marked)
                await _hub.Clients.Group(id.ToString()).SendAsync("messagesRead", new { conversationId = id.ToString(), userId = me.ToString() });
        }

        var pageItems = items.Select(m => MapMessage(m, items)).ToList();
        return Ok(PagedResult<object>.Create(pageItems, paging.Page, paging.PageSize, total));
    }

    [HttpPost("{id:guid}/messages")]
    public async Task<IActionResult> Send(Guid id, [FromBody] SendMsgBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var conv = await _db.Conversations.Include(c => c.Members).FirstOrDefaultAsync(c => c.Id == id);
        if (conv == null || conv.Members.All(m => m.UserId != me)) return NotFound();
        var others = conv.Members.Select(m => m.UserId).Where(x => x != me).ToList();
        if (!conv.IsGroup)
        {
            if (await IsBlocked(me, conv.Members.Select(m => m.UserId)))
                return StatusCode(403, new { message = "Bu profil baglidir" });
            if (await _db.Blocks.AnyAsync(b =>
                    (b.BlockerId == me && others.Contains(b.BlockedId)) || (b.BlockedId == me && others.Contains(b.BlockerId))))
                return StatusCode(403, new { message = "Bu profil baglidir" });
            var target = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => others.Contains(u.Id));
            if (target != null && !await PrivacyRules.AllowsAsync(_db, target, me, target.WhoCanMessage))
                return StatusCode(403, new { message = $"@{target.UserName} mesaj qəbul etmir" });
        }
        var type = (body.Type ?? "text").Trim().ToLowerInvariant();
        var allowed = new HashSet<string> { "text", "image", "video", "audio", "post", "reel", "location", "music", "status" };
        if (!allowed.Contains(type)) type = "text";
        var text = (body.Text ?? "").Trim();
        var folder = type == "video" ? "videos" : type == "audio" ? "audio" : "images";
        var (mediaUrl, mediaExtension) = type is "location" or "music" or "status"
            ? ("", "")
            : await StoredMedia.ResolveAsync(_files, body.MediaUrl, body.MediaExtension, folder);
        var shared = await SharedPost(me, body.SharedPostId);
        if (shared == null && type == "status" && Guid.TryParse(body.SharedPostId, out var storyId))
        {
            var story = await _db.Stories.AsNoTracking().Include(s => s.User).FirstOrDefaultAsync(s => s.Id == storyId);
            if (story == null) return BadRequest(new { message = "Hekayə tapılmadı" });
            if (story.UserId != me && story.User != null && !story.User.AllowStorySharing)
                return StatusCode(403, new { message = "Bu hekayəni paylaşmaq olmaz" });
            if (story.UserId != me && await _db.Blocks.AnyAsync(b =>
                    (b.BlockerId == me && b.BlockedId == story.UserId) || (b.BlockerId == story.UserId && b.BlockedId == me)))
                return StatusCode(403, new { message = "Bu profil baglidir" });
            shared = story.Id.ToString();
        }
        if (text.Length == 0 && string.IsNullOrWhiteSpace(mediaUrl) && shared == null)
            return BadRequest(new { message = "Mesaj yaz" });
        if (type is "location" or "music" or "status" && text.Length == 0)
            return BadRequest(new { message = "Məlumat yaz" });
        var msg = new Message
        {
            ConversationId = id,
            SenderId = me,
            Type = type,
            Text = text,
            MediaUrl = string.IsNullOrWhiteSpace(mediaUrl) ? null : mediaUrl,
            MediaExtension = mediaExtension,
            SharedPostId = shared,
            ReadBy = me.ToString(),
            ReplyToId = await ReplyInConversation(id, body.ReplyToId)
        };
        _db.Messages.Add(msg);
        conv.UpdatedAtValue = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var meUser = await _users.FindByIdAsync(me.ToString());
        foreach (var member in conv.Members.Where(m => m.UserId != me))
        {
            await _notes.AddAsync(member.UserId, me, "dm", id.ToString(), $"{meUser!.UserName} mesaj gonderdi");
        }

        var saved = await _db.Messages.Include(m => m.Sender).FirstAsync(m => m.Id == msg.Id);
        var reply = saved.ReplyToId == null
            ? null
            : await _db.Messages.Include(m => m.Sender).FirstOrDefaultAsync(m => m.Id == saved.ReplyToId && m.ConversationId == id);
        var payload = MapMessage(saved, reply == null ? new[] { saved } : new[] { saved, reply });
        await _hub.Clients.Group(id.ToString()).SendAsync("message", payload);
        return StatusCode(201, payload);
    }

    [HttpPatch("{id:guid}/messages/{messageId:guid}")]
    public async Task<IActionResult> EditMessage(Guid id, Guid messageId, [FromBody] EditMsgBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var closed = await ClosedDirect(id, me);
        if (closed == null) return NotFound();
        if (closed == true) return StatusCode(403, new { message = "Bu profil baglidir" });
        var msg = await _db.Messages.Include(m => m.Sender).FirstOrDefaultAsync(m => m.Id == messageId && m.ConversationId == id && m.SenderId == me && !m.IsDeleted);
        if (msg == null) return NotFound();
        var text = (body.Text ?? "").Trim();
        if (text.Length == 0) return BadRequest(new { message = "Mətn yazın" });
        msg.Text = text;
        msg.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        var reply = msg.ReplyToId == null
            ? null
            : await _db.Messages.Include(m => m.Sender).FirstOrDefaultAsync(m => m.Id == msg.ReplyToId && m.ConversationId == id);
        var payload = MapMessage(msg, reply == null ? new[] { msg } : new[] { msg, reply });
        await _hub.Clients.Group(id.ToString()).SendAsync("messageEdited", payload);
        return Ok(payload);
    }

    [HttpPost("{id:guid}/messages/{messageId:guid}/hide")]
    public async Task<IActionResult> HideMessage(Guid id, Guid messageId)
    {
        var me = DtoMapper.GetUserId(User);
        var closed = await ClosedDirect(id, me);
        if (closed == null) return NotFound();
        if (closed == true) return StatusCode(403, new { message = "Bu profil baglidir" });
        var msg = await _db.Messages.FirstOrDefaultAsync(m => m.Id == messageId && m.ConversationId == id);
        if (msg == null) return NotFound();
        var parts = (msg.HiddenFor ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
        if (!parts.Contains(me.ToString()))
        {
            parts.Add(me.ToString());
            msg.HiddenFor = string.Join(',', parts);
            await _db.SaveChangesAsync();
        }
        return Ok(new { hidden = true });
    }

    [HttpDelete("{id:guid}/messages/{messageId:guid}")]
    public async Task<IActionResult> RemoveMessage(Guid id, Guid messageId)
    {
        var me = DtoMapper.GetUserId(User);
        var closed = await ClosedDirect(id, me);
        if (closed == null) return NotFound();
        if (closed == true) return StatusCode(403, new { message = "Bu profil baglidir" });
        var msg = await _db.Messages.FirstOrDefaultAsync(m => m.Id == messageId && m.ConversationId == id && m.SenderId == me);
        if (msg == null) return NotFound();
        msg.IsDeleted = true;
        msg.Text = "";
        msg.MediaUrl = null;
        await _db.SaveChangesAsync();
        await _hub.Clients.Group(id.ToString()).SendAsync("messageDeleted", new { conversationId = id.ToString(), id = messageId.ToString() });
        return Ok(new { deleted = true });
    }

    [HttpPost("{id:guid}/typing")]
    public async Task<IActionResult> Typing(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        var closed = await ClosedDirect(id, me);
        if (closed == null) return NotFound();
        if (closed == true) return StatusCode(403, new { message = "Bu profil baglidir" });
        await _hub.Clients.Group(id.ToString()).SendAsync("typing", new { conversationId = id.ToString(), userId = me });
        return Ok(new { ok = true });
    }

    private Task<bool> InConversation(Guid id, Guid me)
        => _db.Conversations.AnyAsync(c => c.Id == id && c.Members.Any(m => m.UserId == me));

    private async Task<bool?> ClosedDirect(Guid id, Guid me)
    {
        var conv = await _db.Conversations.AsNoTracking().Include(c => c.Members).FirstOrDefaultAsync(c => c.Id == id);
        if (conv == null || conv.Members.All(m => m.UserId != me)) return null;
        if (conv.IsGroup) return false;
        return await IsBlocked(me, conv.Members.Select(m => m.UserId));
    }

    private Task<bool> IsBlocked(Guid me, IEnumerable<Guid> memberIds)
    {
        var others = memberIds.Where(x => x != me).ToList();
        return _db.Blocks.AnyAsync(b =>
            (b.BlockerId == me && others.Contains(b.BlockedId)) || (b.BlockedId == me && others.Contains(b.BlockerId)));
    }

    private async Task<string?> SharedPost(Guid me, string? raw)
    {
        if (!Guid.TryParse(raw, out var itemId)) return null;
        var post = await _db.Posts.AsNoTracking().Include(p => p.User).FirstOrDefaultAsync(p => p.Id == itemId);
        if (post != null)
        {
            if (post.IsDeleted || post.IsArchived || post.IsDraft) return null;
            if (post.ScheduledAt != null && post.ScheduledAt > DateTime.UtcNow && post.UserId != me) return null;
            if (post.User != null && (post.User.IsBanned || !post.User.IsActive) && post.UserId != me) return null;
            if (post.UserId != me && await _db.Blocks.AnyAsync(b =>
                    (b.BlockerId == me && b.BlockedId == post.UserId) || (b.BlockerId == post.UserId && b.BlockedId == me)))
                return null;
            if (post.User?.IsPrivate == true && post.UserId != me
                && !await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == post.UserId))
                return null;
            return post.Id.ToString();
        }

        var reel = await _db.Reels.AsNoTracking().Include(r => r.User).FirstOrDefaultAsync(r => r.Id == itemId);
        if (reel == null || reel.IsDeleted) return null;
        if (reel.User != null && (reel.User.IsBanned || !reel.User.IsActive) && reel.UserId != me) return null;
        if (reel.UserId != me && await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && b.BlockedId == reel.UserId) || (b.BlockerId == reel.UserId && b.BlockedId == me)))
            return null;
        if (reel.User?.IsPrivate == true && reel.UserId != me
            && !await _db.Follows.AnyAsync(f => f.FollowerId == me && f.FollowingId == reel.UserId))
            return null;
        return reel.Id.ToString();
    }

    private async Task<Guid?> ReplyInConversation(Guid conversationId, string? raw)
    {
        if (!Guid.TryParse(raw, out var replyId)) return null;
        var exists = await _db.Messages.AnyAsync(m => m.Id == replyId && m.ConversationId == conversationId);
        return exists ? replyId : null;
    }

    private static bool HiddenFrom(Message message, Guid me)
        => ("," + (message.HiddenFor ?? "") + ",").Contains("," + me + ",", StringComparison.OrdinalIgnoreCase);

    private static object MapMessage(Message m, IEnumerable<Message> thread)
    {
        var reply = m.ReplyToId == null ? null : thread.FirstOrDefault(x => x.Id == m.ReplyToId);
        return new
        {
            id = m.Id.ToString(),
            conversationId = m.ConversationId.ToString(),
            senderId = m.SenderId.ToString(),
            type = m.Type,
            text = m.IsDeleted ? "Mesaj silindi" : m.Text,
            deleted = m.IsDeleted,
            edited = m.UpdatedAt != null && !m.IsDeleted,
            mediaUrl = m.IsDeleted ? "" : m.MediaUrl ?? "",
            mediaExtension = m.MediaExtension,
            sharedPostId = m.SharedPostId ?? "",
            createdAt = m.CreatedAt,
            readBy = (m.ReadBy ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries),
            replyToId = m.ReplyToId?.ToString() ?? "",
            replyText = reply == null ? "" : (reply.IsDeleted ? "Mesaj silindi" : reply.Text),
            replyUser = reply?.Sender?.UserName ?? "",
            sender = m.Sender == null ? null : DtoMapper.MapUser(m.Sender)
        };
    }
}

public class NewConvBody
{
    public List<string> MemberIds { get; set; } = new();
    public bool IsGroup { get; set; }
    public string? Title { get; set; }
}

public class SendMsgBody
{
    public string? Type { get; set; }
    public string? Text { get; set; }
    public string? MediaUrl { get; set; }
    public string? MediaExtension { get; set; }
    public string? SharedPostId { get; set; }
    public string? ReplyToId { get; set; }
}

public class EditMsgBody
{
    public string? Text { get; set; }
}
