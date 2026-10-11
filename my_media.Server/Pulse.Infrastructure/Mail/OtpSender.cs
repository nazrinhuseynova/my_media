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
        _logger.LogInformation("OTP kod {Code} {Contact} unvanina gonderildi", code, contact);

        var pickup = _config["Smtp:PickupDirectory"];
        if (!string.IsNullOrWhiteSpace(pickup))
        {
            var dir = Path.IsPathRooted(pickup) ? pickup : Path.Combine(Directory.GetCurrentDirectory(), pickup);
            Directory.CreateDirectory(dir);
            var safe = string.Concat((contact ?? "contact").Select(ch => Path.GetInvalidFileNameChars().Contains(ch) ? '_' : ch));
            var file = Path.Combine(dir, $"{DateTime.UtcNow:yyyyMMddHHmmssfff}-{safe}.eml");
            var from = _config["Smtp:From"] ?? "pulse@localhost";
            var body = $"From: {from}{Environment.NewLine}To: {contact}{Environment.NewLine}Subject: Pulse tesdiq kodu{Environment.NewLine}{Environment.NewLine}Kodunuz: {code}{Environment.NewLine}";
            await File.WriteAllTextAsync(file, body);
            return;
        }

        var host = _config["Smtp:Host"];
        if (string.IsNullOrWhiteSpace(host) || !contact.Contains('@'))
        {
            return;
        }

        using var smtp = new SmtpClient(host)
        {
            Port = int.Parse(_config["Smtp:Port"] ?? "587"),
            Credentials = new NetworkCredential(_config["Smtp:User"], _config["Smtp:Password"]),
            EnableSsl = true
        };
        await smtp.SendMailAsync(
            _config["Smtp:From"] ?? "pulse@localhost",
            contact,
            "Pulse tesdiq kodu",
            $"Kodunuz: {code}");
    }
}
