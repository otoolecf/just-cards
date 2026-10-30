import { it, expect, vi } from "vitest";
import { resourceOperation } from "./resource-operation";
const admission = () => ({
  accessResource: vi.fn(async () => 200),
  reserveResource: vi.fn(async () => ({ status: 200, lease: "lease" })),
  finishResource: vi.fn(async () => true),
});
it("commits only a successful persisted response", async () => {
  const a = admission();
  const operation = vi.fn(async () => new Response("ok"));
  await resourceOperation(a, "score:a", true, "ip", operation);
  expect(a.finishResource).toHaveBeenCalledWith("score:a", "lease", true);
});
it("releases on validation failure or thrown operation", async () => {
  const a = admission();
  await resourceOperation(
    a,
    "score:a",
    true,
    "ip",
    async () => new Response("bad", { status: 400 }),
  );
  expect(a.finishResource).toHaveBeenCalledWith("score:a", "lease", false);
  await expect(
    resourceOperation(a, "score:b", true, "ip", async () => {
      throw new Error("crash");
    }),
  ).rejects.toThrow("crash");
  expect(a.finishResource).toHaveBeenCalledWith("score:b", "lease", false);
});
it("does not dispatch when reservation is denied", async () => {
  const a = admission();
  a.reserveResource.mockResolvedValue({ status: 429, lease: "" });
  const op = vi.fn();
  expect((await resourceOperation(a, "score:a", true, "ip", op)).status).toBe(
    429,
  );
  expect(op).not.toHaveBeenCalled();
});
