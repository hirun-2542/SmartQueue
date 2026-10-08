using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SmartQueue.Api.Data;

namespace SmartQueue.Api.Domain;

public readonly record struct ShopTransaction(AppDbContext Db, IDbContextTransaction Transaction, Shop Shop) : IAsyncDisposable
{
    public static async Task<ShopTransaction> OpenAsync(AppDbContext db, Guid shopId, string? ownerId, CancellationToken cancellationToken = default)
    {
        var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var shop = await db.Set<Shop>().FromSqlInterpolated($"SELECT * FROM shops WHERE \"Id\" = {shopId} FOR UPDATE").SingleOrDefaultAsync(cancellationToken);
            if (shop is null || (ownerId is not null && shop.OwnerId != ownerId)) throw new ApiException("not_found",404);
            return new(db,transaction,shop);
        }
        catch { await transaction.DisposeAsync(); throw; }
    }
    public async Task CommitAsync(CancellationToken cancellationToken = default)
    {
        Shop.Version++;
        await Db.SaveChangesAsync(cancellationToken);
        await Db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_notify('smartqueue_changes', {Shop.Id.ToString()})",cancellationToken);
        await Transaction.CommitAsync(cancellationToken);
    }
    public ValueTask DisposeAsync() => Transaction.DisposeAsync();
}
