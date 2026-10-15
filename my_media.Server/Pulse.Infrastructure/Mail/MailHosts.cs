using System.Net.Sockets;
using System.Text;

namespace Pulse.Infrastructure.Mail;

public static class MailHosts
{
    private static readonly string[] Known =
    {
        "gmail.com", "googlemail.com", "yahoo.com", "outlook.com", "hotmail.com",
        "live.com", "icloud.com", "me.com", "mail.ru", "bk.ru", "list.ru", "inbox.ru",
        "yandex.com", "yandex.ru", "ya.ru", "proton.me", "protonmail.com", "aol.com",
        "gmx.com", "mail.az", "box.az"
    };

    public static bool IsTypo(string host)
    {
        foreach (var known in Known)
        {
            if (known.Equals(host, StringComparison.OrdinalIgnoreCase)) return false;
            if (Math.Abs(known.Length - host.Length) > 1) continue;
            if (Distance(known, host) == 1) return true;
        }
        return false;
    }

    public static async Task<bool?> MailboxExistsAsync(string email)
    {
        var at = email.LastIndexOf('@');
        if (at < 1) return false;
        var host = email[(at + 1)..];
        var mx = await PrimaryMxAsync(host) ?? host;
        try
        {
            using var tcp = new TcpClient();
            using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(8));
            await tcp.ConnectAsync(mx, 25, cancel.Token);
            tcp.ReceiveTimeout = 8000;
            tcp.SendTimeout = 8000;
            using var stream = tcp.GetStream();
            using var reader = new StreamReader(stream, Encoding.ASCII);
            using var writer = new StreamWriter(stream, Encoding.ASCII) { NewLine = "\r\n", AutoFlush = true };
            if (await ReadCode(reader) == 0) return null;
            await writer.WriteLineAsync("EHLO pulse.az");
            if (await ReadCode(reader) == 0) return null;
            await writer.WriteLineAsync("MAIL FROM:<check@pulse.az>");
            if (await ReadCode(reader) == 0) return null;
            await writer.WriteLineAsync($"RCPT TO:<{email}>");
            var code = await ReadCode(reader);
            try { await writer.WriteLineAsync("QUIT"); } catch { /* the answer is enough */ }
            if (code is 550 or 551 or 553 or 501) return false;
            if (code is 250 or 251) return true;
            return null;
        }
        catch
        {
            return null;
        }
    }

    public static async Task<bool> AcceptsMailAsync(string host)
    {
        var mx = await LookupAsync(host, 15);
        if (mx == Answer.Yes) return true;
        if (mx == Answer.No)
        {
            var address = await LookupAsync(host, 1);
            return address == Answer.Yes;
        }
        return true;
    }

    private enum Answer { Yes, No, Unknown }

    private static async Task<string?> PrimaryMxAsync(string host)
    {
        try
        {
            using var udp = new UdpClient();
            var query = Query(host, 15);
            await udp.SendAsync(query, query.Length, "8.8.8.8", 53);
            using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            var reply = await udp.ReceiveAsync(cancel.Token);
            return BestMx(reply.Buffer);
        }
        catch
        {
            return null;
        }
    }

    private static string? BestMx(byte[] buffer)
    {
        if (buffer.Length < 12 || (buffer[3] & 0x0F) != 0) return null;
        var questions = (buffer[4] << 8) | buffer[5];
        var answers = (buffer[6] << 8) | buffer[7];
        var offset = 12;
        for (var i = 0; i < questions && offset < buffer.Length; i++)
        {
            offset = SkipName(buffer, offset);
            offset += 4;
        }
        string? best = null;
        var preference = int.MaxValue;
        for (var i = 0; i < answers && offset + 10 < buffer.Length; i++)
        {
            offset = SkipName(buffer, offset);
            var type = (buffer[offset] << 8) | buffer[offset + 1];
            var length = (buffer[offset + 8] << 8) | buffer[offset + 9];
            var data = offset + 10;
            if (type == 15 && data + 2 < buffer.Length)
            {
                var rank = (buffer[data] << 8) | buffer[data + 1];
                var exchange = ReadName(buffer, data + 2);
                if (!string.IsNullOrWhiteSpace(exchange) && rank < preference)
                {
                    preference = rank;
                    best = exchange.TrimEnd('.');
                }
            }
            offset = data + length;
        }
        return best;
    }

    private static int SkipName(byte[] buffer, int offset)
    {
        while (offset < buffer.Length)
        {
            var length = buffer[offset];
            if (length == 0) return offset + 1;
            if ((length & 0xC0) == 0xC0) return offset + 2;
            offset += length + 1;
        }
        return offset;
    }

    private static string ReadName(byte[] buffer, int offset)
    {
        var labels = new List<string>();
        var jumps = 0;
        while (offset < buffer.Length && jumps < 8)
        {
            var length = buffer[offset];
            if (length == 0) break;
            if ((length & 0xC0) == 0xC0)
            {
                offset = ((length & 0x3F) << 8) | buffer[offset + 1];
                jumps++;
                continue;
            }
            offset++;
            if (offset + length > buffer.Length) break;
            labels.Add(Encoding.ASCII.GetString(buffer, offset, length));
            offset += length;
        }
        return string.Join('.', labels);
    }

    private static async Task<int> ReadCode(StreamReader reader)
    {
        string? line;
        var code = 0;
        do
        {
            line = await reader.ReadLineAsync();
            if (line != null && line.Length >= 3 && int.TryParse(line.AsSpan(0, 3), out var parsed)) code = parsed;
        }
        while (line != null && line.Length >= 4 && line[3] == '-');
        return code;
    }

    private static async Task<Answer> LookupAsync(string host, ushort type)
    {
        try
        {
            using var udp = new UdpClient();
            var query = Query(host, type);
            await udp.SendAsync(query, query.Length, "8.8.8.8", 53);
            using var cancel = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            var reply = await udp.ReceiveAsync(cancel.Token);
            return Read(reply.Buffer);
        }
        catch
        {
            return Answer.Unknown;
        }
    }

    private static Answer Read(byte[] buffer)
    {
        if (buffer.Length < 12) return Answer.Unknown;
        var code = buffer[3] & 0x0F;
        if (code == 3) return Answer.No;
        if (code != 0) return Answer.Unknown;
        var answers = (buffer[6] << 8) | buffer[7];
        return answers > 0 ? Answer.Yes : Answer.No;
    }

    private static byte[] Query(string host, ushort type)
    {
        var labels = host.Split('.', StringSplitOptions.RemoveEmptyEntries);
        using var stream = new MemoryStream();
        stream.Write(new byte[] { 0x13, 0x37, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 });
        foreach (var label in labels)
        {
            var bytes = Encoding.ASCII.GetBytes(label);
            stream.WriteByte((byte)bytes.Length);
            stream.Write(bytes);
        }
        stream.Write(new byte[] { 0x00, 0x00, (byte)type, 0x00, 0x01 });
        return stream.ToArray();
    }

    private static int Distance(string left, string right)
    {
        var rows = left.Length + 1;
        var cols = right.Length + 1;
        var grid = new int[rows, cols];
        for (var i = 0; i < rows; i++) grid[i, 0] = i;
        for (var j = 0; j < cols; j++) grid[0, j] = j;
        for (var i = 1; i < rows; i++)
        {
            for (var j = 1; j < cols; j++)
            {
                var cost = left[i - 1] == right[j - 1] ? 0 : 1;
                var best = Math.Min(grid[i - 1, j] + 1, Math.Min(grid[i, j - 1] + 1, grid[i - 1, j - 1] + cost));
                if (i > 1 && j > 1 && left[i - 1] == right[j - 2] && left[i - 2] == right[j - 1])
                    best = Math.Min(best, grid[i - 2, j - 2] + 1);
                grid[i, j] = best;
            }
        }
        return grid[left.Length, right.Length];
    }
}
