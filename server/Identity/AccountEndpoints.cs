using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using SmartQueue.Api.Data;
using SmartQueue.Api.Tickets;
using SmartQueue.Api.Demo;

namespace SmartQueue.Api.Identity;

public static class AccountEndpoints
{
    public static void MapAccounts(this WebApplication app)
    {
        app.MapGet("/api/session", async (HttpContext context, IAntiforgery antiforgery, UserManager<OwnerAccount> users, TimeProvider time) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(context);
            DeviceIdentity.Get(context);
            var expired = DemoSessionGuard.IsExpired(context.User, time.GetUtcNow()) || context.Items[DemoClaims.ExpiredItem] as bool? == true;
            var owner = context.User.Identity?.IsAuthenticated == true && !expired ? await users.GetUserAsync(context.User) : null;
            return Results.Ok(new { csrf = tokens.RequestToken, owner = owner is null ? null : new { owner.Id, owner.Email, demo = owner.DemoExpiresAt is not null, demoExpiresAt = owner.DemoExpiresAt }, demoExpired = expired });
        });
        app.MapPost("/api/account/register", async (RegisterRequest request, UserManager<OwnerAccount> users, SmtpEmail email, IConfiguration config) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password)) return ApiError.Bad("account_required");
            var owner = new OwnerAccount { UserName = request.Email.Trim(), Email = request.Email.Trim() };
            var result = await users.CreateAsync(owner, request.Password);
            if (!result.Succeeded) return IdentityError(result);
            var code = Encode(await users.GenerateEmailConfirmationTokenAsync(owner));
            var link = $"{Origin(config)}/account/verify?userId={Uri.EscapeDataString(owner.Id)}&code={Uri.EscapeDataString(code)}";
            var thai = request.Language != "en";
            await email.SendAsync(owner.Email!, thai ? "ยืนยันอีเมล SmartQueue" : "Verify your SmartQueue email", link, thai);
            return Results.Ok(new { sent = true });
        });
        app.MapPost("/api/account/verify", async (VerifyRequest request, UserManager<OwnerAccount> users) =>
        {
            var owner = await users.FindByIdAsync(request.UserId ?? "");
            var code = Decode(request.Code);
            if (owner is null || code is null) return ApiError.Bad("invalid_token");
            var result = await users.ConfirmEmailAsync(owner, code);
            return result.Succeeded ? Results.Ok(new { verified = true }) : ApiError.Bad("invalid_token");
        });
        app.MapPost("/api/account/login", async (Credentials request, SignInManager<OwnerAccount> signIn) =>
        {
            if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password)) return ApiError.Bad("account_required");
            var result = await signIn.PasswordSignInAsync(request.Email.Trim(), request.Password, true, true);
            return result.Succeeded ? Results.Ok(new { authenticated = true }) : Results.Json(new { code = result.IsNotAllowed ? "email_not_verified" : result.IsLockedOut ? "account_locked" : "invalid_credentials" }, statusCode: 401);
        });
        app.MapPost("/api/account/logout", async (SignInManager<OwnerAccount> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.Ok(new { signedOut = true });
        });
        app.MapPost("/api/account/forgot-password", async (ForgotRequest request, UserManager<OwnerAccount> users, SmtpEmail email, IConfiguration config) =>
        {
            var owner = await users.FindByEmailAsync(request.Email?.Trim() ?? "");
            if (owner is { EmailConfirmed: true })
            {
                var code = Encode(await users.GeneratePasswordResetTokenAsync(owner));
                var link = $"{Origin(config)}/account/reset?email={Uri.EscapeDataString(owner.Email!)}&code={Uri.EscapeDataString(code)}";
                var thai = request.Language != "en";
                await email.SendAsync(owner.Email!, thai ? "ตั้งรหัสผ่าน SmartQueue ใหม่" : "Reset your SmartQueue password", link, thai);
            }
            return Results.Ok(new { sent = true });
        });
        app.MapPost("/api/account/reset-password", async (ResetRequest request, UserManager<OwnerAccount> users) =>
        {
            var owner = await users.FindByEmailAsync(request.Email?.Trim() ?? "");
            var code = Decode(request.Code);
            if (owner is null || code is null || string.IsNullOrEmpty(request.Password)) return ApiError.Bad("invalid_token");
            var result = await users.ResetPasswordAsync(owner, code, request.Password);
            return result.Succeeded ? Results.Ok(new { reset = true }) : IdentityError(result);
        });
    }

    public static string OwnerId(this HttpContext context) => context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new ApiException("unauthenticated", 401);
    private static string Origin(IConfiguration config) => (config["PublicOrigin"] ?? throw new InvalidOperationException("Configure PublicOrigin")).TrimEnd('/');
    private static string Encode(string value) => WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(value));
    private static string? Decode(string? value)
    {
        try { return value is null ? null : Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(value)); }
        catch (FormatException) { return null; }
    }
    private static IResult IdentityError(IdentityResult result) => ApiError.Bad("invalid_account", result.Errors.Select(e => e.Code).ToArray());
    public sealed record RegisterRequest(string? Email, string? Password, string? Language);
    public sealed record Credentials(string? Email, string? Password);
    public sealed record VerifyRequest(string? UserId, string? Code);
    public sealed record ForgotRequest(string? Email, string? Language);
    public sealed record ResetRequest(string? Email, string? Code, string? Password);
}
