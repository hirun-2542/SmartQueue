using System.Net;
using System.Net.Mail;
using System.Text;

namespace SmartQueue.Api.Identity;

public sealed class SmtpEmail(IConfiguration configuration)
{
    public async Task SendAsync(string recipient, string subject, string link, bool thai)
    {
        using var client = new SmtpClient(configuration["Smtp:Host"] ?? throw new InvalidOperationException("Configure Smtp:Host"), configuration.GetValue("Smtp:Port", 587));
        client.EnableSsl = configuration.GetValue("Smtp:UseTls", true);
        if (configuration["Smtp:Username"] is { Length: > 0 } username)
            client.Credentials = new NetworkCredential(username, configuration["Smtp:Password"]);
        using var message = new MailMessage(configuration["Smtp:From"] ?? throw new InvalidOperationException("Configure Smtp:From"), recipient);
        message.Subject = subject;
        message.SubjectEncoding = Encoding.UTF8;
        message.BodyEncoding = Encoding.UTF8;
        message.Body = $"{(thai ? "เปิดลิงก์นี้เพื่อดำเนินการต่อกับบัญชี SmartQueue ของคุณ:" : "Open this link to continue with your SmartQueue account:")}\n\n{link}";
        await client.SendMailAsync(message);
    }
}
