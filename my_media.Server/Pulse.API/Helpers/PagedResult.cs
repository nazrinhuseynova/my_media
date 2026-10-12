namespace Pulse.API.Helpers;

public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalCount { get; set; }
    public int TotalPages { get; set; }
    public bool HasMore { get; set; }
    public bool HasPrevious { get; set; }

    public static PagedResult<T> Create(List<T> items, int page, int pageSize, int totalCount, bool? hasMore = null)
    {
        var pages = pageSize <= 0 ? 0 : (int)Math.Ceiling(totalCount / (double)pageSize);
        return new PagedResult<T>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
            TotalPages = pages,
            HasMore = hasMore ?? (page < pages),
            HasPrevious = page > 1
        };
    }
}

public static class Paging
{
    public static (int Page, int PageSize) Normalize(int page, int pageSize, int fallback, int max)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = fallback;
        if (pageSize > max) pageSize = max;
        return (page, pageSize);
    }
}
