import {it,expect} from 'vitest';
import {createRulesetStore} from './store';
import {createRulesetService} from './service';
it('returns bounded nonoverlapping catalog pages',async()=>{
 const service=createRulesetService(await createRulesetStore({driver:'memory'}));
 for(let i=0;i<4;i++)await service.createDraft({name:`Game ${i}`,origin:'manual',bundle:{bundleVersion:'runtime-bundle/v1',gameId:`g${i}`,displayName:'Game',runtimeRulePack:{}}});
 const first=await service.list(2,0),second=await service.list(2,2);
 expect(first).toHaveLength(2);expect(second).toHaveLength(2);
 expect(new Set([...first,...second].map(r=>r.id)).size).toBe(4);
});
