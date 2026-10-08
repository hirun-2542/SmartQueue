using Lib.Net.Http.WebPush;

namespace SmartQueue.Api.Push;

/// <summary>
/// The real delivery path: the client keys are turned back into a push subscription and the JSON payload is
/// encrypted and POSTed to the endpoint's push service with the VAPID identity from <see cref="VapidKeys"/>.
/// The singleton <see cref="PushServiceClient"/> never follows a redirect and never retries a 429 on its own,
/// so a hostile or misdirected endpoint cannot bounce a delivery to a second host and a busy push service
/// cannot hold a Ticket open.
/// </summary>
public sealed class LibPushDelivery(PushServiceClient client) : IPushDelivery
{
    public async Task DeliverAsync(PushEnvelope envelope, CancellationToken cancellationToken)
    {
        var subscription = new PushSubscription { Endpoint = envelope.Target.Endpoint };
        subscription.SetKey(PushEncryptionKeyName.P256DH, envelope.Target.P256dh);
        subscription.SetKey(PushEncryptionKeyName.Auth, envelope.Target.Auth);
        var message = new PushMessage(envelope.Payload) { TimeToLive = 3600, Urgency = PushMessageUrgency.High };
        await client.RequestPushMessageDeliveryAsync(subscription, message, cancellationToken);
    }
}
