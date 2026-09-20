import type { PageServerLoad } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';
export const load: PageServerLoad = async ({ platform }) => ({ rulesets: await (await getDefaultRulesetService(platform)).list() });
