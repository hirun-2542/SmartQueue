using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SmartQueue.Api.Migrations
{
    /// <inheritdoc />
    public partial class DemoSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DemoExpiresAt",
                table: "AspNetUsers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AspNetUsers_DemoExpiresAt",
                table: "AspNetUsers",
                column: "DemoExpiresAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AspNetUsers_DemoExpiresAt",
                table: "AspNetUsers");

            migrationBuilder.DropColumn(
                name: "DemoExpiresAt",
                table: "AspNetUsers");
        }
    }
}
