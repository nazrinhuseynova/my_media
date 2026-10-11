using Pulse.Domain.Common;

namespace Pulse.Domain.Entities;

public class Report : BaseEntity
{
    public Guid FromId { get; set; }
    public string TargetType { get; set; } = string.Empty;
    public string TargetId { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public string Status { get; set; } = "open";
}
