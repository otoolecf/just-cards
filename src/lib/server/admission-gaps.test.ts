import { it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { ResourceRegistry } from "./resource-registry";
function setup() {
  const db = new DatabaseSync(":memory:");
  let writes = 0;
  const registry = new ResourceRegistry({
    run(sql, ...args) {
      writes++;
      db.prepare(sql).run(...args);
    },
    all(sql, ...args) {
      return db.prepare(sql).all(...args);
    },
  });
  return { registry, writes: () => writes };
}
it("denials cause no storage writes and discovery cannot exhaust existing traffic", () => {
  const { registry: r, writes } = setup();
  const a = r.reserve("score:good", "owner", 0);
  expect(a.status).toBe(200);
  expect(r.finish("score:good", a.lease!, true, 1)).toBe(true);
  for (let i = 0; i < 60; i++)
    expect(r.access("score:missing", "attacker", 2)).toBe(404);
  const before = writes();
  expect(r.access("score:missing", "attacker", 2)).toBe(429);
  expect(writes()).toBe(before);
  expect(r.access("score:good", "attacker", 2)).toBe(200);
});
it("releases failed and expired reservations and ignores stale completion", () => {
  const { registry: r } = setup();
  const a = r.reserve("score:new", "client", 0);
  expect(r.access("score:new", "client", 0)).toBe(404);
  expect(r.reserve("score:new", "client", 1).status).toBe(409);
  expect(r.finish("score:new", a.lease!, false, 2)).toBe(true);
  const b = r.reserve("score:new", "client", 3);
  const c = r.reserve("score:new", "client", 600004);
  expect(c.status).toBe(200);
  expect(r.finish("score:new", b.lease!, true, 600005)).toBe(false);
  expect(r.finish("score:new", c.lease!, true, 600005)).toBe(true);
  expect(r.access("score:new", "client", 600006)).toBe(200);
});
it("global discovery exhaustion leaves existing resources available", () => {
  const { registry: r } = setup();
  const a = r.reserve("score:good", "owner", 0);
  r.finish("score:good", a.lease!, true, 1);
  for (let i = 0; i < 10000; i++)
    expect(r.access("score:no", `client${Math.floor(i / 60)}`, 2)).toBe(404);
  expect(r.access("score:no", "new-client", 2)).toBe(429);
  expect(r.access("score:good", "new-client", 2)).toBe(200);
});
it("global creation budget still applies across addresses", () => {
  const { registry: r } = setup();
  for (let i = 0; i < 100; i++)
    expect(r.reserve(`score:${i}`, `client${i}`, 0).status).toBe(200);
  expect(r.reserve("score:extra", "other", 0).status).toBe(429);
});
it("migrates the old registry once without losing saved IDs", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE resource_access (id INTEGER PRIMARY KEY,payload TEXT)");
  db.prepare("INSERT INTO resource_access VALUES(1,?)").run(
    JSON.stringify({
      ids: { "score:legacy": true },
      windows: { "traffic:global": { count: 100000, until: 86400000 } },
    }),
  );
  const sql = {
    run: (q: string, ...a: (string | number)[]) => {
      db.prepare(q).run(...a);
    },
    all: (q: string, ...a: (string | number)[]) => db.prepare(q).all(...a),
  };
  expect(new ResourceRegistry(sql).access("score:legacy", "user", 1)).toBe(200);
  expect(new ResourceRegistry(sql).access("score:legacy", "user", 2)).toBe(200);
  expect(
    db
      .prepare("SELECT name FROM sqlite_master WHERE name='resource_access'")
      .all(),
  ).toHaveLength(0);
});
