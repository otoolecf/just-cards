import {
  advanceMahjong,
  evaluateMahjong,
  makeTiles,
  settleMahjong,
  tileName,
  validTileGroup,
  type MahjongContext,
  type MahjongPolicy,
  type MahjongProgress,
  type MahjongScore,
  type Tile,
  type TileGroup,
  type VisibleTile,
} from "./mahjong";
import type { TableState, TableView } from "./table-engine";
export type TileCommand =
  | { type: "tile_draw" }
  | { type: "tile_discard"; tileId: string }
  | { type: "tile_win" }
  | { type: "tile_kong"; tileIds: string[]; groupIndex?: number }
  | {
      type: "tile_respond";
      choice: "pass" | "win" | "chow" | "pung" | "kong";
      tileIds?: string[];
    };
type Response = Extract<TileCommand, { type: "tile_respond" }>;
interface Claim {
  tile: Tile;
  from: string;
  kind: "discard" | "added_kong" | "concealed_kong";
  tileIds?: string[];
  groupIndex?: number;
  responses: Record<string, Response>;
}
export interface MahjongState {
  policy: MahjongPolicy;
  hands: Record<string, Tile[]>;
  wall: Tile[];
  groups: Record<string, TileGroup[]>;
  discards: Record<string, Tile[]>;
  phase: "draw" | "discard" | "claims" | "ended";
  claim?: Claim;
  rotations: number;
  progress?: MahjongProgress;
  lastDraw?: string;
  replacement: boolean;
  kongChain: number;
  discardCount: number;
  ban: number[];
  liability: Record<string, string>;
  result?: {
    winner?: string;
    payer?: string;
    score?: MahjongScore;
    description: string;
  };
}
export interface TileOption {
  label: string;
  explanation: string;
  command: TileCommand;
}
export interface MahjongView {
  hands: Record<string, VisibleTile[]>;
  groups: Record<string, TileGroup[]>;
  discards: Record<string, Tile[]>;
  phase: MahjongState["phase"];
  wallCount: number;
  rotations: number;
  lastDraw?: string;
  claim?: {
    tile: Tile;
    from: string;
    kind: Claim["kind"];
    responded: boolean;
    waiting: number;
  };
  result?: MahjongState["result"];
  options: TileOption[];
  winReason: string;
}
function ctx(s: TableState, actor: string, claim = false): MahjongContext {
  const m = s.mahjong!,
    c = m.claim;
  const selfDraw = !claim;
  const winning = claim
    ? c!.tile
    : m.hands[actor].find((t) => t.id === m.lastDraw);
  return {
    seatWind: (s.players.indexOf(actor) - s.dealer + 4) % 4,
    roundWind: Math.floor(m.rotations / 4),
    selfDraw,
    winningFace: winning?.face ?? -1,
    ...(claim && c?.kind !== "discard" ? { robbingKong: true } : {}),
    ...(selfDraw && m.replacement
      ? {
          afterKong: true,
          ...(m.kongChain > 1 ? { consecutiveKongs: true } : {}),
        }
      : {}),
    ...(selfDraw && !m.wall.length ? { lastWall: true } : {}),
    ...(m.discardCount === 0 &&
    selfDraw &&
    s.turn === s.dealer &&
    Object.values(m.groups).every((g) => !g.length)
      ? { initial: "heaven" as const }
      : {}),
    ...(claim &&
    m.discardCount === 1 &&
    c?.kind === "discard" &&
    c.from === s.players[s.dealer] &&
    Object.values(m.groups).every((g) => !g.length)
      ? { initial: "earth" as const }
      : {}),
  };
}
function score(s: TableState, actor: string, p: MahjongPolicy, claim = false) {
  const m = s.mahjong!;
  return evaluateMahjong(
    [...m.hands[actor], ...(claim ? [m.claim!.tile] : [])],
    m.groups[actor],
    ctx(s, actor, claim),
    p,
  );
}
function end(
  s: TableState,
  p: MahjongPolicy,
  winner?: string,
  payer?: string,
  scored?: MahjongScore,
) {
  const m = s.mahjong!;
  const result = winner
    ? {
        winner,
        payer,
        fan: scored!.fan,
        ...(!payer && m.liability[winner]
          ? { liability: m.liability[winner] }
          : {}),
      }
    : { draw: true };
  s.scores.push(settleMahjong(s.players, result, p));
  m.progress = advanceMahjong(
    {
      dealer: s.dealer,
      rotations: m.rotations,
      hands: s.round - 1,
      finished: false,
      players: s.players,
    },
    s.players,
    result,
    p,
  );
  m.phase = "ended";
  delete m.claim;
  m.result = {
    winner,
    payer,
    score: scored,
    description: winner
      ? `${scored!.fan} faan · ${payer ? "win on a discard" : "self draw"}${!payer && m.liability[winner] ? " · liability payment" : ""}`
      : "The wall is empty. This hand is a draw; no points change.",
  };
  s.stage = m.progress.finished ? "game_end" : "round_end";
  if (m.progress.finished) {
    const totals = s.players.map((id) =>
      s.scores.reduce((n, r) => n + (r[id] ?? 0), 0),
    );
    s.winners = s.players.filter((_, i) => totals[i] === Math.max(...totals));
  } else s.winners = winner ? [winner] : [];
}
function draw(s: TableState, p: MahjongPolicy, replacement = false) {
  const m = s.mahjong!;
  const t = replacement ? m.wall.shift() : m.wall.pop();
  if (!t) {
    end(s, p);
    return;
  }
  m.hands[s.players[s.turn]].push(t);
  m.lastDraw = t.id;
  m.replacement = replacement;
  m.kongChain = replacement ? m.kongChain + 1 : 0;
  m.phase = "discard";
  m.ban = [];
  s.stage = "play";
}
export function createMahjongTable(
  players: string[],
  deck: Tile[],
  p: MahjongPolicy,
  previous?: TableState,
): TableState {
  const expected = makeTiles();
  if (
    deck.length !== 136 ||
    new Set(deck.map((t) => t.id)).size !== 136 ||
    deck.some((t) => typeof t.id !== "string" || !t.id) ||
    expected.some((t) => deck.filter((v) => v.face === t.face).length !== 4)
  )
    throw new Error("Invalid tile inventory");
  if (
    previous &&
    (previous.stage !== "round_end" ||
      !previous.mahjong ||
      JSON.stringify(previous.players) !== JSON.stringify(players))
  )
    throw new Error("Keep the four seats fixed until the match ends");
  const progress = previous?.mahjong?.progress;
  const s: TableState = {
    players: [...players],
    round: (previous?.round ?? 0) + 1,
    dealer: progress?.dealer ?? 0,
    turn: progress?.dealer ?? 0,
    stage: "play",
    hands: Object.fromEntries(players.map((id) => [id, []])),
    stock: [],
    discard: [],
    melds: [],
    scores: structuredClone(previous?.scores ?? []),
    winners: [],
  };
  const m: MahjongState = {
    policy: structuredClone(p),
    hands: Object.fromEntries(players.map((id) => [id, []])),
    wall: structuredClone(deck),
    groups: Object.fromEntries(players.map((id) => [id, []])),
    discards: Object.fromEntries(players.map((id) => [id, []])),
    phase: "discard",
    rotations: progress?.rotations ?? 0,
    replacement: false,
    kongChain: 0,
    discardCount: 0,
    ban: [],
    liability: {},
  };
  s.mahjong = m;
  for (let i = 0; i < 13; i++)
    for (let j = 0; j < 4; j++)
      m.hands[players[(s.dealer + j) % 4]].push(m.wall.pop()!);
  draw(s, p);
  return s;
}
function take(
  m: MahjongState,
  actor: string,
  ids: string[],
  count: number,
): Tile[] {
  if (
    !Array.isArray(ids) ||
    ids.length !== count ||
    new Set(ids).size !== count
  )
    throw new Error("Choose distinct tiles");
  return ids.map((id) => {
    const t = m.hands[actor].find((t) => t.id === id);
    if (!t) throw new Error("Tile is not in your hand");
    return t;
  });
}
/** No exchanging a claimed group by discarding an equivalent tile. */
function claimDiscardBan(
  tile: Tile,
  used: Tile[],
  sequence: boolean,
): number[] {
  const ban = [tile.face];
  if (sequence)
    for (let face = 0; face < 27; face++) {
      if (
        validTileGroup({
          kind: "chow",
          concealed: false,
          tiles: [...used, { id: "candidate", face }],
        })
      )
        ban.push(face);
    }
  return ban;
}
function responseOptions(
  s: TableState,
  actor: string,
  p: MahjongPolicy,
): TileOption[] {
  const m = s.mahjong!,
    c = m.claim!;
  if (c.from === actor || c.responses[actor]) return [];
  const options: TileOption[] = [
    {
      label: "Pass",
      explanation: "Leave this tile. Play continues after everyone responds.",
      command: { type: "tile_respond", choice: "pass" },
    },
  ];
  const win = score(s, actor, p, true);
  if (
    win.valid &&
    (c.kind !== "concealed_kong" ||
      win.items.some((i) => i.label === "Thirteen orphans"))
  )
    options.push({
      label: "Win with this tile",
      explanation: `Your hand qualifies for ${win.fan} faan. A win takes priority over other claims.`,
      command: { type: "tile_respond", choice: "win" },
    });
  if (c.kind !== "discard") return options;
  const same = m.hands[actor].filter((t) => t.face === c.tile.face);
  if (same.length >= 2)
    options.push({
      label: "Make three of a kind (pung)",
      explanation:
        "Take the discard with your two matching tiles. Put the group on the table, then discard.",
      command: {
        type: "tile_respond",
        choice: "pung",
        tileIds: same.slice(0, 2).map((t) => t.id),
      },
    });
  if (same.length >= 3 && m.wall.length)
    options.push({
      label: "Make four of a kind (kong)",
      explanation: "Expose four matching tiles and draw a replacement tile.",
      command: {
        type: "tile_respond",
        choice: "kong",
        tileIds: same.slice(0, 3).map((t) => t.id),
      },
    });
  if (
    s.players[(s.players.indexOf(c.from) + 1) % 4] === actor &&
    c.tile.face < 27
  )
    for (let start = c.tile.face - 2; start <= c.tile.face; start++) {
      if (
        start < 0 ||
        start >= 27 ||
        start % 9 > 6 ||
        Math.floor(start / 9) !== Math.floor(c.tile.face / 9)
      )
        continue;
      const faces = [start, start + 1, start + 2].filter(
          (f) => f !== c.tile.face,
        ),
        chosen = faces.map((f) => m.hands[actor].find((t) => t.face === f));
      if (
        chosen.every(Boolean) &&
        m.hands[actor].some(
          (t) =>
            !chosen.some((c) => c!.id === t.id) &&
            !claimDiscardBan(c.tile, chosen as Tile[], true).includes(t.face),
        )
      )
        options.push({
          label: `Make a sequence: ${(start % 9) + 1}–${(start % 9) + 3} ${tileName(start).split(" ").slice(1).join(" ")} (chow)`,
          explanation:
            "Only the next player may claim a sequence. A win or matching group takes priority.",
          command: {
            type: "tile_respond",
            choice: "chow",
            tileIds: chosen.map((t) => t!.id),
          },
        });
    }
  return options;
}
export function tileOptions(
  s: TableState,
  actor: string,
  p: MahjongPolicy,
): TileOption[] {
  const m = s.mahjong!;
  if (!s.players.includes(actor) || m.phase === "ended") return [];
  if (m.phase === "claims") return responseOptions(s, actor, p);
  if (s.players[s.turn] !== actor) return [];
  if (m.phase === "draw")
    return [
      {
        label: "Draw a tile",
        explanation: "Take the next hidden tile from the wall.",
        command: { type: "tile_draw" },
      },
    ];
  const options: TileOption[] = [];
  const win = score(s, actor, p);
  if (m.lastDraw && win.valid)
    options.push({
      label: "Declare mahjong",
      explanation: `Your complete hand is worth ${win.fan} faan.`,
      command: { type: "tile_win" },
    });
  if (m.lastDraw && m.wall.length) {
    for (let f = 0; f < 34; f++) {
      const same = m.hands[actor].filter((t) => t.face === f);
      if (same.length === 4)
        options.push({
          label: `Declare four ${tileName(f)} tiles`,
          explanation:
            "Set aside a concealed quad and draw a replacement. Thirteen orphans may rob this quad.",
          command: { type: "tile_kong", tileIds: same.map((t) => t.id) },
        });
    }
    m.groups[actor].forEach((g, groupIndex) => {
      const tile = m.hands[actor].find((t) => t.face === g.tiles[0].face);
      if (g.kind === "pung" && tile)
        options.push({
          label: `Extend ${tileName(tile.face)} to four`,
          explanation:
            "Others may win with this tile before you draw a replacement.",
          command: { type: "tile_kong", tileIds: [tile.id], groupIndex },
        });
    });
  }
  for (const tile of m.hands[actor])
    if (!m.ban.includes(tile.face))
      options.push({
        label: `Discard ${tileName(tile.face)}`,
        explanation: "Place this tile face up for others to claim.",
        command: { type: "tile_discard", tileId: tile.id },
      });
  return options;
}
function commitKong(s: TableState, p: MahjongPolicy) {
  const m = s.mahjong!,
    c = m.claim!;
  const tiles = take(m, c.from, c.tileIds!, c.kind === "added_kong" ? 1 : 4);
  if (c.kind === "added_kong") {
    const g = m.groups[c.from][c.groupIndex!];
    g.kind = "kong";
    g.tiles.push(...tiles);
  } else m.groups[c.from].push({ kind: "kong", tiles, concealed: true });
  m.hands[c.from] = m.hands[c.from].filter((t) => !c.tileIds!.includes(t.id));
  delete m.claim;
  draw(s, p, true);
}
function resolve(s: TableState, p: MahjongPolicy) {
  const m = s.mahjong!,
    c = m.claim!;
  if (Object.keys(c.responses).length !== 3) return;
  const priority = { win: 3, pung: 2, kong: 2, chow: 1, pass: 0 };
  const candidates = Array.from(
    { length: 3 },
    (_, i) => s.players[(s.players.indexOf(c.from) + i + 1) % 4],
  )
    .map((id) => ({ id, response: c.responses[id] }))
    .sort((a, b) => priority[b.response.choice] - priority[a.response.choice]);
  const first = candidates[0];
  if (first.response.choice === "win") {
    const scored = score(s, first.id, p, true);
    if (c.kind === "discard") m.discards[c.from].pop();
    else m.hands[c.from] = m.hands[c.from].filter((t) => t.id !== c.tile.id);
    m.hands[first.id].push(c.tile);
    end(s, p, first.id, c.from, scored);
    return;
  }
  if (c.kind !== "discard") {
    commitKong(s, p);
    return;
  }
  if (first.response.choice === "pass") {
    s.turn = (s.players.indexOf(c.from) + 1) % 4;
    delete m.claim;
    m.phase = "draw";
    s.stage = "draw";
    if (!m.wall.length) end(s, p);
    return;
  }
  const actor = first.id,
    r = first.response,
    tiles = take(m, actor, r.tileIds!, r.choice === "kong" ? 3 : 2);
  const g: TileGroup = {
    kind: r.choice as TileGroup["kind"],
    tiles: [...tiles, c.tile].sort((a, b) => a.face - b.face),
    concealed: false,
    from: c.from,
  };
  if (!validTileGroup(g)) throw new Error("Invalid claim group");
  if (
    p.liability &&
    (m.groups[actor].length === 3 ||
      (c.tile.face >= 31 &&
        m.groups[actor].filter((g) => g.tiles[0].face >= 31).length === 2))
  )
    m.liability[actor] = c.from;
  m.groups[actor].push(g);
  m.discards[c.from].pop();
  m.hands[actor] = m.hands[actor].filter((t) => !r.tileIds!.includes(t.id));
  s.turn = s.players.indexOf(actor);
  delete m.claim;
  m.lastDraw = undefined;
  m.replacement = false;
  m.kongChain = 0;
  m.ban = claimDiscardBan(c.tile, tiles, r.choice === "chow");
  m.phase = "discard";
  s.stage = "play";
  if (r.choice === "kong") draw(s, p, true);
}
/** Called with a clone by table-engine. Commands are validated against private legal options. */
export function applyMahjong(
  s: TableState,
  actor: string,
  command: TileCommand,
  p: MahjongPolicy,
): TableState {
  const m = s.mahjong!;
  const options = tileOptions(s, actor, p);
  const same = (a: TileCommand, b: TileCommand) => {
    if (a.type !== b.type) return false;
    if (a.type === "tile_discard" && b.type === "tile_discard")
      return a.tileId === b.tileId;
    if (a.type === "tile_respond" && b.type === "tile_respond")
      return (
        a.choice === b.choice &&
        (a.choice === "pass" ||
          a.choice === "win" ||
          JSON.stringify([...(a.tileIds ?? [])].sort()) ===
            JSON.stringify([...(b.tileIds ?? [])].sort()))
      );
    if (a.type === "tile_kong" && b.type === "tile_kong")
      return (
        a.groupIndex === b.groupIndex &&
        JSON.stringify([...a.tileIds].sort()) ===
          JSON.stringify([...(b.tileIds ?? [])].sort())
      );
    return true;
  };
  if (!options.some((o) => same(o.command, command)))
    throw new Error(
      "That move is not available. Use the choices shown for your current turn.",
    );
  if (command.type === "tile_draw") draw(s, p);
  else if (command.type === "tile_win")
    end(s, p, actor, undefined, score(s, actor, p));
  else if (command.type === "tile_discard") {
    const t = take(m, actor, [command.tileId], 1)[0];
    m.hands[actor] = m.hands[actor].filter((t) => t.id !== command.tileId);
    m.discards[actor].push(t);
    m.discardCount++;
    m.claim = { tile: t, from: actor, kind: "discard", responses: {} };
    m.phase = "claims";
    m.lastDraw = undefined;
    m.replacement = false;
    m.kongChain = 0;
    m.ban = [];
  } else if (command.type === "tile_respond") {
    m.claim!.responses[actor] = structuredClone(command);
    resolve(s, p);
  } else if (command.type === "tile_kong") {
    const added = command.groupIndex !== undefined;
    const ts = take(m, actor, command.tileIds, added ? 1 : 4);
    m.claim = {
      tile: ts[0],
      from: actor,
      kind: added ? "added_kong" : "concealed_kong",
      tileIds: command.tileIds,
      groupIndex: command.groupIndex,
      responses: {},
    };
    m.phase = "claims";
  }
  return s;
}
export function projectMahjong(
  s: TableState,
  viewer: string,
  p: MahjongPolicy,
): MahjongView {
  const m = s.mahjong!,
    ended = m.phase === "ended",
    own = s.players.includes(viewer),
    options = own ? tileOptions(s, viewer, p) : [];
  return {
    hands: Object.fromEntries(
      s.players.map((id) => [
        id,
        m.hands[id].map((t, i) =>
          ended || id === viewer ? { ...t } : { id: `hidden-${id}-${i}` },
        ),
      ]),
    ),
    groups: structuredClone(m.groups),
    discards: structuredClone(m.discards),
    phase: m.phase,
    wallCount: m.wall.length,
    rotations: m.rotations,
    ...(s.players[s.turn] === viewer && m.lastDraw
      ? { lastDraw: m.lastDraw }
      : {}),
    ...(m.claim
      ? {
          claim: {
            tile: { ...m.claim.tile },
            from: m.claim.from,
            kind: m.claim.kind,
            responded: !!m.claim.responses[viewer],
            waiting: 3 - Object.keys(m.claim.responses).length,
          },
        }
      : {}),
    ...(m.result ? { result: structuredClone(m.result) } : {}),
    options,
    winReason:
      own &&
      ((m.phase === "discard" && s.players[s.turn] === viewer && m.lastDraw) ||
        (m.phase === "claims" && m.claim?.from !== viewer))
        ? score(s, viewer, p, m.phase === "claims").reason
        : "",
  };
}
