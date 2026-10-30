import { describe, expect, it } from "vitest";
import {
  makeTiles,
  tileName,
  evaluateMahjong,
  settleMahjong,
  DEFAULT_MAHJONG,
  type Tile,
  type MahjongResult,
} from "./mahjong";
import { familyRulesets } from "../rulesets/family-presets";
import {
  createTable,
  applyTableCommand,
  projectTable,
  makeDeck,
} from "./table-engine";
import {
  deriveState,
  createRulePack,
  type ScoreEvent,
} from "../scorekeeper/engine";
const players = ["a", "b", "c", "d"];
const bundle = () =>
  familyRulesets().find((r) => r.id === "builtin-hong-kong-mahjong")!.bundle;
const tiles = (faces: number[]): Tile[] =>
  faces.map((face, i) => ({ id: `t-${i}`, face }));
const winning = [0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 4, 4];
const context = { seatWind: 0, roundWind: 0, selfDraw: true, winningFace: 4 };
describe("tile inventory and scoring", () => {
  it("has four copies of 34 distinct named types", () => {
    const t = makeTiles();
    expect(t).toHaveLength(136);
    for (let i = 0; i < 34; i++)
      expect(t.filter((t) => t.face === i)).toHaveLength(4);
    expect(tileName(27)).toBe("East wind");
  });
  it("scores whole hands and rejects impossible inventories", () => {
    const score = evaluateMahjong(tiles(winning), [], context, DEFAULT_MAHJONG);
    expect(score.valid).toBe(true);
    expect(score.fan).toBe(10);
    expect(score.items.some((i) => i.label === "One suit only")).toBe(true);
    expect(
      evaluateMahjong(tiles(Array(14).fill(0)), [], context, DEFAULT_MAHJONG)
        .valid,
    ).toBe(false);
  });
  it("recognizes thirteen orphans and requires a full decomposition", () => {
    expect(
      evaluateMahjong(
        tiles([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 33]),
        [],
        { ...context, winningFace: 33 },
        DEFAULT_MAHJONG,
      ).items.some((i) => i.label === "Thirteen orphans"),
    ).toBe(true);
    expect(
      evaluateMahjong(tiles(winning.slice(1)), [], context, DEFAULT_MAHJONG)
        .valid,
    ).toBe(false);
  });
  it("settles discard/self draw atomically and enforces the threshold", () => {
    expect(
      settleMahjong(
        players,
        { winner: "a", payer: "b", fan: 3 },
        DEFAULT_MAHJONG,
      ),
    ).toEqual({ a: 32, b: -32, c: 0, d: 0 });
    expect(
      settleMahjong(players, { winner: "a", fan: 3 }, DEFAULT_MAHJONG),
    ).toEqual({ a: 48, b: -16, c: -16, d: -16 });
    expect(() =>
      settleMahjong(players, { winner: "a", fan: 2 }, DEFAULT_MAHJONG),
    ).toThrow();
  });
});
describe("authoritative tile capability", () => {
  it("deals tiles without changing card inventory or leaking private state", () => {
    const s = createTable(players, bundle(), makeTiles());
    expect(s.mahjong!.hands.a).toHaveLength(14);
    expect(s.mahjong!.wall).toHaveLength(83);
    const v = projectTable(s, "a").mahjong!;
    expect(v.hands.b.every((t) => t.face === undefined)).toBe(true);
    expect(JSON.stringify(v)).not.toContain('"wall":');
    expect(makeDeck()).toHaveLength(52);
  });
  it("requires all responses before advancing and masks others responses", () => {
    let s = createTable(players, bundle(), makeTiles());
    s = applyTableCommand(
      s,
      "a",
      { type: "tile_discard", tileId: s.mahjong!.hands.a[0].id },
      bundle(),
    );
    expect(s.mahjong!.phase).toBe("claims");
    s = applyTableCommand(
      s,
      "b",
      { type: "tile_respond", choice: "pass" },
      bundle(),
    );
    expect(JSON.stringify(projectTable(s, "c").mahjong)).not.toContain(
      "responses",
    );
    expect(() =>
      applyTableCommand(s, "b", { type: "tile_draw" }, bundle()),
    ).toThrow();
    for (const p of ["c", "d"])
      s = applyTableCommand(
        s,
        p,
        { type: "tile_respond", choice: "pass" },
        bundle(),
      );
    expect(s.turn).toBe(1);
    expect(s.mahjong!.phase).toBe("draw");
  });
  it("rejects card commands and duplicate claim submissions atomically", () => {
    let s = createTable(players, bundle(), makeTiles());
    expect(() =>
      applyTableCommand(s, "a", { type: "draw", source: "stock" }, bundle()),
    ).toThrow();
    s = applyTableCommand(
      s,
      "a",
      { type: "tile_discard", tileId: s.mahjong!.hands.a[0].id },
      bundle(),
    );
    s = applyTableCommand(
      s,
      "b",
      { type: "tile_respond", choice: "pass" },
      bundle(),
    );
    const before = JSON.stringify(s);
    expect(() =>
      applyTableCommand(
        s,
        "b",
        { type: "tile_respond", choice: "pass" },
        bundle(),
      ),
    ).toThrow();
    expect(JSON.stringify(s)).toBe(before);
  });
});
it("replays physical mahjong payments through undo and redo", () => {
  const result: MahjongResult = { winner: "a", payer: "b", fan: 3 };
  const e: ScoreEvent = {
    type: "add_mahjong",
    players,
    policy: DEFAULT_MAHJONG,
    result,
  };
  expect(deriveState([e], createRulePack()).totalsByPlayer).toEqual({
    a: 32,
    b: -32,
    c: 0,
    d: 0,
  });
  expect(
    deriveState([e, { type: "undo" }], createRulePack()).totalsByPlayer,
  ).toEqual({});
  expect(
    deriveState([e, { type: "undo" }, { type: "redo" }], createRulePack())
      .totalsByPlayer.a,
  ).toBe(32);
});

import { tileOptions } from "./mahjong-table";
import type { TableState, TableCommand } from "./table-engine";
import { validateTableRules } from "./table-rules";
import type { TileGroup } from "./mahjong";
function rig(
  hands: Record<string, number[]>,
  groups: Record<string, TileGroup[]> = {},
): TableState {
  const s = createTable(players, bundle(), makeTiles());
  const pool = makeTiles();
  const grab = (face: number) => {
    const i = pool.findIndex((t) => t.face === face);
    if (i < 0) throw new Error(`Fixture overuses ${face}`);
    return pool.splice(i, 1)[0];
  };
  for (const id of players) {
    s.mahjong!.groups[id] = (groups[id] ?? []).map((g) => ({
      ...g,
      tiles: g.tiles.map((t) => grab(t.face)),
    }));
    s.mahjong!.hands[id] = (hands[id] ?? []).map(grab);
  }
  for (const id of players)
    while (
      s.mahjong!.hands[id].length <
      (id === "a" ? 14 : 13) - s.mahjong!.groups[id].length * 3
    )
      s.mahjong!.hands[id].push(pool.pop()!);
  s.mahjong!.wall = pool;
  s.mahjong!.discardCount = 5;
  s.mahjong!.lastDraw = s.mahjong!.hands.a.at(-1)!.id;
  return s;
}
function act(s: TableState, id: string, c: TableCommand) {
  return applyTableCommand(s, id, c, bundle());
}
function respond(
  s: TableState,
  id: string,
  choice: "pass" | "win" | "chow" | "pung" | "kong",
) {
  const o = tileOptions(s, id, DEFAULT_MAHJONG).find(
    (o) => o.command.type === "tile_respond" && o.command.choice === choice,
  );
  if (!o) throw new Error(`No ${choice} for ${id}`);
  return act(s, id, o.command);
}
function discard(s: TableState, id: string, face: number) {
  return act(s, id, {
    type: "tile_discard",
    tileId: s.mahjong!.hands[id].find((t) => t.face === face)!.id,
  });
}
function invariant(s: TableState) {
  const m = s.mahjong!;
  const inventory = [
    ...m.wall,
    ...Object.values(m.hands).flat(),
    ...Object.values(m.discards).flat(),
    ...Object.values(m.groups)
      .flat()
      .flatMap((g) => g.tiles),
  ];
  expect(inventory).toHaveLength(136);
  expect(new Set(inventory.map((t) => t.id)).size).toBe(136);
  for (let f = 0; f < 34; f++)
    expect(inventory.filter((t) => t.face === f)).toHaveLength(4);
}
describe("claims, quads and compatibility", () => {
  it("resolves matching groups before sequences regardless of arrival order", () => {
    const original = discard(
      rig({ a: [4], b: [3, 5], c: [4, 4], d: [] }),
      "a",
      4,
    );
    let s = respond(original, "b", "chow");
    expect(s.mahjong!.groups.b).toHaveLength(0);
    s = respond(s, "d", "pass");
    s = respond(s, "c", "pung");
    expect(s.turn).toBe(2);
    expect(s.mahjong!.groups.c[0].kind).toBe("pung");
    expect(s.mahjong!.groups.b).toHaveLength(0);
    invariant(s);
    let reverse = respond(original, "c", "pung");
    reverse = respond(reverse, "b", "chow");
    reverse = respond(reverse, "d", "pass");
    expect(reverse).toEqual(s);
  });
  it("only allows sequences from previous seat and prevents claim swapping", () => {
    let s = discard(rig({ a: [4], b: [3, 4, 5, 6], c: [3, 5], d: [] }), "a", 4);
    expect(
      tileOptions(s, "c", DEFAULT_MAHJONG).some(
        (o) => o.command.type === "tile_respond" && o.command.choice === "chow",
      ),
    ).toBe(false);
    for (const id of ["c", "d"]) s = respond(s, id, "pass");
    s = respond(s, "b", "chow");
    expect(() => discard(s, "b", 4)).toThrow();
    expect(
      tileOptions(s, "b", DEFAULT_MAHJONG).some(
        (o) => o.command.type === "tile_kong",
      ),
    ).toBe(false);
    invariant(s);
  });
  it("exposes a called quad and draws exactly one replacement from the back", () => {
    let s = discard(rig({ a: [4], b: [4, 4, 4], c: [], d: [] }), "a", 4);
    const replacement = s.mahjong!.wall[0].id;
    for (const id of ["c", "d"]) s = respond(s, id, "pass");
    s = respond(s, "b", "kong");
    expect(s.mahjong!.groups.b[0].tiles).toHaveLength(4);
    expect(s.mahjong!.lastDraw).toBe(replacement);
    expect(s.mahjong!.hands.b).toHaveLength(11);
    invariant(s);
  });
  it("handles concealed quads and added quads with a response window", () => {
    let s = rig({ a: [4, 4, 4, 4], b: [], c: [], d: [] });
    const c = tileOptions(s, "a", DEFAULT_MAHJONG).find(
      (o) => o.command.type === "tile_kong",
    )!;
    s = act(s, "a", c.command);
    for (const id of ["b", "c", "d"]) s = respond(s, id, "pass");
    expect(s.mahjong!.groups.a[0].concealed).toBe(true);
    expect(s.mahjong!.replacement).toBe(true);
    invariant(s);
    s = rig(
      { a: [4], b: [], c: [], d: [] },
      { a: [{ kind: "pung", tiles: tiles([4, 4, 4]), concealed: false }] },
    );
    s = act(
      s,
      "a",
      tileOptions(s, "a", DEFAULT_MAHJONG).find(
        (o) => o.command.type === "tile_kong" && o.command.groupIndex === 0,
      )!.command,
    );
    for (const id of ["b", "c", "d"]) s = respond(s, id, "pass");
    expect(s.mahjong!.groups.a[0].kind).toBe("kong");
    invariant(s);
  });
  it("allows robbing an added quad and leaves the original triplet intact", () => {
    let s = rig(
      { a: [4], b: [0, 1, 2, 3, 5, 6, 7, 8, 0, 1, 2, 6, 6], c: [], d: [] },
      { a: [{ kind: "pung", tiles: tiles([4, 4, 4]), concealed: false }] },
    );
    s = act(
      s,
      "a",
      tileOptions(s, "a", DEFAULT_MAHJONG).find(
        (o) => o.command.type === "tile_kong" && o.command.groupIndex === 0,
      )!.command,
    );
    s = respond(s, "b", "win");
    for (const id of ["c", "d"]) s = respond(s, id, "pass");
    expect(s.stage).toBe("round_end");
    expect(s.mahjong!.groups.a[0].kind).toBe("pung");
    expect(
      s.mahjong!.result!.score!.items.some((i) => i.label === "Robbing a quad"),
    ).toBe(true);
    invariant(s);
  });
  it("awards a discard win, rotates dealer, and preserves round scores", () => {
    let s = discard(
      rig({ a: [4], b: winning.filter((_, i) => i !== 13), c: [], d: [] }),
      "a",
      4,
    );
    s = respond(s, "b", "win");
    for (const id of ["c", "d"]) s = respond(s, id, "pass");
    expect(s.stage).toBe("round_end");
    expect(s.scores[0].b).toBeGreaterThan(0);
    expect(Object.values(s.scores[0]).reduce((a, b) => a + b)).toBe(0);
    invariant(s);
    const next = createTable(players, bundle(), makeTiles(), s);
    expect(next.dealer).toBe(1);
    expect(next.scores).toEqual(s.scores);
    expect(() =>
      createTable(["a", "b", "c", "x"], bundle(), makeTiles(), s),
    ).toThrow();
  });
  it("prefers the nearest winning seat, not the first response", () => {
    const h = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 31];
    // Enable practice threshold; both players wait on a red dragon pair.
    const b = bundle();
    b.runtimeRulePack.tableRules!.tileMahjong!.minFan = 0;
    let s = rig({ a: [31], b: h, c: h, d: [] });
    s.mahjong!.policy.minFan = 0;
    const step = (id: string, c: TableCommand) =>
      (s = applyTableCommand(s, id, c, b));
    step("a", {
      type: "tile_discard",
      tileId: s.mahjong!.hands.a.find((t) => t.face === 31)!.id,
    });
    step("c", { type: "tile_respond", choice: "win" });
    step("d", { type: "tile_respond", choice: "pass" });
    step("b", { type: "tile_respond", choice: "win" });
    expect(s.mahjong!.result!.winner).toBe("b");
    invariant(s);
  });
  it("replays an entire exhausted wall without losing tiles or leaking responses", () => {
    const initial = createTable(players, bundle(), makeTiles());
    let s = initial;
    const log: { actor: string; command: TableCommand }[] = [];
    for (let n = 0; n < 600 && s.stage !== "round_end"; n++) {
      const actor =
        s.mahjong!.phase === "claims"
          ? players.find(
              (p) =>
                p !== s.mahjong!.claim!.from && !s.mahjong!.claim!.responses[p],
            )!
          : players[s.turn];
      const options = tileOptions(s, actor, DEFAULT_MAHJONG);
      const command = (options.find(
        (o) => o.command.type === "tile_respond" && o.command.choice === "pass",
      ) ??
        options.find(
          (o) =>
            o.command.type === "tile_draw" || o.command.type === "tile_discard",
        ))!.command;
      log.push({ actor, command });
      s = act(s, actor, command);
      invariant(s);
    }
    expect(s.stage).toBe("round_end");
    expect(s.mahjong!.result!.winner).toBeUndefined();
    expect(s.scores[0]).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    let replay = initial;
    for (const e of log) replay = act(replay, e.actor, e.command);
    expect(replay).toEqual(s);
  });
  it("retains old policy shapes, decks and private projections", () => {
    for (const id of [
      "builtin-six-card-golf",
      "builtin-500-rum",
      "builtin-solitaire",
      "builtin-palace",
      "builtin-palace-family",
      "builtin-bridge",
    ]) {
      const b = familyRulesets().find((r) => r.id === id)!.bundle;
      const r = JSON.parse(JSON.stringify(b.runtimeRulePack.tableRules));
      validateTableRules(r);
      const seats = players.slice(0, r.players.min);
      const s = createTable(seats, b, makeDeck());
      expect(s.mahjong).toBeUndefined();
      expect(projectTable(s, seats[0]).mahjong).toBeUndefined();
      expect(
        [
          ...s.stock,
          ...Object.values(s.hands).flat(),
          ...s.discard,
          ...(s.patience?.tableau.flat() ?? []),
          ...(s.shedding ? Object.values(s.shedding.down).flat() : []),
        ].length,
      ).toBeGreaterThan(0);
    }
  });
});

describe("Hong Kong scoring boundaries", () => {
  it("selects a valid highest-scoring interpretation of ambiguous tiles", () => {
    const score = evaluateMahjong(
      tiles([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4]),
      [],
      { ...context, winningFace: 4 },
      DEFAULT_MAHJONG,
    );
    expect(score.valid).toBe(true);
    expect(score.items.some((i) => i.label === "Four concealed triplets")).toBe(
      true,
    );
  });
  it("distinguishes a complete low-value hand from a legal win", () => {
    const h = tiles([0, 1, 2, 9, 10, 11, 18, 19, 20, 3, 4, 5, 28, 28]);
    const score = evaluateMahjong(
      h,
      [],
      { ...context, selfDraw: false, winningFace: 28 },
      DEFAULT_MAHJONG,
    );
    expect(score.shape).toBe(true);
    expect(score.fan).toBe(2);
    expect(score.valid).toBe(false);
  });
  it("counts overlapping seat/round winds, dragons and small dragons", () => {
    const h = tiles([27, 27, 27, 31, 31, 31, 32, 32, 32, 0, 1, 2, 33, 33]);
    const score = evaluateMahjong(
      h,
      [],
      { ...context, winningFace: 33 },
      DEFAULT_MAHJONG,
    );
    for (const label of [
      "Seat wind group",
      "Round wind group",
      "Small dragons",
    ])
      expect(score.items.some((i) => i.label === label)).toBe(true);
    expect(score.fan).toBe(10);
  });
  it("rejects impossible declared groups, duplicate identities and contradictory context", () => {
    const invalid = {
      kind: "chow" as const,
      concealed: false,
      tiles: tiles([7, 8, 9]),
    };
    expect(
      evaluateMahjong(
        tiles(winning.slice(3)),
        [invalid],
        context,
        DEFAULT_MAHJONG,
      ).valid,
    ).toBe(false);
    const h = tiles(winning);
    h[1].id = h[0].id;
    expect(evaluateMahjong(h, [], context, DEFAULT_MAHJONG).valid).toBe(false);
    expect(
      evaluateMahjong(
        tiles(winning),
        [],
        { ...context, robbingKong: true },
        DEFAULT_MAHJONG,
      ).valid,
    ).toBe(false);
  });
  it("handles liability and all payment-table entries without creating points", () => {
    for (let fan = 3; fan <= 10; fan++)
      for (const result of [
        { winner: "a", payer: "c", fan },
        { winner: "a", fan },
        { winner: "a", liability: "b", fan },
      ]) {
        const delta = settleMahjong(players, result, DEFAULT_MAHJONG);
        expect(Object.values(delta).reduce((a, b) => a + b)).toBe(0);
      }
    expect(
      settleMahjong(
        players,
        { winner: "a", liability: "b", fan: 3 },
        DEFAULT_MAHJONG,
      ),
    ).toEqual({ a: 48, b: -48, c: 0, d: 0 });
  });
  it("retains dealer on wins, advances on draws and ends after four winds", () => {
    const events: ScoreEvent[] = Array.from({ length: 16 }, () => ({
      type: "add_mahjong",
      players,
      policy: DEFAULT_MAHJONG,
      result: { draw: true },
    }));
    const state = deriveState(events, createRulePack());
    expect(state.mahjong).toMatchObject({
      rotations: 16,
      hands: 16,
      finished: true,
      dealer: 0,
    });
    expect(() => deriveState([...events, events[0]], createRulePack())).toThrow(
      /match ends/,
    );
    expect(
      deriveState(
        [
          {
            type: "add_mahjong",
            players,
            policy: DEFAULT_MAHJONG,
            result: { winner: "a", fan: 3 },
          },
        ],
        createRulePack(),
      ).mahjong?.dealer,
    ).toBe(0);
  });
  it("robbed concealed quad is available only to a thirteen-orphans hand", () => {
    let s = rig({
      a: [0, 0, 0, 0],
      b: [8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33, 33],
      c: [],
      d: [],
    });
    const kong = tileOptions(s, "a", DEFAULT_MAHJONG).find(
      (o) =>
        o.command.type === "tile_kong" &&
        o.command.tileIds.every(
          (id) => s.mahjong!.hands.a.find((t) => t.id === id)!.face === 0,
        ),
    )!;
    s = act(s, "a", kong.command);
    s = respond(s, "b", "win");
    s = respond(s, "c", "pass");
    s = respond(s, "d", "pass");
    expect(s.mahjong!.result!.winner).toBe("b");
    expect(s.mahjong!.groups.a).toHaveLength(0);
    invariant(s);
  });
  it("assigns liability on the third dragon claim", () => {
    let s = rig(
      { a: [33], b: [33, 33, 0, 1, 2, 9, 9], c: [], d: [] },
      {
        b: [
          { kind: "pung", concealed: false, tiles: tiles([31, 31, 31]) },
          { kind: "pung", concealed: false, tiles: tiles([32, 32, 32]) },
        ],
      },
    );
    s = discard(s, "a", 33);
    s = respond(s, "b", "pung");
    s = respond(s, "c", "pass");
    s = respond(s, "d", "pass");
    expect(s.mahjong!.liability.b).toBe("a");
    invariant(s);
  });
});

it("does not offer a sequence claim that leaves no legal discard", () => {
  let s = rig(
    { a: [4], b: [3, 5, 4, 4], c: [], d: [] },
    {
      b: [
        { kind: "pung", concealed: false, tiles: tiles([9, 9, 9]) },
        { kind: "pung", concealed: false, tiles: tiles([19, 19, 19]) },
        { kind: "pung", concealed: false, tiles: tiles([13, 13, 13]) },
      ],
    },
  );
  s = discard(s, "a", 4);
  expect(
    tileOptions(s, "b", DEFAULT_MAHJONG).some(
      (o) => o.command.type === "tile_respond" && o.command.choice === "chow",
    ),
  ).toBe(false);
});
