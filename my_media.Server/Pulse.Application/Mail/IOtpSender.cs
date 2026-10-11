namespace Pulse.Application.Mail;

public interface IOtpSender
{
    Task SendAsync(string contact, string code);
}
