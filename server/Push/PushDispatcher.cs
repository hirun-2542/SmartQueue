using System.Threading.Channels;

namespace SmartQueue.Api.Push;

/// <summary>Delivers one already-built envelope to its push service. Replaced by a test sink in boundary tests.</summary>
public interface IPushDelivery
{
    Task DeliverAsync(PushEnvelope envelope, CancellationToken cancellationToken);
}

/// <summary>
/// The hand-off between a committing Shop transaction and the network. A transaction only ever writes here
/// after it committed, so no push can be produced for a Ticket or Queue change that rolled back, and the
/// delivery itself never runs inside the Shop lock or inside PostgreSQL. The queue is in-process and
/// best-effort: there is no retry, broker or outbox, because a missing notification is an accepted outcome
/// and must never postpone or undo a Ticket.
/// </summary>
public sealed class PushDispatcher
{
    private readonly Channel<PushEnvelope> channel = Channel.CreateUnbounded<PushEnvelope>(new UnboundedChannelOptions { SingleReader = true, SingleWriter = false });

    public void Enqueue(IReadOnlyList<PushEnvelope> envelopes)
    {
        foreach (var envelope in envelopes) channel.Writer.TryWrite(envelope);
    }

    internal ChannelReader<PushEnvelope> Reader => channel.Reader;
}

/// <summary>
/// Drains the dispatcher and calls the delivery implementation. A failure is logged and dropped: it can
/// never reach back into the Ticket that produced it.
/// </summary>
public sealed class PushDeliveryWorker(PushDispatcher dispatcher, IPushDelivery delivery, ILogger<PushDeliveryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await foreach (var envelope in dispatcher.Reader.ReadAllAsync(stoppingToken))
            {
                try
                {
                    await delivery.DeliverAsync(envelope, stoppingToken);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                {
                    return;
                }
                catch (Exception error)
                {
                    logger.LogWarning(error, "Push delivery for Ticket {TicketId} failed and does not affect the Ticket", envelope.TicketId);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Host shutdown; the channel is best-effort by design.
        }
    }
}
