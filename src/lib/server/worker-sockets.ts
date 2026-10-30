import { edgeAdmission } from "./edge-admission";
import { parseRoomSocketRequest } from "./room-socket";

/** Intercept upgrades before SvelteKit so its Response handling never buffers a socket. */
export function socketResponse(
  request: Request,
  env: Env,
): Promise<Response> | Response | undefined {
  if (!new URL(request.url).pathname.endsWith("/socket")) return undefined;
  try {
    const { code } = parseRoomSocketRequest(request);
    return edgeAdmission(
      env.API_RATE_LIMIT,
      request.headers.get("cf-connecting-ip") ?? "unknown",
    ).then(
      (denied) =>
        denied ??
        env.ROOM_ADMISSION.getByName("global")
          .accessResource(
            `room:${code}`,
            false,
            request.headers.get("cf-connecting-ip") ?? "unknown",
          )
          .then((status) =>
            status === 200
              ? env.ROOMS.getByName(code).fetch(request)
              : Response.json(
                  { error: "Table unavailable or request limit reached" },
                  { status },
                ),
          ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid socket request",
      },
      { status: 400 },
    );
  }
}
