import type { RequestHandler } from './$types';
import { familyRulesets } from '$lib/rulesets/family-presets';
import { roomError } from '$lib/server/room-api';
import { dispatchRoom } from '$lib/server/room-dispatch';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const payload = (await request.clone().json()) as { rulesetId: string };
		const ruleset =
			familyRulesets().find((r) => r.id === payload.rulesetId) ??
			(await (
				await getDefaultRulesetService(platform)
			).getById(payload.rulesetId));
		if (!ruleset) throw new Error('Ruleset not found');
		if (ruleset.archived)
			throw new Error(
				'Restore this archived ruleset before starting a new room.',
			);
		const code = crypto
			.randomUUID()
			.replace(/-/g, '')
			.slice(0, 8)
			.toUpperCase();
		return dispatchRoom(request, code, platform, {
			...ruleset.bundle,
			displayName: ruleset.name,
		});
	} catch (error) {
		return roomError(error);
	}
};
