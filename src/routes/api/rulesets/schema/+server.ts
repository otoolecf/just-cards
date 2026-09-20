import { json } from '@sveltejs/kit';
import { extractionResource } from '$lib/rulesets/extraction-contract';
export const GET = () => json(extractionResource());
