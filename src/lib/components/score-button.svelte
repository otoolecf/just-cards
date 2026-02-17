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
		border: 1px solid var(--jc-line, #c8d5e2);
		background: var(--jc-surface-elevated, #f6faff);
		color: var(--jc-text, #132336);
		min-height: 44px;
		font-size: var(--jc-type-md, 1rem);
		font: inherit;
		transition:
			border-color var(--jc-motion-fast, 120ms) var(--jc-ease-standard, ease),
			background-color var(--jc-motion-fast, 120ms) var(--jc-ease-standard, ease),
			box-shadow var(--jc-motion-fast, 120ms) var(--jc-ease-standard, ease),
			transform var(--jc-motion-fast, 120ms) var(--jc-ease-standard, ease);
	}

	:global(.score-button:hover) {
		border-color: color-mix(in srgb, var(--jc-line, #c8d5e2) 50%, var(--jc-brand, #0f6b63));
		transform: translateY(-1px);
	}

	:global(.score-button:focus-visible) {
		outline: 0;
		border-color: var(--jc-brand, #0f6b63);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--jc-brand, #0f6b63) 20%, transparent);
	}

	:global(.score-button:disabled) {
		color: var(--jc-text-muted, #3d4f63);
		background: var(--jc-surface-elevated, #f6faff);
		opacity: 0.7;
	}

	:global(.score-button--primary) {
		background: var(--jc-brand, #0f6b63);
		border-color: var(--jc-brand, #0f6b63);
		color: var(--jc-text-on-brand, #ffffff);
	}

	:global(.score-button--primary:hover) {
		background: var(--jc-brand-strong, #0b5a54);
	}
</style>
