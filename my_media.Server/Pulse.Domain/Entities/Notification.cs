using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Notification : BaseEntity
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public Guid? FromId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public bool IsRead { get; set; }
}
