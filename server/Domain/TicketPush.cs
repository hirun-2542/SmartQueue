using Microsoft.EntityFrameworkCore;

namespace SmartQueue.Api.Domain;

/// <summary>
/// Push-specific state of a Ticket, kept out of the shared Ticket file.
///
/// <see cref="NearTurnNotifiedAt"/> is the durable "at most once per Ticket" guard for the near-turn
/// notification. It lives on the Ticket, not on a push association, because the rule is about the Ticket:
/// it must survive the Owner editing the Service threshold, the Customer unsubscribing and opting in again,
/// a restart, and a second API instance. It is written inside the same Shop transaction that produced the
/// notification, so the guard and the notification cannot disagree.
/// </summary>
public sealed partial class Ticket
{
    /// <summary>When this Ticket's one near-turn notification was produced; null when it has not been sent.</summary>
    public DateTimeOffset? NearTurnNotifiedAt { get; set; }
}
