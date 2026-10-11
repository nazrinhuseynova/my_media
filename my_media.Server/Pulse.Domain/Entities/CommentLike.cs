using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class CommentLike : BaseEntity
{
    public Guid CommentId { get; set; }
    public Comment Comment { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string Reaction { get; set; } = "like";
}
