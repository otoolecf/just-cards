<script lang="ts">
	import SiteMetadata from '$lib/components/site-metadata.svelte';
	import { onMount } from 'svelte';
	import ScoreButton from '$lib/components/score-button.svelte';
	let owner = false,
		key = '',
		busy = false,
		error = '';
	onMount(() => {
		void fetch('/api/owner/session')
			.then((r) => r.json())
			.then((r) => (owner = (r as { owner: boolean }).owner))
			.catch(
				() =>
					(error =
						'Could not check owner access. Please reconnect and try again.'),
			);
	});
	async function submit() {
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/owner/session', {
				method: owner ? 'DELETE' : 'POST',
				headers: { 'content-type': 'application/json' },
				...(owner ? {} : { body: JSON.stringify({ key }) }),
			});
			const result = (await response.json()) as {
				owner: boolean;
				error?: string;
			};
			if (!response.ok) throw new Error(result.error);
			owner = result.owner;
			key = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not sign in.';
		} finally {
			busy = false;
		}
	}
</script>

<SiteMetadata title="Owner access · Just Cards" description="Owner sign-in for Just Cards management tools." noindex />
<main class="jc-panel">
	<h1>Owner access</h1>
	<p>
		Playing and scorekeeping are open to everyone. Importing rules with AI
		requires the owner's key.
	</p>
	{#if owner}<p role="status">
			Signed in. AI imports are available on this browser for up to eight hours.
		</p>{/if}
	<form on:submit|preventDefault={submit}>
		{#if !owner}<label for="owner-key">Owner key</label><input
				class="jc-control"
				id="owner-key"
				type="password"
				autocomplete="current-password"
				bind:value={key}
				required
				maxlength="512"
			/>{/if}
		<ScoreButton type="submit" variant="primary" disabled={busy}
			>{owner ? 'Sign out' : 'Sign in'}</ScoreButton
		>
	</form>
	{#if error}<p role="alert" class="jc-status-error">{error}</p>{/if}
	<a class="jc-mode-link" href="/play">Back to games</a>
</main>

<style>
	main {
		max-width: 600px;
		margin: 24px auto;
		padding: 24px;
	}
	form {
		display: grid;
		gap: 12px;
	}
	input {
		width: 100%;
		min-width: 0;
	}
</style>
