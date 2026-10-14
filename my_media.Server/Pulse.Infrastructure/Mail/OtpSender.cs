using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Pulse.Application.Mail;
using System.Net;
using System.Net.Mail;

namespace Pulse.Infrastructure.Mail;

public class OtpSender : IOtpSender
{
    private readonly IConfiguration _config;
    private readonly ILogger<OtpSender> _logger;

    public OtpSender(IConfiguration config, ILogger<OtpSender> logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SendAsync(string contact, string code)
    {
        var address = (contact ?? "").Trim();
        if (!address.Contains('@') || address.EndsWith("@pulse.local", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Təsdiq kodu yalnız emailə göndərilir");

        var host = _config["Smtp:Host"];
        var user = _config["Smtp:User"];
        var password = _config["Smtp:Password"];
        if (string.IsNullOrWhiteSpace(host)
            || host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(user)
            || string.IsNullOrWhiteSpace(password)
            || password == "PulseLocal123!")
        {
            throw new InvalidOperationException("Email serveri ayarlanmayıb");
        }

        using var message = new MailMessage(_config["Smtp:From"] ?? user, address)
        {
            Subject = "Pulse təsdiq kodu",
            Body = $"Pulse hesabını təsdiqləmək üçün kodun: {code}{Environment.NewLine}Kod 10 dəqiqə etibarlıdır.",
            IsBodyHtml = false
        };
        using var smtp = new SmtpClient(host)
        {
            Port = int.Parse(_config["Smtp:Port"] ?? "587"),
            Credentials = new NetworkCredential(user, password),
            EnableSsl = true
        };
        await smtp.SendMailAsync(message);
        _logger.LogInformation("OTP kodu {Contact} unvanina gonderildi", address);
    }
}
