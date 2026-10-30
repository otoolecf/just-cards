import { resourceOperation } from "./resource-operation";
import { dev } from "$app/environment";
import type { RuntimeRulesetBundle } from "../rulesets/types";
import { localRoomStorage } from "./local-room-storage";
import { ManagedRoom } from "./managed-room";
import { localAdmission } from "./local-admission";
import { capacityPolicy } from "./room-admission";
let localManager: Promise<ManagedRoom> | undefined;

export async function dispatchRoom(
  request: Request,
  code: string,
  platform: App.Platform | undefined,
  bundle?: RuntimeRulesetBundle,
  client = "unknown",
): Promise<Response> {
  if (!/^[A-Z0-9]{8}$/.test(code))
    return Response.json(
      { error: "Enter an eight-character room code" },
      { status: 400 },
    );
  if (!dev && platform?.env.ROOMS) {
    return resourceOperation(
      platform.env.ROOM_ADMISSION.getByName("global"),
      `room:${code}`,
      !!bundle,
      client,
      async () =>
        platform.env.ROOMS.getByName(code).handleRoom(
          code,
          {
            method: request.method,
            authorization: request.headers.get("authorization") ?? "",
            client,
            ...(request.method !== "GET" ? { body: await request.text() } : {}),
          },
          bundle,
        ),
    );
  }
  if (!dev) throw new Error("ROOMS binding is required");
  localManager ??= Promise.all([localRoomStorage(), localAdmission()]).then(
    ([storage, admission]) =>
      new ManagedRoom(storage, admission, capacityPolicy(process.env)),
  );
  return (await localManager).request(request, code, client, bundle);
}
