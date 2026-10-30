import { resourceOperation } from "./resource-operation";
import { dev } from "$app/environment";
import { localScoreStorage } from "./local-score-storage";
import { handleScoreRequest, type ScoreRequest } from "./score-api";

export async function dispatchScore(
  id: string,
  input: ScoreRequest,
  platform: App.Platform | undefined,
  client = "unknown",
): Promise<Response> {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(id))
    return Response.json({ error: "Invalid session id" }, { status: 400 });
  if (!dev && platform?.env.ROOMS) {
    return resourceOperation(
      platform.env.ROOM_ADMISSION.getByName("global"),
      `score:${id}`,
      input.type === "create",
      client,
      () => platform.env.ROOMS.getByName(`score-${id}`).handleScore(id, input),
    );
  }
  if (!dev) throw new Error("ROOMS binding is required");
  return handleScoreRequest(id, input, await localScoreStorage());
}
