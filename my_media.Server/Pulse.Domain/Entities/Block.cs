using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Block : BaseEntity
{
    public Guid BlockerId { get; set; }
    public Guid BlockedId { get; set; }
}
