using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Message : BaseEntity
{
    public Guid ConversationId { get; set; }
    public Conversation Conversation { get; set; } = null!;
    public Guid SenderId { get; set; }
    public AppUser Sender { get; set; } = null!;
    public string Type { get; set; } = "text";
    public string Text { get; set; } = string.Empty;
    public string? MediaUrl { get; set; }
    public string MediaExtension { get; set; } = string.Empty;
    public string? SharedPostId { get; set; }
    public string ReadBy { get; set; } = string.Empty;
    public string HiddenFor { get; set; } = string.Empty;
    public Guid? ReplyToId { get; set; }
}
