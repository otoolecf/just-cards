import { describe, expect, it } from 'vitest';
import { correctionForUndo } from './score-correction';
import type { ScoreEvent } from '$lib/scorekeeper/engine';

const points: ScoreEvent = { type: 'add_delta', entries: [
 {target:{kind:'player',id:'Alice'},delta:0},
 {target:{kind:'player',id:'Bob'},delta:-12}
]};
describe('undo correction', () => {
 it('restores all submitted scores including zero and negative', () => {
  expect(correctionForUndo([points])).toEqual({mode:'delta',points:{Alice:'0',Bob:'-12'}});
 });
 it('follows repeated undo, redo and a new branch', () => {
  const next:ScoreEvent={type:'add_delta',entries:[{target:{kind:'player',id:'Alice'},delta:5}]};
  expect(correctionForUndo([points,next,{type:'undo'}])).toEqual(correctionForUndo([points]));
  expect(correctionForUndo([points,next,{type:'undo'},{type:'redo'}])).toEqual(correctionForUndo([next]));
  expect(correctionForUndo([points,{type:'undo'},next,{type:'redo'}])).toEqual(correctionForUndo([next]));
  expect(correctionForUndo([points,{type:'undo'}])).toBeNull();
 });
 it('restores cards for every player after reload', () => {
  expect(correctionForUndo([{type:'add_round',playerCards:{Alice:[{rank:'A',suit:'hearts'}],Bob:[{rank:'2',suit:'clubs'}]}}])).toEqual({mode:'rows',cards:{Alice:'AH',Bob:'2C'}});
 });
});
