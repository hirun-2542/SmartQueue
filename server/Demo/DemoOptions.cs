namespace SmartQueue.Api.Demo;

/// <summary>Bound from the <c>Demo</c> configuration section (for example <c>Demo__SessionLifetime=04:00:00</c>).</summary>
public sealed class DemoOptions
{
    /// <summary>How long a Try demo session and its fixture stay reachable. Defaults to 24 hours, the value shown to the interviewer.</summary>
    public TimeSpan SessionLifetime { get; set; } = TimeSpan.FromHours(24);

    /// <summary>How often the server sweeps expired demo fixtures. Defaults to every 10 minutes.</summary>
    public TimeSpan CleanupInterval { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>Sweep expired demo fixtures once at startup before the first interval elapses.</summary>
    public bool CleanupOnStartup { get; set; } = true;
}
