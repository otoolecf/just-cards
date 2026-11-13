import { describe, expect, it } from 'vitest';
import { roomRecoveryAction } from './room-recovery-action';
describe('one recovery action at a time',()=>{
 it('prioritizes return, then host resume once everyone returns',()=>{
  expect(roomRecoveryAction({away:true,host:true,anyAway:true,hostAbsent:false,sleeping:false})).toBe('return');
  expect(roomRecoveryAction({away:false,host:true,anyAway:true,hostAbsent:false,sleeping:false})).toBeNull();
  expect(roomRecoveryAction({away:false,host:true,anyAway:false,hostAbsent:false,sleeping:false})).toBe('resume');
 });
 it('offers takeover for a present viewer and check only for a saved table',()=>{
  expect(roomRecoveryAction({away:false,host:false,anyAway:true,hostAbsent:true,sleeping:false})).toBe('claim_host');
  expect(roomRecoveryAction({away:true,host:true,anyAway:true,hostAbsent:true,sleeping:true})).toBe('return');
  expect(roomRecoveryAction({away:false,host:true,anyAway:false,hostAbsent:false,sleeping:true})).toBe('resume');
  expect(roomRecoveryAction({away:false,host:false,anyAway:false,hostAbsent:false,sleeping:true})).toBe('check');
 });
});
