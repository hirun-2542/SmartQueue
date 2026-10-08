namespace SmartQueue.Api.Demo;

/// <summary>Bound from the <c>Demo</c> configuration section (for example <c>Demo__CleanupInterval=00:05:00</c>).</summary>
public sealed class DemoOptions
{
    /// <summary>How often the server sweeps expired demo fixtures. Defaults to every 10 minutes.</summary>
    public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromMinutes(10);
}
