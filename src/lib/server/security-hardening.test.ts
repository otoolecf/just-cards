import { describe, it, expect } from 'vitest';
import { safeSourceUrl } from '../rulesets/source-url';
import { boundedBody } from './request-limits';
import { protectedOwnerPath } from './owner-auth';
import { detectPatterns } from '../gameplay/pattern-detector';

describe('public security boundaries', () => {
 it('rejects executable and credential-bearing source URLs', () => {
  for (const value of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\nscript:alert(1)', 'data:text/html,test', 'https://user:pass@example.com', 42]) expect(safeSourceUrl(value)).toBeUndefined();
  expect(safeSourceUrl('https://example.com/rules')).toBe('https://example.com/rules');
 });
 it('bounds chunked bodies without trusting content-length', async () => {
  const body = new ReadableStream({start(c){c.enqueue(new Uint8Array(20));c.close();}});
  await expect(boundedBody(new Request('https://example.com', {method:'POST',body,duplex:'half'} as RequestInit), 10)).rejects.toThrow('too large');
 });
 it('protects every shared catalog write', () => {
  for(const path of ['/api/rulesets','/api/rulesets/[rulesetId]/house-rules','/api/rulesets/[rulesetId]/review']) expect(protectedOwnerPath(path,'POST')).toBe(true);
  expect(protectedOwnerPath('/api/sessions','POST')).toBe(false);
 });
 it('rejects exponential candidate enumeration before allocating it', () => {
  expect(()=>detectPatterns(Array.from({length:30},()=>({rank:'A' as const})),{schemaVersion:'pattern/v0',capabilities:['pattern:all_same_rank'],rankOrder:['A'],patterns:[{id:'same',match:{kind:'all_same_rank',minCards:1},maxMatches:1}]})).toThrow(/budget|limit/i);
 });
});

it('bounds composition before nested pattern validation',()=>{
 let match:unknown={kind:'card_count',min:1};
 for(let i=0;i<20;i++)match={kind:'all',matches:[match]};
 expect(()=>detectPatterns([{rank:'A'}],{schemaVersion:'pattern/v0',capabilities:['composition:all','pattern:count'],rankOrder:['A'],patterns:[{id:'deep',match}]})).toThrow(/budget/);
});

it('rejects unsafe links at the shared ruleset service boundary', async()=>{
 const {createRulesetStore}=await import('../rulesets/store');
 const {createRulesetService}=await import('../rulesets/service');
 const service=createRulesetService(await createRulesetStore({driver:'memory'}));
 await expect(service.createDraft({name:'Bad link',origin:'manual',sourceUrl:'javascript:alert(1)',bundle:{bundleVersion:'runtime-bundle/v1',gameId:'test',displayName:'Test',runtimeRulePack:{}}})).rejects.toThrow(/Source URL/);
 expect(await service.list()).toHaveLength(0);
});
