using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace SmartQueue.Api.Push;

/// <summary>Configuration for optional Web Push, bound from the "Push" section.</summary>
public sealed class PushOptions
{
    public const string SectionName = "Push";

    /// <summary>VAPID public key (base64url, uncompressed P-256 point). Required in production.</summary>
    public string? PublicKey { get; set; }

    /// <summary>VAPID private key (base64url, P-256 scalar). Required in production.</summary>
    public string? PrivateKey { get; set; }

    /// <summary>VAPID contact, a <c>mailto:</c> or <c>https:</c> value the push service can use.</summary>
    public string Subject { get; set; } = "mailto:push@smartqueue.local";

    /// <summary>Where a Development instance persists the generated key pair. Defaults next to the Data Protection keys.</summary>
    public string? VapidKeyPath { get; set; }
}

/// <summary>
/// The VAPID identity the API signs its push requests with. In Development a real ECDSA P-256 key pair is
/// generated once and persisted to a file with owner-only permissions, so every local instance and restart
/// presents the same application server key to FCM, Mozilla, Apple and Windows and a browser subscription
/// stays valid. Creation is race-safe: the first writer wins and every other caller reads that same pair.
/// In any other environment the pair must be supplied explicitly; when it is absent, Web Push reports itself
/// unavailable instead of quietly generating a throwaway identity per process.
/// </summary>
public sealed class VapidKeys
{
    private VapidKeys(string? publicKey, string? privateKey, string subject)
    {
        PublicKey = publicKey; PrivateKey = privateKey; Subject = subject;
    }

    public string? PublicKey { get; }
    public string? PrivateKey { get; }
    public string Subject { get; }
    public bool Configured => PublicKey is not null && PrivateKey is not null;

    public static VapidKeys Resolve(PushOptions options, bool development)
    {
        var subject = string.IsNullOrWhiteSpace(options.Subject) ? "mailto:push@smartqueue.local" : options.Subject;
        var hasPublic = !string.IsNullOrWhiteSpace(options.PublicKey);
        var hasPrivate = !string.IsNullOrWhiteSpace(options.PrivateKey);

        if (hasPublic || hasPrivate)
        {
            if (!hasPublic || !hasPrivate)
                throw new InvalidOperationException("Push:PublicKey and Push:PrivateKey must be configured together.");
            if (!PushKeys.TryDecodePublicKey(options.PublicKey, out _))
                throw new InvalidOperationException("Push:PublicKey must be a base64url uncompressed P-256 point.");
            if (!PushKeys.TryDecodePrivateKey(options.PrivateKey, out _))
                throw new InvalidOperationException("Push:PrivateKey must be a base64url P-256 private scalar.");
            return new(options.PublicKey, options.PrivateKey, subject);
        }

        if (!development) return new(null, null, subject);
        var pair = LoadOrCreate(KeyPath(options));
        return new(pair.PublicKey, pair.PrivateKey, subject);
    }

    private static string KeyPath(PushOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.VapidKeyPath)) return options.VapidKeyPath!;
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "smartqueue", "keys");
        return Path.Combine(directory, "vapid.json");
    }

    private static (string PublicKey, string PrivateKey) LoadOrCreate(string path)
    {
        if (TryRead(path, out var existing)) return existing;
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(directory)) Directory.CreateDirectory(directory);
        var generated = Generate();
        try
        {
            using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                JsonSerializer.Serialize(stream, new Stored(generated.PublicKey, generated.PrivateKey));
                stream.Flush(true);
            }
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            return generated;
        }
        catch (IOException)
        {
            // Another instance created the file between the read and the create; its pair is the shared one.
            if (TryRead(path, out var raced)) return raced;
            throw;
        }
    }

    private static bool TryRead(string path, out (string PublicKey, string PrivateKey) pair)
    {
        pair = default;
        try
        {
            if (!File.Exists(path)) return false;
            var stored = JsonSerializer.Deserialize<Stored>(File.ReadAllText(path));
            if (stored?.PublicKey is null || stored.PrivateKey is null) return false;
            if (!PushKeys.TryDecodePublicKey(stored.PublicKey, out _) || !PushKeys.TryDecodePrivateKey(stored.PrivateKey, out _)) return false;
            pair = (stored.PublicKey, stored.PrivateKey);
            return true;
        }
        catch (Exception error) when (error is IOException or JsonException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static (string PublicKey, string PrivateKey) Generate()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parameters = ecdsa.ExportParameters(true);
        var point = new byte[65];
        point[0] = 0x04;
        parameters.Q.X!.CopyTo(point, 1);
        parameters.Q.Y!.CopyTo(point, 33);
        return (WebEncoders.Base64UrlEncode(point), WebEncoders.Base64UrlEncode(parameters.D!));
    }

    private sealed record Stored(string PublicKey, string PrivateKey);
}
