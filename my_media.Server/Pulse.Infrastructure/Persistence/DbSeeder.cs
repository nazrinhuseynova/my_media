using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Pulse.Domain.Entities;
using Pulse.Infrastructure.Persistence;

namespace Pulse.Infrastructure.Persistence;

public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext db, UserManager<AppUser> users, RoleManager<IdentityRole<Guid>> roles)
    {
        if (!await roles.RoleExistsAsync("Admin"))
        {
            await roles.CreateAsync(new IdentityRole<Guid>("Admin"));
        }

        if (!await roles.RoleExistsAsync("User"))
        {
            await roles.CreateAsync(new IdentityRole<Guid>("User"));
        }

        if (await users.Users.AnyAsync())
        {
            await EnsureFollowedStoriesAsync(db, users);
            await EnsureLivesAsync(db, users);
            await LinkMusicAsync(db);
            return;
        }

        var admin = await CreateUser(users, "admin", "Admin", "admin@pulse.az", "+994501112233", "https://i.pravatar.cc/300?img=12", false);
        var leyla = await CreateUser(users, "leyla", "Leyla Memmedova", "leyla@mail.az", "+994557778899", "https://i.pravatar.cc/300?img=5", false);
        var elvin = await CreateUser(users, "elvin", "Elvin Quliyev", "elvin@mail.az", "+994503334455", "https://i.pravatar.cc/300?img=11", false);
        var aysel = await CreateUser(users, "aysel", "Aysel Hesenova", "aysel@mail.az", "+994702223344", "https://i.pravatar.cc/300?img=32", true);
        var kamran = await CreateUser(users, "kamran", "Kamran Aliyev", "kamran@mail.az", "+994555551212", "https://i.pravatar.cc/300?img=15", false);

        await users.AddToRoleAsync(admin, "Admin");
        await users.AddToRoleAsync(leyla, "User");
        await users.AddToRoleAsync(elvin, "User");
        await users.AddToRoleAsync(aysel, "User");
        await users.AddToRoleAsync(kamran, "User");

        db.Follows.AddRange(
            new Follow { FollowerId = elvin.Id, FollowingId = leyla.Id },
            new Follow { FollowerId = elvin.Id, FollowingId = kamran.Id },
            new Follow { FollowerId = leyla.Id, FollowingId = elvin.Id },
            new Follow { FollowerId = leyla.Id, FollowingId = kamran.Id },
            new Follow { FollowerId = kamran.Id, FollowingId = leyla.Id },
            new Follow { FollowerId = kamran.Id, FollowingId = elvin.Id },
            new Follow { FollowerId = admin.Id, FollowingId = leyla.Id },
            new Follow { FollowerId = admin.Id, FollowingId = elvin.Id },
            new Follow { FollowerId = admin.Id, FollowingId = kamran.Id }
        );

        db.FollowRequests.Add(new FollowRequest { FromId = kamran.Id, ToId = aysel.Id, Status = "pending" });

        var p1 = new Post
        {
            UserId = leyla.Id,
            Caption = "Iceriseher axsam #baku #oldcity",
            Hashtags = "baku,oldcity",
            Location = "Iceriseher, Baki",
            Mentions = "elvin",
            CreatedAt = DateTime.UtcNow.AddMinutes(-40)
        };
        p1.Media.Add(new PostMedia { Type = "image", Url = "https://picsum.photos/id/1015/1080/1080", Filter = "clarendon", SortOrder = 0 });
        p1.Media.Add(new PostMedia { Type = "image", Url = "https://picsum.photos/id/1016/1080/1080", Filter = "none", SortOrder = 1 });
        p1.Likes.Add(new PostLike { UserId = elvin.Id, Reaction = "like" });
        p1.Likes.Add(new PostLike { UserId = kamran.Id, Reaction = "celebrate" });

        var p2 = new Post
        {
            UserId = elvin.Id,
            Caption = "Yeni kadr @leyla",
            Hashtags = "photo",
            Location = "Baki Bulvari",
            Mentions = "leyla",
            CreatedAt = DateTime.UtcNow.AddHours(-3)
        };
        p2.Media.Add(new PostMedia { Type = "image", Url = "https://picsum.photos/id/1025/1080/1350", Filter = "moon" });

        var p3 = new Post
        {
            UserId = kamran.Id,
            Caption = "Seher #sunrise",
            Hashtags = "sunrise",
            Location = "Xezer",
            CreatedAt = DateTime.UtcNow.AddHours(-6)
        };
        p3.Media.Add(new PostMedia { Type = "image", Url = "https://picsum.photos/id/1043/1080/1080", Filter = "gingham" });

        db.Posts.AddRange(p1, p2, p3);

        db.Comments.Add(new Comment { Post = p1, UserId = elvin.Id, Text = "Ela kadr!" });

        db.Stories.AddRange(
            new Story
            {
                UserId = leyla.Id,
                MediaUrl = "https://picsum.photos/id/1011/720/1280",
                Text = "Bugun",
                Sticker = "\uD83D\uDD25",
                Music = "Sunset Beat||https://res.cloudinary.com/twv3frfo/video/upload/v1791500504/pulse/audio/sunset.wav",
                CreatedAt = DateTime.UtcNow.AddMinutes(-90)
            },
            new Story
            {
                UserId = elvin.Id,
                MediaUrl = "https://picsum.photos/id/1015/720/1280",
                Text = "Bulvar",
                Sticker = "\uD83C\uDF05",
                Music = "Night Drive||https://res.cloudinary.com/twv3frfo/video/upload/v1791500506/pulse/audio/night.wav",
                CreatedAt = DateTime.UtcNow.AddMinutes(-40)
            },
            new Story
            {
                UserId = kamran.Id,
                MediaUrl = "https://picsum.photos/id/1036/720/1280",
                Text = "",
                Sticker = "\uD83D\uDCCD",
                CreatedAt = DateTime.UtcNow.AddMinutes(-20)
            }
        );

        db.Reels.Add(new Reel
        {
            UserId = elvin.Id,
            VideoUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
            VideoExtension = ".mp4",
            Caption = "Qisa kadr #reels",
            Music = "Night Drive||https://res.cloudinary.com/twv3frfo/video/upload/v1791500506/pulse/audio/night.wav",
            Effect = "warm"
        });

        var conv = new Conversation { IsGroup = false, Title = "" };
        conv.Members.Add(new ConversationMember { UserId = leyla.Id });
        conv.Members.Add(new ConversationMember { UserId = elvin.Id });
        conv.Messages.Add(new Message { SenderId = leyla.Id, Type = "text", Text = "Salam, necesen?", ReadBy = $"{leyla.Id},{elvin.Id}" });
        db.Conversations.Add(conv);

        db.Notifications.Add(new Notification
        {
            UserId = leyla.Id,
            FromId = elvin.Id,
            Type = "like",
            EntityId = "",
            Text = "elvin senin paylasimini beyendi"
        });

        await db.SaveChangesAsync();
        await EnsureLivesAsync(db, users);
    }

    private static async Task EnsureLivesAsync(AppDbContext db, UserManager<AppUser> users)
    {
        if (await db.LiveRooms.AnyAsync()) return;
        var elvin = await users.FindByNameAsync("elvin");
        var kamran = await users.FindByNameAsync("kamran");
        var leyla = await users.FindByNameAsync("leyla");
        if (elvin == null || kamran == null || leyla == null) return;
        var solo = new LiveRoom { Title = "Axşam danışığı" };
        solo.Seats.Add(new LiveSeat { UserId = elvin.Id, SortOrder = 0 });
        var duo = new LiveRoom { Title = "Birlikdə yayım" };
        duo.Seats.Add(new LiveSeat { UserId = kamran.Id, SortOrder = 0 });
        duo.Seats.Add(new LiveSeat { UserId = leyla.Id, SortOrder = 1 });
        db.LiveRooms.AddRange(solo, duo);
        await db.SaveChangesAsync();
    }

    private static async Task<AppUser> CreateUser(UserManager<AppUser> users, string username, string fullName, string email, string phone, string avatar, bool isPrivate)
    {
        var user = new AppUser
        {
            Id = Guid.NewGuid(),
            UserName = username,
            Email = email,
            PhoneNumber = phone,
            FullName = fullName,
            AvatarUrl = avatar,
            IsPrivate = isPrivate,
            IsActive = true,
            EmailConfirmed = true
        };

        var result = await users.CreateAsync(user, "Admin123!");
        if (!result.Succeeded)
        {
            throw new Exception(string.Join(", ", result.Errors.Select(e => e.Description)));
        }

        return user;
    }

    private static async Task EnsureFollowedStoriesAsync(AppDbContext db, UserManager<AppUser> users)
    {
        var leyla = await users.FindByNameAsync("leyla");
        var elvin = await users.FindByNameAsync("elvin");
        var kamran = await users.FindByNameAsync("kamran");
        if (leyla == null || elvin == null || kamran == null) return;

        async Task EnsureFollow(Guid follower, Guid following)
        {
            var exists = await db.Follows.AnyAsync(f => f.FollowerId == follower && f.FollowingId == following);
            if (!exists)
            {
                db.Follows.Add(new Follow { FollowerId = follower, FollowingId = following });
            }
        }

        await EnsureFollow(elvin.Id, leyla.Id);
        await EnsureFollow(elvin.Id, kamran.Id);
        await EnsureFollow(leyla.Id, elvin.Id);
        await EnsureFollow(leyla.Id, kamran.Id);
        await EnsureFollow(kamran.Id, leyla.Id);
        await EnsureFollow(kamran.Id, elvin.Id);

        var from = DateTime.UtcNow.AddHours(-24);
        async Task EnsureStory(Guid userId, string url, string text, string sticker)
        {
            var exists = await db.Stories.AnyAsync(s => s.UserId == userId && s.CreatedAt >= from);
            if (!exists)
            {
                db.Stories.Add(new Story
                {
                    UserId = userId,
                    MediaUrl = url,
                    Text = text,
                    Sticker = sticker,
                    CreatedAt = DateTime.UtcNow.AddMinutes(-15)
                });
            }
        }

        await EnsureStory(leyla.Id, "https://picsum.photos/id/1011/720/1280", "Bugun", "\uD83D\uDD25");
        await EnsureStory(elvin.Id, "https://picsum.photos/id/1015/720/1280", "Bulvar", "\uD83C\uDF05");
        await EnsureStory(kamran.Id, "https://picsum.photos/id/1036/720/1280", "", "\uD83D\uDCCD");

        await db.SaveChangesAsync();
    }

    private static async Task LinkMusicAsync(AppDbContext db)
    {
        var tracks = new Dictionary<string, string>
        {
            ["Sunset Beat"] = "Sunset Beat||https://res.cloudinary.com/twv3frfo/video/upload/v1791500504/pulse/audio/sunset.wav",
            ["Night Drive"] = "Night Drive||https://res.cloudinary.com/twv3frfo/video/upload/v1791500506/pulse/audio/night.wav",
            ["City Lights"] = "City Lights||https://res.cloudinary.com/twv3frfo/video/upload/v1791500507/pulse/audio/city.wav"
        };

        string Cloud(string? music)
        {
            if (string.IsNullOrWhiteSpace(music) || music.Contains("res.cloudinary.com", StringComparison.OrdinalIgnoreCase))
            {
                return music ?? "";
            }

            foreach (var pair in tracks)
            {
                if (music == pair.Key || music.StartsWith(pair.Key + "||", StringComparison.Ordinal))
                {
                    return pair.Value;
                }
            }

            return music;
        }

        var changed = false;
        var stories = await db.Stories.Where(s => s.Music != null && s.Music != "").ToListAsync();
        foreach (var story in stories)
        {
            var next = Cloud(story.Music);
            if (next != story.Music)
            {
                story.Music = next;
                changed = true;
            }
        }

        var reels = await db.Reels.Where(r => r.Music != null && r.Music != "").ToListAsync();
        foreach (var reel in reels)
        {
            var next = Cloud(reel.Music);
            if (next != reel.Music)
            {
                reel.Music = next;
                changed = true;
            }
        }

        if (changed)
        {
            await db.SaveChangesAsync();
        }
    }
}
