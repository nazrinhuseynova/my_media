using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class FollowRequest : BaseEntity
{
    public Guid FromId { get; set; }
    public AppUser From { get; set; } = null!;
    public Guid ToId { get; set; }
    public AppUser To { get; set; } = null!;
    public string Status { get; set; } = "pending";
}
