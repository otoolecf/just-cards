import { describe, expect, it, vi } from 'vitest';
import { shareImageFile, supportsImageShare } from './browser';

describe('native result image sharing',()=>{
 const file=new File(['png'],'results.png',{type:'image/png'});
 it('feature-detects the exact file and does not try to share unsupported files',async()=>{
  const target={canShare:vi.fn(()=>false),share:vi.fn()};
  expect(supportsImageShare(file,target)).toBe(false);
  expect(await shareImageFile(file,target)).toBe('unsupported');
  expect(target.share).not.toHaveBeenCalled();
 });
 it('shares only a local image file, with no room URL or network upload',async()=>{
  const target={canShare:vi.fn(()=>true),share:vi.fn(async()=>{})};
  expect(await shareImageFile(file,target)).toBe('shared');
  expect(target.share).toHaveBeenCalledWith({files:[file],title:'Just Cards results'});
 });
 it('treats cancellation as a normal result, and preserves other failures',async()=>{
  const target={canShare:()=>true,share:async()=>{throw new DOMException('cancelled','AbortError');}};
  expect(await shareImageFile(file,target)).toBe('cancelled');
  await expect(shareImageFile(file,{canShare:()=>true,share:async()=>{throw new Error('blocked');}})).rejects.toThrow('blocked');
 });
 it('handles missing and throwing capability checks safely',()=>{
  expect(supportsImageShare(file,{})).toBe(false);
  expect(supportsImageShare(file,{share:async()=>{},canShare:()=>{throw new Error('not supported');}})).toBe(false);
 });
});
