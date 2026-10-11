using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class CloseFriend : BaseEntity
{
    public Guid OwnerId { get; set; }
    public Guid FriendId { get; set; }
    public AppUser Friend { get; set; } = null!;
}

public class UserMute : BaseEntity
{
    public Guid UserId { get; set; }
    public Guid MutedId { get; set; }
}

public class HashtagFollow : BaseEntity
{
    public Guid UserId { get; set; }
    public string Tag { get; set; } = string.Empty;
}

public class ProfileView : BaseEntity
{
    public Guid ProfileId { get; set; }
    public Guid ViewerId { get; set; }
    public AppUser Viewer { get; set; } = null!;
}

public class StoryReply : BaseEntity
{
    public Guid StoryId { get; set; }
    public Guid FromId { get; set; }
    public AppUser From { get; set; } = null!;
    public string Text { get; set; } = string.Empty;
}

public class Highlight : BaseEntity
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string CoverUrl { get; set; } = string.Empty;
    public ICollection<HighlightItem> Items { get; set; } = new List<HighlightItem>();
}

public class HighlightItem : BaseEntity
{
    public Guid HighlightId { get; set; }
    public Highlight Highlight { get; set; } = null!;
    public string MediaUrl { get; set; } = string.Empty;
    public string MediaType { get; set; } = "image";
    public string Text { get; set; } = string.Empty;
}

public class PostTag : BaseEntity
{
    public Guid PostId { get; set; }
    public Post Post { get; set; } = null!;
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
}

public class PollOption : BaseEntity
{
    public Guid PostId { get; set; }
    public Post Post { get; set; } = null!;
    public string Text { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public ICollection<PollVote> Votes { get; set; } = new List<PollVote>();
}

public class PollVote : BaseEntity
{
    public Guid OptionId { get; set; }
    public PollOption Option { get; set; } = null!;
    public Guid UserId { get; set; }
}
