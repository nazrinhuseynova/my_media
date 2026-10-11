using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Comment : BaseEntity
{
    public Guid PostId { get; set; }
    public Post Post { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string Text { get; set; } = string.Empty;
    public Guid? ParentId { get; set; }
    public Comment? Parent { get; set; }
    public ICollection<CommentLike> Likes { get; set; } = new List<CommentLike>();
}
