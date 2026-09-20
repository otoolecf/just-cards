<script lang="ts">
 import type { RoomView, RoomMutation } from '$lib/server/room-service';
 import ScoreButton from './score-button.svelte';
 export let room:RoomView;
 export let busy=false;
 export let mutate:(input:RoomMutation)=>Promise<boolean>;
 export let onLeave:()=>void;
 let privateLink='', privateName='', confirmingUndo=false, copied=false;
 $: me=room.seats.find(s=>s.id===room.selfId);
 $: host=room.selfId===room.hostId;
 async function action(type:'pause'|'resume'|'return'|'claim_host'|'undo') {
  if(await mutate({type,revision:room.revision,requestId:crypto.randomUUID()})) confirmingUndo=false;
 }
 async function issue(seatId:string) {
  const secret=crypto.randomUUID();
  if(await mutate({type:'issue_recovery',seatId,recoveryToken:secret,revision:room.revision,requestId:crypto.randomUUID()})) {
   privateLink=`${location.origin}/play/room/${room.code}#recover=${encodeURIComponent(secret)}`;
   privateName=room.seats.find(s=>s.id===seatId)?.name ?? '';copied=false;
  }
 }
 async function copy() {try {await navigator.clipboard.writeText(privateLink);copied=true;}catch {copied=false;}}
</script>
{#if room.paused}<section class="jc-panel controls" aria-label="Paused game" aria-live="polite">
 <h2>Game paused</h2><p>{room.pauseReason}</p>
 <div class="actions">
 {#if me?.away}<ScoreButton disabled={busy} onPress={()=>action('return')}>I'm back</ScoreButton>{/if}
 {#if host}<ScoreButton variant="primary" disabled={busy || room.seats.some(s=>s.away)} onPress={()=>action('resume')}>Resume game</ScoreButton>{:else if room.hostAbsent && me && !me.away}<ScoreButton disabled={busy} onPress={()=>action('claim_host')}>Take over as host</ScoreButton>{/if}
 </div>
 <p class="jc-subtle">Away players can return on their original phone, or the host can make a replacement link below.</p>
</section>{/if}
<details class="jc-panel controls">
 <summary>Table controls</summary>
 <div class="actions">
 {#if !room.paused}<ScoreButton disabled={busy} onPress={()=>action('pause')}>Pause game</ScoreButton>{/if}
 <ScoreButton disabled={busy} onPress={()=>issue(room.selfId!)}>Create my private recovery link</ScoreButton>
 {#if room.started}<ScoreButton disabled={busy} onPress={onLeave}>{room.table?.stage==='round_end' || room.table?.stage==='game_end'?'Leave table':'Step away'}</ScoreButton>{/if}
 <a class="jc-mode-link" href="/play">Back to tables</a>
 </div>
 <p class="jc-subtle">Save a recovery link before switching phones. It transfers your cards and score to the new phone. Step away pauses an unfinished round and keeps your seat.</p>
 {#if host}
  {#if room.canUndo}
   {#if confirmingUndo}<p>Undo the latest card action for everyone? Scores will recalculate. Players may already have seen a card that becomes hidden again.</p><div class="actions"><ScoreButton disabled={busy} onPress={()=>action('undo')}>Confirm undo</ScoreButton><ScoreButton onPress={()=>confirmingUndo=false}>Cancel undo</ScoreButton></div>
   {:else}<ScoreButton disabled={busy} onPress={()=>confirmingUndo=true}>Undo last play</ScoreButton>{/if}
  {/if}
  {#each room.seats.filter(s=>s.id!==room.selfId) as seat}<div class="player-controls">
   <strong>Manage {seat.name}</strong><div class="actions">
    <ScoreButton disabled={busy || seat.away} onPress={()=>mutate({type:'transfer_host',seatId:seat.id,revision:room.revision,requestId:crypto.randomUUID()})}>Make {seat.name} host</ScoreButton>
    <ScoreButton disabled={busy || (room.started && !room.paused && !['round_end','game_end'].includes(room.table?.stage ?? ''))} onPress={()=>issue(seat.id)}>Replacement link for {seat.name}</ScoreButton>
   </div>
  </div>{/each}
 {/if}
 {#if privateLink}<section aria-label="Private recovery link">
  <label for="private-link">Private link for {privateName}</label><input class="jc-control" id="private-link" readonly value={privateLink} />
  <p>Anyone with this link can take this seat and see its cards. It works once; creating another link cancels the previous one. Send it only to that player.</p>
  <ScoreButton onPress={copy}>{copied?'Private link copied':'Copy private link'}</ScoreButton>
 </section>{/if}
</details>
<style>
 .controls{padding:16px;margin:16px 0;} summary{min-height:44px;cursor:pointer;padding:10px 0;font-weight:700;}
 .actions{display:flex;gap:8px;flex-wrap:wrap;} .player-controls{display:grid;gap:8px;margin-top:16px;}
 input{width:100%;min-width:0;margin-top:8px;} h2{margin-top:0;}
</style>
