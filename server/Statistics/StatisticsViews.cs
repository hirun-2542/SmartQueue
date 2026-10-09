using SmartQueue.Api.Domain;

namespace SmartQueue.Api.Statistics;

/// <summary>
/// Turns one resolved selection and its Ticket rows into the numbers an Owner reads. The definitions are the
/// ones the spec fixes:
/// <list type="bullet">
/// <item><b>Issued</b> counts every Ticket issued into the selected Business days, both Customer and Walk-in
/// origins, whether or not it has finished.</item>
/// <item><b>Average wait</b> is CalledAt − ReceivedAt over Tickets that have ever been Called, including ones
/// that later Skipped, Cancelled or are still in service. A Waiting Ticket and a Ticket Cancelled or Dropped
/// before any Call has no measurement and never contributes; <c>WaitSampleCount</c> says how many did.</item>
/// <item><b>Average service</b> is EndedAt − StartedAt over Completed Tickets only, and only when both real
/// timestamps exist with EndedAt on or after StartedAt. A zero-duration Completed job is a real measurement
/// and counts; Skipped, Cancelled, Dropped and unfinished InService work never invent a duration.</item>
/// <item><b>Outcomes</b> Completed, Skipped, Cancelled and Dropped are reported separately. Skipped and
/// Cancelled rates divide by the terminal Tickets in the selection (Completed + Skipped + Cancelled + Dropped);
/// Waiting, Called and InService stay out of the denominator and are reported as <c>Pending</c>.</item>
/// <item>An average or a rate with no measurement is <c>null</c>, never a fabricated zero, so a missing
/// measurement can never be read as a 0-minute wait. A zero-valued average or rate that was really measured
/// stays 0.</item>
/// </list>
/// </summary>
public static class StatisticsViews
{
    public static StatisticsDto Compute(StatisticsSelectionResult selection, TicketRow[] tickets, DateTimeOffset serverTime)
    {
        int issued = tickets.Length, completed = 0, skipped = 0, cancelled = 0, dropped = 0, pending = 0;
        int waitSamples = 0, serviceSamples = 0;
        double waitSeconds = 0, serviceSeconds = 0;
        var issuedByDay=new Dictionary<Guid,int>(selection.BusinessDays.Length);

        foreach (var ticket in tickets)
        {
            issuedByDay[ticket.BusinessDayId]=issuedByDay.GetValueOrDefault(ticket.BusinessDayId)+1;
            switch (ticket.Status)
            {
                case TicketStatus.Completed: completed++; break;
                case TicketStatus.Skipped: skipped++; break;
                case TicketStatus.Cancelled: cancelled++; break;
                case TicketStatus.Dropped: dropped++; break;
                default: pending++; break;
            }

            if (ticket.CalledAt is { } calledAt)
            {
                waitSeconds += (calledAt - ticket.ReceivedAt).TotalSeconds;
                waitSamples++;
            }

            if (ticket.Status == TicketStatus.Completed
                && ticket.StartedAt is { } startedAt
                && ticket.EndedAt is { } endedAt
                && endedAt >= startedAt)
            {
                serviceSeconds += (endedAt - startedAt).TotalSeconds;
                serviceSamples++;
            }
        }

        var terminal = completed + skipped + cancelled + dropped;
        return new StatisticsDto(
            selection.ShopId,
            selection.Range,
            selection.ServiceId,
            selection.ServiceName,
            issued, completed, skipped, cancelled, dropped, pending, terminal,
            waitSamples == 0 ? (double?)null : waitSeconds / waitSamples, waitSamples,
            serviceSamples == 0 ? (double?)null : serviceSeconds / serviceSamples, serviceSamples,
            terminal == 0 ? (double?)null : (double)skipped / terminal,
            terminal == 0 ? (double?)null : (double)cancelled / terminal,
            selection.BusinessDays.Length,
            selection.BusinessDays.Select(day => new StatisticsBusinessDayDto(day.Id, day.QueueId, day.ServiceId, day.ServiceName, day.OpenedAt, day.ClosedAt,issuedByDay.GetValueOrDefault(day.Id))).ToArray(),
            selection.Services.Select(service => new StatisticsServiceDto(service.Id, service.Name, service.Prefix, service.Archived)).ToArray(),
            serverTime);
    }
}

/// <summary>
/// Statistics for one owned Shop, optional Service and Business day range. <c>AverageWaitSeconds</c>,
/// <c>AverageServiceSeconds</c>, <c>SkippedRate</c> and <c>CancelledRate</c> are null when nothing was
/// measured; rates are fractions of the terminal Tickets, so a consumer formats them as percentages.
/// </summary>
public sealed record StatisticsDto(
    Guid ShopId,
    string Range,
    Guid? ServiceId,
    string? ServiceName,
    int Issued,
    int Completed,
    int Skipped,
    int Cancelled,
    int Dropped,
    int Pending,
    int Terminal,
    double? AverageWaitSeconds,
    int WaitSampleCount,
    double? AverageServiceSeconds,
    int ServiceSampleCount,
    double? SkippedRate,
    double? CancelledRate,
    int BusinessDayCount,
    StatisticsBusinessDayDto[] BusinessDays,
    StatisticsServiceDto[] Services,
    DateTimeOffset ServerTime);

/// <summary>One Business day round that was counted; <c>ClosedAt</c> is null while the round is still running.</summary>
public sealed record StatisticsBusinessDayDto(Guid Id, Guid QueueId, Guid ServiceId, string ServiceName, DateTimeOffset OpenedAt, DateTimeOffset? ClosedAt,int Issued);

/// <summary>One Service of the Shop; an archived Service keeps its history in the aggregates.</summary>
public sealed record StatisticsServiceDto(Guid Id, string Name, string Prefix, bool Archived);
