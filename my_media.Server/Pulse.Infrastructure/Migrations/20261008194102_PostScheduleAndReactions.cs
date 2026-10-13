using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pulse.Infrastructure.Migrations
{
    public partial class PostScheduleAndReactions : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ScheduledAt",
                table: "Posts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Reaction",
                table: "PostLikes",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "like");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ScheduledAt",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "Reaction",
                table: "PostLikes");
        }
    }
}
