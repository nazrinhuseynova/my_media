using System.Collections.Concurrent;

namespace Pulse.Infrastructure.Realtime;

public sealed class PresenceTracker
{
    private static readonly TimeSpan StaleAfter = TimeSpan.FromSeconds(90);
    private readonly ConcurrentDictionary<Guid, PresenceEntry> _users = new();

    public void Connected(Guid userId, string connectionId)
    {
        _users.AddOrUpdate(
            userId,
            _ => new PresenceEntry(userId, connectionId),
            (_, entry) =>
            {
                entry.Add(connectionId);
                return entry;
            });
    }

    public bool Disconnected(Guid userId, string connectionId)
    {
        if (!_users.TryGetValue(userId, out var entry)) return true;
        entry.Remove(connectionId);
        if (entry.Count > 0) return false;
        _users.TryRemove(userId, out _);
        return true;
    }

    public void Heartbeat(Guid userId)
    {
        if (_users.TryGetValue(userId, out var entry))
            entry.Touch();
    }

    public bool IsOnline(Guid userId)
    {
        if (!_users.TryGetValue(userId, out var entry)) return false;
        if (entry.IsFresh(StaleAfter)) return true;
        _users.TryRemove(userId, out _);
        return false;
    }

    public IReadOnlyList<Guid> OnlineUserIds()
    {
        var now = DateTime.UtcNow;
        var dead = new List<Guid>();
        var live = new List<Guid>();
        foreach (var pair in _users)
        {
            if (pair.Value.IsFresh(StaleAfter, now)) live.Add(pair.Key);
            else dead.Add(pair.Key);
        }
        foreach (var id in dead) _users.TryRemove(id, out _);
        return live;
    }

    public int OnlineCount() => OnlineUserIds().Count;

    private sealed class PresenceEntry
    {
        private readonly HashSet<string> _connections = new();
        private DateTime _seen = DateTime.UtcNow;

        public PresenceEntry(Guid userId, string connectionId)
        {
            UserId = userId;
            _connections.Add(connectionId);
        }

        public Guid UserId { get; }
        public int Count
        {
            get { lock (_connections) return _connections.Count; }
        }

        public void Add(string connectionId)
        {
            lock (_connections) _connections.Add(connectionId);
            Touch();
        }

        public void Remove(string connectionId)
        {
            lock (_connections) _connections.Remove(connectionId);
        }

        public void Touch() => _seen = DateTime.UtcNow;

        public bool IsFresh(TimeSpan maxAge, DateTime? now = null)
        {
            var at = now ?? DateTime.UtcNow;
            lock (_connections)
            {
                return _connections.Count > 0 && at - _seen <= maxAge;
            }
        }
    }
}
