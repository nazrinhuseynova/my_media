using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class NotificationSetting : BaseEntity
{
    public Guid UserId { get; set; }
    public bool Like { get; set; } = true;
    public bool Comment { get; set; } = true;
    public bool Follow { get; set; } = true;
    public bool Mention { get; set; } = true;
    public bool Dm { get; set; } = true;
}
