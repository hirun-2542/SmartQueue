namespace SmartQueue.Api;

public sealed class ApiException(string code, int status = 409, object? current = null) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public object? Current { get; } = current;
}

public static class ApiError
{
    public static IResult Bad(string code, object? errors = null) => Results.Json(new { code, errors }, statusCode: 400);
}
