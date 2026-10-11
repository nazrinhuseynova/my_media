using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Conversation : BaseEntity
{
    public bool IsGroup { get; set; }
    public string Title { get; set; } = string.Empty;
    public DateTime UpdatedAtValue { get; set; } = DateTime.UtcNow;
    public ICollection<ConversationMember> Members { get; set; } = new List<ConversationMember>();
    public ICollection<Message> Messages { get; set; } = new List<Message>();
}
