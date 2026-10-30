import { DEFAULT_MAHJONG } from "../gameplay/mahjong";
import type { TableRules } from "../gameplay/table-rules";
import { createRulePack } from "../scorekeeper/engine";
import { generateUiProfileFromRuntime } from "../ui/ui-profile";
import type { RulesetRecord } from "./types";
export function mahjongRuleset(): RulesetRecord {
  const tableRules: TableRules = {
    schemaVersion: "table-rules/v1",
    players: { min: 4, max: 4 },
    deal: { cardsPerPlayer: 13 },
    discard: { pickup: "top", immediateUse: false },
    tileMahjong: { ...DEFAULT_MAHJONG },
    roundEnd: "tile_win",
    stockExhaustion: "end_round",
    scoring: { zones: [], lowWins: false },
  };
  const runtimeRulePack = {
    tableRules,
    scoreRulePack: createRulePack(),
    scoringTriggers: [],
  };
  return {
    id: "builtin-hong-kong-mahjong",
    name: "Hong Kong Mahjong",
    origin: "import",
    sourceUrl: "https://www.hkmahjong.org/rules?lang=en",
    createdAt: "2026-09-27T00:00:00.000Z",
    updatedAt: "2026-09-27T00:00:00.000Z",
    bundle: {
      bundleVersion: "runtime-bundle/v1",
      gameId: "hong-kong-mahjong",
      displayName: "Hong Kong Mahjong",
      runtimeRulePack,
      uiProfile: generateUiProfileFromRuntime(runtimeRulePack),
    },
  };
}
