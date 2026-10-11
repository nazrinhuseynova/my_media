using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Reel : BaseEntity
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string VideoUrl { get; set; } = string.Empty;
    public string VideoExtension { get; set; } = string.Empty;
    public string Caption { get; set; } = string.Empty;
    public string? Music { get; set; }
    public string Effect { get; set; } = "none";
    public ICollection<ReelLike> Likes { get; set; } = new List<ReelLike>();
    public ICollection<ReelComment> Comments { get; set; } = new List<ReelComment>();
}
