using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class SavedPost : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid PostId { get; set; }
    public Post Post { get; set; } = null!;
}

public class SavedReel : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid ReelId { get; set; }
    public Reel Reel { get; set; } = null!;
}
