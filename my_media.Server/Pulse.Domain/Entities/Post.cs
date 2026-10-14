using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Post : BaseEntity
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string Caption { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Location { get; set; }
    public string Mentions { get; set; } = string.Empty;
    public string Hashtags { get; set; } = string.Empty;
    public DateTime? ScheduledAt { get; set; }
    public bool MentionsSent { get; set; }
    public bool IsPinned { get; set; }
    public bool IsArchived { get; set; }
    public bool IsDraft { get; set; }
    public Guid? RepostOfId { get; set; }
    public Post? RepostOf { get; set; }
    public string PollQuestion { get; set; } = string.Empty;

    public ICollection<PostMedia> Media { get; set; } = new List<PostMedia>();
    public ICollection<PostTag> Tags { get; set; } = new List<PostTag>();
    public ICollection<PollOption> PollOptions { get; set; } = new List<PollOption>();
    public ICollection<PostLike> Likes { get; set; } = new List<PostLike>();
    public ICollection<Comment> Comments { get; set; } = new List<Comment>();
    public ICollection<SavedPost> Saves { get; set; } = new List<SavedPost>();
}
