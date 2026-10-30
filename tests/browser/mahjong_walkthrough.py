"""Mobile four-seat mahjong and physical scoring. Play actions use real UI controls.
Run against an isolated local dev server; no production data is modified.
"""
import asyncio, argparse, json, random
from collections import Counter
from playwright.async_api import async_playwright, expect

async def run(base,browser_path):
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=browser_path)
  contexts=[];pages=[];errors=[];coverage=Counter()
  try:
   for i in range(4):
    ctx=await browser.new_context(viewport={'width':390,'height':844});page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));contexts.append(ctx);pages.append(page)
    if i==0:
     await page.goto(base+'/play');await page.wait_for_load_state('networkidle');await page.get_by_label('Game',exact=True).select_option('builtin-hong-kong-mahjong');await page.get_by_label('Your name',exact=True).fill('Tile QA 1');await page.get_by_role('button',name='Create room',exact=True).click();await expect(page.get_by_test_id('room-code')).to_be_visible();code=await page.get_by_test_id('room-code').inner_text()
    else:
     await page.goto(base+'/play/room/'+code);await page.get_by_label('Your name',exact=True).fill('Tile QA '+str(i+1));await page.get_by_role('button',name='Join room',exact=True).click();await expect(page.get_by_role('heading',name='Join this table')).to_have_count(0)
    await page.wait_for_load_state('networkidle')
   tokens=[await page.evaluate('(code)=>localStorage.getItem("jc-seat-"+code)',code) for page in pages]
   api=base+'/api/rooms/'+code
   async def view(i=0):
    r=await contexts[i].request.get(api,headers={'authorization':'Bearer '+tokens[i]});assert r.ok,await r.text();return await r.json()
   async def click(i,button):
    async with pages[i].expect_response(lambda r:r.url==api and r.request.method=='POST') as pending:await button.click()
    response=await pending.value;assert response.ok,await response.text();coverage['actions']+=1;return await response.json()
   await click(0,pages[0].get_by_role('button',name='Deal tiles',exact=True))
   await expect(pages[0].get_by_test_id('tile-hand')).to_be_visible()
   await pages[0].screenshot(path='/tmp/jc-mahjong-mobile.png',full_page=True)
   print(json.dumps({'headings':await pages[0].locator('h2,h3').all_text_contents()}),flush=True)
   ids=[(await view(i))['selfId'] for i in range(4)]
   rng=random.Random(17);latest=await view();latest_actor=0;claim_key=None;responded=set()
   for n in range(600):
    v=latest;t=v['table'];m=t['mahjong']
    assert 'wall' not in m and 'responses' not in json.dumps(m)
    for id,hand in m['hands'].items():
     if id!=ids[latest_actor] and m['phase']!='ended':assert all('face' not in tile for tile in hand)
    if m['phase']=='ended':
     assert len(t['scores'])==1 and sum(t['scores'][0].values())==0;coverage['completed_hands']+=1;break
    if m['phase']=='claims':
     if claim_key!=m['claim']['tile']['id']:claim_key=m['claim']['tile']['id'];responded=set()
     i=next(candidate for candidate in range(4) if ids[candidate]!=m['claim']['from'] and candidate not in responded)
    else:i=ids.index(t['players'][t['turn']])
    v=latest if i==latest_actor else await view(i);m=v['table']['mahjong'];options=m['options'];page=pages[i]
    await expect(page.get_by_test_id('tile-hand')).to_be_visible()
    # Inspect live controls before acting; options contain only this viewer's legal actions.
    rendered=await page.get_by_role('button').all_text_contents()
    wins=[o for o in options if o['command']['type']=='tile_win' or o['command'].get('choice')=='win']
    claims=[o for o in options if o['command'].get('choice') in ['kong','pung','chow']]
    draws=[o for o in options if o['command']['type']=='tile_draw']
    discards=[o for o in options if o['command']['type']=='tile_discard']
    if wins:o=wins[0]
    elif claims:o=claims[0]
    elif draws:o=draws[0]
    elif discards:
     hand=m['hands'][ids[i]];counts=Counter(c['face'] for c in hand)
     def value(o):
      face=next(c['face'] for c in hand if c['id']==o['command']['tileId']);near=sum(counts.get(f,0) for f in [face-1,face+1] if face<27 and f>=0 and f//9==face//9)
      return counts[face]*3+near+rng.random()
     o=min(discards,key=value)
    else:o=next(o for o in options if o['command'].get('choice')=='pass')
    c=o['command'];coverage[c.get('choice',c['type'])]+=1
    if c['type']=='tile_discard':
     await page.locator('button[data-tile-id="'+c['tileId']+'"]').click()
    else:await expect(page.get_by_role('button',name=o['label'],exact=True)).to_be_visible()
    latest=await click(i,page.get_by_role('button',name=o['label'],exact=True));latest_actor=i
    if c['type']=='tile_respond':responded.add(i)
    if n%60==0:print(json.dumps({'step':n,'coverage':coverage}),flush=True)
   else:raise AssertionError('No completed hand')
   for page in pages:
    await page.reload();await expect(page.get_by_role('heading',name='Round scores',exact=True)).to_be_visible();assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   await pages[0].screenshot(path='/tmp/jc-mahjong-result.png',full_page=True)
   # Restore a claim-free round through host controls, then finish the temporary room.
   await click(0,pages[0].get_by_role('button',name='Deal next round',exact=True))
   assert (await view())['table']['round']==2
   await pages[0].get_by_role('button',name='End game',exact=True).click()
   await click(0,pages[0].get_by_role('button',name='End game for everyone',exact=True))
   ctx=await browser.new_context(viewport={'width':390,'height':844});page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto(base+'/?ruleset=builtin-hong-kong-mahjong');await page.wait_for_load_state('networkidle');await page.get_by_role('button',name='Create session',exact=True).click();await expect(page.get_by_role('heading',name='Score a mahjong hand')).to_be_visible()
   print(json.dumps({'score_controls':await page.get_by_role('button').all_text_contents()}),flush=True)
   await page.get_by_role('combobox',name='Entry method',exact=True).select_option('quick');await page.get_by_role('combobox',name='Winner',exact=True).select_option('Player 2');await page.get_by_role('combobox',name='How did they win?',exact=True).select_option('false');await page.get_by_role('combobox',name='Who discarded the winning tile?',exact=True).select_option('Player 1')
   await expect(page.get_by_text('Player 2: +32 points',exact=True)).to_be_visible();await page.get_by_role('button',name='Save mahjong result',exact=True).click();await expect(page.get_by_text('Result saved.',exact=True)).to_be_visible();coverage['quick_score']+=1
   await page.get_by_role('combobox',name='Entry method',exact=True).select_option('tiles');await page.get_by_role('combobox',name='Winner',exact=True).select_option('Player 1');await page.get_by_role('combobox',name='How did they win?',exact=True).select_option('true')
   for n in [1,2,3,4,5,6,7,8,9,1,2,3,5,5]:await page.get_by_role('button',name=f'Add {n} Dots',exact=True).click()
   await expect(page.get_by_text('10 faan · payments',exact=True)).to_be_visible();await expect(page.get_by_role('button',name='Save mahjong result',exact=True)).to_be_enabled()
   await page.screenshot(path='/tmp/jc-mahjong-score.png',full_page=True);await page.get_by_role('button',name='Save mahjong result',exact=True).click();coverage['tile_score']+=1
   await page.reload();await expect(page.get_by_role('heading',name='Score a mahjong hand')).to_be_visible();assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   assert not errors,errors;print(json.dumps({'coverage':coverage,'errors':errors}),flush=True)
  finally:await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--base-url',required=True);parser.add_argument('--browser',required=True);args=parser.parse_args();asyncio.run(run(args.base_url,args.browser))
