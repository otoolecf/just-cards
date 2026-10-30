import {expect,it} from 'vitest';
import {admitAI} from './ai-admission';
it('limits concurrency and daily requests and expires crashed leases',()=>{
 const s={until:0,count:0,leases:{} as Record<string,number>};
 expect(admitAI(s,'a',1)).toBe(true);expect(admitAI(s,'b',1)).toBe(true);
 expect(admitAI(s,'c',1)).toBe(false);
 expect(admitAI(s,'c',600002)).toBe(true);
 s.count=20;expect(admitAI(s,'d',600003)).toBe(false);
 expect(admitAI(s,'e',86400002)).toBe(true);
});
