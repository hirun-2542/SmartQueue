using System.Collections.Concurrent;
using System.Security.Cryptography;
using Microsoft.AspNetCore.WebUtilities;
using SmartQueue.Api.Push;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// The test delivery sink. Boundary tests observe what the application actually asked to deliver — the
/// endpoint it chose, the event and the exact payload it built — and can make the sink fail, which is how the
/// tests prove that a push service refusing a delivery never rolls back a Ticket or Queue operation. Nothing
/// about Ticket or Queue state is simulated here: the operations under test are real HTTP requests against a
/// real PostgreSQL database. A captured envelope is evidence of the policy, never of device delivery.
/// </summary>
internal sealed class TestPushSink : IPushDelivery
{
    private readonly ConcurrentQueue<PushEnvelope> captured = new();

    /// <summary>When true every delivery throws, standing in for a push service that rejects the request.</summary>
    public bool Fail { get; set; }

    public Task DeliverAsync(PushEnvelope envelope, CancellationToken cancellationToken)
    {
        captured.Enqueue(envelope);
        if (Fail) throw new InvalidOperationException("push service rejected the delivery");
        return Task.CompletedTask;
    }

    public PushEnvelope[] Captured => captured.ToArray();

    public async Task<PushEnvelope[]> WaitAsync(int count, int timeoutSeconds = 10)
    {
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);
        while (true)
        {
            var current = Captured;
            if (current.Length >= count) return current;
            if (DateTime.UtcNow > deadline)
                throw new TimeoutException($"Only {current.Length} of {count} push envelopes were delivered within {timeoutSeconds} s");
            await Task.Delay(25);
        }
    }

    /// <summary>Waits a bounded window and reports how much arrived, which is how a rolled-back change is shown to deliver nothing.</summary>
    public async Task<PushEnvelope[]> SettleAsync(int milliseconds = 1000)
    {
        await Task.Delay(milliseconds);
        return Captured;
    }
}

/// <summary>
/// A real ECDSA P-256 VAPID identity generated for one run, so the tests exercise the production signing path
/// without writing a development key file and without committing any credential.
/// </summary>
internal static class TestVapid
{
    public static (string Public, string Private) Pair()
    {
        using var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
        var parameters = ecdsa.ExportParameters(true);
        var point = new byte[65];
        point[0] = 0x04;
        parameters.Q.X!.CopyTo(point, 1);
        parameters.Q.Y!.CopyTo(point, 33);
        return (WebEncoders.Base64UrlEncode(point), WebEncoders.Base64UrlEncode(parameters.D!));
    }

    public static IReadOnlyDictionary<string, string?> Settings()
    {
        var pair = Pair();
        return new Dictionary<string, string?>
        {
            ["Push:PublicKey"] = pair.Public,
            ["Push:PrivateKey"] = pair.Private,
            ["Push:Subject"] = "mailto:push-tests@example.test",
        };
    }
}

/// <summary>Realistic browser subscription material: a 65 byte uncompressed P-256 point and a 16 byte auth secret.</summary>
internal static class TestPushClient
{
    public static (string P256dh, string Auth) Keys()
    {
        var point = new byte[65];
        point[0] = 0x04;
        Random.Shared.NextBytes(point.AsSpan(1));
        var auth = new byte[16];
        Random.Shared.NextBytes(auth);
        return (WebEncoders.Base64UrlEncode(point), WebEncoders.Base64UrlEncode(auth));
    }

    public static string Endpoint(string provider = "fcm.googleapis.com") => $"https://{provider}/fcm/send/{Guid.NewGuid():N}";
}
