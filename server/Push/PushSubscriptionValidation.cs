using Microsoft.AspNetCore.WebUtilities;

namespace SmartQueue.Api.Push;

/// <summary>
/// Validation for everything a browser hands the API at opt-in. A push endpoint is an outbound destination
/// the server will POST to, so it is treated as untrusted input: only HTTPS on the default port, no
/// userinfo, no IP literal and only the four public push providers a real browser can return are accepted,
/// which is what keeps the delivery path from becoming an anonymous SSRF primitive. Client keys are checked
/// to be the shapes the Web Push encryption expects, so a malformed subscription is refused at opt-in rather
/// than failing later inside the delivery worker.
/// </summary>
public static class PushSubscriptionValidation
{
    public const int MaxEndpointLength = 1024;

    private static readonly string[] TrustedPushHosts =
    [
        "fcm.googleapis.com",
        "push.services.mozilla.com",
        "push.apple.com",
        "notify.windows.com",
    ];

    public static string RequireEndpoint(string? endpoint)
    {
        var value = endpoint?.Trim();
        if (string.IsNullOrEmpty(value) || value.Length > MaxEndpointLength) throw Invalid("push_endpoint_invalid");
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)) throw Invalid("push_endpoint_invalid");
        if (uri.Scheme != Uri.UriSchemeHttps) throw Invalid("push_endpoint_invalid");
        if (uri.Port != 443) throw Invalid("push_endpoint_invalid");
        if (!string.IsNullOrEmpty(uri.UserInfo)) throw Invalid("push_endpoint_invalid");
        if (uri.HostNameType != UriHostNameType.Dns) throw Invalid("push_endpoint_invalid");
        if (!IsTrustedHost(uri.Host)) throw Invalid("push_endpoint_invalid");
        return value;
    }

    public static (string P256dh, string Auth) RequireKeys(string? p256dh, string? auth)
    {
        var key = p256dh?.Trim();
        var secret = auth?.Trim();
        if (!PushKeys.TryDecodePublicKey(key, out _)) throw Invalid("push_keys_invalid");
        if (!PushKeys.TryDecodeAuth(secret, out _)) throw Invalid("push_keys_invalid");
        return (key!, secret!);
    }

    public static string RequireLanguage(string? language) => language == "en" ? "en" : "th";

    /// <summary>True when <paramref name="host"/> is one of the public push providers a supported browser uses.</summary>
    public static bool IsTrustedHost(string host) =>
        TrustedPushHosts.Any(trusted => host.Equals(trusted, StringComparison.OrdinalIgnoreCase) || host.EndsWith("." + trusted, StringComparison.OrdinalIgnoreCase));

    private static ApiException Invalid(string code) => new(code, 400);
}

/// <summary>Decoding helpers shared by opt-in validation and the VAPID identity check.</summary>
public static class PushKeys
{
    /// <summary>The uncompressed P-256 public point a browser sends as <c>p256dh</c>: 65 bytes beginning with 0x04.</summary>
    public static bool TryDecodePublicKey(string? value, out byte[] point)
    {
        point = [];
        if (!TryDecode(value, 65, out var bytes)) return false;
        if (bytes[0] != 0x04) return false;
        point = bytes;
        return true;
    }

    /// <summary>The 32 byte P-256 scalar used as the VAPID private key.</summary>
    public static bool TryDecodePrivateKey(string? value, out byte[] scalar) =>
        TryDecode(value, 32, out scalar);

    /// <summary>The 16 byte authentication secret a browser sends as <c>auth</c>.</summary>
    public static bool TryDecodeAuth(string? value, out byte[] secret) =>
        TryDecode(value, 16, out secret);

    private static bool TryDecode(string? value, int length, out byte[] bytes)
    {
        bytes = [];
        if (string.IsNullOrWhiteSpace(value)) return false;
        var decoded = TryBase64Url(value) ?? TryBase64(value);
        if (decoded is null || decoded.Length != length) return false;
        bytes = decoded;
        return true;
    }

    private static byte[]? TryBase64Url(string value)
    {
        try { return WebEncoders.Base64UrlDecode(value); }
        catch (Exception error) when (error is FormatException or ArgumentException) { return null; }
    }

    private static byte[]? TryBase64(string value)
    {
        try { return Convert.FromBase64String(value); }
        catch (Exception error) when (error is FormatException or ArgumentException) { return null; }
    }
}
