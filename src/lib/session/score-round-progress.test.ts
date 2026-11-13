import { describe, expect, it } from 'vitest';
import { scoreRoundProgress, roundProgressMetadata } from './score-round-progress';
import { deriveGuidedScoreProfileFromBundle } from './score-session-commands';
import { familyRulesets } from '../rulesets/family-presets';
import type { ScoreEvent } from '../scorekeeper/engine';

const points: ScoreEvent = {type:'add_delta',entries:[{target:{kind:'player',id:'Alice'},delta:0}]};
const cards: ScoreEvent = {type:'add_round',playerCards:{Alice:[{rank:'A'}]}};

describe('scoring round progress',()=>{
 it('copies fixed or open round metadata from capabilities, not game names',()=>{
  const rules=familyRulesets();
  const golf=rules.find(r=>r.bundle.runtimeRulePack.tableRules?.scoring.rounds===9)!;
  expect(deriveGuidedScoreProfileFromBundle(golf.bundle,'unrelated-id').roundProgress).toEqual({total:9});
  const rummy=rules.find(r=>r.bundle.runtimeRulePack.tableRules?.scoring.target===500)!;
  expect(deriveGuidedScoreProfileFromBundle(rummy.bundle,'another-id').roundProgress).toEqual({});
  for(const r of rules.filter(r=>r.bundle.runtimeRulePack.tableRules?.contract||r.bundle.runtimeRulePack.tableRules?.patience||r.bundle.runtimeRulePack.tableRules?.tileMahjong)) {
   expect(deriveGuidedScoreProfileFromBundle(r.bundle,r.id).roundProgress).toBeUndefined();
  }
 });
 it('starts at one, advances once per submission, and preserves zero scores',()=>{
  expect(scoreRoundProgress([],{total:9})).toMatchObject({label:'Round 1 of 9',completed:0});
  expect(scoreRoundProgress([points,cards],{total:9})).toMatchObject({label:'Round 3 of 9',completed:2});
 });
 it('replays undo, redo, new branches and undo of a bonus correctly',()=>{
  const settlement:ScoreEvent={type:'settle_pool',fromPoolId:'kitty',toTarget:{kind:'player',id:'Alice'}};
  expect(scoreRoundProgress([points,cards,{type:'undo'}],{})).toMatchObject({label:'Round 2'});
  expect(scoreRoundProgress([points,cards,{type:'undo'},{type:'redo'}],{})).toMatchObject({label:'Round 3'});
  expect(scoreRoundProgress([points,cards,{type:'undo'},points,{type:'redo'}],{})).toMatchObject({completed:2});
  expect(scoreRoundProgress([points,settlement,{type:'undo'}],{})).toMatchObject({completed:1});
  expect(scoreRoundProgress([{type:'add_pattern_round',entries:[],patternPack:{schemaVersion:'patterns/v0',patterns:[]},patternScoring:[]} as unknown as ScoreEvent],{})).toMatchObject({completed:0});
 });
 it('shows completion without overflowing the planned total',()=>{
  expect(scoreRoundProgress(Array(9).fill(points),{total:9})).toMatchObject({label:'9 rounds complete',complete:true});
  expect(scoreRoundProgress(Array(10).fill(points),{total:9})).toMatchObject({label:'10 rounds complete',complete:true});
  expect(scoreRoundProgress([points],{total:1})).toMatchObject({label:'1 round complete'});
  expect(scoreRoundProgress(Array(9).fill(points).concat({type:'undo'}),{total:9})).toMatchObject({label:'Round 9 of 9',complete:false});
  expect(scoreRoundProgress([points],undefined)).toBeNull();
 });
 it('keeps snapshot metadata and only uses exact catalog matches for legacy sessions',()=>{
  const golf=familyRulesets().find(r=>r.bundle.runtimeRulePack.tableRules?.scoring.rounds===9)!;
  const profile=deriveGuidedScoreProfileFromBundle(golf.bundle,golf.id);
  const saved=JSON.parse(JSON.stringify({...profile,roundProgress:{total:18}}));
  expect(roundProgressMetadata(saved,[golf])).toEqual({total:18});
  delete saved.roundProgress;
  expect(roundProgressMetadata(saved,[golf])).toEqual({total:9});
  expect(roundProgressMetadata({...saved,rulesetId:'missing'},[golf])).toBeUndefined();
  expect(roundProgressMetadata(null,[golf])).toBeUndefined();
 });
});
