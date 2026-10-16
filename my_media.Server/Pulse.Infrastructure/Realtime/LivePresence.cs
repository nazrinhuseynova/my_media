using System.Collections.Concurrent;

namespace Pulse.Infrastructure.Realtime;

public sealed class LiveViewer
{
    public Guid UserId { get; init; }
    public string Username { get; set; } = "";
    public string FullName { get; set; } = "";
    public string Avatar { get; set; } = "";
    public HashSet<string> Connections { get; } = new();
}

public static class LivePresence
{
    private static readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, LiveViewer>> Viewers = new();
    private static readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, byte>> Invites = new();
    private static readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, long>> LikeAt = new();
    private static readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, long>> LikeAnnounce = new();
    private static readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, DateTime>> Mutes = new();
    private static readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, byte>> Kicked = new();
    private static readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, byte>> SeatRequests = new();

    public static IEnumerable<Guid> RoomIds() => Viewers.Keys.ToArray();

    public static ConcurrentDictionary<Guid, LiveViewer> RoomViewers(Guid roomId) =>
        Viewers.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, LiveViewer>());

    /// <summary>Host öz yayımında izləyici sayılmır.</summary>
    public static List<object> ViewerList(Guid roomId, Guid? excludeUserId = null)
    {
        return RoomViewers(roomId).Values
            .Where(v => !excludeUserId.HasValue || v.UserId != excludeUserId.Value)
            .OrderBy(v => v.Username)
            .Select(v => (object)new
            {
                id = v.UserId.ToString(),
                username = v.Username,
                fullName = v.FullName,
                avatar = v.Avatar,
                muted = IsMuted(roomId, v.UserId)
            })
            .ToList();
    }

    public static int ViewerCount(Guid roomId, Guid? excludeUserId = null)
    {
        if (!Viewers.TryGetValue(roomId, out var map)) return 0;
        if (!excludeUserId.HasValue) return map.Count;
        return map.Keys.Count(id => id != excludeUserId.Value);
    }

    /// <summary>Otaqdakı digər SignalR connection-lar (WebRTC offer üçün).</summary>
    public static List<object> OtherPeers(Guid roomId, string excludeConnectionId)
    {
        if (!Viewers.TryGetValue(roomId, out var map)) return new List<object>();
        var list = new List<object>();
        foreach (var v in map.Values)
        {
            string[] connections;
            lock (v.Connections) connections = v.Connections.ToArray();
            foreach (var c in connections)
            {
                if (c == excludeConnectionId) continue;
                list.Add(new { connectionId = c, userId = v.UserId.ToString(), username = v.Username });
            }
        }
        return list;
    }

    public static void UpsertViewer(Guid roomId, Guid userId, string connectionId, string username, string fullName, string avatar)
    {
        var map = RoomViewers(roomId);
        map.AddOrUpdate(
            userId,
            _ =>
            {
                var row = new LiveViewer
                {
                    UserId = userId,
                    Username = username,
                    FullName = fullName,
                    Avatar = avatar
                };
                row.Connections.Add(connectionId);
                return row;
            },
            (_, row) =>
            {
                row.Username = username;
                row.FullName = fullName;
                row.Avatar = avatar;
                lock (row.Connections) row.Connections.Add(connectionId);
                return row;
            });
    }

    public static bool RemoveConnection(Guid roomId, Guid userId, string connectionId)
    {
        if (!Viewers.TryGetValue(roomId, out var map)) return false;
        if (!map.TryGetValue(userId, out var row)) return false;
        lock (row.Connections) row.Connections.Remove(connectionId);
        if (row.Connections.Count > 0) return false;
        map.TryRemove(userId, out _);
        if (map.IsEmpty) Viewers.TryRemove(roomId, out _);
        return true;
    }

    public static void RemoveViewer(Guid roomId, Guid userId)
    {
        if (!Viewers.TryGetValue(roomId, out var map)) return;
        map.TryRemove(userId, out _);
        if (map.IsEmpty) Viewers.TryRemove(roomId, out _);
    }

    public static void ClearRoom(Guid roomId)
    {
        Viewers.TryRemove(roomId, out _);
        Invites.TryRemove(roomId, out _);
        LikeAt.TryRemove(roomId, out _);
        LikeAnnounce.TryRemove(roomId, out _);
        Mutes.TryRemove(roomId, out _);
        Kicked.TryRemove(roomId, out _);
        SeatRequests.TryRemove(roomId, out _);
    }

    public static void Invite(Guid roomId, Guid userId)
    {
        Invites.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, byte>())[userId] = 0;
        ClearRequest(roomId, userId);
    }

    public static bool HasInvite(Guid roomId, Guid userId) =>
        Invites.TryGetValue(roomId, out var map) && map.ContainsKey(userId);

    public static void ClearInvite(Guid roomId, Guid userId)
    {
        if (Invites.TryGetValue(roomId, out var map))
        {
            map.TryRemove(userId, out _);
            if (map.IsEmpty) Invites.TryRemove(roomId, out _);
        }
    }

    /// <summary>TikTok kimi çoxlu like — istifadəçi başına ~50ms throttle.</summary>
    public static bool TryLike(Guid roomId, Guid userId)
    {
        var map = LikeAt.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, long>());
        var now = Environment.TickCount64;
        while (true)
        {
            if (!map.TryGetValue(userId, out var prev))
            {
                if (map.TryAdd(userId, now)) return true;
                continue;
            }
            if (now - prev < 50) return false;
            if (map.TryUpdate(userId, now, prev)) return true;
        }
    }

    /// <summary>Activity spam-i azalt: eyni user üçün ~800ms-də bir dəfə «bəyənir» yazısı.</summary>
    public static bool ShouldAnnounceLike(Guid roomId, Guid userId)
    {
        var ann = LikeAnnounce.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, long>());
        var now = Environment.TickCount64;
        while (true)
        {
            if (!ann.TryGetValue(userId, out var prev))
            {
                if (ann.TryAdd(userId, now)) return true;
                continue;
            }
            if (now - prev < 800) return false;
            if (ann.TryUpdate(userId, now, prev)) return true;
        }
    }

    public static void Mute(Guid roomId, Guid userId, int minutes)
    {
        var until = minutes <= 0 ? DateTime.MaxValue : DateTime.UtcNow.AddMinutes(Math.Clamp(minutes, 1, 24 * 60));
        Mutes.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, DateTime>())[userId] = until;
    }

    public static void Unmute(Guid roomId, Guid userId)
    {
        if (Mutes.TryGetValue(roomId, out var map))
        {
            map.TryRemove(userId, out _);
            if (map.IsEmpty) Mutes.TryRemove(roomId, out _);
        }
    }

    public static bool IsMuted(Guid roomId, Guid userId)
    {
        if (!Mutes.TryGetValue(roomId, out var map) || !map.TryGetValue(userId, out var until))
            return false;
        if (until == DateTime.MaxValue || until > DateTime.UtcNow) return true;
        map.TryRemove(userId, out _);
        return false;
    }

    public static void Kick(Guid roomId, Guid userId)
    {
        Kicked.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, byte>())[userId] = 0;
        RemoveViewer(roomId, userId);
        ClearInvite(roomId, userId);
        ClearRequest(roomId, userId);
        Unmute(roomId, userId);
    }

    public static bool IsKicked(Guid roomId, Guid userId) =>
        Kicked.TryGetValue(roomId, out var map) && map.ContainsKey(userId);

    public static void RequestSeat(Guid roomId, Guid userId)
    {
        SeatRequests.GetOrAdd(roomId, _ => new ConcurrentDictionary<Guid, byte>())[userId] = 0;
    }

    public static bool HasRequest(Guid roomId, Guid userId) =>
        SeatRequests.TryGetValue(roomId, out var map) && map.ContainsKey(userId);

    public static void ClearRequest(Guid roomId, Guid userId)
    {
        if (SeatRequests.TryGetValue(roomId, out var map))
        {
            map.TryRemove(userId, out _);
            if (map.IsEmpty) SeatRequests.TryRemove(roomId, out _);
        }
    }

    public static List<Guid> RequestIds(Guid roomId) =>
        SeatRequests.TryGetValue(roomId, out var map) ? map.Keys.ToList() : new List<Guid>();
}
