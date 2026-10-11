using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Collection : BaseEntity
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public ICollection<CollectionItem> Items { get; set; } = new List<CollectionItem>();
}
