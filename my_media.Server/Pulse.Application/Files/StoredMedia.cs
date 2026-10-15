using Pulse.Application.Files.Interfaces;

namespace Pulse.Application.Files;

public static class StoredMedia
{
    public static async Task<(string Url, string Extension)> ResolveAsync(
        IFileStorageService files,
        string? url,
        string? extension,
        string folder,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return (string.Empty, FileNames.Normalize(extension, url));
        }

        if (url.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var stored = await files.SaveDataUrlAsync(url, folder, cancellationToken);
            return (stored.Url, stored.Extension);
        }

        if (url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            || url.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
        {
            return (url, FileNames.Normalize(extension, url));
        }

        throw new InvalidOperationException("Fayl yüklənmədi");
    }
}
