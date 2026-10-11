using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class LiveSeat : BaseEntity
{
    public Guid RoomId { get; set; }
    public LiveRoom Room { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public int SortOrder { get; set; }
}
