<script lang="ts">
	import type { RulesetRecord } from '$lib/rulesets/types';
	import ScoreButton from './score-button.svelte';
	import RulesetReview from './ruleset-review.svelte';
	import { canPlayRuleset } from '$lib/rulesets/generation-report';
	export let onImported: (record: RulesetRecord) => void;
	let sourceType: 'url' | 'text' = 'url';
	let source = '',
		name = '',
		busy = false,
		error = '';
	let imported: RulesetRecord | null = null;
	async function generate() {
		busy = true;
		error = '';
		imported = null;
		try {
			const response = await fetch('/api/rulesets/generate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					name: name.trim() || undefined,
					source:
						sourceType === 'url'
							? { type: 'url', url: source.trim() }
							: { type: 'text', text: source }
				})
			});
			const result = (await response.json()) as { ruleset: RulesetRecord; error?: string };
			if (!response.ok) throw new Error(result.error ?? 'Could not import these rules');
			imported = result.ruleset;
			onImported(result.ruleset);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not import these rules';
		} finally {
			busy = false;
		}
	}
</script>

<section class="jc-panel import-panel">
	<h2>Add a game from its rules</h2>
	<p class="jc-subtle">
		Use a specific game page or paste its rules. We’ll show what is ready to play and any scoring
		defaults.
	</p>
	<form on:submit|preventDefault={generate}>
		<label for="import-type">Rules source</label>
		<select
			id="import-type"
			class="jc-control"
			bind:value={sourceType}
			disabled={busy}
			on:change={() => (source = '')}
		>
			<option value="url">Web page</option><option value="text">Paste rules</option>
		</select>
		<label for="import-source">{sourceType === 'url' ? 'Game rules URL' : 'Game rules text'}</label>
		{#if sourceType === 'url'}
			<input
				id="import-source"
				class="jc-control"
				type="url"
				bind:value={source}
				required
				disabled={busy}
				placeholder="https://bicyclecards.com/how-to-play/six-card-golf"
			/>
		{:else}
			<textarea
				id="import-source"
				class="jc-control"
				rows="8"
				bind:value={source}
				required
				disabled={busy}
				maxlength="24000"></textarea>
		{/if}
		<label for="import-name">Game name (optional)</label>
		<input id="import-name" class="jc-control" bind:value={name} disabled={busy} maxlength="80" />
		<ScoreButton type="submit" variant="primary" disabled={busy || !source.trim()}
			>{busy ? 'Reading rules…' : 'Import rules'}</ScoreButton
		>
	</form>
	{#if busy}<p class="jc-subtle" role="status">
			Translating the rules, comparing them with the source, and testing play. This can take a
			couple of minutes.
		</p>{/if}
	{#if error}<p class="jc-status-error" role="alert">{error}</p>{/if}
	{#if imported}
		<div class="import-result" role="status">
			<h3>{imported.name}</h3>
			<RulesetReview
				record={imported}
				onReviewed={(record) => {
					imported = record;
					onImported(record);
				}}
			/>
			{#if canPlayRuleset(imported.bundle)}
				<p><strong>Ready for shared play.</strong> Selected in Start a table above.</p>
			{:else}<p>
					<strong>Saved as a draft.</strong> Review the report above before playing. You can still inspect
					its scoring profile or use Raw score entry.
				</p>{/if}
			{#each imported.bundle.explain?.diagnostics.filter( (line) => /default|convention|missing|not specified|snapshot/i.test(line) ) ?? [] as line}<p
				>
					{line}
				</p>{/each}
			<a class="jc-mode-link" href={`/?ruleset=${encodeURIComponent(imported.id)}`}
				>Use for scorekeeping</a
			>
			{#if !canPlayRuleset(imported.bundle)}<a class="jc-mode-link" href={`/play/${imported.id}`}
					>Inspect draft</a
				>{/if}
		</div>
	{/if}
</section>

<style>
	.import-panel {
		padding: 22px;
		margin-top: 24px;
	}
	h2 {
		margin: 0 0 10px;
	}
	form {
		display: grid;
		gap: 10px;
	}
	label {
		font-weight: 700;
	}
	.import-result {
		border-top: 1px solid var(--jc-line);
		margin-top: 18px;
		padding-top: 12px;
	}
	textarea {
		resize: vertical;
	}
</style>
