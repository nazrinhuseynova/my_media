using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Pulse.Infrastructure.Persistence;

#nullable disable

namespace Pulse.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261015040000_UserPrivacy")]
    public partial class UserPrivacy : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ShowActivityStatus",
                table: "AspNetUsers",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "everyone");

            migrationBuilder.AddColumn<string>(
                name: "WhoCanMessage",
                table: "AspNetUsers",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "everyone");

            migrationBuilder.AddColumn<string>(
                name: "WhoCanTag",
                table: "AspNetUsers",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "everyone");

            migrationBuilder.AddColumn<string>(
                name: "WhoCanMention",
                table: "AspNetUsers",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "everyone");

            migrationBuilder.AddColumn<bool>(
                name: "ReadReceipts",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowStoryReplies",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "AllowStorySharing",
                table: "AspNetUsers",
                type: "bit",
                nullable: false,
                defaultValue: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ShowActivityStatus", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "WhoCanMessage", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "WhoCanTag", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "WhoCanMention", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "ReadReceipts", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "AllowStoryReplies", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "AllowStorySharing", table: "AspNetUsers");
        }
    }
}
