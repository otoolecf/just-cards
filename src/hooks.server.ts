import { edgeAdmission } from "$lib/server/edge-admission";
import { boundedBody } from "$lib/server/request-limits";
import type { Handle } from "@sveltejs/kit";
import { ownerAuthorized, protectedOwnerPath } from "$lib/server/owner-auth";
import { ownerKey } from "$lib/server/owner-config";
export const handle: Handle = async ({ event, resolve }) => {
  const route = event.route.id ?? event.url.pathname;
  if (
    String(event.platform?.env.PUBLIC_WRITES_ENABLED) === "false" &&
    route.startsWith("/api/") &&
    !["GET", "HEAD"].includes(event.request.method) &&
    !route.startsWith("/api/owner/")
  )
    return Response.json(
      { error: "Writes are temporarily paused" },
      { status: 503 },
    );
  if (
    protectedOwnerPath(route, event.request.method) &&
    !(await ownerAuthorized(event.request, ownerKey(event.platform)))
  ) {
    return Response.json(
      {
        error:
          "Owner sign-in is required for AI imports, assistant tools, and shared-library edits. Sign in at /owner.",
      },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  // Data requests and encoded URLs have the same resolved ID as their page.
  const databasePage = ["/", "/play", "/play/[rulesetId]", "/sitemap.xml"].includes(route);
  if ((route.startsWith("/api/") || databasePage) && event.platform) {
    const denied = await edgeAdmission(
      event.platform.env.API_RATE_LIMIT,
      event.getClientAddress(),
    );
    if (denied) return denied;
  }
  if (
    route.startsWith("/api/") &&
    !["GET", "HEAD"].includes(event.request.method)
  ) {
    try {
      const bytes = await boundedBody(
        event.request,
        route.startsWith("/api/rooms") ? 16000 : 65536,
      );
      event.request = new Request(event.request, { body: bytes as BodyInit });
    } catch {
      return Response.json(
        { error: "Request body is too large or unreadable" },
        { status: 413 },
      );
    }
  }
  const ai =
    event.request.method === "POST" &&
    /^\/api\/(rulesets\/generate|mcp(?:\/|$)|chat\/actions)/.test(route);
  const coordinator = ai
    ? event.platform?.env.ROOM_ADMISSION.getByName("global")
    : undefined;
  const lease = crypto.randomUUID();
  if (coordinator && !(await coordinator.aiRequest(lease)))
    return Response.json(
      { error: "AI request budget or concurrency limit reached" },
      { status: 429, headers: { "retry-after": "600" } },
    );
  let response: Response;
  try {
    response = await resolve(event);
  } finally {
    if (coordinator) await coordinator.aiRequest(lease, true);
  }

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
};
