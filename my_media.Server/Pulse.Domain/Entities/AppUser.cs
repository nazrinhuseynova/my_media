using Microsoft.AspNetCore.Identity;

namespace Pulse.Domain.Entities;

public class AppUser : IdentityUser<Guid>
{
    public string FullName { get; set; } = string.Empty;
    public string? Bio { get; set; }
    public string? Website { get; set; }
    public string? AvatarUrl { get; set; }
    public string AvatarExtension { get; set; } = string.Empty;
    public bool IsPrivate { get; set; }
    public bool ProfileViewHistory { get; set; } = true;
    public bool IsActive { get; set; } = true;
    public bool IsBanned { get; set; }
    public string Provider { get; set; } = "email";
    public bool IsOnline { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public ICollection<Post> Posts { get; set; } = new List<Post>();
    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
