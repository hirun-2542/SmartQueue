using System.Net;
using System.Text.Json;
using Xunit;

namespace SmartQueue.IntegrationTests;

public sealed class CommandScopeTests : IAsyncLifetime
{
    private readonly SmartQueueCluster cluster=new();
    public Task InitializeAsync()=>cluster.InitializeAsync();
    public Task DisposeAsync()=>cluster.DisposeAsync();

    [Fact]
    public async Task Customer_notification_changes_do_not_invalidate_the_Owner_close_snapshot()
    {
        var owner=await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);var shop=await owner.Api.PostAsync("/api/shops",new{name="Subscription concurrency"});var shopId=shop.Body.GetProperty("id").GetGuid();var queue=await Queue(owner.Api,shopId,"A");
        var guest=new SmartQueueClient(cluster.Host.CreateClient());await guest.SessionAsync();var joined=await guest.PostAsync($"/api/queues/{queue}/tickets",new{requestId=Guid.NewGuid()});var link=joined.Body.GetProperty("link").GetString();
        var observed=await owner.Api.GetAsync($"/api/shops/{shopId}/console?queueId={queue}");var keys=TestPushClient.Keys();var endpoint=TestPushClient.Endpoint();
        Assert.Equal(HttpStatusCode.OK,(await guest.PostAsync("/api"+link+"/push",new{endpoint,p256dh=keys.P256dh,auth=keys.Auth,language="th"})).Status);
        Assert.Equal(HttpStatusCode.OK,(await guest.PostAsync("/api"+link+"/push",new{endpoint,p256dh=keys.P256dh,auth=keys.Auth,language="en"})).Status);
        Assert.Equal(HttpStatusCode.OK,(await guest.PostAsync("/api"+link+"/push/remove",new{endpoint})).Status);
        var stopped=await owner.Api.PostAsync($"/api/queues/{queue}/stop",new{version=observed.GetProperty("version").GetInt64()});Assert.Equal(HttpStatusCode.OK,stopped.Status);Assert.Equal("Closing",stopped.Body.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Call_next_accepts_independent_receiving_in_another_Queue_and_keeps_the_atomic_hold()
    {
        var owner=await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);var shop=await owner.Api.PostAsync("/api/shops",new{name="Independent commands"});var shopId=shop.Body.GetProperty("id").GetGuid();var first=await Queue(owner.Api,shopId,"A");var second=await Queue(owner.Api,shopId,"B");
        var guest=new SmartQueueClient(cluster.Host.CreateClient());await guest.SessionAsync();var firstTicket=await guest.PostAsync($"/api/queues/{first}/tickets",new{requestId=Guid.NewGuid()});await owner.Api.GetAsync($"/api/shops/{shopId}/console?queueId={first}");await guest.PostAsync($"/api/queues/{second}/tickets",new{requestId=Guid.NewGuid()});
        var called=await owner.Api.PostAsync($"/api/queues/{first}/call",new{});Assert.Equal(HttpStatusCode.OK,called.Status);Assert.Equal(firstTicket.Body.GetProperty("ticket").GetProperty("id").GetGuid(),called.Body.GetProperty("id").GetGuid());
        var otherCall=await owner.Api.PostAsync($"/api/queues/{second}/call",new{});Assert.Equal(HttpStatusCode.Conflict,otherCall.Status);Assert.Equal("shop_busy",otherCall.Body.GetProperty("code").GetString());
    }

    private static async Task<Guid> Queue(SmartQueueClient api,Guid shop,string prefix){var result=await api.PostAsync($"/api/shops/{shop}/services",new{name=prefix,prefix,callTimeoutMinutes=10,nearTurnThreshold=2});Assert.Equal(HttpStatusCode.Created,result.Status);var queue=result.Body.GetProperty("queue").GetProperty("id").GetGuid();Assert.Equal(HttpStatusCode.OK,(await api.PostAsync($"/api/queues/{queue}/open",new{})).Status);return queue;}
}
