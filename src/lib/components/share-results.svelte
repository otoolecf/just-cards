<script lang="ts">
	import { onDestroy } from 'svelte';
	import { Tabs } from 'bits-ui';
	import ScoreButton from './score-button.svelte';
	import { resultText, winnerText, type ShareResult } from '$lib/sharing/results';
	import { renderResultImage } from '$lib/sharing/result-image';
	import { supportsImageShare, shareImageFile } from '$lib/sharing/browser';
	import { publicOrigin } from '$lib/site/metadata';

	export let getResult: () => ShareResult | null;
	export let manual = false;
	let open = false, names = true, format = 'image', imageUrl = '', preparing = false, busy = false;
	let snapshot: ShareResult | null = null, image: File | null = null;
	let message = '', imageError = '', fileSharing = false, textSharing = false, generation = 0;
	let textArea: HTMLTextAreaElement;
	let container: HTMLDivElement;
	const site = new URL(publicOrigin).hostname;
	$: text = snapshot ? resultText(snapshot, names, site) : '';
	function clearImage() {
		if (imageUrl) URL.revokeObjectURL(imageUrl);
		imageUrl = ''; image = null; fileSharing = false;
	}
	async function prepareImage() {
		const version = ++generation;
		clearImage(); imageError = ''; preparing = true;
		try {
			const file = await renderResultImage(snapshot!, names, site);
			if (!open || version !== generation) return;
			image = file; imageUrl = URL.createObjectURL(file); fileSharing = supportsImageShare(file);
		} catch (error) {
			if (open && version === generation) imageError = error instanceof Error ? error.message : 'Unable to create an image. Use plain text instead.';
		} finally { if (version === generation) preparing = false; }
	}
	function show() {
		message = ''; imageError = '';
		try {
			const result = getResult();
			if (!result) return;
			snapshot = structuredClone(result); names = true; open = true; format = 'image';
			textSharing = typeof navigator.share === 'function';
			void prepareImage();
		} catch (error) { message = error instanceof Error ? error.message : 'Unable to prepare results.'; }
	}
	function close() { open = false; ++generation; clearImage(); snapshot = null; message = ''; container?.querySelector<HTMLButtonElement>(':scope > button')?.focus(); }
	async function sendImage() {
		if (!image || busy) return;
		busy = true; message = '';
		try {
			const result = await shareImageFile(image);
			message = result === 'shared' ? 'Image shared.' : result === 'cancelled' ? 'Sharing cancelled.' : 'Use Download image to save this result.';
		} catch { message = 'Unable to share the image. You can still download it below.'; }
		finally { busy = false; }
	}
	async function copyText() {
		message = '';
		try {
			if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
			await navigator.clipboard.writeText(text); message = 'Results copied.';
		} catch { textArea?.focus(); textArea?.select(); message = 'Select and copy the text below.'; }
	}
	async function sendText() {
		if (busy) return; busy = true;
		try { await navigator.share({ title: 'Just Cards results', text }); message = 'Text shared.'; }
		catch (error) { message = error instanceof Error && error.name === 'AbortError' ? 'Sharing cancelled.' : 'Unable to share. You can still copy the text below.'; }
		finally { busy = false; }
	}
	onDestroy(() => { ++generation; clearImage(); });
</script>

<div class="result-sharing" bind:this={container}>
	<ScoreButton variant="primary" onPress={show}>{manual ? 'Finish & share' : 'Share results'}</ScoreButton>
	{#if open && snapshot}
		<section class="jc-panel share-panel" aria-label="Share results">
			<div class="share-heading"><h3>Share results</h3><ScoreButton onPress={close}>Close sharing</ScoreButton></div>
			<p>{manual ? 'Share your current scores as the final result. You can still edit them afterward.' : 'Share these scores as an image or plain text.'}</p>
			<label class="share-name-choice"><input type="checkbox" checked={names} on:change={(event) => { names = event.currentTarget.checked; void prepareImage(); }} /> Include player names</label>
			<Tabs.Root bind:value={format}>
				<Tabs.List class="jc-mode-links" aria-label="Share format">
					<Tabs.Trigger class="jc-mode-link share-format" value="image">Image</Tabs.Trigger>
					<Tabs.Trigger class="jc-mode-link share-format" value="text">Plain text</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="image">
					{#if preparing}<p role="status">Preparing image…</p>{/if}
					{#if imageError}<p role="alert" class="jc-status-error">{imageError}</p>{/if}
					{#if imageUrl && image}
						<img src={imageUrl} alt={`${snapshot.gameName}. ${winnerText(snapshot, names)} Full numeric scores are also available under Plain text.`} />
						<div class="share-actions">
							{#if fileSharing}<ScoreButton disabled={busy} onPress={() => void sendImage()}>Share image</ScoreButton>{/if}
							<a class="jc-mode-link" href={imageUrl} download={image.name}>Download image</a>
						</div>
					{/if}
				</Tabs.Content>
				<Tabs.Content value="text">
					<label class="share-text-label">Plain text results<textarea bind:this={textArea} class="jc-control" readonly value={text} rows={Math.min(18, snapshot.players.length + 7)} spellcheck="false"></textarea></label>
					<div class="share-actions"><ScoreButton disabled={busy} onPress={() => void copyText()}>Copy text</ScoreButton>{#if textSharing}<ScoreButton disabled={busy} onPress={() => void sendText()}>Share text</ScoreButton>{/if}</div>
				</Tabs.Content>
			</Tabs.Root>
			<p class="jc-subtle">Only the scores shown here are shared. Your scores stay saved here.</p>
		</section>
	{/if}
	{#if message}<p role="status">{message}</p>{/if}
</div>

<style>
	.result-sharing { margin-top: 16px; }
	.share-panel { margin-top: 12px; padding: 16px; min-width: 0; }
	.share-heading, .share-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
	.share-heading { justify-content: space-between; }
	h3 { margin: 0; }
	.share-name-choice { min-height: 44px; display: flex; align-items: center; gap: 8px; margin-block: 8px; }
	.share-text-label { display: grid; gap: 8px; margin-block: 12px; }
	textarea { width: 100%; min-width: 0; resize: vertical; font-family: ui-monospace, monospace; font-size: var(--jc-type-sm); }
	img { display: block; width: 100%; max-width: 430px; height: auto; margin: 12px auto; border-radius: 12px; }
	.share-actions { margin-top: 12px; }
	:global(.share-format) { border: 0; background: transparent; }
	:global(.share-format[aria-selected='true']) { background: var(--jc-brand-soft); color: var(--jc-text); }
</style>
