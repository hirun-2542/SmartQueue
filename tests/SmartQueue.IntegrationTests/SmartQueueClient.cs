using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace SmartQueue.IntegrationTests;

/// <summary>
/// Cookie- and CSRF-aware HTTP helper for one browser session: an authenticated Owner or an anonymous
/// Customer. Mutations send the antiforgery token issued by <c>/api/session</c>, exactly like the SPA.
/// </summary>
public sealed class SmartQueueClient(HttpClient http)
{
    public string Csrf { get; private set; } = "";

    public async Task<JsonElement> SessionAsync()
    {
        var session = await GetAsync("/api/session");
        Csrf = session.GetProperty("csrf").GetString() ?? "";
        return session;
    }

    public async Task<JsonElement> GetAsync(string path)
    {
        using var response = await http.GetAsync(path);
        return await ReadAsync(response, path);
    }

    public Task<(HttpStatusCode Status, JsonElement Body)> PostAsync(string path, object? body = null) =>
        SendAsync(HttpMethod.Post, path, body);

    public Task<(HttpStatusCode Status, JsonElement Body)> PutAsync(string path, object? body = null) =>
        SendAsync(HttpMethod.Put, path, body);

    private async Task<(HttpStatusCode Status, JsonElement Body)> SendAsync(HttpMethod method, string path, object? body)
    {
        using var request = new HttpRequestMessage(method, path)
        {
            Content = body is null ? new StringContent("", Encoding.UTF8, "application/json") : JsonContent.Create(body),
        };
        if (Csrf.Length > 0) request.Headers.Add("X-CSRF", Csrf);
        using var response = await http.SendAsync(request);
        return (response.StatusCode, await ReadAsync(response, path));
    }

    private static async Task<JsonElement> ReadAsync(HttpResponseMessage response, string path)
    {
        var text = await response.Content.ReadAsStringAsync();
        if (string.IsNullOrWhiteSpace(text))
            throw new InvalidOperationException($"{path} returned {(int)response.StatusCode} with an empty body");
        try
        {
            using var document = JsonDocument.Parse(text);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            throw new InvalidOperationException($"{path} returned {(int)response.StatusCode} with a non-JSON body: {text}");
        }
    }
}
