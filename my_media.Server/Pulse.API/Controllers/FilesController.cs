using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pulse.Application.Files;
using Pulse.Application.Files.Interfaces;

namespace Pulse.API.Controllers;

[ApiController]
[Authorize]
[Route("api/files")]
[RequestSizeLimit(80_000_000)]
public class FilesController : ControllerBase
{
    private readonly IFileStorageService _files;

    public FilesController(IFileStorageService files)
    {
        _files = files;
    }

    [HttpPost("image")]
    public async Task<IActionResult> Image(IFormFile file, CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0) return BadRequest(new { message = "Fayl secin" });
        return await Save(() => _files.SaveImageAsync(file, cancellationToken));
    }

    [HttpPost("video")]
    public async Task<IActionResult> Video(IFormFile file, CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0) return BadRequest(new { message = "Video secin" });
        return await Save(() => _files.SaveVideoAsync(file, cancellationToken));
    }

    [HttpPost("audio")]
    public async Task<IActionResult> Audio(IFormFile file, CancellationToken cancellationToken)
    {
        if (file == null || file.Length == 0) return BadRequest(new { message = "Ses secin" });
        return await Save(() => _files.SaveAudioAsync(file, cancellationToken));
    }

    private async Task<IActionResult> Save(Func<Task<StoredFile>> upload)
    {
        try
        {
            var stored = await upload();
            return Ok(new { url = stored.Url, extension = stored.Extension });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }
}
