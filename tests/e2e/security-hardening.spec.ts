import {test,expect} from '@playwright/test';

test('catalog writes reject anonymous callers',async({request})=>{
 const response=await request.post('/api/rulesets',{data:{}});
 expect(response.status()).toBe(403);
});

test('owner cannot persist executable source links',async({page})=>{
 const key=process.env.E2E_OWNER_ACCESS_KEY;
 test.skip(!key,'Requires an isolated deployment with a matching owner test key');
 await page.goto('/owner');
 const result=await page.evaluate(async(key)=>{
  const post=(url:string,body:unknown)=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const login=await post('/api/owner/session',{key});
  const {rulesets}=await (await fetch('/api/rulesets')).json() as {rulesets:Array<{bundle:unknown}>};
  const rejected=await post('/api/rulesets',{name:'Unsafe audit link',origin:'manual',sourceUrl:'javascript:alert(1)',bundle:rulesets[0].bundle});
  return {login:login.status,rejected:rejected.status};
 },key);
 expect(result).toEqual({login:200,rejected:400});
});
