<script lang="ts">
	export let className = '';
	export let variant: 'primary' | 'default' = 'default';
	export let type: 'button' | 'submit' | 'reset' = 'button';
	export let disabled = false;
	export let onPress: ((event: MouseEvent) => void) | null = null;

	const buttonClass = `score-button ${variant === 'primary' ? 'score-button--primary' : ''} ${className}`.trim();
</script>

<button class={buttonClass} {type} {disabled} onclick={onPress}>
	<slot />
</button>

<style>
	:global(.score-button) {
		padding: 10px 14px;
		border-radius: 12px;
		border: 1px solid var(--line, #d5dce7);
		background: var(--surface-2, #f8fafc);
		color: var(--foreground, #0f172a);
		min-height: 44px;
		font-size: 1rem;
		font: inherit;
		transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
	}

	:global(.score-button:hover) {
		border-color: #97a7be;
	}

	:global(.score-button:focus-visible) {
		outline: 0;
		border-color: var(--brand, #0f766e);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand, #0f766e) 20%, transparent);
	}

	:global(.score-button:disabled) {
		color: var(--muted, #64748b);
		background: var(--surface-2, #f8fafc);
		opacity: 0.7;
	}

	:global(.score-button--primary) {
		background: var(--brand, #0f766e);
		border-color: var(--brand, #0f766e);
		color: var(--surface, #ffffff);
	}

	:global(.score-button--primary:hover) {
		background: color-mix(in srgb, var(--brand, #0f766e) 90%, #000);
	}
</style>
