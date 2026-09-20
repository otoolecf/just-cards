import { expect, it } from 'vitest';
import { familyRulesets } from './family-presets';
import {
	deriveGameRuntimeState,
	type RuntimeEvent
} from '../runtime/game-runtime';
import {
	buildGuidedRoundDeltaEntries,
	deriveGuidedScoreProfileFromBundle
} from '../session/score-session-commands';
import type { CardInput } from '../scorekeeper/engine';

it('shares explicit positional scoring between generated runtime and guided physical-card entry', () => {
	const b = familyRulesets()[0].bundle;
	const cards: CardInput[] = ['2', 'K', 'Q', '2', 'A', 'Q'].map((rank) => ({
		rank: rank as CardInput['rank']
	}));
	const events: RuntimeEvent[] = [
		{ type: 'gameplay', event: { type: 'init_game', players: ['a', 'b'] } },
		{ type: 'gameplay', event: { type: 'start_round' } },
		{ type: 'gameplay', event: { type: 'deal_cards', playerId: 'a', cards } },
		{ type: 'gameplay', event: { type: 'end_round' } }
	];
	expect(
		deriveGameRuntimeState(events, b.runtimeRulePack).score.totalsByPlayer.a
	).toBe(1);
	expect(
		buildGuidedRoundDeltaEntries({
			players: ['a'],
			profile: deriveGuidedScoreProfileFromBundle(b, 'golf'),
			cardsByPlayerZone: { a: { hand: cards } }
		})
	).toEqual([{ playerId: 'a', delta: 1 }]);
});
it('compiles net scoring with a negative hand multiplier', () => {
	const b = familyRulesets()[1].bundle;
	const e = (
		event: Extract<RuntimeEvent, { type: 'gameplay' }>['event']
	): RuntimeEvent => ({ type: 'gameplay', event });
	const result = deriveGameRuntimeState(
		[
			e({ type: 'init_game', players: ['a', 'b'] }),
			e({ type: 'start_round' }),
			e({
				type: 'deal_cards',
				playerId: 'a',
				zone: 'meld',
				cards: [{ rank: 'K' }]
			}),
			e({ type: 'deal_cards', playerId: 'a', cards: [{ rank: 'A' }] }),
			e({ type: 'end_round' })
		],
		b.runtimeRulePack
	);
	expect(result.score.totalsByPlayer.a).toBe(-5);
});
