using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Pulse.Infrastructure.Persistence;

#nullable disable

namespace Pulse.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261014120000_PostSlugs")]
    public partial class PostSlugs : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Slug",
                table: "Posts",
                type: "nvarchar(140)",
                maxLength: 140,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_Posts_Slug",
                table: "Posts",
                column: "Slug",
                unique: true,
                filter: "[Slug] <> ''");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Posts_Slug",
                table: "Posts");

            migrationBuilder.DropColumn(
                name: "Slug",
                table: "Posts");
        }
    }
}
