using Microsoft.EntityFrameworkCore;
using Npgsql;
using SmartQueue.Api.Data;
using SmartQueue.Api.Domain;
using SmartQueue.Api.Identity;

namespace SmartQueue.Api.Shops;

public static class ShopEndpoints
{
    public static void MapShops(this WebApplication app)
    {
        var routes = app.MapGroup("/api").RequireAuthorization();
        routes.MapGet("/shops", async (HttpContext context, AppDbContext db, TimeProvider time) =>
        {
            var ownerId = context.OwnerId();
            var shops = await db.Set<Shop>().AsNoTracking().Where(x=>x.OwnerId==ownerId).Include(x=>x.Services).ThenInclude(x=>x.Queue).OrderBy(x=>x.Name).ToListAsync();
            return Results.Ok(shops.Select(x=>Snapshot(x,time.GetUtcNow())));
        });
        routes.MapGet("/shops/{id:guid}", async (Guid id,HttpContext context,AppDbContext db,TimeProvider time) => Results.Ok(await ReadAsync(db,id,context.OwnerId(),time.GetUtcNow())));
        routes.MapPost("/shops", async (NameRequest request,HttpContext context,AppDbContext db,TimeProvider time) =>
        {
            var name=ValidateName(request.Name);var shop=new Shop{OwnerId=context.OwnerId(),Name=name};db.Add(shop);await db.SaveChangesAsync();
            return Results.Json(Snapshot(shop,time.GetUtcNow()),statusCode:201);
        });
        routes.MapPut("/shops/{id:guid}", async (Guid id,NameRequest request,HttpContext context,AppDbContext db,TimeProvider time) =>
        {
            await using var unit=await ShopTransaction.OpenAsync(db,id,context.OwnerId());unit.Shop.Name=ValidateName(request.Name);await unit.CommitAsync();
            return Results.Ok(await ReadAsync(db,id,context.OwnerId(),time.GetUtcNow()));
        });
        routes.MapPost("/shops/{id:guid}/services", async (Guid id,ServiceRequest request,HttpContext context,AppDbContext db) =>
        {
            await using var unit=await ShopTransaction.OpenAsync(db,id,context.OwnerId());var value=ValidateService(request);
            if(await db.Set<Service>().AnyAsync(x=>x.ShopId==id&&!x.Archived&&x.Prefix==value.Prefix))throw new ApiException("prefix_exists");
            var service=new Service{ShopId=id,Name=value.Name,Prefix=value.Prefix,CallTimeoutMinutes=value.Timeout,NearTurnThreshold=value.Threshold};
            service.Queue=new Domain.Queue{Service=service,ServiceId=service.Id};db.Add(service);
            await CommitWithPrefixError(unit);
            return Results.Json(ServiceSnapshot(service),statusCode:201);
        });
        routes.MapPut("/services/{id:guid}", async (Guid id,ServiceRequest request,HttpContext context,AppDbContext db) =>
        {
            var shopId=await db.Set<Service>().Where(x=>x.Id==id).Select(x=>(Guid?)x.ShopId).SingleOrDefaultAsync()??throw new ApiException("not_found",404);
            await using var unit=await ShopTransaction.OpenAsync(db,shopId,context.OwnerId());
            var service=await db.Set<Service>().Include(x=>x.Queue).SingleAsync(x=>x.Id==id);var value=ValidateService(request);
            if(await db.Set<Service>().AnyAsync(x=>x.ShopId==shopId&&x.Id!=id&&!x.Archived&&x.Prefix==value.Prefix))throw new ApiException("prefix_exists");
            service.Name=value.Name;service.Prefix=value.Prefix;service.CallTimeoutMinutes=value.Timeout;service.NearTurnThreshold=value.Threshold;
            await CommitWithPrefixError(unit);return Results.Ok(ServiceSnapshot(service));
        });
    }
    public static async Task<ShopDto> ReadAsync(AppDbContext db,Guid id,string ownerId,DateTimeOffset now)
    {
        var shop=await db.Set<Shop>().AsNoTracking().Where(x=>x.Id==id&&x.OwnerId==ownerId).Include(x=>x.Services).ThenInclude(x=>x.Queue).SingleOrDefaultAsync()??throw new ApiException("not_found",404);
        return Snapshot(shop,now);
    }
    public static ShopDto Snapshot(Shop shop,DateTimeOffset now)=>new(shop.Id,shop.Name,shop.PublicId,shop.Version,shop.Services.OrderBy(x=>x.Name).Select(ServiceSnapshot).ToArray(),now);
    public static ServiceDto ServiceSnapshot(Service service)=>new(service.Id,service.ShopId,service.Name,service.Prefix,service.CallTimeoutMinutes,service.NearTurnThreshold,service.Archived,new(service.Queue.Id,service.Queue.Status,service.Queue.BusinessDayId));
    private static string ValidateName(string? name)=>!string.IsNullOrWhiteSpace(name)&&name.Trim().Length<=160?name.Trim():throw new ApiException("invalid_name",400);
    private static (string Name,string Prefix,double Timeout,int Threshold) ValidateService(ServiceRequest r)
    {
        var name=ValidateName(r.Name);var prefix=r.Prefix?.Trim().ToUpperInvariant()??"";
        if(prefix.Length is <1 or >8||prefix.Any(c=>c is <'A' or >'Z')||!double.IsFinite(r.CallTimeoutMinutes)||r.CallTimeoutMinutes<=0||r.NearTurnThreshold<0)throw new ApiException("invalid_service",400);
        return(name,prefix,r.CallTimeoutMinutes,r.NearTurnThreshold);
    }
    private static async Task CommitWithPrefixError(ShopTransaction unit)
    {
        try{await unit.CommitAsync();}
        catch(DbUpdateException error)when(error.InnerException is PostgresException {SqlState:PostgresErrorCodes.UniqueViolation}){throw new ApiException("prefix_exists");}
    }
    public sealed record NameRequest(string? Name);
    public sealed record ServiceRequest(string? Name,string? Prefix,double CallTimeoutMinutes,int NearTurnThreshold);
}
public sealed record ShopDto(Guid Id,string Name,string PublicId,long Version,ServiceDto[] Services,DateTimeOffset ServerTime);
public sealed record ServiceDto(Guid Id,Guid ShopId,string Name,string Prefix,double CallTimeoutMinutes,int NearTurnThreshold,bool Archived,QueueDto Queue);
public sealed record QueueDto(Guid Id,string Status,Guid? BusinessDayId);
