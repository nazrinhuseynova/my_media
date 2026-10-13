using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pulse.Infrastructure.Migrations
{
    public partial class MoreSocialFeatures : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Audience",
                table: "Stories",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Reaction",
                table: "ReelLikes",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "like");

            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                table: "Posts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsDraft",
                table: "Posts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPinned",
                table: "Posts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PollQuestion",
                table: "Posts",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "RepostOfId",
                table: "Posts",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Reaction",
                table: "CommentLikes",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "like");

            migrationBuilder.CreateTable(
                name: "CloseFriends",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OwnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FriendId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CloseFriends", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CloseFriends_AspNetUsers_FriendId",
                        column: x => x.FriendId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "HashtagFollows",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Tag = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HashtagFollows", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Highlights",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CoverUrl = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Highlights", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PollOptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PostId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Text = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PollOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PollOptions_Posts_PostId",
                        column: x => x.PostId,
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PostTags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PostId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PostTags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PostTags_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PostTags_Posts_PostId",
                        column: x => x.PostId,
                        principalTable: "Posts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ProfileViews",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProfileId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ViewerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProfileViews", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProfileViews_AspNetUsers_ViewerId",
                        column: x => x.ViewerId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StoryReplies",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StoryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Text = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StoryReplies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StoryReplies_AspNetUsers_FromId",
                        column: x => x.FromId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "UserMutes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MutedId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserMutes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "HighlightItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    HighlightId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MediaUrl = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    MediaType = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Text = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_HighlightItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_HighlightItems_Highlights_HighlightId",
                        column: x => x.HighlightId,
                        principalTable: "Highlights",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PollVotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OptionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PollVotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PollVotes_PollOptions_OptionId",
                        column: x => x.OptionId,
                        principalTable: "PollOptions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReelLikes_UserId",
                table: "ReelLikes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Posts_RepostOfId",
                table: "Posts",
                column: "RepostOfId");

            migrationBuilder.CreateIndex(
                name: "IX_CommentLikes_UserId",
                table: "CommentLikes",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_CloseFriends_FriendId",
                table: "CloseFriends",
                column: "FriendId");

            migrationBuilder.CreateIndex(
                name: "IX_CloseFriends_OwnerId_FriendId",
                table: "CloseFriends",
                columns: new[] { "OwnerId", "FriendId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HashtagFollows_UserId_Tag",
                table: "HashtagFollows",
                columns: new[] { "UserId", "Tag" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_HighlightItems_HighlightId",
                table: "HighlightItems",
                column: "HighlightId");

            migrationBuilder.CreateIndex(
                name: "IX_PollOptions_PostId",
                table: "PollOptions",
                column: "PostId");

            migrationBuilder.CreateIndex(
                name: "IX_PollVotes_OptionId_UserId",
                table: "PollVotes",
                columns: new[] { "OptionId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PostTags_PostId_UserId",
                table: "PostTags",
                columns: new[] { "PostId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PostTags_UserId",
                table: "PostTags",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_ProfileViews_ProfileId_ViewerId",
                table: "ProfileViews",
                columns: new[] { "ProfileId", "ViewerId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProfileViews_ViewerId",
                table: "ProfileViews",
                column: "ViewerId");

            migrationBuilder.CreateIndex(
                name: "IX_StoryReplies_FromId",
                table: "StoryReplies",
                column: "FromId");

            migrationBuilder.CreateIndex(
                name: "IX_UserMutes_UserId_MutedId",
                table: "UserMutes",
                columns: new[] { "UserId", "MutedId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CommentLikes_AspNetUsers_UserId",
                table: "CommentLikes",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Posts_Posts_RepostOfId",
                table: "Posts",
                column: "RepostOfId",
                principalTable: "Posts",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_ReelLikes_AspNetUsers_UserId",
                table: "ReelLikes",
                column: "UserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CommentLikes_AspNetUsers_UserId",
                table: "CommentLikes");

            migrationBuilder.DropForeignKey(
                name: "FK_Posts_Posts_RepostOfId",
                table: "Posts");

            migrationBuilder.DropForeignKey(
                name: "FK_ReelLikes_AspNetUsers_UserId",
                table: "ReelLikes");

            migrationBuilder.DropTable(
                name: "CloseFriends");

            migrationBuilder.DropTable(
                name: "HashtagFollows");

            migrationBuilder.DropTable(
                name: "HighlightItems");

            migrationBuilder.DropTable(
                name: "PollVotes");

            migrationBuilder.DropTable(
                name: "PostTags");

            migrationBuilder.DropTable(
                name: "ProfileViews");

            migrationBuilder.DropTable(
                name: "StoryReplies");

            migrationBuilder.DropTable(
                name: "UserMutes");

            migrationBuilder.DropTable(
                name: "Highlights");

            migrationBuilder.DropTable(
                name: "PollOptions");

            migrationBuilder.DropIndex(
                name: "IX_ReelLikes_UserId",
                table: "ReelLikes");

            migrationBuilder.DropIndex(
                name: "IX_Posts_RepostOfId",
                table: "Posts");

            migrationBuilder.DropIndex(
                name: "IX_CommentLikes_UserId",
                table: "CommentLikes");

            migrationBuilder.DropColumn(
                name: "Audience",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "Reaction",
                table: "ReelLikes");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "IsDraft",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "IsPinned",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "PollQuestion",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "RepostOfId",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "Reaction",
                table: "CommentLikes");
        }
    }
}
