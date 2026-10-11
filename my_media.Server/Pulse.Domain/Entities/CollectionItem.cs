using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class CollectionItem : BaseEntity
{
    public Guid CollectionId { get; set; }
    public Collection Collection { get; set; } = null!;
    public string Type { get; set; } = "post";
    public string ItemId { get; set; } = string.Empty;
}
