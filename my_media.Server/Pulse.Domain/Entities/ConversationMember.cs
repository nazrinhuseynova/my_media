using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class ConversationMember : BaseEntity
{
    public Guid ConversationId { get; set; }
    public Conversation Conversation { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
}
