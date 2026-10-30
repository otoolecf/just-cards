import { expect, it } from "vitest";
import {
  createRoom,
  updateRoom,
  viewRoom,
  replayRoom,
  type RoomMutation,
} from "./room-service";
import { familyRulesets } from "../rulesets/family-presets";
it("reconnects, pauses and undoes inside a private claim window using persisted room events", () => {
  const b = familyRulesets().find(
    (r) => r.id === "builtin-hong-kong-mahjong",
  )!.bundle;
  let r = createRoom("TESTMAHJ", "A", "a", b);
  for (const token of ["b", "c", "d"])
    r = updateRoom(r, { type: "join", name: token.toUpperCase() }, token);
  const act = (token: string, input: object) => {
    r = updateRoom(
      r,
      {
        ...input,
        revision: r.revision,
        requestId: crypto.randomUUID(),
      } as RoomMutation,
      token,
    );
  };
  act("a", { type: "start" });
  let v = viewRoom(r, "a");
  const id = v.table!.mahjong!.hands[v.selfId!][0].id;
  act("a", { type: "command", command: { type: "tile_discard", tileId: id } });
  act("b", {
    type: "command",
    command: { type: "tile_respond", choice: "pass" },
  });
  expect(
    viewRoom(JSON.parse(JSON.stringify(r)), "b").table!.mahjong!.claim!
      .responded,
  ).toBe(true);
  expect(JSON.stringify(viewRoom(r, "c"))).not.toContain('"responses"');
  expect(viewRoom(r, "unjoined").table).toBeNull();
  act("a", { type: "undo" });
  expect(viewRoom(r, "b").table!.mahjong!.claim!.responded).toBe(false);
  const snapshot = replayRoom(r);
  act("c", { type: "leave" });
  expect(viewRoom(r, "a").paused).toBe(true);
  expect(replayRoom(r)).toEqual(snapshot);
  expect(() =>
    act("b", {
      type: "command",
      command: { type: "tile_respond", choice: "pass" },
    }),
  ).toThrow(/paused/);
  act("c", { type: "return" });
  act("a", { type: "resume" });
  act("b", {
    type: "command",
    command: { type: "tile_respond", choice: "pass" },
  });
  act("c", {
    type: "command",
    command: { type: "tile_respond", choice: "pass" },
  });
  act("d", {
    type: "command",
    command: { type: "tile_respond", choice: "pass" },
  });
  expect(viewRoom(r, "b").table!.mahjong!.phase).toBe("draw");
  expect(replayRoom(JSON.parse(JSON.stringify(r)))).toEqual(replayRoom(r));
});
