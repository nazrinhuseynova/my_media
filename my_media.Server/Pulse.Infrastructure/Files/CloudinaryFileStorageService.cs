using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Pulse.Application.Files;
using Pulse.Application.Files.Interfaces;

namespace Pulse.Infrastructure.Files;

public class CloudinaryFileStorageService : IFileStorageService
{
    private static readonly Dictionary<string, string[]> Allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image"] = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif"],
        ["video"] = [".mp4", ".webm", ".mov", ".mkv", ".m4v"],
        ["audio"] = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".webm"]
    };

    private readonly IConfiguration _config;
    private readonly IWebHostEnvironment _env;
    private Cloudinary? _cloudinary;

    public CloudinaryFileStorageService(IConfiguration config, IWebHostEnvironment env)
    {
        _config = config;
        _env = env;
    }

    public Task<StoredFile> SaveImageAsync(IFormFile file, CancellationToken cancellationToken = default)
        => UploadAsync(file, "image", "pulse/images", cancellationToken);

    public Task<StoredFile> SaveVideoAsync(IFormFile file, CancellationToken cancellationToken = default)
        => UploadAsync(file, "video", "pulse/videos", cancellationToken);

    public Task<StoredFile> SaveAudioAsync(IFormFile file, CancellationToken cancellationToken = default)
        => UploadAsync(file, "audio", "pulse/audio", cancellationToken);

    public async Task<StoredFile> SaveDataUrlAsync(string dataUrl, string folder, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(dataUrl) || !dataUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            return new StoredFile
            {
                Url = dataUrl ?? string.Empty,
                Extension = FileNames.Normalize(null, dataUrl)
            };
        }

        var comma = dataUrl.IndexOf(',');
        if (comma < 0)
        {
            throw new InvalidOperationException("Fayl formati yanlisdir");
        }

        var meta = dataUrl[..comma];
        var payload = dataUrl[(comma + 1)..];
        var mime = meta.Split(';')[0].Replace("data:", "", StringComparison.OrdinalIgnoreCase);
        var extension = ExtensionFromContentType(mime);
        if (string.IsNullOrEmpty(extension))
        {
            throw new InvalidOperationException("Fayl uzantisi taninmadi");
        }

        var bytes = Convert.FromBase64String(payload);
        await using var stream = new MemoryStream(bytes);
        IFormFile file = new FormFile(stream, 0, bytes.Length, "file", $"upload{extension}")
        {
            Headers = new HeaderDictionary(),
            ContentType = string.IsNullOrWhiteSpace(mime) ? "application/octet-stream" : mime
        };

        return folder switch
        {
            "videos" => await SaveVideoAsync(file, cancellationToken),
            "audio" => await SaveAudioAsync(file, cancellationToken),
            _ => await SaveImageAsync(file, cancellationToken)
        };
    }

    private async Task<StoredFile> UploadAsync(IFormFile file, string kind, string folder, CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0)
        {
            throw new InvalidOperationException("Fayl bosdur");
        }

        var extension = ResolveExtension(file);
        if (!Allowed[kind].Contains(extension))
        {
            throw new InvalidOperationException("Bu fayl uzantisina icaze yoxdur");
        }

        if (UseLocal())
        {
            return await SaveLocalAsync(file, kind, extension, cancellationToken);
        }

        await using var stream = file.OpenReadStream();
        var description = new FileDescription($"{Guid.NewGuid():N}{extension}", stream);
        var cloudinary = Client();

        UploadResult result = kind == "image"
            ? await cloudinary.UploadAsync(new ImageUploadParams
            {
                File = description,
                Folder = folder,
                UseFilename = true,
                UniqueFilename = false,
                Overwrite = false
            }, cancellationToken)
            : await cloudinary.UploadAsync(new VideoUploadParams
            {
                File = description,
                Folder = folder,
                UseFilename = true,
                UniqueFilename = false,
                Overwrite = false
            }, cancellationToken);

        if (result.Error != null)
        {
            throw new InvalidOperationException(result.Error.Message);
        }

        var url = result.SecureUrl?.ToString();
        if (string.IsNullOrWhiteSpace(url))
        {
            throw new InvalidOperationException("Cloudinary fayli saxlamadi");
        }

        var storedExtension = FileNames.Normalize(result.Format);
        if (string.IsNullOrEmpty(storedExtension))
        {
            storedExtension = extension;
        }

        return new StoredFile { Url = url, Extension = storedExtension };
    }

    private bool UseLocal()
    {
        var cloud = _config["Cloudinary:CloudName"];
        var key = _config["Cloudinary:ApiKey"];
        var secret = _config["Cloudinary:ApiSecret"];
        return string.IsNullOrWhiteSpace(cloud)
            || string.IsNullOrWhiteSpace(key)
            || string.IsNullOrWhiteSpace(secret)
            || cloud.Equals("local", StringComparison.OrdinalIgnoreCase);
    }

    private async Task<StoredFile> SaveLocalAsync(IFormFile file, string kind, string extension, CancellationToken cancellationToken)
    {
        var root = _env.WebRootPath;
        if (string.IsNullOrWhiteSpace(root))
        {
            root = Path.Combine(_env.ContentRootPath, "wwwroot");
        }

        var dir = Path.Combine(root, "uploads", kind);
        Directory.CreateDirectory(dir);
        var name = $"{Guid.NewGuid():N}{extension}";
        await using (var input = file.OpenReadStream())
        await using (var output = File.Create(Path.Combine(dir, name)))
        {
            await input.CopyToAsync(output, cancellationToken);
        }

        return new StoredFile { Url = $"/uploads/{kind}/{name}", Extension = extension };
    }

    private Cloudinary Client()
    {
        if (_cloudinary != null)
        {
            return _cloudinary;
        }

        var cloud = _config["Cloudinary:CloudName"];
        var key = _config["Cloudinary:ApiKey"];
        var secret = _config["Cloudinary:ApiSecret"];
        if (string.IsNullOrWhiteSpace(cloud) || string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(secret))
        {
            throw new InvalidOperationException("Cloudinary ayarlari tapilmadi");
        }

        _cloudinary = new Cloudinary(new Account(cloud, key, secret));
        _cloudinary.Api.Secure = true;
        return _cloudinary;
    }

    private static string ResolveExtension(IFormFile file)
    {
        var extension = FileNames.Normalize(Path.GetExtension(file.FileName));
        if (string.IsNullOrEmpty(extension))
        {
            extension = ExtensionFromContentType(file.ContentType);
        }

        if (string.IsNullOrEmpty(extension))
        {
            throw new InvalidOperationException("Fayl uzantisi taninmadi");
        }

        return extension;
    }

    private static string ExtensionFromContentType(string? contentType)
    {
        return (contentType ?? string.Empty).Split(';')[0].Trim().ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/gif" => ".gif",
            "image/webp" => ".webp",
            "image/bmp" => ".bmp",
            "image/heic" => ".heic",
            "image/heif" => ".heif",
            "video/mp4" => ".mp4",
            "video/webm" => ".webm",
            "video/quicktime" => ".mov",
            "video/x-matroska" => ".mkv",
            "audio/mpeg" => ".mp3",
            "audio/wav" or "audio/x-wav" => ".wav",
            "audio/ogg" => ".ogg",
            "audio/mp4" or "audio/aac" or "audio/x-m4a" => ".m4a",
            "audio/webm" => ".webm",
            _ => string.Empty
        };
    }
}
