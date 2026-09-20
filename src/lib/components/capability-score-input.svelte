<script lang="ts">
	import type { ScoreEvent } from '$lib/scorekeeper/engine';
	import {
		emptyRubber,
		scoreContract,
		type Strain,
		type RubberState,
	} from '$lib/gameplay/contract-scoring';
	import ScoreButton from './score-button.svelte';
	export let kind: 'contract' | 'outcome' | 'solo_outcome';
	export let players: string[];
	export let rubber: RubberState | undefined = undefined;
	export let busy = false;
	export let onSubmit: (event: ScoreEvent) => Promise<void>;
	let team: 0 | 1 = 0,
		level = 1,
		strain: Strain = 'clubs',
		doubling: 1 | 2 | 4 = 1,
		tricks = 7,
		honorTeam = -1,
		honors = 0,
		winner = '';
	$: if (!players.includes(winner)) winner = players[0] ?? '';
	$: result = {
		team,
		level,
		strain,
		doubling,
		tricks,
		honors: [honorTeam === 0 ? honors : 0, honorTeam === 1 ? honors : 0] as [
			number,
			number,
		],
	};
	$: preview = (() => {
		try {
			return scoreContract(rubber ?? emptyRubber(), result);
		} catch {
			return undefined;
		}
	})();
	const partnership = (i: number) => `${players[i]} & ${players[i + 2]}`;
	function outcome(won: boolean) {
		void onSubmit({
			type: 'add_delta',
			entries: players.map((id) => ({
				target: { kind: 'player', id },
				delta: won && id === winner ? 1 : 0,
			})),
		});
	}
</script>

{#if kind === 'contract'}
	<h3>Enter the contract result</h3>
	<p>
		Partners follow the original seating order: {partnership(0)} and {partnership(
			1,
		)}. Enter the final bid and declarer's total tricks; scoring handles the
		rest.
	</p>
	{#if rubber}<div class="fields">
			{#each [0, 1] as i}<p>
					{partnership(i)}: {rubber.games[i]} games · {rubber.below[i]} below line
					· {rubber.games[i] ? 'vulnerable' : 'not vulnerable'}
				</p>{/each}
		</div>{/if}
	{#if rubber?.finished}<p role="status">
			Rubber complete. Create a new score session for the next rubber.
		</p>{:else}
		<div class="fields">
			<label
				>Declaring partnership<select class="jc-control" bind:value={team}
					><option value={0}>{partnership(0)}</option><option value={1}
						>{partnership(1)}</option
					></select
				></label
			>
			<label
				>Contract level<select class="jc-control" bind:value={level}
					>{#each [1, 2, 3, 4, 5, 6, 7] as n}<option value={n}
							>{n} ({n + 6} tricks)</option
						>{/each}</select
				></label
			>
			<label
				>Contract strain<select class="jc-control" bind:value={strain}
					><option value="clubs">Clubs ♣</option><option value="diamonds"
						>Diamonds ♦</option
					><option value="hearts">Hearts ♥</option><option value="spades"
						>Spades ♠</option
					><option value="notrump">No trump</option></select
				></label
			>
			<label
				>Doubling<select class="jc-control" bind:value={doubling}
					><option value={1}>Undoubled</option><option value={2}>Doubled</option
					><option value={4}>Redoubled</option></select
				></label
			>
			<label
				>Declarer's tricks taken<select class="jc-control" bind:value={tricks}
					>{#each Array.from({ length: 14 }, (_, i) => i) as n}<option value={n}
							>{n}</option
						>{/each}</select
				></label
			>
			<label
				>Honors held in one hand<select
					class="jc-control"
					bind:value={honorTeam}
					><option value={-1}>None</option><option value={0}
						>{partnership(0)}</option
					><option value={1}>{partnership(1)}</option></select
				></label
			>
			{#if honorTeam >= 0}<label
					>Honors points<select class="jc-control" bind:value={honors}
						><option value={0}>Choose honors</option
						>{#if strain !== 'notrump'}<option value={100}
								>100 — four trump honors</option
							>{/if}<option value={150}
							>150 — five trump honors / four aces at NT</option
						></select
					></label
				>{/if}
		</div>
		{#if preview}<p role="status">
				{preview.description} · {partnership(0)} +{preview.delta[0]} · {partnership(
					1,
				)} +{preview.delta[1]}
			</p>{/if}
		<ScoreButton
			variant="primary"
			disabled={busy ||
				players.length !== 4 ||
				!preview ||
				(honorTeam >= 0 && !honors)}
			onPress={() => onSubmit({ type: 'add_contract', players, result })}
			>Save contract result</ScoreButton
		>
	{/if}
{:else}
	<p>
		{kind === 'solo_outcome'
			? 'Record whether you completed this deal.'
			: 'Choose the first player to play all their cards.'} A win scores one point.
	</p>
	{#if kind === 'outcome'}<label
			>Winner<select class="jc-control" bind:value={winner}
				>{#each players as player}<option value={player}>{player}</option
					>{/each}</select
			></label
		>{/if}
	<div class="fields">
		<ScoreButton
			variant="primary"
			disabled={busy || !winner}
			onPress={() => outcome(true)}
			>{kind === 'solo_outcome'
				? 'Completed deal (+1)'
				: 'Save winner (+1)'}</ScoreButton
		>{#if kind === 'solo_outcome'}<ScoreButton
				disabled={busy}
				onPress={() => outcome(false)}>Conceded deal (0)</ScoreButton
			>{/if}
	</div>
{/if}

<style>
	.fields {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 12px;
		margin-block: 16px;
	}
	label {
		display: grid;
		gap: 6px;
	}
</style>
