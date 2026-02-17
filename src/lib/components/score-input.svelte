<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	export let as: 'input' | 'textarea' = 'input';
	export let type: HTMLInputAttributes['type'] = 'text';
	export let id = '';
	export let value = '';
	export let placeholder = '';
	export let min: HTMLInputAttributes['min'] = undefined;
	export let rows = 4;
	export let disabled = false;
	export let className = '';
	export let onValueChange: ((nextValue: string) => void) | null = null;

	function handleInput(event: Event): void {
		const target = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
		value = target.value;
		onValueChange?.(value);
	}
</script>

{#if as === 'textarea'}
	<textarea
		id={id}
		rows={rows}
		class={className ? `jc-control control control-textarea ${className}` : 'jc-control control control-textarea'}
		placeholder={placeholder}
		{disabled}
		bind:value
		on:input={handleInput}
	></textarea>
{:else}
	<input
		id={id}
		type={type}
		min={min}
		class={className ? `jc-control control ${className}` : 'jc-control control'}
		placeholder={placeholder}
		{disabled}
		bind:value
		on:input={handleInput}
	/>
{/if}
