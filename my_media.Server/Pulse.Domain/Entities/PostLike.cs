using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class PostLike : BaseEntity
{
    public Guid PostId { get; set; }
    public Post Post { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string Reaction { get; set; } = "like";
}
