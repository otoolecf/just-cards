import type { RequestHandler } from "./$types";
/** Register known legacy IDs before enabling the new dispatch boundary. Owner-gated in hooks. */
export const POST: RequestHandler = async ({
  request,
  platform,
  getClientAddress,
}) => {
  const { id } = (await request.json()) as { id?: unknown };
  if (typeof id !== "string" || !platform?.env.ROOM_ADMISSION)
    return Response.json(
      { error: "Invalid resource or unavailable deployment" },
      { status: 400 },
    );
  const admission = platform.env.ROOM_ADMISSION.getByName("global");
  const permit = await admission.reserveResource(id, getClientAddress());
  let status = permit.status;
  if (permit.lease && !(await admission.finishResource(id, permit.lease, true)))
    status = 409;
  return Response.json({ registered: status === 200 }, { status });
};
