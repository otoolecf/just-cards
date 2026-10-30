/** Tile identity is separate from the legacy playing-card model. Faces 0..26 are
 * dots/bamboo/characters, 27..30 winds, 31..33 dragons. No encoded private IDs. */
export interface Tile {
  id: string;
  face: number;
}
export interface VisibleTile {
  id: string;
  face?: number;
}
export interface TileGroup {
  kind: "chow" | "pung" | "kong";
  tiles: Tile[];
  concealed: boolean;
  from?: string;
}
export interface MahjongPolicy {
  scoring: "hk-classical/v1";
  flowers: false;
  minFan: number;
  maxFan: 10;
  prevailingWinds: 1 | 4;
  liability: boolean;
}
export const DEFAULT_MAHJONG: MahjongPolicy = {
  scoring: "hk-classical/v1",
  flowers: false,
  minFan: 3,
  maxFan: 10,
  prevailingWinds: 4,
  liability: true,
};
export const WIND_NAMES = ["East", "South", "West", "North"];
const HONORS = [
  "East wind",
  "South wind",
  "West wind",
  "North wind",
  "Red dragon",
  "Green dragon",
  "White dragon",
];
export function tileName(face: number): string {
  return face < 27
    ? `${(face % 9) + 1} ${["Dots", "Bamboo", "Characters"][Math.floor(face / 9)]}`
    : (HONORS[face - 27] ?? "Unknown tile");
}
export function makeTiles(): Tile[] {
  return Array.from({ length: 136 }, (_, i) => ({
    id: `tile-${i}`,
    face: Math.floor(i / 4),
  }));
}
export function shuffledTiles(): Tile[] {
  const tiles = makeTiles();
  for (let i = tiles.length - 1; i > 0; i--) {
    const bound = i + 1,
      limit = Math.floor(0x100000000 / bound) * bound;
    let n: number;
    do {
      n = crypto.getRandomValues(new Uint32Array(1))[0];
    } while (n >= limit);
    const j = n % bound;
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.map((t) => ({ ...t, id: crypto.randomUUID() }));
}
export function validTileGroup(g: TileGroup): boolean {
  if (!g || !Array.isArray(g.tiles) || typeof g.concealed !== "boolean")
    return false;
  const f = g.tiles.map((t) => t.face).sort((a, b) => a - b);
  if (f.some((n) => !Number.isInteger(n) || n < 0 || n > 33)) return false;
  if (g.kind === "chow")
    return (
      !g.concealed &&
      f.length === 3 &&
      f[0] < 27 &&
      Math.floor(f[0] / 9) === Math.floor(f[2] / 9) &&
      f[1] === f[0] + 1 &&
      f[2] === f[0] + 2
    );
  return (
    ((g.kind === "pung" && !g.concealed && f.length === 3) ||
      (g.kind === "kong" && f.length === 4)) &&
    f.every((n) => n === f[0])
  );
}
export interface MahjongContext {
  seatWind: number;
  roundWind: number;
  selfDraw: boolean;
  winningFace: number;
  robbingKong?: boolean;
  afterKong?: boolean;
  consecutiveKongs?: boolean;
  lastWall?: boolean;
  initial?: "heaven" | "earth";
}
export interface MahjongScore {
  valid: boolean;
  shape: boolean;
  fan: number;
  items: { label: string; fan: number }[];
  groups: number[][];
  reason: string;
}
const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
/** Exhaustively partition a bounded 14-tile hand. First-nonzero branching avoids
 * permutation duplicates and evaluates ambiguous pair/sequence choices fairly. */
function decompositions(
  faces: number[],
  needed: number,
): { pair: number; groups: number[][] }[] {
  const counts = Array(34).fill(0) as number[];
  faces.forEach((n) => counts[n]++);
  const found: { pair: number; groups: number[][] }[] = [];
  function visit(pair: number, groups: number[][]) {
    const f = counts.findIndex((n) => n > 0);
    if (f < 0) {
      if (groups.length === needed) found.push({ pair, groups });
      return;
    }
    if (groups.length >= needed) return;
    if (counts[f] >= 3) {
      counts[f] -= 3;
      visit(pair, [...groups, [f, f, f]]);
      counts[f] += 3;
    }
    if (f < 27 && f % 9 <= 6 && counts[f + 1] && counts[f + 2]) {
      for (const n of [f, f + 1, f + 2]) counts[n]--;
      visit(pair, [...groups, [f, f + 1, f + 2]]);
      for (const n of [f, f + 1, f + 2]) counts[n]++;
    }
  }
  for (let p = 0; p < 34; p++)
    if (counts[p] >= 2) {
      counts[p] -= 2;
      visit(p, []);
      counts[p] += 2;
    }
  return found;
}
export function evaluateMahjong(
  tiles: Tile[],
  exposed: TileGroup[],
  ctx: MahjongContext,
  policy: MahjongPolicy,
): MahjongScore {
  const bad = (reason: string): MahjongScore => ({
    valid: false,
    shape: false,
    fan: 0,
    items: [],
    groups: [],
    reason,
  });
  if (
    !Array.isArray(tiles) ||
    !Array.isArray(exposed) ||
    exposed.length > 4 ||
    exposed.some((g) => !validTileGroup(g))
  )
    return bad("Check the declared groups.");
  if (
    !ctx ||
    ![ctx.seatWind, ctx.roundWind].every(
      (n) => Number.isInteger(n) && n >= 0 && n <= 3,
    ) ||
    typeof ctx.selfDraw !== "boolean" ||
    !Number.isInteger(ctx.winningFace) ||
    ctx.winningFace < 0 ||
    ctx.winningFace > 33
  )
    return bad("Choose the seat wind, round wind and winning tile.");
  if (
    (ctx.robbingKong && ctx.selfDraw) ||
    (ctx.afterKong && !ctx.selfDraw) ||
    (ctx.consecutiveKongs && !ctx.afterKong) ||
    (ctx.lastWall && !ctx.selfDraw) ||
    (ctx.initial === "heaven" && (!ctx.selfDraw || ctx.seatWind !== 0)) ||
    (ctx.initial === "earth" && (ctx.selfDraw || ctx.seatWind === 0)) ||
    (ctx.initial && (exposed.length > 0 || ctx.afterKong || ctx.robbingKong))
  )
    return bad("These winning circumstances cannot occur together.");
  const all = [...tiles, ...exposed.flatMap((g) => g.tiles)];
  const faces = all.map((t) => t.face),
    counts = Array(34).fill(0) as number[];
  if (
    all.some(
      (t) =>
        !t ||
        typeof t.id !== "string" ||
        !Number.isInteger(t.face) ||
        t.face < 0 ||
        t.face > 33,
    ) ||
    new Set(all.map((t) => t.id)).size !== all.length
  )
    return bad("Each tile needs a distinct identity and valid face.");
  for (const f of faces)
    if (++counts[f] > 4)
      return bad(`There are only four copies of ${tileName(f)}.`);
  if (
    tiles.length !== 14 - 3 * exposed.length ||
    !tiles.some((t) => t.face === ctx.winningFace)
  )
    return bad(
      "A winning hand needs four groups and a pair (plus one extra tile per declared quad). Include the winning tile.",
    );
  const orphan =
    exposed.length === 0 &&
    ORPHANS.every((f) => counts[f] > 0) &&
    faces.every((f) => ORPHANS.includes(f));
  const ds = decompositions(
    tiles.map((t) => t.face),
    4 - exposed.length,
  );
  if (!orphan && !ds.length)
    return bad(
      "These tiles do not make four groups and a pair, or thirteen orphans.",
    );
  const scores: MahjongScore[] = [];
  for (const d of orphan ? [{ pair: -1, groups: [] as number[][] }] : ds) {
    const items: { label: string; fan: number }[] = [];
    const add = (label: string, fan: number) => items.push({ label, fan });
    const groups = [
      ...d.groups,
      ...exposed.map((g) => g.tiles.map((t) => t.face)),
    ];
    const triplets = groups
      .filter((g) => g.every((f) => f === g[0]))
      .map((g) => g[0]);
    const suited = new Set(
      faces.filter((f) => f < 27).map((f) => Math.floor(f / 9)),
    );
    const honors = faces.some((f) => f >= 27);
    if (orphan) add("Thirteen orphans", 10);
    else {
      if (groups.every((g) => g[0] !== g[1])) add("All sequences", 1);
      if (triplets.length === 4) add("All triplets", 3);
      for (const f of triplets) {
        if (f >= 31) add(`Three ${tileName(f)} tiles`, 1);
        if (f === 27 + ctx.seatWind) add("Seat wind group", 1);
        if (f === 27 + ctx.roundWind) add("Round wind group", 1);
      }
      const dragons = triplets.filter((f) => f >= 31).length,
        winds = triplets.filter((f) => f >= 27 && f <= 30).length;
      if (dragons === 2 && d.pair >= 31) add("Small dragons", 3);
      if (dragons === 3) add("Big dragons", 5);
      if (winds === 4 || (winds === 3 && d.pair >= 27 && d.pair <= 30))
        add(winds === 4 ? "Big winds" : "Small winds", 10);
      if (triplets.length === 4 && faces.every((f) => ORPHANS.includes(f)))
        add("Only terminals and honors", 1);
      if (
        exposed.length === 0 &&
        triplets.length === 4 &&
        (ctx.selfDraw || d.pair === ctx.winningFace)
      )
        add("Four concealed triplets", 10);
      if (exposed.length === 4 && exposed.every((g) => g.kind === "kong"))
        add("Four quads", 10);
    }
    if (exposed.length === 0) add("Concealed hand", 1);
    if (ctx.selfDraw) add("Self draw", 1);
    if (suited.size === 1)
      add(honors ? "One suit and honors" : "One suit only", honors ? 3 : 7);
    if (suited.size === 0) add("All honors", 10);
    if (faces.every((f) => f < 27 && (f % 9 === 0 || f % 9 === 8)))
      add("All terminals", 10);
    if (ctx.robbingKong) add("Robbing a quad", 1);
    if (ctx.afterKong) add("Quad replacement win", 1);
    if (ctx.consecutiveKongs) add("Consecutive quad replacements", 10);
    if (ctx.lastWall) add("Last tile from the wall", 1);
    if (ctx.initial)
      add(ctx.initial === "heaven" ? "Heavenly hand" : "Earthly hand", 10);
    if (exposed.length === 0 && suited.size === 1 && !honors) {
      const start = Math.floor(faces[0] / 9) * 9;
      const required = [3, 1, 1, 1, 1, 1, 1, 1, 3];
      const nine = required.every((n, i) => counts[start + i] >= n);
      const original = counts.slice(start, start + 9);
      original[ctx.winningFace - start]--;
      if (nine && (ctx.selfDraw || required.every((n, i) => original[i] === n)))
        add("Nine gates", 10);
    }
    const fan = Math.min(
      policy.maxFan,
      items.reduce((n, i) => n + i.fan, 0),
    );
    scores.push({
      valid: fan >= policy.minFan,
      shape: true,
      fan,
      items,
      groups: orphan
        ? [tiles.map((t) => t.face)]
        : [...groups, [d.pair, d.pair]],
      reason:
        fan >= policy.minFan
          ? "Winning hand"
          : `This hand has ${fan} faan; this table requires ${policy.minFan}.`,
    });
  }
  return scores.sort(
    (a, b) =>
      b.fan - a.fan ||
      b.items.reduce((n, i) => n + i.fan, 0) -
        a.items.reduce((n, i) => n + i.fan, 0),
  )[0];
}
export interface MahjongResult {
  winner?: string;
  payer?: string;
  liability?: string;
  fan?: number;
  draw?: boolean;
  hand?: { tiles: Tile[]; groups: TileGroup[]; context: MahjongContext };
}
export function validateMahjongPolicy(p: MahjongPolicy): void {
  if (
    !p ||
    p.scoring !== "hk-classical/v1" ||
    p.flowers !== false ||
    !Number.isInteger(p.minFan) ||
    p.minFan < 0 ||
    p.minFan > 3 ||
    p.maxFan !== 10 ||
    ![1, 4].includes(p.prevailingWinds) ||
    typeof p.liability !== "boolean"
  )
    throw new Error("Invalid tile scoring policy");
}
export function resultFan(r: MahjongResult, p: MahjongPolicy): number {
  if (r.hand) {
    const s = evaluateMahjong(r.hand.tiles, r.hand.groups, r.hand.context, p);
    if (!s.valid) throw new Error(s.reason);
    if (r.hand.context.selfDraw !== !r.payer)
      throw new Error("Winning method and payer disagree");
    return s.fan;
  }
  if (!Number.isInteger(r.fan) || r.fan! < p.minFan || r.fan! > p.maxFan)
    throw new Error(`Enter ${p.minFan}–${p.maxFan} faan`);
  return r.fan!;
}
export const MAHJONG_PAYMENTS = [2, 4, 8, 16, 32, 48, 64, 96, 128, 192, 256];
export function settleMahjong(
  players: string[],
  r: MahjongResult,
  p: MahjongPolicy,
): Record<string, number> {
  validateMahjongPolicy(p);
  if (
    !Array.isArray(players) ||
    players.length !== 4 ||
    new Set(players).size !== 4 ||
    players.some((id) => typeof id !== "string" || !id.trim()) ||
    !r ||
    typeof r !== "object"
  )
    throw new Error("Mahjong needs four distinct players");
  const delta = Object.fromEntries(players.map((id) => [id, 0]));
  if (r.draw === true) {
    if (r.winner || r.payer || r.hand || r.fan !== undefined || r.liability)
      throw new Error("A drawn hand has no winner or payment");
    return delta;
  }
  if (
    !r.winner ||
    !players.includes(r.winner) ||
    (r.payer !== undefined &&
      (!players.includes(r.payer) || r.payer === r.winner)) ||
    (r.liability !== undefined &&
      (!p.liability ||
        !players.includes(r.liability) ||
        r.liability === r.winner))
  )
    throw new Error("Choose a valid winner and paying player");
  const base = MAHJONG_PAYMENTS[resultFan(r, p)];
  if (r.payer) {
    delta[r.payer] = -2 * base;
    delta[r.winner] = 2 * base;
  } else if (r.liability) {
    delta[r.liability] = -3 * base;
    delta[r.winner] = 3 * base;
  } else {
    for (const id of players) delta[id] = id === r.winner ? 3 * base : -base;
  }
  return delta;
}
export interface MahjongProgress {
  dealer: number;
  rotations: number;
  hands: number;
  finished: boolean;
  players: string[];
}
export function advanceMahjong(
  previous: MahjongProgress | undefined,
  players: string[],
  result: MahjongResult,
  policy: MahjongPolicy,
): MahjongProgress {
  const p = previous ?? {
    dealer: 0,
    rotations: 0,
    hands: 0,
    finished: false,
    players: [...players],
  };
  if (p.finished || JSON.stringify(p.players) !== JSON.stringify(players))
    throw new Error("Keep the four seats fixed until the match ends");
  if (
    result.hand &&
    (result.hand.context.seatWind !==
      (players.indexOf(result.winner!) - p.dealer + 4) % 4 ||
      result.hand.context.roundWind !== Math.floor(p.rotations / 4))
  )
    throw new Error(
      "Winning hand winds do not match the current seats and round",
    );
  const rotate = result.winner !== players[p.dealer];
  const rotations = p.rotations + (rotate ? 1 : 0);
  return {
    dealer: (p.dealer + (rotate ? 1 : 0)) % 4,
    rotations,
    hands: p.hands + 1,
    finished: rotations >= policy.prevailingWinds * 4,
    players: [...players],
  };
}
