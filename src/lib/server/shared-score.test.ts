import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleScoreRequest, type ScoreRequest } from './score-api';
import type { SessionRecord, SessionRepository } from '../session/session-store';
import type { SessionStateView } from '../session/score-session-api';

describe('shared score ownership', () => {
 afterEach(()=>vi.useRealTimers());
 let repo:SessionRepository;
 const run=(request:ScoreRequest)=>handleScoreRequest('scores',request,repo);
 const view=async(response:Response)=>await response.json() as SessionStateView & {shared:NonNullable<SessionStateView['shared']>};
 const append=(keeperHash?:string,count=0):ScoreRequest=>({type:'append',keeperHash,input:{source:'scorekeeper',expectedEventCount:count,scoreEvent:{type:'add_delta',entries:[{target:{kind:'player',id:'Alice'},delta:8}]}}});
 beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  const records=new Map<string,SessionRecord>();
  repo={has:id=>records.has(id),get:id=>structuredClone(records.get(id)),set:(id,r)=>{records.set(id,structuredClone(r));}};
  run({type:'create',config:{players:['Alice','Bob']}});
 });
 it('shares without leaking credentials and rejects all spectator write paths', async()=>{
  const shared=run({type:'share',keeperHash:'keeper'});
  expect(shared.status).toBe(200);
  expect((await view(shared)).shared.isScorekeeper).toBe(true);
  const publicView=await view(run({type:'get'}));
  expect(publicView.shared.isScorekeeper).toBe(false);
  expect(publicView.shared).not.toHaveProperty('keeperHash');
  expect(JSON.stringify(publicView)).not.toContain('"keeper"');
  expect(run(append()).status).toBe(403);
  expect(run({type:'create',config:{players:['Alice','Bob']}}).status).toBe(403);
  expect(run({type:'share',keeperHash:'intruder'}).status).toBe(403);
  expect(run(append('keeper')).status).toBe(200);
  expect(run(append('keeper')).status).toBe(409);
 });
 it('requires the event count and rejects active takeover',()=>{
  run({type:'share',keeperHash:'keeper'});
  const input=append('keeper');if(input.type==='append')delete input.input.expectedEventCount;
  expect(run(input).status).toBe(409);
  expect(run({type:'claim',keeperHash:'new'}).status).toBe(409);
 });
 it('heartbeats, expires and atomically revokes the old scorekeeper',async()=>{
  run({type:'share',keeperHash:'keeper'});
  vi.advanceTimersByTime(59000);run({type:'get',keeperHash:'keeper'});
  vi.advanceTimersByTime(2000);
  expect((await view(run({type:'get'}))).shared.canTakeOver).toBe(false);
  vi.advanceTimersByTime(60000);
  expect((await view(run({type:'get'}))).shared.canTakeOver).toBe(true);
  expect(run({type:'claim',keeperHash:'new'}).status).toBe(200);
  expect(run({type:'claim',keeperHash:'other'}).status).toBe(409);
  expect(run(append('keeper')).status).toBe(403);
  expect(run(append('new')).status).toBe(200);
 });
 it('lets the keeper release for an immediate handoff',()=>{
  run({type:'share',keeperHash:'keeper'});
  expect(run({type:'release',keeperHash:'other'}).status).toBe(403);
  expect(run({type:'release',keeperHash:'keeper'}).status).toBe(200);
  expect(run(append('keeper')).status).toBe(403);
  expect(run({type:'claim',keeperHash:'new'}).status).toBe(200);
 });
});
