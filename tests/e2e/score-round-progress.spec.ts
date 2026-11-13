import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function capture(page:Page,name:string) {
	if (!process.env.STAGING_EVIDENCE_DIR) return;
	const dir=resolve(process.env.STAGING_EVIDENCE_DIR);
	await mkdir(dir,{recursive:true});
	await page.screenshot({path:resolve(dir,`${name}.png`),fullPage:true});
	await page.getByRole('status',{name:'Round progress',exact:true}).screenshot({path:resolve(dir,`${name}-banner.png`)});
	if(name==='rounds-complete')await page.getByRole('button',{name:'Add round',exact:true}).locator('..').locator('..').screenshot({path:resolve(dir,`${name}-entry.png`)});
	await writeFile(resolve(dir,`${name}.json`),JSON.stringify({url:page.url(),capturedAt:new Date().toISOString()},null,2));
}

test('Golf round progress stays prominent and synchronized through correction and completion',async({browser})=>{
	const first=await browser.newContext({viewport:{width:390,height:844}});
	const second=await browser.newContext({viewport:{width:390,height:844}});
	const a=await first.newPage(),b=await second.newPage();
	const banner=(page:Page)=>page.getByRole('status',{name:'Round progress',exact:true});
	const expectRound=(page:Page,label:string)=>expect(banner(page).getByRole('heading',{name:label,exact:true})).toBeVisible();
	await a.goto('/');await a.waitForLoadState('networkidle');
	await a.getByPlaceholder('Player 1',{exact:true}).fill('Alice');
	await a.getByPlaceholder('Player 2',{exact:true}).fill('Bob');
	await a.getByRole('button',{name:'Create session',exact:true}).click();
	await expectRound(a,'Round 1 of 9');
	const bounds=await banner(a).boundingBox();
	expect(bounds!.y+bounds!.height).toBeLessThan(844);
	await a.getByRole('button',{name:'Share scoring room',exact:true}).click();
	await expect(a.getByText('You are the scorekeeper.',{exact:true})).toBeVisible();
	const invite=await a.getByLabel('Invite everyone to watch').inputValue();
	await b.goto(invite);await expectRound(b,'Round 1 of 9');
	await expect(b.getByRole('button',{name:'Add round',exact:true})).toHaveCount(0);
	await a.getByRole('spinbutton',{name:'Alice',exact:true}).fill('5');
	await a.getByRole('spinbutton',{name:'Bob',exact:true}).fill('8');
	await a.getByRole('button',{name:'Add round',exact:true}).click();
	await expectRound(a,'Round 2 of 9');await expectRound(b,'Round 2 of 9');
	await capture(a,'round-2-scorekeeper');await capture(b,'round-2-viewer');
	await a.getByRole('button',{name:'Undo',exact:true}).click();
	await expectRound(a,'Round 1 of 9');await expectRound(b,'Round 1 of 9');
	await expect(a.getByRole('spinbutton',{name:'Alice',exact:true})).toHaveValue('5');
	await a.getByRole('button',{name:'Redo',exact:true}).click();
	await expectRound(a,'Round 2 of 9');
	await a.reload();await expectRound(a,'Round 2 of 9');
	const id=new URL(invite).searchParams.get('score');
	const state=await (await a.request.get(`/api/sessions/${id}`)).json();
	expect(state.config.scoreGuidedProfile.roundProgress).toEqual({total:9});
	for(let round=2;round<=9;round++) {
		await a.getByRole('spinbutton',{name:'Alice',exact:true}).fill(String(round));
		await a.getByRole('spinbutton',{name:'Bob',exact:true}).fill('0');
		await a.getByRole('button',{name:'Add round',exact:true}).click();
		await expectRound(a,round===9?'9 rounds complete':`Round ${round+1} of 9`);
	}
	await expectRound(b,'9 rounds complete');
	const addRound=a.getByRole('button',{name:'Add round',exact:true});
	await expect(addRound).toBeDisabled();
	await a.getByRole('tab',{name:'Guided cards',exact:true}).click();
	await expect(addRound).toBeDisabled();
	await a.getByRole('tab',{name:'Manual points',exact:true}).click();
	await expect(a.getByRole('button',{name:'Undo',exact:true})).toBeEnabled();
	await capture(a,'rounds-complete');
	await a.getByRole('button',{name:'Undo',exact:true}).click();
	await expectRound(a,'Round 9 of 9');await expectRound(b,'Round 9 of 9');
	await expect(a.getByRole('spinbutton',{name:'Alice',exact:true})).toHaveValue('9');
	await expect(a.getByRole('spinbutton',{name:'Bob',exact:true})).toHaveValue('0');
	await expect(addRound).toBeEnabled();
	await a.getByRole('button',{name:'Redo',exact:true}).click();
	await expectRound(a,'9 rounds complete');
	await expect(addRound).toBeDisabled();
	await a.getByRole('button',{name:'Undo',exact:true}).click();
	await expect(addRound).toBeEnabled();
	await a.getByRole('spinbutton',{name:'Alice',exact:true}).fill('10');
	await addRound.click();
	await expectRound(a,'9 rounds complete');await expectRound(b,'9 rounds complete');
	await expect(addRound).toBeDisabled();
	await a.reload();await expectRound(a,'9 rounds complete');
	await expect(addRound).toBeDisabled();
	for(const page of [a,b])expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
	await first.close();await second.close();
});
