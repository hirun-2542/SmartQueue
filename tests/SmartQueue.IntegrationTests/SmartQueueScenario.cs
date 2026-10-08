using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Xunit;

namespace SmartQueue.IntegrationTests;

/// <summary>An Owner session together with the email that identifies it, so a restarted host can sign in again.</summary>
public sealed record OwnerSession(string Email, SmartQueueClient Api);

/// <summary>
/// Reusable actors for the public application boundary. Owner accounts are created through the real
/// registration, verification and sign-in endpoints, and the verification link is picked up from the
/// local SMTP capture mailbox rather than fabricated.
/// </summary>
public static partial class SmartQueueScenario
{
    public const string Password = "QueuePass123!";

    /// <summary>Base URL of the local SMTP capture sink used to read verification and recovery links.</summary>
    public static string MailCaptureUrl { get; } = Environment.GetEnvironmentVariable("MAILPIT_URL") ?? "http://127.0.0.1:8026";

    public static async Task<OwnerSession> VerifiedOwnerAsync(SmartQueueFactory host)
    {
        var api = new SmartQueueClient(host.CreateClient());
        await api.SessionAsync();
        var email = $"owner-{Guid.NewGuid():N}@example.test";
        var registered = await api.PostAsync("/api/account/register", new { email, password = Password, language = "en" });
        Assert.Equal(HttpStatusCode.OK, registered.Status);

        var link = await VerificationLinkAsync(email, "verify");
        var verified = await api.PostAsync("/api/account/verify", new { userId = QueryValue(link.Query, "userId"), code = QueryValue(link.Query, "code") });
        Assert.Equal(HttpStatusCode.OK, verified.Status);
        return new OwnerSession(email, await SignInAsync(api, email));
    }

    /// <summary>Signs an existing Owner in again, e.g. against a host that replaced a stopped instance.</summary>
    public static async Task<SmartQueueClient> SignInAsync(SmartQueueClient api, string email)
    {
        await api.SessionAsync();
        var login = await api.PostAsync("/api/account/login", new { email, password = Password });
        Assert.Equal(HttpStatusCode.OK, login.Status);
        await api.SessionAsync();
        return api;
    }

    public static Task<SmartQueueClient> SignInAsync(SmartQueueFactory host, string email) =>
        SignInAsync(new SmartQueueClient(host.CreateClient()), email);

    /// <summary>
    /// Reads the public Customer snapshot of a Ticket link. It is a GET, so no session or CSRF token is needed
    /// and the assertion reflects exactly what a Customer browser would see.
    /// </summary>
    public static async Task<JsonElement> TicketViewAsync(HttpClient guest, string link)
    {
        using var response = await guest.GetAsync($"/api{link}");
        var text = await response.Content.ReadAsStringAsync();
        Assert.True(response.IsSuccessStatusCode, $"Customer Ticket view returned {(int)response.StatusCode}: {text}");
        using var document = JsonDocument.Parse(text);
        return document.RootElement.Clone();
    }

    /// <summary>
    /// Waits until the public Customer snapshot reports <paramref name="expected"/>, bounded so that a missing
    /// server transition fails instead of hanging. This is how a test synchronises with the background worker:
    /// the clock only moves through <c>SmartQueueCluster</c>, and the outcome is read from the public boundary.
    /// </summary>
    public static async Task<JsonElement> WaitForTicketStatusAsync(HttpClient guest, string link, string expected, int timeoutSeconds = 15)
    {
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);
        while (true)
        {
            var ticket = await TicketViewAsync(guest, link);
            var status = ticket.GetProperty("status").GetString();
            if (status == expected) return ticket;
            if (DateTime.UtcNow > deadline)
                throw new TimeoutException($"Ticket stayed {status} instead of becoming {expected} within {timeoutSeconds} s");
            await Task.Delay(50);
        }
    }

    private static async Task<Uri> VerificationLinkAsync(string email, string kind)
    {
        using var client = new HttpClient { BaseAddress = new Uri(MailCaptureUrl) };
        var deadline = DateTime.UtcNow.AddSeconds(30);
        while (true)
        {
            var listing = await client.GetFromJsonAsync<JsonElement>($"/api/v1/search?query={Uri.EscapeDataString($"to:{email}")}");
            foreach (var message in listing.GetProperty("messages").EnumerateArray())
            {
                var detail = await client.GetFromJsonAsync<JsonElement>($"/api/v1/message/{message.GetProperty("ID").GetString()}");
                var body = $"{Read(detail, "Text")} {Read(detail, "HTML")}";
                foreach (Match match in LinkPattern().Matches(body))
                {
                    var link = WebUtility.HtmlDecode(match.Value);
                    if (link.Contains($"/account/{kind}", StringComparison.Ordinal)) return new Uri(link);
                }
            }
            if (DateTime.UtcNow > deadline) throw new TimeoutException($"No {kind} email was delivered to the capture sink for {email}");
            await Task.Delay(200);
        }
    }

    private static string Read(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) ? value.GetString() ?? "" : "";

    private static string QueryValue(string query, string key) =>
        query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(part => part.Split('=', 2))
            .Where(part => part.Length == 2 && part[0] == key)
            .Select(part => Uri.UnescapeDataString(part[1]))
            .First();

    [GeneratedRegex(@"https?://[^\s<>""']+")]
    private static partial Regex LinkPattern();
}
