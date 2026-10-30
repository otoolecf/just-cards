<script lang="ts">
 import { page } from '$app/stores';
 import { publicOrigin } from '$lib/site/metadata';
 export let title: string;
 export let description: string;
 export let noindex = false;
 // Room codes and query parameters never appear in shared metadata.
 $: canonical = `${publicOrigin}${$page.route.id === '/play/room/[code]' ? '/play' : $page.url.pathname}`;
</script>

<svelte:head>
 <title>{title}</title>
 <meta name="description" content={description} />
 {#if noindex}<meta name="robots" content="noindex" />{/if}
 <link rel="canonical" href={canonical} />
 <meta property="og:type" content="website" />
 <meta property="og:site_name" content="Just Cards" />
 <meta property="og:title" content={title} />
 <meta property="og:description" content={description} />
 <meta property="og:url" content={canonical} />
 <meta property="og:image" content={`${publicOrigin}/icon-512.png`} />
 <meta property="og:image:width" content="512" />
 <meta property="og:image:height" content="512" />
 <meta property="og:image:alt" content="Just Cards overlapping playing cards logo" />
 <meta name="twitter:card" content="summary" />
 <meta name="twitter:title" content={title} />
 <meta name="twitter:description" content={description} />
 <meta name="twitter:image" content={`${publicOrigin}/icon-512.png`} />
 <meta name="twitter:image:alt" content="Just Cards overlapping playing cards logo" />
</svelte:head>
