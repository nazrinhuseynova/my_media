using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Pulse.Domain.Entities;

namespace Pulse.Infrastructure.Persistence;

public class AppDbContext : IdentityDbContext<AppUser, IdentityRole<Guid>, Guid>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    public DbSet<Post> Posts => Set<Post>();
    public DbSet<PostMedia> PostMedia => Set<PostMedia>();
    public DbSet<PostLike> PostLikes => Set<PostLike>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<CommentLike> CommentLikes => Set<CommentLike>();
    public DbSet<Follow> Follows => Set<Follow>();
    public DbSet<FollowRequest> FollowRequests => Set<FollowRequest>();
    public DbSet<Block> Blocks => Set<Block>();
    public DbSet<Story> Stories => Set<Story>();
    public DbSet<StoryView> StoryViews => Set<StoryView>();
    public DbSet<Reel> Reels => Set<Reel>();
    public DbSet<ReelLike> ReelLikes => Set<ReelLike>();
    public DbSet<ReelComment> ReelComments => Set<ReelComment>();
    public DbSet<SavedPost> SavedPosts => Set<SavedPost>();
    public DbSet<SavedReel> SavedReels => Set<SavedReel>();
    public DbSet<Collection> Collections => Set<Collection>();
    public DbSet<CollectionItem> CollectionItems => Set<CollectionItem>();
    public DbSet<Conversation> Conversations => Set<Conversation>();
    public DbSet<ConversationMember> ConversationMembers => Set<ConversationMember>();
    public DbSet<Message> Messages => Set<Message>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationSetting> NotificationSettings => Set<NotificationSetting>();
    public DbSet<Report> Reports => Set<Report>();
    public DbSet<OtpCode> OtpCodes => Set<OtpCode>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<CloseFriend> CloseFriends => Set<CloseFriend>();
    public DbSet<UserMute> UserMutes => Set<UserMute>();
    public DbSet<HashtagFollow> HashtagFollows => Set<HashtagFollow>();
    public DbSet<ProfileView> ProfileViews => Set<ProfileView>();
    public DbSet<StoryReply> StoryReplies => Set<StoryReply>();
    public DbSet<Highlight> Highlights => Set<Highlight>();
    public DbSet<HighlightItem> HighlightItems => Set<HighlightItem>();
    public DbSet<PostTag> PostTags => Set<PostTag>();
    public DbSet<PollOption> PollOptions => Set<PollOption>();
    public DbSet<PollVote> PollVotes => Set<PollVote>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Follow>()
            .HasIndex(x => new { x.FollowerId, x.FollowingId })
            .IsUnique();

        builder.Entity<Follow>()
            .HasOne(x => x.Follower)
            .WithMany()
            .HasForeignKey(x => x.FollowerId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Follow>()
            .HasOne(x => x.Following)
            .WithMany()
            .HasForeignKey(x => x.FollowingId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<PostLike>()
            .HasIndex(x => new { x.PostId, x.UserId })
            .IsUnique();

        builder.Entity<FollowRequest>()
            .HasOne(x => x.From)
            .WithMany()
            .HasForeignKey(x => x.FromId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<FollowRequest>()
            .HasOne(x => x.To)
            .WithMany()
            .HasForeignKey(x => x.ToId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Comment>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<PostLike>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<SavedReel>().HasIndex(x => new { x.UserId, x.ReelId }).IsUnique();
        builder.Entity<PostLike>().Property(x => x.Reaction).HasMaxLength(20).HasDefaultValue("like");
        builder.Entity<CommentLike>().Property(x => x.Reaction).HasMaxLength(20).HasDefaultValue("like");
        builder.Entity<ReelLike>().Property(x => x.Reaction).HasMaxLength(20).HasDefaultValue("like");
        builder.Entity<Story>().Property(x => x.Audience).HasMaxLength(16);
        builder.Entity<HashtagFollow>().Property(x => x.Tag).HasMaxLength(80);
        builder.Entity<Highlight>().Property(x => x.Name).HasMaxLength(40);

        builder.Entity<Post>()
            .HasOne(p => p.RepostOf)
            .WithMany()
            .HasForeignKey(p => p.RepostOfId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.Entity<CloseFriend>().HasIndex(x => new { x.OwnerId, x.FriendId }).IsUnique();
        builder.Entity<UserMute>().HasIndex(x => new { x.UserId, x.MutedId }).IsUnique();
        builder.Entity<HashtagFollow>().HasIndex(x => new { x.UserId, x.Tag }).IsUnique();
        builder.Entity<ProfileView>().HasIndex(x => new { x.ProfileId, x.ViewerId }).IsUnique();
        builder.Entity<PollVote>().HasIndex(x => new { x.OptionId, x.UserId }).IsUnique();
        builder.Entity<PostTag>().HasIndex(x => new { x.PostId, x.UserId }).IsUnique();

        builder.Entity<CloseFriend>()
            .HasOne(x => x.Friend)
            .WithMany()
            .HasForeignKey(x => x.FriendId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<ProfileView>()
            .HasOne(x => x.Viewer)
            .WithMany()
            .HasForeignKey(x => x.ViewerId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<StoryReply>()
            .HasOne(x => x.From)
            .WithMany()
            .HasForeignKey(x => x.FromId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<PostTag>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<CommentLike>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<ReelLike>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Message>()
            .HasOne(x => x.Sender)
            .WithMany()
            .HasForeignKey(x => x.SenderId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<Comment>()
            .HasOne(x => x.Parent)
            .WithMany()
            .HasForeignKey(x => x.ParentId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.Entity<StoryView>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<ConversationMember>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<ReelComment>()
            .HasOne(x => x.User)
            .WithMany()
            .HasForeignKey(x => x.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Entity<PostMedia>().Property(x => x.Extension).HasMaxLength(16);
        builder.Entity<Story>().Property(x => x.MediaExtension).HasMaxLength(16);
        builder.Entity<Reel>().Property(x => x.VideoExtension).HasMaxLength(16);
        builder.Entity<Message>().Property(x => x.MediaExtension).HasMaxLength(16);
        builder.Entity<AppUser>().Property(x => x.AvatarExtension).HasMaxLength(16);
    }
}
