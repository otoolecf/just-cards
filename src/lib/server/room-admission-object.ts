import { admitAI, type AIState } from "./ai-admission";
import { ResourceRegistry, type ResourcePermit } from "./resource-registry";
import { DurableObject } from "cloudflare:workers";
import {
  admitRoom,
  releaseRoom,
  emptyAdmission,
  capacityPolicy,
  type AdmissionInput,
  type AdmissionState,
} from "./room-admission";
/** Only admission/renewal touches this object; room reads and pings stay per-room. */
export class RoomAdmission extends DurableObject<Env> {
  private resources!: ResourceRegistry;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS admission (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, salt TEXT NOT NULL)",
    );
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO admission VALUES (1,?,?)",
      JSON.stringify(emptyAdmission()),
      crypto.randomUUID(),
    );
    ctx.storage.transactionSync(() => {
      this.resources = new ResourceRegistry({
        run: (sql, ...args) => {
          ctx.storage.sql.exec(sql, ...args);
        },
        all: (sql, ...args) => ctx.storage.sql.exec(sql, ...args).toArray(),
      });
    });
  }

  async aiRequest(id: string, finish = false): Promise<boolean> {
    return this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "CREATE TABLE IF NOT EXISTS ai_budget (id INTEGER PRIMARY KEY,payload TEXT NOT NULL)",
      );
      const row = this.ctx.storage.sql
        .exec<{ payload: string }>("SELECT payload FROM ai_budget WHERE id=1")
        .toArray()[0];
      const state: AIState = row
        ? JSON.parse(row.payload)
        : { until: 0, count: 0, leases: {} };
      const allowed = finish
        ? (delete state.leases[id], true)
        : admitAI(state, id, Date.now());
      this.ctx.storage.sql.exec(
        "INSERT INTO ai_budget VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
        JSON.stringify(state),
      );
      return allowed;
    });
  }
  private registry() {
    return this.resources;
  }
  private async clientHash(address: string) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${this.row().salt}:${address}`),
    );
    return Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
  }
  private validResource(id: string) {
    return /^(room:[A-Z0-9]{8}|score:[a-zA-Z0-9-]{1,100})$/.test(id);
  }
  async accessResource(
    id: string,
    creating: boolean,
    address: string,
  ): Promise<number> {
    if (!this.validResource(id) || creating) return 400;
    const client = await this.clientHash(address);
    return this.ctx.storage.transactionSync(() =>
      this.registry().access(id, client, Date.now()),
    );
  }
  async reserveResource(id: string, address: string): Promise<ResourcePermit> {
    if (!this.validResource(id)) return { status: 400 };
    const client = await this.clientHash(address);
    return this.ctx.storage.transactionSync(() =>
      this.registry().reserve(id, client, Date.now()),
    );
  }
  async finishResource(
    id: string,
    lease: string,
    success: boolean,
  ): Promise<boolean> {
    return this.ctx.storage.transactionSync(() =>
      this.registry().finish(id, lease, success, Date.now()),
    );
  }
  private row() {
    return this.ctx.storage.sql
      .exec<{
        payload: string;
        salt: string;
      }>("SELECT payload,salt FROM admission WHERE id=1")
      .toArray()[0];
  }
  async reserve(input: AdmissionInput) {
    const salt = this.row().salt;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${salt}:${input.client}`),
    );
    const client = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    return this.ctx.storage.transactionSync(() => {
      const state = JSON.parse(this.row().payload) as AdmissionState;
      const result = admitRoom(
        state,
        { ...input, client },
        Date.now(),
        capacityPolicy(this.env),
      );
      this.ctx.storage.sql.exec(
        "UPDATE admission SET payload=? WHERE id=1",
        JSON.stringify(state),
      );
      return result;
    });
  }
  async release(code: string, lease: string) {
    this.ctx.storage.transactionSync(() => {
      const state = JSON.parse(this.row().payload) as AdmissionState;
      releaseRoom(state, code, lease);
      this.ctx.storage.sql.exec(
        "UPDATE admission SET payload=? WHERE id=1",
        JSON.stringify(state),
      );
    });
  }
}
