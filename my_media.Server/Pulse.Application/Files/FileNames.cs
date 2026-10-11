namespace Pulse.Application.Files;

public static class FileNames
{
    public static string Normalize(string? extension, string? url = null)
    {
        var ext = (extension ?? string.Empty).Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(ext) && !string.IsNullOrWhiteSpace(url) &&
            !url.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var path = url.Split('?', '#')[0];
            ext = Path.GetExtension(path).ToLowerInvariant();
        }

        if (ext.Length > 0 && ext[0] != '.')
        {
            ext = "." + ext;
        }

        if (ext.Length is < 2 or > 12)
        {
            return string.Empty;
        }

        for (var i = 1; i < ext.Length; i++)
        {
            if (!char.IsLetterOrDigit(ext[i]))
            {
                return string.Empty;
            }
        }

        return ext;
    }
}
