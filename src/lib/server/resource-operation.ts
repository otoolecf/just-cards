import type { ResourcePermit } from "./resource-registry";
interface Admission {
  accessResource(
    id: string,
    creating: boolean,
    address: string,
  ): Promise<number>;
  reserveResource(id: string, address: string): Promise<ResourcePermit>;
  finishResource(id: string, lease: string, success: boolean): Promise<boolean>;
}
/** Handles failed operations immediately; crashes are recovered by reservation expiry. */
export async function resourceOperation(
  admission: Admission,
  id: string,
  creating: boolean,
  client: string,
  operation: () => Promise<Response>,
): Promise<Response> {
  const permit = creating
    ? await admission.reserveResource(id, client)
    : { status: await admission.accessResource(id, false, client) };
  if (permit.status !== 200)
    return Response.json(
      { error: "Resource unavailable or request limit reached" },
      { status: permit.status },
    );
  let response: Response;
  try {
    response = await operation();
  } catch (error) {
    if (permit.lease) await admission.finishResource(id, permit.lease, false);
    throw error;
  }
  if (permit.lease) {
    const completed = await admission.finishResource(
      id,
      permit.lease,
      response.ok,
    );
    if (response.ok && !completed)
      return Response.json(
        { error: "Creation reservation expired. Retry with the same ID." },
        { status: 409 },
      );
  }
  return response;
}
