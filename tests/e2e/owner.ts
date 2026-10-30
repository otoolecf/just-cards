import { expect, test, type APIRequestContext } from '@playwright/test';

/** Authenticate only the contexts used by an owner-management scenario. */
export async function signInOwner(...contexts: APIRequestContext[]) {
 const key = process.env.E2E_OWNER_ACCESS_KEY;
 test.skip(!key, 'Requires an isolated server with E2E_OWNER_ACCESS_KEY');
 for (const context of contexts) {
  const response = await context.post('/api/owner/session', { data: { key } });
  expect(response.ok(), 'Owner test login must succeed').toBe(true);
 }
}
