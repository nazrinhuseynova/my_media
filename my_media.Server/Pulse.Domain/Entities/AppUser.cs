using Microsoft.AspNetCore.Identity;

namespace Pulse.Domain.Entities;

public class AppUser : IdentityUser<Guid>
{
    public string FullName { get; set; } = string.Empty;
    public string? Bio { get; set; }
    public string? Website { get; set; }
    public string? Language { get; set; }
    public string? AvatarUrl { get; set; }
    public string AvatarExtension { get; set; } = string.Empty;
    public bool IsPrivate { get; set; }
    public bool ProfileViewHistory { get; set; } = true;
    /// <summary>everyone | followers | nobody — onlayn/son görülmə</summary>
    public string ShowActivityStatus { get; set; } = "everyone";
    /// <summary>everyone | followers | nobody</summary>
    public string WhoCanMessage { get; set; } = "everyone";
    /// <summary>everyone | followers | nobody</summary>
    public string WhoCanTag { get; set; } = "everyone";
    /// <summary>everyone | followers | nobody</summary>
    public string WhoCanMention { get; set; } = "everyone";
    public bool ReadReceipts { get; set; } = true;
    public bool AllowStoryReplies { get; set; } = true;
    public bool AllowStorySharing { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public bool IsBanned { get; set; }
    public DateTime? BannedUntil { get; set; }
    public string Provider { get; set; } = "email";
    public bool IsOnline { get; set; }
    public DateTime? LastSeenAt { get; set; }
    /// <summary>Instagram Notes — qısa durum (24 saat).</summary>
    public string? NoteText { get; set; }
    /// <summary>text | music | location | emoji</summary>
    public string NoteKind { get; set; } = "text";
    public DateTime? NoteAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<Post> Posts { get; set; } = new List<Post>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
