<script lang="ts">
 import { tick, onMount } from 'svelte';
 let owner = false;
 onMount(() => { void fetch('/api/owner/session').then(r=>r.json()).then(r=>owner=(r as {owner:boolean}).owner).catch(()=>{}); });
 let panel: HTMLDetailsElement;
 let open = false;
 export async function reveal() {
  open = true;
  await tick();
  panel.scrollIntoView({ block: 'start' });
  panel.querySelector('summary')?.focus({ preventScroll: true });
 }
 import type { RulesetRecord } from '$lib/rulesets/types';
 import { favoritesKey, toggleFavorite } from '$lib/rulesets/catalog';
 import ScoreButton from './score-button.svelte';
 export let rulesets: RulesetRecord[];
 export let favorites: string[]=[];
 export let onDeleted: (id:string)=>void;
 export let onChanged: (record:RulesetRecord)=>void;
 export let onFavorites: (ids:string[])=>void;
 let deleting:RulesetRecord|null=null;
 let search='', showArchived=false, editing='', action:'rename'|'copy'='rename', name='', busy=false, error='', notice='';
 async function permanentlyDelete(record:RulesetRecord) {
  busy=true;error='';notice='';
  try {
   const response=await fetch(`/api/rulesets/${record.id}`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({expectedUpdatedAt:record.updatedAt})});
   const result=await response.json() as {error?:string};
   if(!response.ok) throw new Error(result.error ?? 'Unable to delete game');
   onDeleted(record.id);deleting=null;notice=`${record.name} permanently deleted.`;
   const ids=favorites.filter(id=>id!==record.id);onFavorites(ids);
   try {
    localStorage.setItem(favoritesKey,JSON.stringify(ids));
    const cached=JSON.parse(localStorage.getItem('jc-score-rulesets-v1') ?? '[]');
    if(Array.isArray(cached)) localStorage.setItem('jc-score-rulesets-v1',JSON.stringify(cached.filter(r=>r.id!==record.id)));
   } catch {error='Game deleted online, but this device could not clear its cached library. Reload while online.';}
  } catch(e) {error=e instanceof Error?e.message:'Unable to delete game';} finally {busy=false;}
 }
 function favorite(id:string) {
  try { const ids=toggleFavorite(favorites,id);localStorage.setItem(favoritesKey,JSON.stringify(ids));onFavorites(ids); }
  catch {error='Could not save favorites on this device.';}
 }
 function edit(record:RulesetRecord, next:'rename'|'copy') { editing=record.id;action=next;name=next==='copy'?`${record.name} copy`:record.name;error=''; }
 async function save(record:RulesetRecord, archive?:boolean) {
  busy=true;error='';notice='';
  try {
   const copying=archive===undefined && action==='copy';
   const response=await fetch(`/api/rulesets/${record.id}`,{method:copying?'POST':'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(copying?{name}:{name:archive===undefined?name:record.name,archived:archive??!!record.archived,expectedUpdatedAt:record.updatedAt})});
   const result=await response.json() as RulesetRecord & {error?:string};if(!response.ok) throw new Error(result.error ?? 'Unable to save game');
   onChanged(result);editing='';notice=copying?`Created ${result.name}.`:archive===true?`${result.name} removed from the list. Find it under Show archived games to restore it.`:archive===false?`${result.name} restored.`:`Renamed to ${result.name}.`;
  } catch(e) {error=e instanceof Error?e.message:'Unable to save game';} finally {busy=false;}
 }
</script>
<details class="jc-panel library" bind:this={panel} bind:open>
 <summary>Manage games</summary>
 <p class="jc-subtle">Rename saved games or use Remove from list to archive them. To bring one back, choose Show archived games, then Restore. Archived games can also be permanently deleted. Built-ins can be duplicated with your own name. Favorites stay on this browser; names and removals update the shared library. Existing games keep their rules.</p>
 {#if !owner}<p class="jc-subtle">Only the owner can rename, archive, restore, or delete shared games. You can still favorite and play saved games. <a class="jc-mode-link" href="/owner">Owner sign in</a></p>{/if}
 <label>Find a game<input class="jc-control" type="search" bind:value={search} /></label>
 <label class="archive-toggle"><input type="checkbox" bind:checked={showArchived} /> Show archived games</label>
 {#if error}<p role="alert" class="jc-status-error">{error}</p>{/if}
 {#if notice}<p role="status" class="jc-status-success">{notice}</p>{/if}
 {#each rulesets.filter(r=>(showArchived || !r.archived) && r.name.toLowerCase().includes(search.toLowerCase())) as record (record.id)}
  <section class="game" aria-label={record.name}>
   <strong>{record.name}</strong><span class="jc-subtle">{record.archived?'Archived':record.id.startsWith('builtin-')?'Built-in':'Saved game'}</span>
   <div class="actions">
    <ScoreButton disabled={busy} onPress={()=>favorite(record.id)}>{favorites.includes(record.id)?'★ Unfavorite':'☆ Favorite'}</ScoreButton>
    <ScoreButton disabled={busy || !owner} onPress={()=>edit(record,'copy')}>Duplicate</ScoreButton>
    {#if owner && !record.id.startsWith('builtin-')}
     <ScoreButton disabled={busy} onPress={()=>edit(record,'rename')}>Rename</ScoreButton>
     <ScoreButton disabled={busy} onPress={()=>save(record,!record.archived)}>{record.archived?'Restore':'Remove from list'}</ScoreButton>
     {#if record.archived}<ScoreButton disabled={busy} onPress={()=>{deleting=record;editing='';}}>Delete permanently</ScoreButton>{/if}
    {/if}
   </div>
   {#if deleting?.id===record.id}
    <section aria-label={`Confirm deletion of ${deleting.name}`}>
     <p>Permanently delete <strong>{deleting.name}</strong>? This removes its saved rules from the shared library and cannot be undone. Existing rooms and scores keep their saved rules.</p>
     <div class="actions"><ScoreButton disabled={busy} onPress={()=>permanentlyDelete(deleting!)}>Confirm permanent deletion</ScoreButton><ScoreButton disabled={busy} onPress={()=>deleting=null}>Cancel deletion</ScoreButton></div>
    </section>
   {/if}
   {#if editing===record.id}<form on:submit|preventDefault={()=>save(record)}>
    <label>{action==='copy'?'Copy name':'Game name'}<input class="jc-control" required maxlength="80" bind:value={name} /></label>
    <div class="actions"><ScoreButton type="submit" disabled={busy || !name.trim()}>{action==='copy'?'Save copy':'Save name'}</ScoreButton><ScoreButton disabled={busy} onPress={()=>editing=''}>Cancel</ScoreButton></div>
   </form>{/if}
  </section>
 {/each}
</details>
<style>
 .library {padding:16px;margin:20px 0;} summary{min-height:44px;cursor:pointer;font-weight:700;padding:10px 0;}
 label,form {display:grid;gap:8px;} .archive-toggle{display:flex;align-items:center;min-height:44px;gap:12px;}
 .archive-toggle input{width:24px;height:24px;} .game{display:grid;gap:10px;padding:16px 0;border-top:1px solid var(--jc-line);}
 .actions{display:flex;flex-wrap:wrap;gap:8px;} input{width:100%;min-width:0;}
</style>
