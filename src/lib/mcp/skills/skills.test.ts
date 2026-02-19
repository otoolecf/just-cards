import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runGameplayAgentSkill } from './gameplay-agent-skill';
import { runRulesetExtractorSkill } from './ruleset-extractor-skill';
import { runRulesetRepairSkill } from './ruleset-repair-skill';

describe('mcp skills', () => {
	it('ruleset_extractor_skill_uses_session_then_server_when_validation_fails', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const context = {
			callTool: async (name: string, args: unknown) => {
				calls.push({ name, args });
				if (name === 'generate_ruleset') {
					const modelSource = (args as { model_source?: string }).model_source;
					return {
						ruleset: {
							id: modelSource === 'session' ? 'ruleset-session' : 'ruleset-server',
							name: modelSource === 'session' ? 'Session' : 'Server'
						}
					};
				}
				if (name === 'validate_ruleset') {
					const rulesetId = (args as { ruleset_id: string }).ruleset_id;
					return { pass: rulesetId === 'ruleset-server', checks: [] };
				}
				throw new Error(`Unexpected tool ${name}`);
			}
		};

		const result = await runRulesetExtractorSkill(context, {
			source: { type: 'text', text: 'Example rules text.' }
		});

		expect(result.rulesetId).toBe('ruleset-server');
		expect(calls.map((entry) => entry.name)).toEqual([
			'generate_ruleset',
			'validate_ruleset',
			'generate_ruleset',
			'validate_ruleset'
		]);
	});

	it('ruleset_repair_skill_revalidates_and_regenerates_using_source', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const context = {
			callTool: async (name: string, args: unknown) => {
				calls.push({ name, args });
				if (name === 'get_ruleset') {
					return {
						ruleset: {
							id: 'ruleset-old',
							name: 'Old Rum',
							sourceUrl: 'https://bicyclecards.com/how-to-play/500-rum'
						}
					};
				}
				if (name === 'validate_ruleset') {
					const rulesetId = (args as { ruleset_id: string }).ruleset_id;
					return { pass: rulesetId === 'ruleset-new', checks: [] };
				}
				if (name === 'generate_ruleset') {
					return { ruleset: { id: 'ruleset-new', name: 'New Rum' } };
				}
				throw new Error(`Unexpected tool ${name}`);
			}
		};

		const result = await runRulesetRepairSkill(context, { rulesetId: 'ruleset-old' });
		expect(result.repaired).toBe(true);
		expect(result.rulesetId).toBe('ruleset-new');
		expect(calls.map((entry) => entry.name)).toEqual([
			'get_ruleset',
			'validate_ruleset',
			'generate_ruleset',
			'validate_ruleset'
		]);
	});

	it('gameplay_agent_skill_can_suggest_and_apply_move', async () => {
		const calls: Array<{ name: string; args: unknown }> = [];
		const context = {
			callTool: async (name: string, args: unknown) => {
				calls.push({ name, args });
				if (name === 'suggest_move') {
					return {
						event: { type: 'advance_turn' },
						reason: 'No legal draw/resolve move found; advance turn.'
					};
				}
				if (name === 'submit_move') {
					return { accepted: true };
				}
				throw new Error(`Unexpected tool ${name}`);
			}
		};

		const result = await runGameplayAgentSkill(context, {
			gameId: 'game-1',
			apply: true
		});

		expect(result.applied).toBe(true);
		expect(calls.map((entry) => entry.name)).toEqual(['suggest_move', 'submit_move']);
	});

	it('skills_do_not_import_store_or_network_modules_directly', () => {
		const skillFiles = [
			'src/lib/mcp/skills/ruleset-extractor-skill.ts',
			'src/lib/mcp/skills/ruleset-repair-skill.ts',
			'src/lib/mcp/skills/gameplay-agent-skill.ts'
		];
		for (const file of skillFiles) {
			const source = readFileSync(resolve(process.cwd(), file), 'utf8');
			expect(source.includes('$lib/rulesets/store')).toBe(false);
			expect(source.includes('$lib/rulesets/service')).toBe(false);
			expect(source.includes('fetch(')).toBe(false);
		}
	});
});
