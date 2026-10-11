using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pulse.Infrastructure.Migrations
{
    public partial class CloudinaryFileExtensions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MediaExtension",
                table: "Stories",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "VideoExtension",
                table: "Reels",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Extension",
                table: "PostMedia",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "MediaExtension",
                table: "Messages",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "AvatarExtension",
                table: "AspNetUsers",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MediaExtension",
                table: "Stories");

            migrationBuilder.DropColumn(
                name: "VideoExtension",
                table: "Reels");

            migrationBuilder.DropColumn(
                name: "Extension",
                table: "PostMedia");

            migrationBuilder.DropColumn(
                name: "MediaExtension",
                table: "Messages");

            migrationBuilder.DropColumn(
                name: "AvatarExtension",
                table: "AspNetUsers");
        }
    }
}
