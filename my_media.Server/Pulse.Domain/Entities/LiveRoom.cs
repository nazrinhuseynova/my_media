using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class LiveRoom : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public int MaxSeats { get; set; } = 4;
    public int LikeCount { get; set; }
    public DateTime? EndedAt { get; set; }
    public ICollection<LiveSeat> Seats { get; set; } = new List<LiveSeat>();
}
