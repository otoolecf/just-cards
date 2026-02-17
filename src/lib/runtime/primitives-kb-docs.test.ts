import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readKbDoc(): string {
	const file = resolve(process.cwd(), 'docs/primitives-kb-v0.md');
	return readFileSync(file, 'utf8');
}

describe('primitives kb docs', () => {
	it('primitives_kb_doc_includes_required_sections_and_primitives', () => {
		const doc = readKbDoc();

		expect(doc).toContain('# Primitives KB v0');
		expect(doc).toContain('## ScoreEvent Primitives');
		expect(doc).toContain('## GameEvent Primitives');
		expect(doc).toContain('## ValidatorRulePack Primitive');
		expect(doc).toContain('## PatternRulePack Primitive');
		expect(doc).toContain('## RuntimeScoringTrigger Primitive');
		expect(doc).toContain('## Rule Generation Output Contract');

		expect(doc).toContain('add_delta');
		expect(doc).toContain('manual_score');

		expect(doc).toContain('event_cards');
		expect(doc).toContain('player_zone');
		expect(doc).toContain('card_values');
		expect(doc).toContain('pattern');
		expect(doc).toContain('fixed');
		expect(doc).toContain('actor');
		expect(doc).toContain('source_player');
		expect(doc).toContain('static');
	});
});
