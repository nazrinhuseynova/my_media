using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class StoryView : BaseEntity
{
    public Guid StoryId { get; set; }
    public Story Story { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
}
