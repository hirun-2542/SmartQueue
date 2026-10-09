using System.Net;
using System.Text.Json;
using Xunit;

namespace SmartQueue.IntegrationTests;

public sealed class ExpiryAndEstimateTests : IAsyncLifetime
{
    private readonly SmartQueueCluster cluster = new(TimeSpan.FromHours(1), DateTimeOffset.Parse("2026-10-09T02:00:00.000Z"));
    public Task InitializeAsync()=>cluster.InitializeAsync();
    public Task DisposeAsync()=>cluster.DisposeAsync();

    [Fact]
    public async Task Terminal_bearer_and_request_replay_expire_at_the_actual_24_hour_boundary()
    {
        var owner=await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var queue=await CreateQueue(owner.Api,"Link boundary","A");
        using var http=cluster.Host.CreateClient();var guest=new SmartQueueClient(http);await guest.SessionAsync();var requestId=Guid.NewGuid();
        var issued=await guest.PostAsync($"/api/queues/{queue.QueueId}/tickets",new{requestId});Assert.Equal(HttpStatusCode.Created,issued.Status);
        var link=issued.Body.GetProperty("link").GetString()!;
        var ended=await guest.PostAsync($"/api{link}/cancel",new{version=issued.Body.GetProperty("ticket").GetProperty("version").GetInt64()});Assert.Equal(HttpStatusCode.OK,ended.Status);
        cluster.Jump(TimeSpan.FromHours(24)-TimeSpan.FromMilliseconds(1));
        Assert.Equal(HttpStatusCode.OK,(await http.GetAsync("/api"+link)).StatusCode);
        cluster.Jump(TimeSpan.FromMilliseconds(1));
        Assert.Equal(HttpStatusCode.Gone,(await http.GetAsync("/api"+link)).StatusCode);
        Assert.Equal(HttpStatusCode.Gone,(await guest.PostAsync($"/api/queues/{queue.QueueId}/tickets",new{requestId})).Status);
    }

    [Fact]
    public async Task Estimate_uses_literal_durations_from_latest_twenty_and_counts_zero_duration_measurements()
    {
        var owner=await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var queue=await CreateQueue(owner.Api,"Window proof","A");
        using var http=cluster.Host.CreateClient();var guest=new SmartQueueClient(http);await guest.SessionAsync();
        await Serve(owner.Api,guest,queue,TimeSpan.FromMinutes(10));
        for(var i=0;i<20;i++)await Serve(owner.Api,guest,queue,TimeSpan.FromMinutes(1));
        await guest.PostAsync($"/api/queues/{queue.QueueId}/tickets",new{requestId=Guid.NewGuid(),confirmExtra=true});
        var tail=await guest.PostAsync($"/api/queues/{queue.QueueId}/tickets",new{requestId=Guid.NewGuid(),confirmExtra=true});
        var snapshot=await guest.GetAsync("/api"+tail.Body.GetProperty("link").GetString());
        Assert.Equal(20,snapshot.GetProperty("estimateSampleCount").GetInt32());Assert.Equal(1,snapshot.GetProperty("ticketsAhead").GetInt32());Assert.Equal(60d,snapshot.GetProperty("estimatedWaitSeconds").GetDouble());
        var zero=await CreateQueue(owner.Api,"Zero measurements","Z");
        for(var i=0;i<5;i++)await Serve(owner.Api,guest,zero,TimeSpan.Zero);
        await guest.PostAsync($"/api/queues/{zero.QueueId}/tickets",new{requestId=Guid.NewGuid(),confirmExtra=true});
        var zeroTail=await guest.PostAsync($"/api/queues/{zero.QueueId}/tickets",new{requestId=Guid.NewGuid(),confirmExtra=true});
        var zeroView=await guest.GetAsync("/api"+zeroTail.Body.GetProperty("link").GetString());
        Assert.Equal(5,zeroView.GetProperty("estimateSampleCount").GetInt32());Assert.Equal(0d,zeroView.GetProperty("estimatedWaitSeconds").GetDouble());
    }

    [Fact]
    public async Task Demo_expires_after_24_hours_and_cleanup_preserves_real_Owner_data()
    {
        var real=await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);var realQueue=await CreateQueue(real.Api,"Real Shop","R");
        using var firstHttp=cluster.Host.CreateClient();var first=new SmartQueueClient(firstHttp);await first.SessionAsync();var firstDemo=await first.PostAsync("/api/demo/session",new{});Assert.Equal(HttpStatusCode.Created,firstDemo.Status);await first.SessionAsync();
        using var secondHttp=cluster.Host.CreateClient();var second=new SmartQueueClient(secondHttp);await second.SessionAsync();var secondDemo=await second.PostAsync("/api/demo/session",new{});Assert.Equal(HttpStatusCode.Created,secondDemo.Status);await second.SessionAsync();
        var firstPublic=firstDemo.Body.GetProperty("shop").GetProperty("publicId").GetString();
        Assert.Equal(cluster.Clock.GetUtcNow().AddHours(24),firstDemo.Body.GetProperty("expiresAt").GetDateTimeOffset());
        cluster.Jump(TimeSpan.FromHours(24)-TimeSpan.FromMilliseconds(1));
        Assert.Equal(HttpStatusCode.OK,(await firstHttp.GetAsync("/api/shops")).StatusCode);
        cluster.Jump(TimeSpan.FromMilliseconds(1));
        Assert.Equal(HttpStatusCode.Unauthorized,(await firstHttp.GetAsync("/api/shops")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,(await secondHttp.GetAsync("/api/shops")).StatusCode);
        Assert.Equal(JsonValueKind.Null,(await first.SessionAsync()).GetProperty("owner").ValueKind);
        await SmartQueueCluster.SettleAsync();
        await WaitForGone(firstHttp,"/api/s/"+firstPublic);
        var retained=await real.Api.PostAsync($"/api/shops/{realQueue.ShopId}/services",new{name="Still owned",prefix="S",callTimeoutMinutes=10,nearTurnThreshold=2});
        Assert.Equal(HttpStatusCode.Created,retained.Status);
        Assert.Equal(realQueue.ShopId,(await real.Api.GetAsync($"/api/shops/{realQueue.ShopId}")).GetProperty("id").GetGuid());
    }

    private async Task Serve(SmartQueueClient owner,SmartQueueClient guest,QueueFixture queue,TimeSpan duration)
    {
        var joined=await guest.PostAsync($"/api/queues/{queue.QueueId}/tickets",new{requestId=Guid.NewGuid(),confirmExtra=true});Assert.Equal(HttpStatusCode.Created,joined.Status);
        var call=await owner.PostAsync($"/api/queues/{queue.QueueId}/call",new{});Assert.Equal(HttpStatusCode.OK,call.Status);
        var id=call.Body.GetProperty("id").GetGuid();var start=await owner.PostAsync($"/api/tickets/{id}/start",new{version=call.Body.GetProperty("version").GetInt64()});Assert.Equal(HttpStatusCode.OK,start.Status);
        cluster.Jump(duration);
        Assert.Equal(HttpStatusCode.OK,(await owner.PostAsync($"/api/tickets/{id}/complete",new{version=start.Body.GetProperty("version").GetInt64()})).Status);
    }
    private static async Task<QueueFixture> CreateQueue(SmartQueueClient owner,string name,string prefix)
    {
        var shop=await owner.PostAsync("/api/shops",new{name});Assert.Equal(HttpStatusCode.Created,shop.Status);var shopId=shop.Body.GetProperty("id").GetGuid();
        var service=await owner.PostAsync($"/api/shops/{shopId}/services",new{name="Service",prefix,callTimeoutMinutes=10,nearTurnThreshold=2});Assert.Equal(HttpStatusCode.Created,service.Status);var queueId=service.Body.GetProperty("queue").GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK,(await owner.PostAsync($"/api/queues/{queueId}/open",new{})).Status);return new(shopId,queueId);
    }
    private static async Task WaitForGone(HttpClient client,string path)
    {
        var end=DateTime.UtcNow.AddSeconds(15);while(DateTime.UtcNow<end){using var response=await client.GetAsync(path);if(response.StatusCode==HttpStatusCode.NotFound)return;await Task.Delay(50);}throw new TimeoutException("Expired demo fixture was not cleaned up");
    }
    private sealed record QueueFixture(Guid ShopId,Guid QueueId);
}
