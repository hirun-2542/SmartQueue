using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.WebUtilities;

namespace SmartQueue.Api.Tickets;

public sealed class TicketLinks(IDataProtectionProvider protection)
{
    private readonly IDataProtector protector = protection.CreateProtector("SmartQueue.TicketLink");
    public string Create() => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
    public string Protect(string secret) => protector.Protect(secret);
    public string Unprotect(string value) => protector.Unprotect(value);
    public static string Hash(string secret)
    {
        if(secret.Length is <32 or >128) throw new ApiException("not_found",404);
        foreach(var c in secret)
            if(!char.IsAsciiLetterOrDigit(c)&&c!='-'&&c!='_')throw new ApiException("not_found",404);
        Span<byte> input = stackalloc byte[128];
        var count = Encoding.ASCII.GetBytes(secret, input);
        Span<byte> hash = stackalloc byte[32];
        SHA256.HashData(input[..count], hash);
        return Convert.ToHexString(hash);
    }
}
