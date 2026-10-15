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
        if (!IsRealEmail(address))
            throw new InvalidOperationException("Email mövcud deyil");
        var host = address[(address.LastIndexOf('@') + 1)..];
        if (MailHosts.IsTypo(host) || !await MailHosts.AcceptsMailAsync(host))
            throw new InvalidOperationException("Email mövcud deyil");
        if (await MailHosts.MailboxExistsAsync(address) == false)
            throw new InvalidOperationException("Email mövcud deyil");

        var smtpHost = _config["Smtp:Host"];
        var user = _config["Smtp:User"];
        var password = _config["Smtp:Password"];
        if (string.IsNullOrWhiteSpace(smtpHost)
            || smtpHost.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || smtpHost.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(user)
            || string.IsNullOrWhiteSpace(password)
            || password == "PulseLocal123!")
        {
            _logger.LogInformation("Email unvani qebul olundu, kod gonderilmedi");
            throw new InvalidOperationException("Kod göndərilmədi");
        }

        using var message = new MailMessage(_config["Smtp:From"] ?? user!, address)
        {
            Subject = "Pulse təsdiq kodu",
            Body = $"Pulse hesabını təsdiqləmək üçün kodun: {code}{Environment.NewLine}Kod 10 dəqiqə etibarlıdır.",
            IsBodyHtml = false
        };
        using var smtp = new SmtpClient(smtpHost)
        {
            Port = int.Parse(_config["Smtp:Port"] ?? "587"),
            Credentials = new NetworkCredential(user, password),
            EnableSsl = true
        };
        try
        {
            await smtp.SendMailAsync(message);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "OTP kodu gonderilmedi");
            throw new InvalidOperationException("Kod göndərilmədi");
        }
        _logger.LogInformation("OTP kodu {Contact} unvanina gonderildi", address);
    }

    private static bool IsRealEmail(string address)
    {
        if (string.IsNullOrWhiteSpace(address) || address.Any(char.IsWhiteSpace)) return false;
        if (address.EndsWith("@pulse.local", StringComparison.OrdinalIgnoreCase)) return false;
        var at = address.IndexOf('@');
        if (at <= 0 || at != address.LastIndexOf('@')) return false;
        var host = address[(at + 1)..];
        return host.Contains('.') && !host.StartsWith('.') && !host.EndsWith('.');
    }
}
