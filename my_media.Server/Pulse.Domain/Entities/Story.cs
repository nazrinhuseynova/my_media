using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Story : BaseEntity
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string MediaUrl { get; set; } = string.Empty;
    public string MediaExtension { get; set; } = string.Empty;
    public string MediaType { get; set; } = "image";
    public string? Text { get; set; }
    public string? Sticker { get; set; }
    public string? Music { get; set; }
    public string Audience { get; set; } = "all";
    public ICollection<StoryView> Views { get; set; } = new List<StoryView>();
}
