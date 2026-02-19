import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function playTableSource(): string {
	return readFileSync(resolve(process.cwd(), 'src/lib/components/play-table.svelte'), 'utf8');
}

describe('play table style contract', () => {
	it('play_table_styles_bits_ui_classes_are_global', () => {
		const source = playTableSource();
		expect(source).toContain(':global(.surface-tab-list)');
		expect(source).toContain(':global(.surface-tab)');
		expect(source).toContain(':global(.surface-content)');
		expect(source).toContain(':global(.surface-content[hidden])');
		expect(source).toContain(':global(.guide-panel)');
		expect(source).toContain(':global(.action-panel)');
	});

	it('play_table_includes_draw_resolve_action_gating_hooks', () => {
		const source = playTableSource();
		expect(source).toContain('isDrawBlocked(');
		expect(source).toContain('isResolveBlocked(');
		expect(source).toContain('drawPickModeForZone(');
		expect(source).toContain('drawFromTable(zone.zoneId, card.key)');
	});

	it('play_table_resolve_blocking_reflects_required_target_and_anchor_constraints', () => {
		const source = playTableSource();
		const match = source.match(/function isResolveBlocked\(zone: string\): boolean \{([\s\S]*?)\n\t\}/);
		expect(match?.[1]).toContain('requiredResolveTargetZonesForSelf');
		expect(match?.[1]).toContain('selectedCardMatchesRequiredResolveAnchor()');
	});
});
