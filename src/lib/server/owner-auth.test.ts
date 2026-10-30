import { describe, it, expect } from 'vitest';
import {
	ownerAuthorized,
	ownerCookie,
	protectedOwnerPath,
	validOwnerKey,
} from './owner-auth';
const key = 'test-owner-secret-'.repeat(4);
const req = (headers: Record<string, string> = {}) =>
	new Request('https://cards.test/api/rulesets/generate', {
		method: 'POST',
		headers,
	});
describe('owner AI access', () => {
	it('fails closed without configuration and rejects seat/MCP credentials', async () => {
		expect(await ownerAuthorized(req(), undefined)).toBe(false);
		expect(
			await ownerAuthorized(req({ authorization: 'Bearer ' + key }), key),
		).toBe(false);
		expect(
			await ownerAuthorized(req({ 'x-just-cards-owner-key': key }), key),
		).toBe(true);
		expect(await validOwnerKey('short', 'short')).toBe(false);
	});
	it('signs expiring cookies, rejects tampering, key rotation, and cross-origin use', async () => {
		const cookie = await ownerCookie(key, 1000);
		const request = req({
			cookie: 'jc_owner=' + cookie,
			origin: 'https://cards.test',
		});
		expect(await ownerAuthorized(request, key, 1001)).toBe(true);
		expect(await ownerAuthorized(request, key, 1000 + 8 * 3600000)).toBe(false);
		expect(await ownerAuthorized(request, key + 'changed', 1001)).toBe(false);
		expect(
			await ownerAuthorized(
				req({ cookie: 'jc_owner=' + cookie + 'x' }),
				key,
				1001,
			),
		).toBe(false);
		expect(
			await ownerAuthorized(
				req({ cookie: 'jc_owner=' + cookie, origin: 'https://evil.test' }),
				key,
				1001,
			),
		).toBe(false);
	});
	it('restricts edits and deletion of the shared catalog without blocking game reads', () => {
  for(const method of ['PATCH','DELETE']) {
   expect(protectedOwnerPath('/api/rulesets/[rulesetId]',method)).toBe(true);
   expect(protectedOwnerPath('/api/rulesets/saved-game',method)).toBe(true);
  }
  for(const method of ['GET','HEAD']) expect(protectedOwnerPath('/api/rulesets/[rulesetId]',method)).toBe(false);
  expect(protectedOwnerPath('/api/rulesets/[rulesetId]/house-rules','POST')).toBe(true);
 });
	it('covers direct generation and all MCP/chat transports, leaves family play public', () => {
		for (const path of [
			'/api/rulesets/generate',
			'/api/mcp',
			'/api/mcp/call',
			'/api/mcp/messages',
			'/api/chat/actions',
		])
			expect(protectedOwnerPath(path)).toBe(true);
		for (const path of [
			'/play',
			'/api/rooms',
			'/api/rooms/ABC',
			'/api/sessions',
		])
			expect(protectedOwnerPath(path)).toBe(false);
	});
});
