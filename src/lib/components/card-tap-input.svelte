<script lang="ts">
	const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
	const SUITS = [
		{ id: 'C', code: 'clubs', symbol: '♣' },
		{ id: 'D', code: 'diamonds', symbol: '♦' },
		{ id: 'H', code: 'hearts', symbol: '♥' },
		{ id: 'S', code: 'spades', symbol: '♠' }
	] as const;

	export let value = '';
	export let labelPrefix = 'cards';
	export let valueChanged: ((nextValue: string) => void) | null = null;

	let selectedSuit: (typeof SUITS)[number]['id'] | '' = '';
	let tokens: string[] = [];
	let syncedValue = '';

	const suitMeta: Record<string, { symbol: string; className: string }> = {
		C: { symbol: '♣', className: 'chip-clubs' },
		D: { symbol: '♦', className: 'chip-diamonds' },
		H: { symbol: '♥', className: 'chip-hearts' },
		S: { symbol: '♠', className: 'chip-spades' }
	};

	function parseTokens(input: string): string[] {
		return input
			.trim()
			.split(/\s+/)
			.map((token) => token.trim())
			.filter(Boolean);
	}

	$: if (value !== syncedValue) {
		tokens = parseTokens(value);
		syncedValue = value;
	}

	function emit(): void {
		const nextValue = tokens.join(' ');
		value = nextValue;
		syncedValue = nextValue;
		valueChanged?.(nextValue);
	}

	function addRank(rank: string): void {
		if (!selectedSuit) {
			return;
		}
		tokens = [...tokens, `${rank}${selectedSuit}`];
		emit();
	}

	function removeToken(index: number): void {
		tokens = tokens.filter((_, i) => i !== index);
		emit();
	}

	function clearAll(): void {
		tokens = [];
		emit();
	}

	function describeToken(token: string): { label: string; suitClass: string } {
		const normalized = token.trim().toUpperCase();
		const match = normalized.match(/^([2-9]|10|[AJQK])([CDHS])$/);
		if (!match) {
			return { label: normalized, suitClass: '' };
		}
		const rank = match[1];
		const suit = match[2];
		const meta = suitMeta[suit];
		return { label: `${rank}${meta.symbol}`, suitClass: meta.className };
	}
</script>

<div class="card-tap-input">
	<div class="suit-row" role="radiogroup" aria-label={`${labelPrefix} suit picker`}>
		{#each SUITS as suit}
			<button
				type="button"
				class={`tap-btn suit-btn suit-${suit.code} ${selectedSuit === suit.id ? 'selected' : ''}`.trim()}
				on:click={() => (selectedSuit = suit.id)}
				aria-label={`${labelPrefix}: suit ${suit.code}`}
			>
				<span class="suit-symbol" aria-hidden="true">{suit.symbol}</span>
				<span class="suit-code">{suit.id}</span>
			</button>
		{/each}
	</div>

	<div class="rank-grid">
		{#each RANKS as rank}
			<button
				type="button"
				class="tap-btn rank-btn"
				on:click={() => addRank(rank)}
				aria-label={`${labelPrefix}: add ${rank}${selectedSuit ? selectedSuit : ''}`}
				disabled={!selectedSuit}
			>
				{rank}
			</button>
		{/each}
	</div>

	{#if !selectedSuit}
		<p class="suit-hint">Pick a suit first, then tap rank cards.</p>
	{/if}

	<div class="token-row">
		{#if tokens.length === 0}
			<p class="token-empty">No cards added</p>
		{:else}
			{#each tokens as token, index}
				{@const described = describeToken(token)}
				<button
					type="button"
					class={`token-chip ${described.suitClass}`.trim()}
					on:click={() => removeToken(index)}
					aria-label={`${labelPrefix}: remove ${token}`}
				>
					{described.label}
				</button>
			{/each}
		{/if}
	</div>

	<div class="meta-row">
		<p class="token-preview">{value || 'Tap cards to build this hand'}</p>
		<button type="button" class="clear-btn" on:click={clearAll} disabled={tokens.length === 0}>Clear</button>
	</div>
</div>

<style>
	.card-tap-input {
		display: grid;
		gap: 8px;
	}

	.suit-row {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 6px;
	}

	.rank-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 6px;
	}

	.tap-btn {
		min-height: 40px;
		border: 1px solid var(--jc-line, #c8d5e2);
		border-radius: 10px;
		background: var(--jc-surface-elevated, #f6faff);
		color: var(--jc-text, #132336);
		font: inherit;
		font-size: 0.92rem;
	}

	.tap-btn:disabled {
		opacity: 0.45;
	}

	.suit-btn {
		display: grid;
		grid-template-columns: auto auto;
		gap: 6px;
		align-items: center;
		justify-content: center;
	}

	.suit-symbol {
		font-size: 1rem;
		line-height: 1;
	}

	.suit-code {
		font-weight: 700;
		font-size: 0.85rem;
		line-height: 1;
	}

	.suit-clubs .suit-symbol,
	.suit-spades .suit-symbol {
		color: var(--jc-text, #132336);
	}

	.suit-diamonds .suit-symbol,
	.suit-hearts .suit-symbol {
		color: var(--jc-error, #b42318);
	}

	.suit-btn.selected {
		border-color: var(--jc-brand, #0f6b63);
		background: var(--jc-brand-soft, #d5f3ee);
		font-weight: 700;
	}

	.suit-hint {
		margin: 0;
		font-size: 0.82rem;
		color: var(--jc-text-muted, #3d4f63);
	}

	.token-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.token-chip {
		min-height: 34px;
		padding: 4px 10px;
		border: 1px solid var(--jc-line, #c8d5e2);
		border-radius: 999px;
		background: var(--jc-surface, #ffffff);
		font: inherit;
		font-size: 0.86rem;
		font-weight: 700;
	}

	.chip-clubs,
	.chip-spades {
		color: var(--jc-text, #132336);
	}

	.chip-diamonds,
	.chip-hearts {
		color: var(--jc-error, #b42318);
	}

	.token-empty {
		margin: 0;
		font-size: 0.85rem;
		color: var(--jc-text-muted, #3d4f63);
	}

	.meta-row {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		align-items: center;
	}

	.token-preview {
		margin: 0;
		font-size: 0.82rem;
		color: var(--jc-text-muted, #3d4f63);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.clear-btn {
		min-height: 34px;
		border: 1px solid var(--jc-line, #c8d5e2);
		border-radius: 8px;
		background: var(--jc-surface, #ffffff);
		padding: 4px 8px;
		font: inherit;
		font-size: 0.85rem;
	}

	@media (max-width: 520px) {
		.rank-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}
</style>
