import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function evidence(page:Page,name:string) {
 if(!process.env.STAGING_EVIDENCE_DIR)return;
 const dir=resolve(process.env.STAGING_EVIDENCE_DIR);await mkdir(dir,{recursive:true});
 await page.screenshot({path:resolve(dir,`${name}.png`),fullPage:true});
 await writeFile(resolve(dir,`${name}.json`),JSON.stringify({url:page.url(),capturedAt:new Date().toISOString()},null,2));
 if(name==='01-undo-restored-scores') await page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Add round',exact:true})}).screenshot({path:resolve(dir,'undo-edit-boxes.png')});
 if(name==='07-rejoin-one-return-button') await page.getByRole('region',{name:'Paused game',exact:true}).screenshot({path:resolve(dir,'single-rejoin-action.png')});
 if(name==='03-viewer-live-read-only') {
  const room=await page.getByRole('region',{name:'Scoring room',exact:true}).boundingBox();
  const history=await page.locator('.event-panel').boundingBox();
  if(room && history) await page.screenshot({path:resolve(dir,'shared-read-only-scores.png'),fullPage:true,clip:{x:0,y:room.y,width:390,height:history.y+history.height-room.y}});
 }
}
async function sheet(page:Page) {
 const response=await page.request.post('/api/sessions',{data:{config:{players:['Alice','Bob'],scoreInputMode:'raw',scoreWinDirection:'high_wins'}}});
 expect(response.ok(),`Create score session: ${response.status()} ${await response.text()}`).toBe(true);
 const {sessionId}=await response.json();
 await page.goto(`/?score=${sessionId}`);await page.waitForLoadState('networkidle');
 await expect(page.getByRole('heading',{name:'Add round',exact:true})).toBeVisible();
 return sessionId as string;
}
const scores=(page:Page)=>page.locator('.score-spotlight');

test('undo reopens all scores after reload and permits correcting only one',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await sheet(page);
 await expect(page.getByRole('tab',{name:'Player card rows',exact:true})).toBeVisible({timeout:2000});
 await expect(page.getByRole('tab',{name:'Guided cards',exact:true})).toHaveCount(0);
 await page.getByRole('spinbutton',{name:'Alice',exact:true}).fill('0');
 await page.getByRole('spinbutton',{name:'Bob',exact:true}).fill('-12');
 await page.getByRole('button',{name:'Add round',exact:true}).click();
 await expect(scores(page)).toContainText('-12');
 await page.reload();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Alice',exact:true})).toHaveValue('0');
 await expect(page.getByRole('spinbutton',{name:'Bob',exact:true})).toHaveValue('-12');
 await evidence(page,'01-undo-restored-scores');
 await page.getByRole('spinbutton',{name:'Bob',exact:true}).fill('-10');
 await page.getByRole('button',{name:'Add round',exact:true}).click();
 await expect(scores(page)).toContainText('-10');
 await expect(scores(page)).not.toContainText('-12');
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Bob',exact:true})).toHaveValue('-10');
 await page.getByRole('button',{name:'Redo',exact:true}).click();
 await expect(page.getByRole('spinbutton',{name:'Bob',exact:true})).toHaveValue('');
 await page.getByRole('tab',{name:'Player card rows',exact:true}).click();
 await page.getByRole('radio',{name:'Alice: suit hearts',exact:true}).click();
 await page.getByRole('button',{name:'Alice: add AH',exact:true}).click();
 await page.getByRole('radio',{name:'Bob: suit clubs',exact:true}).click();
 await page.getByRole('button',{name:'Bob: add 2C',exact:true}).click();
 await page.getByRole('button',{name:'Add round',exact:true}).click();
 await expect(page.locator('.status-success')).toHaveText('Round added.');
 await page.reload();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Player card rows',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.token-preview').filter({hasText:/^AH$/})).toBeVisible();
 await expect(page.locator('.token-preview').filter({hasText:/^2C$/})).toBeVisible();
 await evidence(page,'09-undo-restored-card-rows');
});

test('scoring invite streams read-only scores and hands editing to one device',async({browser})=>{
 const first=await browser.newContext({viewport:{width:390,height:844}}), second=await browser.newContext({viewport:{width:390,height:844}});
 const a=await first.newPage(), b=await second.newPage();
 const id=await sheet(a);
 await a.getByRole('button',{name:'Share scoring room',exact:true}).click();
 await expect(a.getByText('You are the scorekeeper.',{exact:true})).toBeVisible();
 const invite=await a.getByLabel('Invite everyone to watch').inputValue();
 expect(invite).not.toContain('#');
 await b.goto(invite);await b.waitForLoadState('networkidle');
 await expect(b.getByText('Watching scores · read only',{exact:true})).toBeVisible();
 await expect(b.getByRole('button',{name:'Undo',exact:true})).toHaveCount(0);
 await expect(b.getByRole('heading',{name:'Add round',exact:true})).toHaveCount(0);
 const rejected=await b.request.post(`/api/sessions/${id}`,{data:{expectedEventCount:0,scoreEvent:{type:'undo'}}});
 expect(rejected.status()).toBe(403);
 await a.getByRole('spinbutton',{name:'Alice',exact:true}).fill('15');
 await a.getByRole('spinbutton',{name:'Bob',exact:true}).fill('22');
 await a.getByRole('button',{name:'Add round',exact:true}).click();
 await expect(scores(b)).toContainText('22');
 await evidence(a,'02-scorekeeper-editing');await evidence(b,'03-viewer-live-read-only');
 await b.reload();await expect(scores(b)).toContainText('22');
 await expect(b.getByRole('button',{name:'Take over scoring',exact:true})).toHaveCount(0);
 await a.getByRole('button',{name:'Hand off scoring',exact:true}).click();
 await expect(b.getByRole('button',{name:'Take over scoring',exact:true})).toBeVisible();
 await b.getByRole('button',{name:'Take over scoring',exact:true}).click();
 await expect(b.getByText('You are the scorekeeper.',{exact:true})).toBeVisible();
 await expect(a.getByText('Watching scores · read only',{exact:true})).toBeVisible();
 await expect(a.getByRole('button',{name:'Undo',exact:true})).toHaveCount(0);
 await evidence(b,'04-takeover-new-scorekeeper');await evidence(a,'05-former-scorekeeper-read-only');
 await b.getByRole('spinbutton',{name:'Bob',exact:true}).fill('3');
 await b.getByRole('button',{name:'Add round',exact:true}).click();
 await expect(scores(a)).toContainText('25');
 expect(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await first.close();await second.close();
});

test('inactive scorekeeper can be replaced and cannot keep editing on return',async({browser})=>{
 test.setTimeout(150_000);
 const first=await browser.newContext({viewport:{width:390,height:844}}), second=await browser.newContext({viewport:{width:390,height:844}});
 const a=await first.newPage(),b=await second.newPage();
 await sheet(a);await a.getByRole('button',{name:'Share scoring room',exact:true}).click();
 const invite=await a.getByLabel('Invite everyone to watch').inputValue();
 await b.goto(invite);await expect(b.getByText('Watching scores · read only',{exact:true})).toBeVisible();
 await a.goto('about:blank');
 await expect(b.getByRole('button',{name:'Take over scoring',exact:true})).toBeVisible({timeout:75000});
 await evidence(b,'06-inactive-scorekeeper-takeover');
 await b.getByRole('button',{name:'Take over scoring',exact:true}).click();
 await expect(b.getByText('You are the scorekeeper.',{exact:true})).toBeVisible();
 await a.goto(invite);await expect(a.getByText('Watching scores · read only',{exact:true})).toBeVisible();
 await first.close();await second.close();
});

test('paused table offers only the next rejoin action and hides deal',async({browser})=>{
 const first=await browser.newContext({viewport:{width:390,height:844}}),second=await browser.newContext({viewport:{width:390,height:844}});
 const a=await first.newPage(),b=await second.newPage();
 await a.goto('/play');await a.waitForLoadState('networkidle');
 await a.getByLabel('Your name',{exact:true}).fill('Alice');
 await a.getByRole('button',{name:'Create room',exact:true}).click();
 await expect(a.getByTestId('room-code')).toBeVisible();
 const roomUrl=a.url();
 await b.goto(roomUrl);await b.getByLabel('Your name',{exact:true}).fill('Bob');
 await b.getByRole('button',{name:'Join room',exact:true}).click();
 await expect(a.getByRole('button',{name:'Deal cards',exact:true})).toBeEnabled();
 await a.getByRole('button',{name:'Deal cards',exact:true}).click();
 await a.getByText('Table controls',{exact:true}).click();
 await a.getByRole('button',{name:'Step away',exact:true}).click();
 await expect(a).toHaveURL(/\/play$/);
 await a.goto(roomUrl);
 const paused=a.getByRole('region',{name:'Paused game',exact:true});
 await expect(paused.getByRole('button')).toHaveCount(1);
 await expect(paused.getByRole('button',{name:"I'm back",exact:true})).toBeVisible();
 await expect(a.getByRole('button',{name:/^Deal |^Play again$/})).toHaveCount(0);
 await evidence(a,'07-rejoin-one-return-button');
 await paused.getByRole('button',{name:"I'm back",exact:true}).click();
 await expect(paused.getByRole('button')).toHaveCount(0);
 await expect(paused.getByText('Waiting for the host to resume.',{exact:true})).toBeVisible();
 const hostRecovery=b.getByRole('region',{name:'Paused game',exact:true});
 await expect(hostRecovery.getByRole('button',{name:'Resume game',exact:true})).toBeVisible();
 await expect(hostRecovery.getByRole('button')).toHaveCount(1);
 await evidence(b,'08-rejoin-one-resume-button');
 await hostRecovery.getByRole('button',{name:'Resume game',exact:true}).click();
 await expect(paused).toHaveCount(0);
 await first.close();await second.close();
});
