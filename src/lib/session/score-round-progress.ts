import type { ScoreEvent } from '../scorekeeper/engine';
import type { RulesetRecord } from '../rulesets/types';
import { appliedScoreEvents } from './score-correction';
import { deriveGuidedScoreProfileFromBundle, type GuidedScoreProfile } from './score-session-commands';

/** Older sheets did not snapshot round metadata. Only their exact ruleset may fill it. */
export function roundProgressMetadata(profile: GuidedScoreProfile | null, rulesets: RulesetRecord[]) {
	if (!profile) return undefined;
	if (profile.roundProgress !== undefined) return profile.roundProgress;
	const record = rulesets.find(record => record.id === profile.rulesetId);
	return record ? deriveGuidedScoreProfileFromBundle(record.bundle, record.id).roundProgress : undefined;
}

export function scoreRoundProgress(events: ScoreEvent[], metadata: GuidedScoreProfile['roundProgress']) {
	if (!metadata) return null;
	const completed = appliedScoreEvents(events).filter(event =>
		event.type === 'add_delta' || event.type === 'add_round'
	).length;
	const total = Number.isInteger(metadata.total) && Number(metadata.total) > 0 && Number(metadata.total) <= 99
		? metadata.total : undefined;
	const complete = total !== undefined && completed >= total;
	const label = complete
		? `${completed} ${completed === 1 ? 'round' : 'rounds'} complete`
		: `Round ${completed + 1}${total === undefined ? '' : ` of ${total}`}`;
	return { completed, total, complete, label };
}
