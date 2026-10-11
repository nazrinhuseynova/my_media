using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pulse.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ReelCommentThreads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ParentId",
                table: "ReelComments",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ReelCommentLikes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CommentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reaction = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false, defaultValue: "like"),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReelCommentLikes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReelCommentLikes_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ReelCommentLikes_ReelComments_CommentId",
                        column: x => x.CommentId,
                        principalTable: "ReelComments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReelComments_ParentId",
                table: "ReelComments",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_ReelCommentLikes_CommentId_UserId",
                table: "ReelCommentLikes",
                columns: new[] { "CommentId", "UserId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReelCommentLikes_UserId",
                table: "ReelCommentLikes",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_ReelComments_ReelComments_ParentId",
                table: "ReelComments",
                column: "ParentId",
                principalTable: "ReelComments",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ReelComments_ReelComments_ParentId",
                table: "ReelComments");

            migrationBuilder.DropTable(
                name: "ReelCommentLikes");

            migrationBuilder.DropIndex(
                name: "IX_ReelComments_ParentId",
                table: "ReelComments");

            migrationBuilder.DropColumn(
                name: "ParentId",
                table: "ReelComments");
        }
    }
}
