namespace Pulse.Application.Notifications.Interfaces;

public interface INotificationService
{
    Task AddAsync(Guid userId, Guid? fromId, string type, string entityId, string text);
}
