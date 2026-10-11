using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class OtpCode : BaseEntity
{
    public Guid UserId { get; set; }
    public string Contact { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Type { get; set; } = "register";
}
