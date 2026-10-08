using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SmartQueue.Api;
using SmartQueue.Api.Data;
using SmartQueue.Api.Identity;
using SmartQueue.Api.Shops;
using SmartQueue.Api.Tickets;
using SmartQueue.Api.Live;
using SmartQueue.Api.Demo;
using SmartQueue.Api.Board;
using SmartQueue.Api.Statistics;
using SmartQueue.Api.Push;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("Database") ?? throw new InvalidOperationException("Configure ConnectionStrings:Database");
builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
builder.Services.AddIdentity<OwnerAccount, IdentityRole>(options =>
{
    options.SignIn.RequireConfirmedEmail = true;
    options.User.RequireUniqueEmail = true;
    options.Password.RequiredLength = 8;
}).AddEntityFrameworkStores<AppDbContext>().AddDefaultTokenProviders();
builder.Services.ConfigureApplicationCookie(options =>
{
    options.Cookie.Name = "smartqueue-owner";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Strict;
    options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAntiforgery(options => { options.HeaderName = "X-CSRF"; options.Cookie.Name = "smartqueue-csrf"; });
builder.Services.AddAuthorization();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddScoped<SmtpEmail>();
builder.Services.AddSingleton<TicketLinks>();
builder.Services.AddSmartQueueLive();
builder.Services.AddSmartQueuePush(builder.Environment.IsDevelopment());
builder.Services.AddDemo(builder.Configuration);
builder.Services.Configure<AutoSkipOptions>(builder.Configuration.GetSection(AutoSkipOptions.SectionName));
builder.Services.AddHostedService<AutoSkipWorker>();
var keysPath = builder.Configuration["DataProtection:KeyPath"] ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "smartqueue", "keys");
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keysPath)).SetApplicationName("SmartQueue");

var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers["Referrer-Policy"] = "no-referrer";
    try { await next(context); }
    catch (ApiException error) { context.Response.StatusCode = error.Status; await context.Response.WriteAsJsonAsync(new { code = error.Code, current = error.Current }); }
    catch (AntiforgeryValidationException) { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { code = "invalid_csrf" }); }
});
app.UseAuthentication();
app.UseDemoSessions();
app.UseAuthorization();
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
        await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context);
    await next(context);
});
app.MapAccounts();
app.MapShops();
app.MapArchive();
app.MapTickets();
app.MapServing();
app.MapCancel();
app.MapWalkin();
app.MapClose();
app.MapBoard();
app.MapSmartQueueLive();
app.MapSmartQueuePush();
app.MapDemo();
app.MapStatistics();
app.MapDemand();
app.MapGet("/api/health", () => Results.Ok(new { status = "ready" }));
app.MapFallback("/api/{**path}", async context =>
{
    context.Response.StatusCode = 404;
    await context.Response.WriteAsJsonAsync(new { code = "not_found" });
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapFallbackToFile("index.html");
await using (var scope = app.Services.CreateAsyncScope())
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
await app.RunAsync();

public partial class Program { }
