import { describe, expect, it } from 'vitest';
import { readGuidedPlay, saveGuidedPlay, displayGameName } from './play-preferences';
import { familyRulesets } from '../rulesets/family-presets';

describe('personal guided play preference', () => {
 it('defaults to normal, persists explicit choices across readers, and rejects malformed preferences', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string,value:string) => { values.set(key,value); } };
  expect(readGuidedPlay(storage)).toBe(false);
  saveGuidedPlay(storage,true);
  expect(readGuidedPlay(storage)).toBe(true);
  saveGuidedPlay(storage,false);
  expect(readGuidedPlay(storage)).toBe(false);
  expect(readGuidedPlay({ getItem: () => 'not a boolean' })).toBe(false);
 });
 it('tolerates missing or blocked browser storage', () => {
  expect(readGuidedPlay()).toBe(false);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  expect(readGuidedPlay(blocked)).toBe(false);
  expect(() => saveGuidedPlay(blocked,true)).not.toThrow();
 });
 it('names the game independently of guidance while preserving custom names', () => {
  const game=familyRulesets().find(r=>r.id==='builtin-hong-kong-mahjong')!;
  expect(game.name).toBe('Hong Kong Mahjong');
  expect(game.bundle.displayName).toBe('Hong Kong Mahjong');
  expect(displayGameName('Hong Kong Mahjong (guided)')).toBe('Hong Kong Mahjong');
  expect(displayGameName('Our family game (guided)')).toBe('Our family game (guided)');
 });
});
