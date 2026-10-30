import { it, expect, vi } from "vitest";
vi.mock("$lib/server/owner-config", () => ({ ownerKey: () => undefined }));
import { handle } from "./hooks.server";
function args(paused: boolean, body: string) {
  return {
    event: {
      url: new URL("https://example.com/%61pi/sessions"),
      route: { id: "/api/sessions" },
      request: new Request("https://example.com/%61pi/sessions", {
        method: "POST",
        body,
      }),
      platform: {
        env: {
          API_RATE_LIMIT: { limit: async () => ({ success: true }) },
          PUBLIC_WRITES_ENABLED: paused ? "false" : "true",
        },
      },
      getClientAddress: () => "test",
    },
    resolve: vi.fn(async () => new Response("unexpected")),
  } as unknown as Parameters<typeof handle>[0];
}
it("uses the resolved route for the pause switch", async () => {
  const a = args(true, "{}");
  expect((await handle(a)).status).toBe(503);
  expect(a.resolve).not.toHaveBeenCalled();
});
it("uses the resolved route for body limits", async () => {
  const a = args(false, "x".repeat(70000));
  expect((await handle(a)).status).toBe(413);
  expect(a.resolve).not.toHaveBeenCalled();
});
it("rejects at the platform limiter before buffering or coordinator dispatch", async () => {
  const a = args(false, "{}");
  a.event.platform!.env.API_RATE_LIMIT = {
    limit: async () => ({ success: false }),
  } as RateLimit;
  expect((await handle(a)).status).toBe(429);
  expect(a.resolve).not.toHaveBeenCalled();
});
