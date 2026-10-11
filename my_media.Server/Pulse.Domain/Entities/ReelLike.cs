using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class ReelLike : BaseEntity
{
    public Guid ReelId { get; set; }
    public Reel Reel { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string Reaction { get; set; } = "like";
}
