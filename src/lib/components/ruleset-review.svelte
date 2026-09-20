<script lang="ts">
	import type { RulePack } from '$lib/scorekeeper/engine';
	import type { RulesetRecord } from '$lib/rulesets/types';
	import ScoreButton from './score-button.svelte';
	export let record: RulesetRecord;
	export let onReviewed: (record: RulesetRecord) => void = () => {};
	let accepted = false,
		busy = false,
		error = '';
	$: report = record.bundle.generationReport;
	$: rules = record.bundle.runtimeRulePack.tableRules;
	$: pack = record.bundle.runtimeRulePack.scoreRulePack as RulePack | undefined;
	$: proposed = rules
		? [
				['Players', `${rules.players.min}–${rules.players.max}`],
				[
					'Deal',
					`${rules.deal.cardsPerPlayer} each${Object.entries(rules.deal.byPlayerCount ?? {})
						.map(([n, c]) => `; ${c} each with ${n} players`)
						.join('')}`
				],
				[
					'Cards',
					rules.layout
						? `${rules.layout.rows} rows × ${rules.layout.columns} columns; choose ${rules.layout.initialReveals} starting reveals`
						: 'Private hands; played melds visible to everyone'
				],
				[
					'Discard pickup',
					`${rules.discard.pickup === 'suffix' ? 'Chosen card and every card above it' : 'Top card only'}${rules.discard.immediateUse ? '; chosen card must be played immediately' : ''}`
				],
				[
					'Round ends',
					rules.roundEnd === 'all_revealed'
						? 'Immediately after a turn reveals all of one player’s cards'
						: 'When a player has no cards'
				],
				['Empty stock', 'End the round after the current turn; no reshuffle'],
				[
					'Scoring',
					`${rules.scoring.zones.map((z) => `${z.multiplier === 1 ? 'add' : 'subtract'} ${z.zone === 'hand' ? 'cards left in hand' : 'cards you contributed to melds'}`).join('; ')}${rules.scoring.columnPairs ? '; equal ranks in a column cancel' : ''}`
				],
				[
					'Winner',
					`${rules.scoring.lowWins ? 'Lowest' : 'Highest'} total${rules.scoring.rounds ? ` after ${rules.scoring.rounds} rounds` : ''}${rules.scoring.target ? `; finish when someone reaches ${rules.scoring.target}` : ''}`
				]
			]
		: [];
	const labels: Record<string, string> = {
		players: 'Players',
		deal: 'Deal',
		layout: 'Card layout',
		discard: 'Discard pickup',
		meld: 'Melds',
		roundEnd: 'Round ending',
		stockExhaustion: 'Empty stock',
		scoring: 'Scoring',
		cardValues: 'Card values'
	};
	function label(path: string) {
		const parts = path.split('.');
		return labels[parts[0] === 'tableRules' ? parts[1] : parts[0]] ?? 'Rule';
	}
	$: assumptionGroups = Array.from(new Set(report?.assumptions.map((a) => label(a.path)) ?? []));
	async function accept() {
		if (!accepted || !report) return;
		busy = true;
		error = '';
		try {
			const response = await fetch(`/api/rulesets/${encodeURIComponent(record.id)}/review`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ accept: true, policySnapshot: report.policySnapshot })
			});
			const body = (await response.json()) as { ruleset: RulesetRecord; error?: string };
			if (!response.ok) throw new Error(body.error ?? 'Could not accept rules');
			onReviewed(body.ruleset);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not accept rules';
		} finally {
			busy = false;
		}
	}
</script>

{#if report}
	<section class="review" aria-label="Rules review">
		<h3>
			{report.status === 'ready'
				? 'Rules ready for play'
				: report.status === 'needs_review'
					? 'Check these rules before playing'
					: 'More rule detail needed'}
		</h3>
		<p>
			{report.strategy === 'llm'
				? 'AI translated these rules.'
				: 'AI was unavailable. These rules came from the basic parser.'}
			{report.behavior.pass
				? `Engine checks passed, including ${report.behavior.simulations.length} simulated rounds.`
				: 'This draft has not passed the engine checks.'}
			These checks do not prove the interpretation matches your rules.
		</p>
		{#if report.acceptedAt}<p>You accepted the rules and assumptions for this saved copy.</p>{/if}
		{#if record.sourceUrl}<a
				class="jc-mode-link"
				href={record.sourceUrl}
				target="_blank"
				rel="noreferrer">Open original rules</a
			>{/if}
		{#if proposed.length}
			<dl>
				{#each proposed as [name, value]}<div>
						<dt>{name}</dt>
						<dd>{value}</dd>
					</div>{/each}
			</dl>
			{#if pack}<p>
					<strong>Card values:</strong> A={pack.baseAceValue}; {Object.entries(pack.rankValues)
						.map(([rank, value]) => `${rank}=${value}`)
						.join(', ')}.
				</p>{/if}
			{#if rules?.meld}<p>
					Melds: {rules.meld.minSet}–{rules.meld.maxSet} matching ranks, or {rules.meld.minRun}+
					consecutive cards of one suit. Aces {rules.meld.ace === 'both' ? 'low or high' : 'low'},
					without wrapping. You may play several melds or add to anyone’s meld after drawing;
					discard to finish your turn.
				</p>{/if}
		{/if}
		{#if report.assumptions.length}
			<h4>Assumptions to check</h4>
			<p>
				Confirm the proposed rules for: <strong>{assumptionGroups.join(', ')}</strong>. The source
				leaves some of these details unstated or open to interpretation.
			</p>
			<details>
				<summary>Read all assumptions ({report.assumptions.length})</summary>
				<ul>
					{#each report.assumptions as assumption}<li>
							<strong>{label(assumption.path)}:</strong>
							{assumption.reason}
						</li>{/each}
				</ul>
			</details>
		{/if}
		<p>
			<strong>Source review:</strong>
			{report.sourceReview.verdict === 'consistent'
				? 'No additional source conflicts were identified.'
				: report.sourceReview.verdict === 'uncertain'
					? 'Some interpretations need your confirmation.'
					: report.sourceReview.verdict === 'unavailable'
						? 'Automatic source comparison was unavailable.'
						: 'The proposed rules conflict with the source.'}
		</p>

		{#if report.blockers.length}<div class="jc-status-error">
				<p>
					This draft cannot start a room yet. {report.unsupported.length
						? 'This game needs play rules that are not supported yet.'
						: 'Clarify the source or resolve the validation issues, then import again.'}
				</p>
				<ul>
					{#each report.blockers as blocker}<li>{blocker}</li>{/each}
				</ul>
			</div>{/if}
		<details>
			<summary>Evidence and validation details</summary>
			<p>{report.sourceReview.summary}</p>
			<ul>
				{#each report.sourceReview.issues as issue}<li>{issue}</li>{/each}
			</ul>
			<ul>
				{#each report.behavior.checks as check}<li>
						{check.pass ? 'Passed' : 'Failed'}: {check.details}
					</li>{/each}
			</ul>
			{#each report.evidence as evidence}<p>
					<strong>{label(evidence.path)}:</strong> “{evidence.quote}”
				</p>{/each}
		</details>
		{#if report.status === 'needs_review'}
			<label class="accept"
				><input type="checkbox" bind:checked={accepted} disabled={busy} />
				<span>I’ve checked these rules and accept the listed assumptions.</span></label
			>
			<ScoreButton variant="primary" disabled={busy || !accepted} onPress={accept}
				>{busy ? 'Checking…' : 'Accept rules & enable play'}</ScoreButton
			>
		{/if}
		{#if error}<p role="alert" class="jc-status-error">{error}</p>{/if}
	</section>
{/if}

<style>
	.review {
		margin-block: 16px;
		overflow-wrap: anywhere;
	}
	dl {
		display: grid;
		gap: 10px;
	}
	dl div {
		display: grid;
		grid-template-columns: minmax(90px, 1fr) 3fr;
		gap: 12px;
	}
	dt {
		font-weight: 700;
	}
	dd {
		margin: 0;
	}
	.accept {
		display: flex;
		gap: 12px;
		align-items: center;
		min-height: 44px;
		margin: 12px 0;
		cursor: pointer;
	}
	.accept input {
		width: 24px;
		height: 24px;
		flex-shrink: 0;
	}
	summary {
		min-height: 44px;
		padding: 10px 0;
		cursor: pointer;
	}
</style>
