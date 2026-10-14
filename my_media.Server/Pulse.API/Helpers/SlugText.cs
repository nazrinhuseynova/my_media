using System.Text;

namespace Pulse.API.Helpers;

public static class SlugText
{
    public static string Unique(string? caption, Guid id, ISet<string> used)
    {
        var stem = Stem(caption);
        var tail = id.ToString("N")[..8];
        var slug = string.IsNullOrEmpty(stem) ? tail : stem + "-" + tail;
        if (slug.Length > 140) slug = slug[..140].Trim('-');
        var candidate = slug;
        var n = 2;
        while (!used.Add(candidate))
        {
            var extra = "-" + n;
            var room = Math.Max(1, 140 - extra.Length);
            var head = slug.Length > room ? slug[..room].Trim('-') : slug;
            candidate = head + extra;
            n += 1;
        }
        return candidate;
    }

    public static string Stem(string? text)
    {
        var sb = new StringBuilder();
        foreach (var ch in (text ?? "").Trim().ToLowerInvariant())
        {
            var folded = Fold(ch);
            if (folded == '-' )
            {
                if (sb.Length > 0 && sb[^1] != '-') sb.Append('-');
                continue;
            }
            if ((folded >= 'a' && folded <= 'z') || (folded >= '0' && folded <= '9')) sb.Append(folded);
        }
        var stem = sb.ToString().Trim('-');
        if (stem.Length > 60) stem = stem[..60].Trim('-');
        return stem;
    }

    private static char Fold(char ch)
    {
        return ch switch
        {
            'ə' or 'ä' => 'e',
            'ı' => 'i',
            'ö' => 'o',
            'ü' => 'u',
            'ş' => 's',
            'ç' => 'c',
            'ğ' => 'g',
            ' ' or '_' => '-',
            _ => ch
        };
    }
}
