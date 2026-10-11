using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class LiveRoom : BaseEntity
{
    public string Title { get; set; } = string.Empty;
    public DateTime? EndedAt { get; set; }
    public ICollection<LiveSeat> Seats { get; set; } = new List<LiveSeat>();
}
