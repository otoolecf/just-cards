import { beforeEach, expect, it } from 'vitest';
import {
	getDefaultRulesetService,
	resetDefaultRulesetServiceForTests,
} from './default-service';
import { familyRulesets } from './family-presets';
import {
	PATCH,
	POST,
	DELETE,
	GET,
} from '../../routes/api/rulesets/[rulesetId]/+server';
import { POST as createRoom } from '../../routes/api/rooms/+server';
import { evaluateTableBehavior } from './behavioral-validation';
import { canPlayRuleset, policySnapshot } from './generation-report';
import type { RulesetRecord } from './types';
const event = (id: string, body: object) =>
	({
		params: { rulesetId: id },
		request: new Request('http://localhost/', {
			method: 'POST',
			body: JSON.stringify(body),
		}),
	}) as Parameters<typeof POST>[0];
beforeEach(() => {
	resetDefaultRulesetServiceForTests();
	process.env.RULESET_STORE_DRIVER = 'memory';
});
it('protects builtins, duplicates independently, and blocks archived games for new rooms', async () => {
	const builtin = familyRulesets()[0];
	expect(
		(
			await PATCH(
				event(builtin.id, {
					name: 'Changed',
					archived: true,
					expectedUpdatedAt: builtin.updatedAt,
				}),
			)
		).status,
	).toBe(400);
	const copy = (await (
		await POST(event(builtin.id, { name: 'Our copy' }))
	).json()) as RulesetRecord;
	expect(copy.id).not.toBe(builtin.id);
	expect(canPlayRuleset(copy.bundle)).toBe(true);
	const archive = await PATCH(
		event(copy.id, {
			name: 'Family',
			archived: true,
			expectedUpdatedAt: copy.updatedAt,
		}),
	);
	expect(archive.ok).toBe(true);
	const archived = (await archive.json()) as RulesetRecord;
	expect(archived.bundle).toEqual(copy.bundle);
	const response = await createRoom(
		event('', { rulesetId: copy.id, name: 'Host' }) as unknown as Parameters<
			typeof createRoom
		>[0],
	);
	expect(response.status).toBe(400);
	expect(await response.text()).toContain('Restore');
	expect(
		(
			await PATCH(
				event(copy.id, {
					name: 'Stale',
					archived: false,
					expectedUpdatedAt: copy.updatedAt,
				}),
			)
		).status,
	).toBe(409);
});
it('keeps blocked validation evidence on duplicates', async () => {
	const service = await getDefaultRulesetService();
	const bundle = familyRulesets()[0].bundle;
	bundle.generationReport = {
		version: 'rule-validation/v1',
		status: 'blocked',
		strategy: 'deterministic',
		policySnapshot: policySnapshot(bundle),
		behavior: evaluateTableBehavior(bundle),
		sourceReview: {
			verdict: 'contradiction',
			issues: ['Wrong deal'],
			summary: 'Wrong deal',
		},
		evidence: [],
		assumptions: [],
		ambiguities: [],
		unsupported: [],
		blockers: ['Wrong deal'],
	};
	const original = await service.createDraft({
		name: 'Blocked source',
		origin: 'manual',
		bundle,
	});
	const response = await POST(event(original.id, { name: 'Blocked copy' }));
	expect(response.ok).toBe(true);
	const copy = (await response.json()) as RulesetRecord;
	expect(copy.bundle.generationReport).toEqual(bundle.generationReport);
	expect(canPlayRuleset(copy.bundle)).toBe(false);
});

it('deletion requires an archived unchanged custom record and removes its lookup', async () => {
	const builtin = familyRulesets()[0];
	expect(
		(await DELETE(event(builtin.id, { expectedUpdatedAt: builtin.updatedAt })))
			.status,
	).toBe(400);
	const copy = (await (
		await POST(event(builtin.id, { name: 'Delete fixture' }))
	).json()) as RulesetRecord;
	expect(
		(await DELETE(event(copy.id, { expectedUpdatedAt: copy.updatedAt })))
			.status,
	).toBe(409);
	expect((await DELETE(event(copy.id, {}))).status).toBe(400);
	const archived = (await (
		await PATCH(
			event(copy.id, {
				name: copy.name,
				archived: true,
				expectedUpdatedAt: copy.updatedAt,
			}),
		)
	).json()) as RulesetRecord;
	expect(
		(await DELETE(event(copy.id, { expectedUpdatedAt: copy.updatedAt })))
			.status,
	).toBe(409);
	expect(
		(await DELETE(event(copy.id, { expectedUpdatedAt: archived.updatedAt })))
			.status,
	).toBe(200);
	expect((await GET(event(copy.id, {}))).status).toBe(404);
});
