using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class ReelComment : BaseEntity
{
    public Guid ReelId { get; set; }
    public Reel Reel { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string Text { get; set; } = string.Empty;
}
