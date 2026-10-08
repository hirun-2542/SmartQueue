namespace SmartQueue.Api.Tickets;

public static class DeviceIdentity
{
    public static string Get(HttpContext context)
    {
        const string name = "smartqueue-device";
        if (context.Request.Cookies[name] is { } existing && Guid.TryParseExact(existing, "N", out _)) return existing;
        var device = Guid.NewGuid().ToString("N");
        context.Response.Cookies.Append(name, device, new CookieOptions
        {
            HttpOnly = true, SameSite = SameSiteMode.Strict,
            Secure = !context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment() || context.Request.IsHttps,
            MaxAge = TimeSpan.FromDays(365)
        });
        return device;
    }
}
