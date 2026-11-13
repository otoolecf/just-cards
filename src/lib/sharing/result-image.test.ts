import { describe, expect, it } from 'vitest';
import { resultImageLayout } from './result-image';
import { createResult } from './results';

describe('bounded result image layout',()=>{
 const make=(players:number,hands:number)=>createResult({gameName:'Golf',lowWins:true,players:Array.from({length:players},(_,i)=>({id:String(i),name:`Player ${i}`})),hands:Array.from({length:hands},()=>Object.fromEntries(Array.from({length:players},(_,i)=>[String(i),i]))),totals:Object.fromEntries(Array.from({length:players},(_,i)=>[String(i),i*hands]))});
 it('supports four and eight players without dropping their scores',()=>{
  const four=resultImageLayout(make(4,9)),eight=resultImageLayout(make(8,9));
  expect(four.visibleHands).toBe(9);expect(four.startHand).toBe(0);
  expect(eight.height).toBeGreaterThan(four.height);
  expect(eight.width*eight.height).toBeLessThanOrEqual(8_000_000);
 });
 it('bounds long histories and identifies the exact displayed hand range',()=>{
  const layout=resultImageLayout(make(8,1000));
  expect(layout.visibleHands).toBe(36);expect(layout.startHand).toBe(964);
  expect(layout.handLabel).toBe('Hand scores · 965–1000 of 1000');
  expect(layout.width*layout.height).toBeLessThanOrEqual(8_000_000);
 });
 it('fails clearly instead of allocating an unbounded image',()=>{
  expect(()=>resultImageLayout(make(200,100))).toThrow('plain text');
 });
});
