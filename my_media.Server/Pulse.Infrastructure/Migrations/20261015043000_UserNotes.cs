using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Pulse.Infrastructure.Persistence;

#nullable disable

namespace Pulse.Infrastructure.Migrations
{
    [DbContext(typeof(AppDbContext))]
    [Migration("20261015043000_UserNotes")]
    public partial class UserNotes : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "NoteText",
                table: "AspNetUsers",
                type: "nvarchar(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "NoteKind",
                table: "AspNetUsers",
                type: "nvarchar(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "text");

            migrationBuilder.AddColumn<DateTime>(
                name: "NoteAt",
                table: "AspNetUsers",
                type: "datetime2",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "NoteText", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "NoteKind", table: "AspNetUsers");
            migrationBuilder.DropColumn(name: "NoteAt", table: "AspNetUsers");
        }
    }
}
