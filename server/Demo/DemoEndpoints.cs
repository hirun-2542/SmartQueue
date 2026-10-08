namespace SmartQueue.Api.Demo;

public static class DemoEndpoints
{
    public static void MapDemo(this WebApplication app)
    {
        app.MapPost("/api/demo/session", async (DemoSessions sessions, TimeProvider time, CancellationToken cancellationToken) =>
            Results.Json(await sessions.StartAsync(time.GetUtcNow(), cancellationToken), statusCode: 201));
        app.MapDelete("/api/demo/session", async (HttpContext context, DemoSessions sessions, CancellationToken cancellationToken) =>
        {
            await sessions.EndAsync(context, cancellationToken);
            return Results.Ok(new { ended = true });
        });
    }
}
