<script lang="ts">
 import type { RulesetRecord } from '$lib/rulesets/types';
 import { houseRuleSettings, houseRanks } from '$lib/rulesets/house-rules';
 import { canPlayRuleset, policySnapshot } from '$lib/rulesets/generation-report';
 import ScoreButton from './score-button.svelte';
 export let original: RulesetRecord;
 export let onSaved: (record: RulesetRecord) => void;
 let settings=houseRuleSettings(original.bundle);
 let name=`${original.name} — our rules`, busy=false, error='', saved='';
 const layout=original.bundle.runtimeRulePack.tableRules?.layout;
 const meld=original.bundle.runtimeRulePack.tableRules?.meld;
 async function save() {
  busy=true; error=''; saved='';
  try {
   const response=await fetch(`/api/rulesets/${encodeURIComponent(original.id)}/house-rules`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,settings:{...settings,rounds:settings.rounds ?? null,target:settings.target ?? null},policySnapshot:policySnapshot(original.bundle)})});
   const result=await response.json() as {ruleset:RulesetRecord;error?:string};
   if(!response.ok) throw new Error(result.error ?? 'Unable to save');
   saved=`Saved ${result.ruleset.name}. Select it for a new table or score session.`;
   onSaved(result.ruleset);
  } catch(e) {error=e instanceof TypeError?'Connect to the internet to save house rules. Your edits are still here.':e instanceof Error?e.message:'Unable to save';}
  finally {busy=false;}
 }
</script>

{#if canPlayRuleset(original.bundle)}
<details class="house-rules jc-panel">
 <summary>Customize house rules</summary>
 <p class="jc-subtle">Based on {original.name}. Save a separate family version for new games and score sessions.</p>
 <div class="fields">
 <label>Family game name<input class="jc-control" bind:value={name} maxlength="80" /></label>
 {#if settings.shedding}
 <fieldset><legend>Palace special cards</legend>
 <label class="check"><input type="checkbox" bind:checked={settings.shedding.resetTwo}/>2 is wild and resets the restriction</label>
 <label class="check"><input type="checkbox" bind:checked={settings.shedding.burnTen}/>10 is wild, clears the pile and plays again</label>
 <label class="check"><input type="checkbox" bind:checked={settings.shedding.forcePickupThree}/>3 makes the next player pick up and lose their turn</label>
 <label class="check"><input type="checkbox" bind:checked={settings.shedding.lowSeven}/>7 requires the next play to be 7 or lower</label>
 <label class="check"><input type="checkbox" bind:checked={settings.shedding.fourBurn}/>Four consecutive equal ranks clear and pass</label>
 </fieldset><p>Three obeys the current rank restriction. Enabled 2 and 10 effects are wild. The first player out wins.</p>
 {:else}<div class="columns">
  <label>Minimum players<input class="jc-control" type="number" min="2" max="8" step="1" bind:value={settings.minPlayers} /></label>
  <label>Maximum players<input class="jc-control" type="number" min="2" max="8" step="1" bind:value={settings.maxPlayers} /></label>
 </div>
 {#if meld}
 <div class="columns">
  <label>Cards per player<input class="jc-control" type="number" min="1" max="25" step="1" bind:value={settings.cardsPerPlayer} /></label>
  <label>Cards each with two players<input class="jc-control" type="number" min="1" max="25" step="1" bind:value={settings.twoPlayerCards} /></label>
 </div>
 <p class="jc-subtle">The deal must fit one 52-card deck. Ten cards each supports at most five players.</p>
 <label>Aces in runs<select class="jc-control" bind:value={settings.ace}><option value="both">Low or high (A-2-3 or Q-K-A)</option><option value="low">Low only (A-2-3)</option></select></label>
 {/if}
 {#if layout}
 <label>Cards revealed at the start<input class="jc-control" type="number" min="0" max={settings.cardsPerPlayer-1} step="1" bind:value={settings.initialReveals} /></label>
 {#if layout.rows===2}<label class="check"><input type="checkbox" bind:checked={settings.cancelPairs} />Matching cards in a column cancel to zero</label>{/if}
 {/if}
 <div class="columns">
 <label>Number of rounds<input class="jc-control" type="number" min="1" max="99" step="1" placeholder="No round limit" bind:value={settings.rounds} /></label>
 <label>Target score<input class="jc-control" type="number" min="1" max="100000" step="1" placeholder="No score target" bind:value={settings.target} /></label>
 </div>
 <p class="jc-subtle">Set at least one limit. If both are set, the first reached ends virtual play. Physical scorekeeping keeps a running total.</p>
 <fieldset><legend>Points for each card</legend><div class="ranks">
 {#each houseRanks as rank}<label>{rank}<input class="jc-control" aria-label={`Points for ${rank}`} type="number" min="-100" max="100" step="1" bind:value={settings.cardValues[rank]} /></label>{/each}
 </div></fieldset>{/if}
 <p class="jc-subtle">Saving validates supported settings. Special mechanics outside these settings require a supported rule import.</p>
 {#if error}<p role="alert" class="jc-status-error">{error}</p>{/if}
 {#if saved}<p role="status" class="jc-status-success">{saved}</p>{/if}
 <ScoreButton type="button" variant="primary" disabled={busy || !name.trim()} onPress={() => void save()}>{busy?'Checking and saving…':'Save family rules'}</ScoreButton>
 </div>
</details>
{/if}
<style>
 .house-rules{padding:16px;margin:16px 0;}
 summary{min-height:44px;display:list-item;padding:10px 0;cursor:pointer;font-weight:700;}
 .fields{display:grid;gap:16px;}
 label{display:grid;gap:6px;font-weight:600;min-width:0;}
 .columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
 .ranks{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:10px;}
 fieldset{min-width:0;border:1px solid var(--jc-line);border-radius:12px;padding:12px;}
 .check{display:flex;align-items:center;min-height:44px;gap:12px;}
 .check input{width:24px;height:24px;}
 input,select{width:100%;min-width:0;}
</style>
