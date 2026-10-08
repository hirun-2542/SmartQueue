using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace SmartQueue.Api.Migrations
{
    /// <inheritdoc />
    public partial class AnonymousTickets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "business_days",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QueueId = table.Column<Guid>(type: "uuid", nullable: false),
                    OpenedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ClosedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Counter = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_business_days", x => x.Id);
                    table.ForeignKey(
                        name: "FK_business_days_queues_QueueId",
                        column: x => x.QueueId,
                        principalTable: "queues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "tickets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ShopId = table.Column<Guid>(type: "uuid", nullable: false),
                    QueueId = table.Column<Guid>(type: "uuid", nullable: false),
                    BusinessDayId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiveOrder = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Number = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Prefix = table.Column<string>(type: "character varying(8)", maxLength: 8, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Origin = table.Column<string>(type: "text", nullable: false),
                    Note = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DeviceId = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    LinkHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    ProtectedLink = table.Column<string>(type: "text", nullable: true),
                    JoinedAhead = table.Column<int>(type: "integer", nullable: false),
                    ReceivedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CalledAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    StartedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EndedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Deadline = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    EndReason = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tickets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tickets_business_days_BusinessDayId",
                        column: x => x.BusinessDayId,
                        principalTable: "business_days",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_tickets_queues_QueueId",
                        column: x => x.QueueId,
                        principalTable: "queues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_tickets_shops_ShopId",
                        column: x => x.ShopId,
                        principalTable: "shops",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_queues_BusinessDayId",
                table: "queues",
                column: "BusinessDayId");

            migrationBuilder.CreateIndex(
                name: "IX_business_days_QueueId_OpenedAt",
                table: "business_days",
                columns: new[] { "QueueId", "OpenedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_tickets_BusinessDayId_Number",
                table: "tickets",
                columns: new[] { "BusinessDayId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tickets_LinkHash",
                table: "tickets",
                column: "LinkHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tickets_QueueId_DeviceId_RequestId",
                table: "tickets",
                columns: new[] { "QueueId", "DeviceId", "RequestId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tickets_QueueId_Status_ReceiveOrder",
                table: "tickets",
                columns: new[] { "QueueId", "Status", "ReceiveOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_tickets_ShopId",
                table: "tickets",
                column: "ShopId",
                unique: true,
                filter: "\"Status\" IN ('Called', 'InService')");

            migrationBuilder.AddForeignKey(
                name: "FK_queues_business_days_BusinessDayId",
                table: "queues",
                column: "BusinessDayId",
                principalTable: "business_days",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_queues_business_days_BusinessDayId",
                table: "queues");

            migrationBuilder.DropTable(
                name: "tickets");

            migrationBuilder.DropTable(
                name: "business_days");

            migrationBuilder.DropIndex(
                name: "IX_queues_BusinessDayId",
                table: "queues");
        }
    }
}
