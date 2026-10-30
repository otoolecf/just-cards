import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { runDeployment } from '../scripts/deploy.mjs';

const config = '.wrangler/test-deploy.jsonc';
function execute(args: string[], failAt = -1) {
 const calls: string[][] = [];
 const run = vi.fn((command: string, argv: string[]) => {
  calls.push([command, ...argv]);
  return { status: calls.length === failAt ? 7 : 0 };
 });
 const result = runDeployment(args, { run, exists: () => true, report: vi.fn() });
 return { calls, result };
}
describe('deployment command', () => {
 it.each([[], ['--config'], ['--config','missing.jsonc'], ['--config','wrangler.jsonc'], ['--config','./wrangler.jsonc'], ['--config',config,'--yes']])('rejects unsafe/incomplete arguments %j before running commands', (...args) => {
  const run = vi.fn();
  expect(runDeployment(args, { run, exists: (file: string) => file !== resolve('missing.jsonc'), report: vi.fn() })).not.toBe(0);
  expect(run).not.toHaveBeenCalled();
 });
 it('builds, validates, migrates, then deploys with one explicit config', () => {
  const {calls,result}=execute(['--config',config]);
  expect(result).toBe(0);
  expect(calls).toHaveLength(4);
  expect(calls[0].slice(-2)).toEqual(['run','build']);
  expect(calls[1].slice(-4)).toEqual(['deploy','--dry-run','--config',resolve(config)]);
  expect(calls[2].slice(-7)).toEqual(['d1','migrations','apply','RULESETS_DB','--remote','--config',resolve(config)]);
  expect(calls[3].slice(-3)).toEqual(['deploy','--config',resolve(config)]);
 });
 it('dry-run validates the built Worker without migrating or publishing', () => {
  const {calls,result}=execute(['--config',config,'--dry-run']);
  expect(result).toBe(0);
  expect(calls).toHaveLength(2);
  expect(calls[1].slice(-4)).toEqual(['deploy','--dry-run','--config',resolve(config)]);
 });
 it.each([1,2,3,4])('stops at failed command %i and preserves its failure status', (step) => {
  const {calls,result}=execute(['--config',config],step);
  expect(result).toBe(7);
  expect(calls).toHaveLength(step);
 });
 it('reports process launch errors without continuing', () => {
  const run=vi.fn(()=>({status:null,error:new Error('cannot launch')}));
  expect(runDeployment(['--config',config],{run,exists:()=>true,report:vi.fn()})).toBe(1);
  expect(run).toHaveBeenCalledTimes(1);
 });
});
