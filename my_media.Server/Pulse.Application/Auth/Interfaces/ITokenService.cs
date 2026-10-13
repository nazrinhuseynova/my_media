using Pulse.Domain.Entities;

namespace Pulse.Application.Auth.Interfaces;

public interface ITokenService
{
    Task<(string Token, DateTime ExpiresAt)> CreateAccessTokenAsync(AppUser user, Guid sessionId);
    (string Token, DateTime ExpiresAt) CreateRefreshToken();
}
