using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class RefreshToken : BaseEntity
{
    public Guid UserId { get; set; }
    public AppUser User { get; set; } = null!;
    public string Token { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public bool IsRevoked { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string DeviceName { get; set; } = string.Empty;
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
}
