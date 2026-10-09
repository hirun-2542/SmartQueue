using System.Text.Json;

namespace SmartQueue.Api.Push;

/// <summary>The three notification events a Ticket can raise. Near-turn and Called are separate events, and a Drop is its own event.</summary>
public static class PushEvents
{
    public const string NearTurn = "near_turn";
    public const string Called = "called";
    public const string Dropped = "dropped";
}

/// <summary>Where to deliver: exactly the fields a push service needs, captured from the association.</summary>
public sealed record PushTarget(string Endpoint, string P256dh, string Auth);

/// <summary>
/// The JSON a service worker receives. It carries the opaque Ticket id so the worker can look the private
/// Ticket link up in its own storage, the event and the public Ticket number. It never carries the Ticket
/// link secret, a Customer note or an Owner capability.
/// </summary>
public sealed record PushPayload(Guid TicketId, string Event, string Number, string Language);

/// <summary>One delivery ready to be handed to the dispatcher after the transaction that produced it committed.</summary>
public sealed record PushEnvelope(PushTarget Target, Guid TicketId, string Payload);

public static class PushMessages
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static PushEnvelope Create(PushTarget target, Guid ticketId, string number, string @event, string language) =>
        new(target,ticketId,JsonSerializer.Serialize(new PushPayload(ticketId,@event,number,language),Json));
}
