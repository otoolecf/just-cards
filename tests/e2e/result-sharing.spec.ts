import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function evidence(page:Page,name:string) {
	if(!process.env.STAGING_EVIDENCE_DIR)return;
	const dir=resolve(process.env.STAGING_EVIDENCE_DIR);await mkdir(dir,{recursive:true});
	await page.getByRole('region',{name:'Share results',exact:true}).screenshot({path:resolve(dir,`${name}.png`)});
}
async function stubSharing(page:Page) {
	await page.addInitScript(()=>{
		const w=window as unknown as {shared:unknown[];copied:string;cancelSharing:boolean};
		w.shared=[];w.copied='';w.cancelSharing=false;
		Object.defineProperty(navigator,'canShare',{configurable:true,value:(data:ShareData)=>Boolean(data.files?.length)});
		Object.defineProperty(navigator,'share',{configurable:true,value:async(data:ShareData)=>{
			if(w.cancelSharing)throw new DOMException('cancelled','AbortError');
			w.shared.push({title:data.title,text:data.text,url:data.url,files:data.files?.map(file=>({name:file.name,type:file.type,size:file.size}))});
		}});
		Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{w.copied=text;}}});
	});
}

test('finished four-player scoring shares a local PNG or numeric text without mutating the session',async({browser})=>{
	const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
	await stubSharing(page);
	await page.goto('/');await page.waitForLoadState('networkidle');
	await page.getByRole('spinbutton',{name:'Players',exact:true}).fill('4');
	for(const [index,name] of ['Alex','Sam','Jo','Pat'].entries())await page.getByPlaceholder(`Player ${index+1}`,{exact:true}).fill(name);
	await page.getByRole('button',{name:'Create session',exact:true}).click();
	await expect(page.getByRole('button',{name:'Share results',exact:true})).toHaveCount(0);
	const players={Alex:[8,5,6,7,5,4,2,3,2],Sam:[3,4,4,5,6,5,4,7,5],Jo:[7,6,5,8,4,9,7,5,6],Pat:[9,7,8,10,8,6,5,4,4]};
	for(let hand=0;hand<9;hand++) {
		for(const [name,scores] of Object.entries(players))await page.getByRole('spinbutton',{name,exact:true}).fill(String(scores[hand]));
		await page.getByRole('button',{name:'Add round',exact:true}).click();
		await expect(page.getByRole('status',{name:'Round progress'})).toContainText(hand===8?'9 rounds complete':`Round ${hand+2} of 9`);
		if(hand<8)await expect(page.getByRole('button',{name:'Finish & share',exact:true})).toHaveCount(0);
	}
	let mutations=0;page.on('request',request=>{if(request.url().includes('/api/')&&request.method()==='POST')mutations++;});
	await page.getByRole('button',{name:'Share results',exact:true}).click();
	const panel=page.getByRole('region',{name:'Share results',exact:true});
	await expect(panel.getByRole('img')).toBeVisible();
	await expect(panel.getByRole('img')).toHaveAttribute('alt',/Alex wins!/);
	const downloadPromise=page.waitForEvent('download');
	await panel.getByRole('link',{name:'Download image',exact:true}).click();
	const download=await downloadPromise,bytes=await readFile((await download.path())!);
	expect(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
	expect(bytes.readUInt32BE(16)).toBe(860);expect(bytes.readUInt32BE(20)).toBeGreaterThan(1000);
	if(process.env.STAGING_EVIDENCE_DIR)await download.saveAs(resolve(process.env.STAGING_EVIDENCE_DIR,'score-result-export.png'));
	await panel.getByRole('button',{name:'Share image',exact:true}).click();
	const shared=await page.evaluate(()=>(window as unknown as {shared:unknown[]}).shared);
	expect(shared).toHaveLength(1);expect(JSON.stringify(shared)).toContain('image/png');expect(JSON.stringify(shared)).not.toContain('/api/');
	await page.evaluate(()=>{(window as unknown as {cancelSharing:boolean}).cancelSharing=true;});
	let unwantedDownloads=0;page.on('download',()=>unwantedDownloads++);
	await panel.getByRole('button',{name:'Share image',exact:true}).click();
	await expect(page.getByRole('status').filter({hasText:'Sharing cancelled.'})).toBeVisible();
	expect(unwantedDownloads).toBe(0);
	await evidence(page,'scoring-image-share');
	await panel.getByRole('tab',{name:'Plain text',exact:true}).click();
	const preview=panel.getByLabel('Plain text results',{exact:true}),text=await preview.inputValue();
	expect(text.split('\n')[2].trim()).toBe('Alex wins!');
	expect(text).toContain('8 5 6 7 5 4 2 3 2 → 42');expect(text).toContain('Pat');expect(text).not.toContain('sess-');
	await panel.getByRole('button',{name:'Copy text',exact:true}).click();
	expect(await page.evaluate(()=>(window as unknown as {copied:string}).copied)).toBe(text);
	await evidence(page,'scoring-text-share');
	await panel.getByLabel('Include player names',{exact:true}).uncheck();
	await expect(preview).not.toHaveValue(/Alex/);await expect(preview).toHaveValue(/Player 1 wins!/);
	await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
	await panel.getByRole('button',{name:'Copy text',exact:true}).click();
	await expect(page.getByRole('status').filter({hasText:'Select and copy the text below.'})).toBeVisible();
	expect(mutations).toBe(0);
	expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
	await panel.getByRole('button',{name:'Close sharing',exact:true}).click();
	await page.getByRole('button',{name:'Share scoring room',exact:true}).click();
	const invite=await page.getByLabel('Invite everyone to watch').inputValue();
	const viewerContext=await browser.newContext({viewport:{width:390,height:844}}),viewer=await viewerContext.newPage();
	await viewer.goto(invite);await expect(viewer.getByText('Watching scores · read only',{exact:true})).toBeVisible();
	await viewer.getByRole('button',{name:'Share results',exact:true}).click();
	await expect(viewer.getByRole('region',{name:'Share results'}).getByRole('img')).toHaveAttribute('alt',/Alex wins!/);
	await context.close();await viewerContext.close();
});

test('manual calculator finishing exports a snapshot and unsupported image sharing still downloads',async({page})=>{
	await page.setViewportSize({width:320,height:780});
	await page.goto('/');await page.waitForLoadState('networkidle');
	await page.locator('#score-input-mode').click();await page.getByRole('option',{name:'Raw (calculator)',exact:true}).click();
	await page.getByRole('button',{name:'Create session',exact:true}).click();
	await page.getByRole('spinbutton',{name:'Player 1',exact:true}).fill('5');
	await page.getByRole('button',{name:'Add round',exact:true}).click();
	await page.getByRole('button',{name:'Finish & share',exact:true}).click();
	const panel=page.getByRole('region',{name:'Share results'});
	await expect(panel.getByRole('link',{name:'Download image',exact:true})).toBeVisible();
	await expect(panel.getByRole('button',{name:'Share image',exact:true})).toHaveCount(0);
	await panel.getByRole('button',{name:'Close sharing',exact:true}).click();
	await expect(page.getByRole('button',{name:'Add round',exact:true})).toBeEnabled();
	expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('finished gameplay offers both result formats and does not declare a solo loss a win',async({page})=>{
	await page.setViewportSize({width:390,height:844});
	await page.goto('/play');await page.waitForLoadState('networkidle');
	await page.getByLabel('Game',{exact:true}).selectOption('builtin-solitaire');
	await page.getByLabel('Your name',{exact:true}).fill('Solo');
	await page.getByRole('button',{name:'Create room',exact:true}).click();
	await page.getByRole('button',{name:'Deal cards',exact:true}).click();
	await expect(page.getByRole('button',{name:'Share results',exact:true})).toHaveCount(0);
	await page.getByText('Stuck?',{exact:true}).click();
	await page.getByRole('button',{name:'Concede deal',exact:true}).click();
	await expect(page.getByRole('heading',{name:'Final scores',exact:true})).toBeVisible();
	await page.getByRole('button',{name:'Share results',exact:true}).click();
	const panel=page.getByRole('region',{name:'Share results'});
	await expect(panel.getByRole('img')).toHaveAttribute('alt',/Deal conceded/);
	await panel.getByRole('tab',{name:'Plain text',exact:true}).click();
	const text=await panel.getByLabel('Plain text results').inputValue();
	expect(text.split('\n')[2].trim()).toBe('Deal conceded');
	expect(text).toContain('Solo');expect(text).not.toContain(new URL(page.url()).pathname.split('/').pop());
	await evidence(page,'gameplay-text-share');
	await panel.getByRole('button',{name:'Close sharing',exact:true}).click();
	await page.getByRole('button',{name:'End game',exact:true}).click();
	await page.getByRole('button',{name:'End game for everyone',exact:true}).click();
	await expect(page.getByRole('heading',{name:'Game ended',exact:true})).toBeVisible();
	await page.getByRole('button',{name:'Share results',exact:true}).click();
	await expect(panel.getByRole('img')).toHaveAttribute('alt',/Deal conceded/);
	expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
