import { describe, expect, it } from 'vitest';
import { createResult, resultText, scoreResult, roomResult, scoreIsComplete, scoreHasFinishRule, resultProfile, handBand } from './results';
import { createSession, appendSessionEvent, buildSessionStateView, type SessionRecord } from '../session/session-store';
import { deriveGuidedScoreProfileFromBundle } from '../session/score-session-commands';
import { familyRulesets } from '../rulesets/family-presets';
import { createRulePack } from '../scorekeeper/engine';
import type { RoomView } from '../server/room-service';
import type { ScoreEvent } from '../scorekeeper/engine';

const input={gameName:'Six Card Golf',lowWins:true,players:[{id:'a',name:'Alex'},{id:'b',name:'Sam'},{id:'c',name:'Jo'},{id:'d',name:'Pat'}],hands:[{a:8,b:3,c:7,d:9},{a:5,b:4,c:6,d:7}],totals:{a:13,b:7,c:13,d:16}};
describe('public result snapshots',()=>{
 it('ranks any roster size and exports only the allowlisted fields',()=>{
  const result=createResult({...input,token:'secret',code:'PRIVATE',handsWithCards:{private:'hand'}} as typeof input);
  expect(result.players.map(p=>p.name)).toEqual(['Sam','Alex','Jo','Pat']);
  expect(result.winnerText).toBe('Sam wins!');
  expect(JSON.stringify(result)).not.toMatch(/secret|PRIVATE|private|"id"|token|handsWithCards/);
  expect(result.players.find(p=>p.name==='Alex')?.hands).toEqual([8,5]);
 });
 it('puts the winner on the third text line with numeric hand scores and no emoji',()=>{
  const text=resultText(createResult(input));
  expect(text.split('\n')[2].trim()).toBe('Sam wins!');
  expect(text).toContain('Alex');expect(text).toContain('8 5');expect(text).toContain('→ 13');
  expect(text).not.toMatch(/[🟩🟨🟥]/u);
  expect(resultText(createResult(input),false)).not.toContain('Alex');
  expect(resultText(createResult(input),false)).toContain('Player 2 wins!');
 });
 it('handles high wins, ties, missing rounds, zero and negative/fractional scores',()=>{
  const result=createResult({gameName:'Custom',lowWins:false,players:input.players.slice(0,3),hands:[{a:-2.5,b:0},{a:4.5,b:2,c:2}],totals:{a:2,b:2,c:2}});
  expect(result.winnerText).toBe('Alex, Sam & Jo tie!');
  expect(result.players[2].hands).toEqual([null,2]);
  expect(resultText(result)).toContain('-2.5 4.5');
  expect(resultText(result)).toContain('— 2');
  expect(handBand([1,2,3,4],2,true)).toBe('middle');
  expect(handBand([1,2,3,4],4,true)).toBe('last');
  expect(handBand([1,2,3,4],4,false)).toBe('best');
  expect(handBand([2,2,2,2],2,true)).toBe('tied');
 });
 it('does not invent a winner for a solo loss and groups partnerships without double counting',()=>{
  expect(createResult({...input,players:input.players.slice(0,1),outcome:'lost'}).winnerText).toBe('Deal conceded');
  const result=createResult({...input,partnerships:true,hands:[{a:100,b:0,c:100,d:0}],totals:{a:100,b:0,c:100,d:0}});
  expect(result.players.map(p=>p.total)).toEqual([0,100]);
  expect(result.players.find(p=>p.name==='Alex & Jo')?.hands).toEqual([100]);
  expect(result.winnerText).toBe('Sam & Pat win!');
 });
 it('sanitizes multiline labels and notes adjustments outside completed hands',()=>{
  const result=createResult({...input,gameName:'Game\nspoof',players:[{id:'a',name:'Alex\nroom=secret'}],totals:{a:20}});
  expect(result.gameName).toBe('Game spoof');
  expect(result.players[0].name).not.toContain('\n');
  expect(result.adjusted).toBe(true);
  expect(resultText(result)).toContain('Totals include adjustments.');
 });
});

describe('scoring result replay and completion',()=>{
 function setup(){
  const rows=new Map<string,SessionRecord>();
  const golf=familyRulesets().find(r=>r.bundle.runtimeRulePack.tableRules?.scoring.rounds===9)!;
  const profile=deriveGuidedScoreProfileFromBundle(golf.bundle,golf.id);
  createSession({sessionId:'test',config:{players:['Alex','Sam'],scoreGuidedProfile:profile,scoreRulePack:profile.scoreRulePack,scoreWinDirection:'low_wins'}},rows);
  return {rows,profile,post:(scoreEvent:ScoreEvent)=>appendSessionEvent('test',{source:'scorekeeper',scoreEvent},rows),view:()=>buildSessionStateView('test',rows)};
 }
 it('reuses game card values, respects undo/redo and ignores unaccepted rounds',()=>{
  const h=setup();
  expect(scoreResult(h.view(),h.profile,'Golf')).toBeNull();
  h.post({type:'add_round',playerCards:{Alex:[{rank:'K'}],Sam:[{rank:'2'}]}});
  let result=scoreResult(h.view(),h.profile,'Golf')!;
  expect(result.players.find(p=>p.name==='Alex')?.hands).toEqual([0]);
  expect(result.players.find(p=>p.name==='Sam')?.hands).toEqual([-2]);
  h.post({type:'undo'});expect(scoreResult(h.view(),h.profile,'Golf')).toBeNull();
  h.post({type:'redo'});expect(scoreResult(h.view(),h.profile,'Golf')?.handCount).toBe(1);
 });
 it('detects fixed rounds and target scores, and follows undo of the finish',()=>{
  const h=setup();
  for(let i=0;i<9;i++)h.post({type:'add_delta',entries:[{target:{kind:'player',id:'Alex'},delta:0}]});
  expect(scoreIsComplete(h.view(),h.profile)).toBe(true);
  h.post({type:'undo'});expect(scoreIsComplete(h.view(),h.profile)).toBe(false);
  const target={...h.profile,roundProgress:{},targetScore:500};
  h.post({type:'add_delta',entries:[{target:{kind:'player',id:'Alex'},delta:500}]});
  expect(scoreIsComplete(h.view(),target)).toBe(true);
  expect(scoreIsComplete(h.view(),null)).toBe(false);
 });
 it('reserves manual finishing for sheets without a known finish rule',()=>{
  const {profile}=setup();
  expect(scoreHasFinishRule(profile)).toBe(true);
  expect(scoreHasFinishRule({...profile,roundProgress:{},targetScore:500})).toBe(true);
  expect(scoreHasFinishRule({...profile,roundProgress:{},roundScoring:'contract'})).toBe(true);
  expect(scoreHasFinishRule({...profile,roundProgress:{}})).toBe(false);
  expect(scoreHasFinishRule(null)).toBe(false);
 });
 it('replays stateful partnership scoring through the existing scorer',()=>{
  const h=setup();
  const bridge=familyRulesets().find(r=>r.bundle.runtimeRulePack.tableRules?.contract)!;
  const profile=deriveGuidedScoreProfileFromBundle(bridge.bundle,bridge.id);
  h.rows.get('test')!.config={players:['N','E','S','W'],scoreGuidedProfile:profile,scoreRulePack:createRulePack()};
  for(let i=0;i<2;i++)h.post({type:'add_contract',players:['N','E','S','W'],result:{team:0,level:4,strain:'hearts',doubling:1,tricks:10}});
  const view=h.view(),result=scoreResult(view,profile,'Bridge')!;
  expect(scoreIsComplete(view,profile)).toBe(true);
  expect(result.players[0].hands.reduce<number>((n,v)=>n+(v??0),0)).toBe(result.players[0].total);
  expect(result.players[0].name).toBe('N & S');
 });
 it('retains copied target metadata and only fills legacy values from the exact ruleset',()=>{
  const rulesets=familyRulesets(),rummy=rulesets.find(r=>r.bundle.runtimeRulePack.tableRules?.scoring.target===500)!;
  const profile=deriveGuidedScoreProfileFromBundle(rummy.bundle,rummy.id);
  expect(JSON.parse(JSON.stringify(profile)).targetScore).toBe(500);
  expect(resultProfile({...profile,targetScore:1000},rulesets)?.targetScore).toBe(1000);
  const legacy={...profile};delete legacy.targetScore;
  expect(resultProfile(legacy,rulesets)?.targetScore).toBe(500);
  expect(resultProfile({...legacy,rulesetId:'missing'},rulesets)?.targetScore).toBeUndefined();
  expect(resultProfile(null,rulesets)).toBeNull();
 });
 it('shares Mahjong payments through the existing scorer and respects an undone hand',()=>{
  const h=setup(),mahjong=familyRulesets().find(r=>r.bundle.runtimeRulePack.tableRules?.tileMahjong)!;
  const profile=deriveGuidedScoreProfileFromBundle(mahjong.bundle,mahjong.id),players=['N','E','S','W'];
  h.rows.get('test')!.config={players,scoreGuidedProfile:profile,scoreRulePack:profile.scoreRulePack};
  for(const winner of ['E','S'])h.post({type:'add_mahjong',players,policy:profile.tileMahjong!,result:{winner,fan:3}});
  let result=scoreResult(h.view(),profile,'Mahjong')!;
  expect(result.handCount).toBe(2);
  for(const player of result.players)expect(player.hands.reduce<number>((n,v)=>n+(v??0),0)).toBe(player.total);
  h.post({type:'undo'});result=scoreResult(h.view(),profile,'Mahjong')!;
  expect(result.handCount).toBe(1);
 });
});

describe('gameplay result projection',()=>{
 const room={name:'Golf',code:'PRIVATE',selfId:'a',hostId:'a',closed:false,seats:input.players.slice(0,2),pastSeats:input.players.slice(2),rules:{scoring:{lowWins:true}},table:{stage:'game_end',scores:input.hands,totals:input.totals,players:['a','b','c','d'],winners:['b'],hands:{a:[{rank:'A',suit:'hearts'}]},stockCount:40}} as unknown as RoomView;
 it('shares final public scores with past seats and rejects active or empty games',()=>{
  const result=roomResult(room)!;
  expect(result.players).toHaveLength(4);
  expect(result.winnerText).toBe('Sam wins!');
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|hearts|stockCount|hostId|selfId/);
  expect(roomResult({...room,table:{...room.table!,stage:'round_end'}})).toBeNull();
  expect(roomResult({...room,closed:true,table:{...room.table!,stage:'draw'}})?.handCount).toBe(2);
  expect(roomResult({...room,closed:true,table:{...room.table!,scores:[]}})).toBeNull();
 });
});
