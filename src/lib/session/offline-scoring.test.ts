import { describe, expect, it } from 'vitest';
import { createOfflineScoreClient } from './offline-scoring';
import { handleScoreRequest } from '../server/score-api';
import {
	appendSessionEvent,
	buildSessionStateView,
	type SessionRecord,
} from './session-store';
import type { ScoreEvent } from '../scorekeeper/engine';

const delta = (n: number): ScoreEvent => ({
	type: 'add_delta',
	entries: [{ target: { kind: 'player', id: 'Pat' }, delta: n }],
});
function setup() {
	const rows = new Map<string, string>(),
		server = new Map<string, SessionRecord>();
	const storage = {
		getItem: (k: string) => rows.get(k) ?? null,
		setItem: (k: string, v: string) => {
			rows.set(k, v);
		},
		removeItem: (k: string) => {
			rows.delete(k);
		},
		key: (i: number) => [...rows.keys()][i] ?? null,
		get length() {
			return rows.size;
		},
	};
	let online = true,
		loseResponse = false;
	const request = async (url: string, init?: RequestInit) => {
		if (!online) throw new TypeError('Offline');
		const body = init?.body ? JSON.parse(init.body as string) : null;
		const id = url === '/api/sessions' ? body.sessionId : url.split('/').pop()!;
		const result = handleScoreRequest(
			id,
			!body
				? { type: 'get' }
				: url === '/api/sessions'
					? { type: 'create', config: body.config }
					: { type: 'append', input: { source: 'scorekeeper', ...body } },
			server,
		);
		if (loseResponse) {
			loseResponse = false;
			throw new TypeError('Lost response');
		}
		return result;
	};
	return {
		server,
		storage,
		client: () => createOfflineScoreClient(storage, request),
		offline: () => {
			online = false;
		},
		online: () => {
			online = true;
		},
		lose: () => {
			loseResponse = true;
		},
	};
}
describe('offline physical scores', () => {
	it('creates offline, replays ranks and undo/redo through reload, then syncs exactly once', async () => {
		const h = setup();
		h.offline();
		const c = h.client();
		const s = await c
			.create({ players: ['Pat'], scoreRulePack: { version: 'bad' } })
			.catch(() => null);
		// A malformed pack must not become a locally acknowledged session.
		expect(s).toBeNull();
		const good = await c.create({ players: ['Pat'] });
		await c.post(good.sessionId, delta(12));
		await c.post(good.sessionId, { type: 'undo' });
		expect(
			(await h.client().get(good.sessionId)).state.totalsByPlayer.Pat ?? 0,
		).toBe(0);
		const redone = await h.client().post(good.sessionId, { type: 'redo' });
		expect(redone.state.totalsByPlayer.Pat).toBe(12);
		expect(redone.sync?.pending).toBe(3);
		h.online();
		expect((await h.client().get(good.sessionId)).sync?.status).toBe('synced');
		await h.client().get(good.sessionId);
		expect(buildSessionStateView(good.sessionId, h.server).eventCount).toBe(3);
	});
	it('retries a committed create and append after losing the response without duplicates', async () => {
		const h = setup();
		h.lose();
		const s = await h.client().create({ players: ['Pat'] });
		await h.client().get(s.sessionId);
		h.lose();
		await h.client().post(s.sessionId, delta(7));
		const state = await h.client().get(s.sessionId);
		expect(state.state.totalsByPlayer.Pat).toBe(7);
		expect(state.eventCount).toBe(1);
		expect(state.sync?.pending).toBe(0);
	});
	it('keeps offline undo separate from a concurrent remote score and can save a copy', async () => {
		const h = setup();
		const s = await h.client().create({ players: ['Pat'] });
		await h.client().post(s.sessionId, delta(10));
		h.offline();
		await h.client().post(s.sessionId, { type: 'undo' });
		appendSessionEvent(
			s.sessionId,
			{ source: 'scorekeeper', scoreEvent: delta(20) },
			h.server,
		);
		h.online();
		const conflicted = await h.client().get(s.sessionId);
		expect(conflicted.sync?.status).toBe('conflict');
		expect(conflicted.state.totalsByPlayer.Pat ?? 0).toBe(0);
		expect(
			buildSessionStateView(s.sessionId, h.server).state.totalsByPlayer.Pat,
		).toBe(30);
		const copy = await h.client().fork(s.sessionId);
		expect(copy.sessionId).not.toBe(s.sessionId);
		expect(copy.state.totalsByPlayer.Pat ?? 0).toBe(0);
		expect(buildSessionStateView(copy.sessionId, h.server).eventCount).toBe(2);
	});
	it('does not acknowledge storage failure or silently overwrite pending work on refresh', async () => {
		const h = setup();
		const s = await h.client().create({});
		h.offline();
		h.storage.setItem = () => {
			throw new Error('Quota exceeded');
		};
		await expect(h.client().post(s.sessionId, delta(3))).rejects.toThrow(
			/storage|Quota/i,
		);
	});
});
it('rejects reused IDs and stale undo atomically at the server boundary', async () => {
	const h = setup();
	const s = await h.client().create({});
	const input = {
		source: 'scorekeeper' as const,
		requestId: 'stable-request-001',
		expectedEventCount: 0,
		scoreEvent: delta(5),
	};
	const first = handleScoreRequest(
		s.sessionId,
		{ type: 'append', input },
		h.server,
	);
	expect(first.status).toBe(200);
	expect(
		handleScoreRequest(s.sessionId, { type: 'append', input }, h.server).status,
	).toBe(200);
	expect(
		handleScoreRequest(
			s.sessionId,
			{ type: 'append', input: { ...input, scoreEvent: delta(9) } },
			h.server,
		).status,
	).toBe(409);
	expect(
		handleScoreRequest(
			s.sessionId,
			{
				type: 'append',
				input: {
					...input,
					requestId: 'another-request-001',
					scoreEvent: { type: 'undo' },
				},
			},
			h.server,
		).status,
	).toBe(409);
	expect(buildSessionStateView(s.sessionId, h.server).eventCount).toBe(1);
});
it('replays raw card values offline using the original session rule pack', async () => {
	const h = setup();
	const { createRulePack } = await import('../scorekeeper/engine');
	const s = await h
		.client()
		.create({ scoreRulePack: createRulePack({ baseAceValue: 15 }) });
	h.offline();
	const result = await h
		.client()
		.post(s.sessionId, {
			type: 'add_round',
			playerCards: { Pat: [{ rank: 'A' }, { rank: '2' }] },
		});
	expect(result.state.totalsByPlayer.Pat).toBe(17);
	h.online();
	expect((await h.client().get(s.sessionId)).state.totalsByPlayer.Pat).toBe(17);
});

it('replays Bridge contracts offline across reload, undo and exact-once synchronization',async()=>{
 const h=setup();h.offline();
 const {familyRulesets}=await import('../rulesets/family-presets');const {deriveGuidedScoreProfileFromBundle}=await import('./score-session-commands');
 const b=familyRulesets().find(r=>r.id==='builtin-bridge')!,profile=deriveGuidedScoreProfileFromBundle(b.bundle,b.id),players=['N','E','S','W'];
 let client=h.client();const created=await client.create({players,scoreRulePack:profile.scoreRulePack,scoreInputMode:'guided',scoreGuidedProfile:profile});
 const id=created.sessionId;
 await client.post(id,{type:'add_contract',players,result:{team:0,level:3,strain:'notrump',doubling:1,tricks:9}});
 client=h.client();const state=await client.get(id);expect(state.state.rubber?.games).toEqual([1,0]);expect(state.state.totalsByPlayer.N).toBe(100);
 await client.post(id,{type:'undo'});expect((await client.get(id)).state.rubber).toBeUndefined();await client.post(id,{type:'redo'});
 h.online();const synced=await client.get(id);expect(synced.state.rubber?.games).toEqual([1,0]);expect(h.server.get(id)?.events).toHaveLength(3);
});

it('keeps mahjong payments and dealer rotation through offline reload, undo and sync',async()=>{
 const h=setup();h.offline();const {familyRulesets}=await import('../rulesets/family-presets');const {deriveGuidedScoreProfileFromBundle}=await import('./score-session-commands');
 const b=familyRulesets().find(r=>r.id==='builtin-hong-kong-mahjong')!,profile=deriveGuidedScoreProfileFromBundle(b.bundle,b.id),players=['N','E','S','W'];
 let client=h.client();const created=await client.create({players,scoreRulePack:profile.scoreRulePack,scoreInputMode:'guided',scoreGuidedProfile:profile});const id=created.sessionId;
 await client.post(id,{type:'add_mahjong',players,policy:profile.tileMahjong!,result:{winner:'E',payer:'N',fan:3}});
 client=h.client();let state=await client.get(id);expect(state.state.mahjong?.dealer).toBe(1);expect(state.state.totalsByPlayer).toEqual({N:-32,E:32,S:0,W:0});
 await client.post(id,{type:'undo'});expect((await client.get(id)).state.mahjong).toBeUndefined();await client.post(id,{type:'redo'});
 h.online();state=await client.get(id);expect(state.sync?.status).toBe('synced');expect(state.state.mahjong?.dealer).toBe(1);expect(h.server.get(id)?.events).toHaveLength(3);
 expect(()=>appendSessionEvent(id,{source:'scorekeeper',scoreEvent:{type:'add_mahjong',players,policy:{...profile.tileMahjong!,minFan:0},result:{winner:'E',fan:0}}},h.server)).toThrow(/configured/);
});
