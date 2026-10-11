using Microsoft.AspNetCore.Http;
using Pulse.Application.Files;

namespace Pulse.Application.Files.Interfaces;

public interface IFileStorageService
{
    Task<StoredFile> SaveImageAsync(IFormFile file, CancellationToken cancellationToken = default);
    Task<StoredFile> SaveVideoAsync(IFormFile file, CancellationToken cancellationToken = default);
    Task<StoredFile> SaveAudioAsync(IFormFile file, CancellationToken cancellationToken = default);
    Task<StoredFile> SaveDataUrlAsync(string dataUrl, string folder, CancellationToken cancellationToken = default);
}
