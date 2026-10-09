using System.Net;
using System.Text.Json;
using Xunit;

namespace SmartQueue.IntegrationTests;

public sealed class DemandTests : IAsyncLifetime
{
    private readonly SmartQueueCluster cluster=new(pollInterval:TimeSpan.FromHours(1),now:new DateTimeOffset(2026,10,8,16,59,0,TimeSpan.Zero));
    public Task InitializeAsync()=>cluster.InitializeAsync();
    public Task DisposeAsync()=>cluster.DisposeAsync();

    [Fact]
    public async Task Demand_uses_Bangkok_receive_time_for_both_origins_not_the_later_Call_and_Complete()
    {
        var owner=await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);
        var shop=await owner.Api.PostAsync("/api/shops",new{name="Bangkok demand"});Assert.Equal(HttpStatusCode.Created,shop.Status);var id=shop.Body.GetProperty("id").GetGuid();
        var cut=await Service(owner.Api,id,"Cut","A");var wash=await Service(owner.Api,id,"Wash","B");
        using var guestHttp=cluster.Host.CreateClient();var guest=new SmartQueueClient(guestHttp);await guest.SessionAsync();
        await Join(guest,cut.Queue);
        cluster.Jump(TimeSpan.FromMinutes(1));await Join(guest,cut.Queue);
        cluster.Jump(TimeSpan.FromHours(1));Assert.Equal(HttpStatusCode.Created,(await owner.Api.PostAsync($"/api/queues/{cut.Queue}/walkin",new{note="private demand"})).Status);await Join(guest,wash.Queue);
        cluster.Jump(TimeSpan.FromHours(2));var called=await owner.Api.PostAsync($"/api/queues/{cut.Queue}/call",new{});Assert.Equal(HttpStatusCode.OK,called.Status);
        var started=await owner.Api.PostAsync($"/api/tickets/{called.Body.GetProperty("id").GetGuid()}/start",new{version=called.Body.GetProperty("version").GetInt64()});Assert.Equal(HttpStatusCode.OK,started.Status);
        Assert.Equal(HttpStatusCode.OK,(await owner.Api.PostAsync($"/api/tickets/{called.Body.GetProperty("id").GetGuid()}/complete",new{version=started.Body.GetProperty("version").GetInt64()})).Status);
        using var ownHttp=cluster.Host.CreateClient();var own=await SmartQueueScenario.SignInAsync(new SmartQueueClient(ownHttp),owner.Email);
        using var response=await ownHttp.GetAsync($"/api/shops/{id}/demand?range=current");Assert.Equal(HttpStatusCode.OK,response.StatusCode);var data=await Json(response);
        Assert.Equal(4,data.GetProperty("issued").GetInt32());Assert.Equal("Asia/Bangkok",data.GetProperty("timeZone").GetString());
        var hours=data.GetProperty("hourly");Assert.Equal(1,hours[23].GetInt32());Assert.Equal(1,hours[0].GetInt32());Assert.Equal(2,hours[1].GetInt32());Assert.Equal(0,hours[3].GetInt32());
        var week=data.GetProperty("weekdayHours");Assert.Equal(1,week[3][23].GetInt32());Assert.Equal(1,week[4][0].GetInt32());Assert.Equal(2,week[4][1].GetInt32());Assert.Equal(new[]{1},data.GetProperty("peakHours").EnumerateArray().Select(x=>x.GetInt32()).ToArray());
        var cutData=await own.GetAsync($"/api/shops/{id}/demand?range=current&serviceId={cut.Service}");Assert.Equal(3,cutData.GetProperty("issued").GetInt32());Assert.Equal(1,cutData.GetProperty("hourly")[1].GetInt32());
        var washData=await own.GetAsync($"/api/shops/{id}/demand?range=current&serviceId={wash.Service}");Assert.Equal(1,washData.GetProperty("issued").GetInt32());Assert.Equal(1,washData.GetProperty("hourly")[1].GetInt32());
        var serialized=data.GetRawText();Assert.DoesNotContain("private demand",serialized);Assert.DoesNotContain("linkHash",serialized);
        var second=await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);using var secondHttp=cluster.Host.CreateClient();await SmartQueueScenario.SignInAsync(new SmartQueueClient(secondHttp),second.Email);Assert.Equal(HttpStatusCode.NotFound,(await secondHttp.GetAsync($"/api/shops/{id}/demand")).StatusCode);
        using var anon=cluster.Host.CreateClient();Assert.Equal(HttpStatusCode.Unauthorized,(await anon.GetAsync($"/api/shops/{id}/demand")).StatusCode);
    }

    [Fact]
    public async Task Quiet_and_reopened_rounds_use_the_shared_Business_day_selection_without_duplicates()
    {
        var owner=await SmartQueueScenario.VerifiedOwnerAsync(cluster.Host);var shop=await owner.Api.PostAsync("/api/shops",new{name="Demand rounds"});var id=shop.Body.GetProperty("id").GetGuid();var service=await Service(owner.Api,id,"Repair","R");
        using var http=cluster.Host.CreateClient();var api=await SmartQueueScenario.SignInAsync(new SmartQueueClient(http),owner.Email);
        var empty=await api.GetAsync($"/api/shops/{id}/demand?range=current");Assert.Equal(0,empty.GetProperty("issued").GetInt32());Assert.Empty(empty.GetProperty("peakHours").EnumerateArray());Assert.All(empty.GetProperty("hourly").EnumerateArray(),x=>Assert.Equal(0,x.GetInt32()));
        var first=await Join(api,service.Queue);var console=await api.GetAsync($"/api/shops/{id}/console?queueId={service.Queue}");Assert.Equal(HttpStatusCode.OK,(await api.PostAsync($"/api/queues/{service.Queue}/drop",new{version=console.GetProperty("version").GetInt64(),confirm=true})).Status);
        Assert.Equal(HttpStatusCode.OK,(await api.PostAsync($"/api/queues/{service.Queue}/open",new{})).Status);var second=await Join(api,service.Queue);Assert.Equal(first.GetProperty("ticket").GetProperty("number").GetString(),second.GetProperty("ticket").GetProperty("number").GetString());
        var current=await api.GetAsync($"/api/shops/{id}/demand?range=current");Assert.Equal(1,current.GetProperty("issued").GetInt32());var history=await api.GetAsync($"/api/shops/{id}/demand?range=latest7");Assert.Equal(2,history.GetProperty("issued").GetInt32());Assert.Equal(2,history.GetProperty("businessDayCount").GetInt32());
        Assert.Equal(HttpStatusCode.BadRequest,(await http.GetAsync($"/api/shops/{id}/demand?range=calendar7")).StatusCode);
    }

    private static async Task<(Guid Service,Guid Queue)> Service(SmartQueueClient api,Guid shop,string name,string prefix)
    {
        var service=await api.PostAsync($"/api/shops/{shop}/services",new{name,prefix,callTimeoutMinutes=600,nearTurnThreshold=2});Assert.Equal(HttpStatusCode.Created,service.Status);var queue=service.Body.GetProperty("queue").GetProperty("id").GetGuid();Assert.Equal(HttpStatusCode.OK,(await api.PostAsync($"/api/queues/{queue}/open",new{})).Status);return(service.Body.GetProperty("id").GetGuid(),queue);
    }
    private static async Task<JsonElement> Join(SmartQueueClient api,Guid queue){var issued=await api.PostAsync($"/api/queues/{queue}/tickets",new{requestId=Guid.NewGuid(),confirmExtra=true});Assert.Equal(HttpStatusCode.Created,issued.Status);return issued.Body;}
    private static async Task<JsonElement> Json(HttpResponseMessage response){using var document=JsonDocument.Parse(await response.Content.ReadAsStringAsync());return document.RootElement.Clone();}
}
