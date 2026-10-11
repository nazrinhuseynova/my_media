using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class PostMedia : BaseEntity
{
    public Guid PostId { get; set; }
    public Post Post { get; set; } = null!;
    public string Type { get; set; } = "image";
    public string Url { get; set; } = string.Empty;
    public string Extension { get; set; } = string.Empty;
    public string Filter { get; set; } = "none";
    public int SortOrder { get; set; }
}
