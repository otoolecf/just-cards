/** Platform rate limiter rejects floods before any Durable Object RPC or body buffering. */
export async function edgeAdmission(
  limiter:
    | { limit(input: { key: string }): Promise<{ success: boolean }> }
    | undefined,
  address: string,
): Promise<Response | undefined> {
  if (!limiter)
    return Response.json(
      { error: "API rate limiter is unavailable" },
      { status: 503 },
    );
  const { success } = await limiter.limit({ key: address });
  if (!success)
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      {
        status: 429,
        headers: { "retry-after": "60", "cache-control": "no-store" },
      },
    );
}
