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

    public ConversationsController(AppDbContext db, UserManager<AppUser> users, INotificationService notes, IHubContext<ChatHub> hub, IFileStorageService files)
    {
        _db = db;
        _users = users;
        _notes = notes;
        _hub = hub;
        _files = files;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var me = DtoMapper.GetUserId(User);
        var convs = await _db.Conversations
            .Include(c => c.Members).ThenInclude(m => m.User)
            .Include(c => c.Messages)
            .Where(c => c.Members.Any(m => m.UserId == me))
            .OrderByDescending(c => c.UpdatedAtValue)
            .ToListAsync();

        return Ok(convs.Select(c =>
        {
            var last = c.Messages.OrderBy(m => m.CreatedAt).LastOrDefault();
            return new
            {
                id = c.Id.ToString(),
                isGroup = c.IsGroup,
                title = c.Title,
                memberIds = c.Members.Select(m => m.UserId.ToString()),
                updatedAt = c.UpdatedAtValue,
                last = last == null ? null : new { text = last.IsDeleted ? "Mesaj silindi" : last.Text, createdAt = last.CreatedAt, readBy = (last.ReadBy ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries) },
                members = c.Members.Where(m => m.UserId != me).Select(m => DtoMapper.MapUser(m.User)),
                unread = last != null && !(last.ReadBy ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Contains(me.ToString())
            };
        }));
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
    public async Task<IActionResult> Messages(Guid id)
    {
        var me = DtoMapper.GetUserId(User);
        if (!await InConversation(id, me)) return NotFound();
        var items = await _db.Messages.Include(m => m.Sender)
            .Where(m => m.ConversationId == id).OrderBy(m => m.CreatedAt).ToListAsync();

        var marked = false;
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

        return Ok(items.Select(m => new
        {
            id = m.Id.ToString(),
            conversationId = m.ConversationId.ToString(),
            senderId = m.SenderId.ToString(),
            type = m.Type,
            text = m.IsDeleted ? "Mesaj silindi" : m.Text,
            deleted = m.IsDeleted,
            mediaUrl = m.IsDeleted ? "" : m.MediaUrl ?? "",
            mediaExtension = m.MediaExtension,
            sharedPostId = m.SharedPostId ?? "",
            createdAt = m.CreatedAt,
            readBy = (m.ReadBy ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries),
            sender = DtoMapper.MapUser(m.Sender)
        }));
    }

    [HttpPost("{id:guid}/messages")]
    public async Task<IActionResult> Send(Guid id, [FromBody] SendMsgBody body)
    {
        var me = DtoMapper.GetUserId(User);
        var conv = await _db.Conversations.Include(c => c.Members).FirstOrDefaultAsync(c => c.Id == id);
        if (conv == null || conv.Members.All(m => m.UserId != me)) return NotFound();
        var others = conv.Members.Select(m => m.UserId).Where(x => x != me).ToList();
        if (await _db.Blocks.AnyAsync(b =>
                (b.BlockerId == me && others.Contains(b.BlockedId)) || (b.BlockedId == me && others.Contains(b.BlockerId))))
            return StatusCode(403, new { message = "Bu profil baglidir" });
        var type = body.Type ?? "text";
        var folder = type == "video" ? "videos" : type == "audio" ? "audio" : "images";
        var (mediaUrl, mediaExtension) = await StoredMedia.ResolveAsync(_files, body.MediaUrl, body.MediaExtension, folder);
        var msg = new Message
        {
            ConversationId = id,
            SenderId = me,
            Type = type,
            Text = body.Text ?? "",
            MediaUrl = string.IsNullOrWhiteSpace(mediaUrl) ? null : mediaUrl,
            MediaExtension = mediaExtension,
            SharedPostId = body.SharedPostId,
            ReadBy = me.ToString()
        };
        _db.Messages.Add(msg);
        conv.UpdatedAtValue = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var meUser = await _users.FindByIdAsync(me.ToString());
        foreach (var member in conv.Members.Where(m => m.UserId != me))
        {
            await _notes.AddAsync(member.UserId, me, "dm", id.ToString(), $"{meUser!.UserName} mesaj gonderdi");
        }

        await _hub.Clients.Group(id.ToString()).SendAsync("message", new
        {
            id = msg.Id.ToString(),
            conversationId = id.ToString(),
            senderId = me.ToString(),
            type = msg.Type,
            text = msg.Text,
            mediaUrl = msg.MediaUrl ?? "",
            mediaExtension = msg.MediaExtension,
            sharedPostId = msg.SharedPostId ?? "",
            createdAt = msg.CreatedAt,
            readBy = new[] { me.ToString() },
            sender = DtoMapper.MapUser(meUser!)
        });

        return StatusCode(201, new
        {
            id = msg.Id.ToString(),
            conversationId = id.ToString(),
            senderId = me.ToString(),
            type = msg.Type,
            text = msg.Text,
            mediaUrl = msg.MediaUrl ?? "",
            mediaExtension = msg.MediaExtension,
            sharedPostId = msg.SharedPostId ?? "",
            createdAt = msg.CreatedAt,
            readBy = new[] { me.ToString() },
            sender = DtoMapper.MapUser(meUser!)
        });
    }

    [HttpDelete("{id:guid}/messages/{messageId:guid}")]
    public async Task<IActionResult> RemoveMessage(Guid id, Guid messageId)
    {
        var me = DtoMapper.GetUserId(User);
        if (!await InConversation(id, me)) return NotFound();
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
        if (!await InConversation(id, me)) return NotFound();
        await _hub.Clients.Group(id.ToString()).SendAsync("typing", new { conversationId = id.ToString(), userId = me });
        return Ok(new { ok = true });
    }

    private Task<bool> InConversation(Guid id, Guid me)
        => _db.Conversations.AnyAsync(c => c.Id == id && c.Members.Any(m => m.UserId == me));
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
}
