using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Pulse.Infrastructure.Persistence;

#nullable disable

namespace Pulse.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261014220000_UserBanWindow")]
    public partial class UserBanWindow : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "BannedUntil",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BannedUntil",
                table: "AspNetUsers");
        }
    }
}
