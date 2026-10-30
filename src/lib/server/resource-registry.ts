export interface RegistrySQL {
  run(sql: string, ...args: (string | number)[]): void;
  all(sql: string, ...args: (string | number)[]): Record<string, unknown>[];
}
export interface ResourcePermit {
  status: number;
  lease?: string;
}
/** All methods run in the caller's synchronous storage transaction. No raw addresses. */
export class ResourceRegistry {
  constructor(private db: RegistrySQL) {
    db.run(
      "CREATE TABLE IF NOT EXISTS resource_registry (id TEXT PRIMARY KEY, lease TEXT, expires INTEGER NOT NULL)",
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS resource_rates (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL)",
    );
    if (
      db.all(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='resource_access'",
      ).length
    ) {
      const row = db.all("SELECT payload FROM resource_access WHERE id=1")[0];
      const ids = row
        ? (JSON.parse(String(row.payload)) as { ids: Record<string, true> }).ids
        : {};
      for (const id of Object.keys(ids))
        if (/^(room:[A-Z0-9]{8}|score:[a-zA-Z0-9-]{1,100})$/.test(id))
          db.run(
            "INSERT OR IGNORE INTO resource_registry VALUES(?,NULL,0)",
            id,
          );
      db.run("DROP TABLE resource_access");
    }
  }
  private row(id: string) {
    return this.db.all(
      "SELECT lease,expires FROM resource_registry WHERE id=?",
      id,
    )[0];
  }
  private consume(limits: [string, number, number][], now: number): boolean {
    const rows = limits.map(
      ([key]) =>
        this.db.all(
          "SELECT count,until FROM resource_rates WHERE key=?",
          key,
        )[0],
    );
    if (
      limits.some(
        ([, max], i) =>
          Number(rows[i]?.until) > now && Number(rows[i]?.count) >= max,
      )
    )
      return false;
    if (
      limits.some(([key], i) => key.startsWith("find:") && !rows[i]) &&
      Number(
        this.db.all(
          "SELECT COUNT(*) AS n FROM resource_rates WHERE key LIKE 'find:%' AND until>?",
          now,
        )[0].n,
      ) >= 2000
    )
      return false;
    this.db.run("DELETE FROM resource_rates WHERE until<=?", now);
    limits.forEach(([key, , ttl], i) => {
      const live = Number(rows[i]?.until) > now;
      this.db.run(
        "INSERT INTO resource_rates VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until",
        key,
        live ? Number(rows[i].count) + 1 : 1,
        live ? Number(rows[i].until) : now + ttl,
      );
    });
    return true;
  }
  access(id: string, client: string, now: number): number {
    const row = this.row(id);
    if (row && row.lease === null)
      return this.consume([[`live:${id}`, 6000, 60000]], now) ? 200 : 429;
    return this.consume(
      [
        [`find:${client}`, 60, 60000],
        ["discovery", 10000, 60000],
      ],
      now,
    )
      ? 404
      : 429;
  }
  reserve(id: string, client: string, now: number): ResourcePermit {
    const row = this.row(id);
    if (row?.lease === null) return { status: this.access(id, client, now) };
    if (row && Number(row.expires) > now) return { status: 409 };
    const count = Number(
      this.db.all(
        "SELECT COUNT(*) AS n FROM resource_registry WHERE lease IS NULL OR expires>?",
        now,
      )[0].n,
    );
    if (count >= 10000) return { status: 503 };
    if (
      !this.consume(
        [
          [`create:${client}`, 5, 3600000],
          ["creation", 100, 86400000],
        ],
        now,
      )
    )
      return { status: 429 };
    this.db.run(
      "DELETE FROM resource_registry WHERE lease IS NOT NULL AND expires<=?",
      now,
    );
    const lease = crypto.randomUUID();
    this.db.run(
      "INSERT INTO resource_registry VALUES(?,?,?)",
      id,
      lease,
      now + 600000,
    );
    return { status: 200, lease };
  }
  finish(id: string, lease: string, success: boolean, now: number): boolean {
    const row = this.row(id);
    if (!row || row.lease !== lease || Number(row.expires) <= now) return false;
    if (success)
      this.db.run(
        "UPDATE resource_registry SET lease=NULL,expires=0 WHERE id=? AND lease=?",
        id,
        lease,
      );
    else
      this.db.run(
        "DELETE FROM resource_registry WHERE id=? AND lease=?",
        id,
        lease,
      );
    return true;
  }
}
