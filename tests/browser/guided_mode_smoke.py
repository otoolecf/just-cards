"""Check optional guidance on an isolated local server using real mobile UI controls."""
import argparse, asyncio, json, re
from playwright.async_api import async_playwright, expect
CASES=[('hong-kong-mahjong',4,'Tap a tile in your hand, then discard it.'),('six-card-golf',2,None),('500-rum',2,'Starting hand:'),('solitaire',1,'Select a face-up card or sequence'),('palace',2,None),('palace-family',2,None),('bridge',4,'Bid for level + 6 tricks.')]
async def run(base, browser_path):
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,executable_path=browser_path)
  errors=[]
  try:
   for game,count,hint in CASES:
    contexts=[]; pages=[]
    for i in range(count):
     ctx=await browser.new_context(viewport={'width':390,'height':844}); contexts.append(ctx)
     page=await ctx.new_page();pages.append(page);page.on('pageerror',lambda e:errors.append(str(e)))
     if i==0:
      await page.goto(base+'/play');await page.wait_for_load_state('networkidle')
      if game=='hong-kong-mahjong': await expect(page.get_by_role('option',name='Hong Kong Mahjong',exact=True)).to_have_count(1)
      await page.get_by_label('Game',exact=True).select_option('builtin-'+game)
      await page.get_by_label('Your name',exact=True).fill('Guidance QA 1')
      await page.get_by_role('button',name='Create room',exact=True).click()
      await expect(page.get_by_test_id('room-code')).to_be_visible(); code=await page.get_by_test_id('room-code').inner_text()
     else:
      await page.goto(base+'/play/room/'+code);await page.get_by_label('Your name',exact=True).fill('Guidance QA '+str(i+1));await page.get_by_role('button',name='Join room',exact=True).click();await expect(page.get_by_role('heading',name='Join this table')).to_have_count(0)
     await page.wait_for_load_state('networkidle')
     toggle=page.get_by_role('checkbox',name=re.compile('^Guided mode'))
     await expect(toggle).to_have_count(1);await expect(toggle).not_to_be_checked()
    page=pages[0];toggle=page.get_by_role('checkbox',name=re.compile('^Guided mode'))
    deal=page.get_by_role('button',name='Deal tiles' if game=='hong-kong-mahjong' else 'Deal cards',exact=True)
    await expect(deal).to_be_enabled();await deal.click();await expect(deal).to_have_count(0)
    await expect(page.get_by_role('heading',name='Your goal',exact=True)).not_to_be_visible()
    if hint: await expect(page.get_by_text(hint,exact=False).first).not_to_be_visible()
    buttons=await page.get_by_role('button').all_text_contents()
    await toggle.check();await expect(page.get_by_role('heading',name='Your goal',exact=True)).to_be_visible()
    if hint: await expect(page.get_by_text(hint,exact=False).first).to_be_visible()
    assert buttons==await page.get_by_role('button').all_text_contents(),game
    if count>1: await expect(pages[1].get_by_role('checkbox',name=re.compile('^Guided mode'))).not_to_be_checked()
    await page.reload();await expect(toggle).to_be_checked()
    assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),game
    if game=='hong-kong-mahjong':
     await expect(page.get_by_role('heading',name='Hong Kong Mahjong',exact=True)).to_be_visible()
     await expect(page.get_by_role('checkbox',name='Tile labels',exact=True)).to_be_checked()
     await page.screenshot(path='/tmp/jc-guided-enabled.png',full_page=True)
    await toggle.uncheck();await expect(page.get_by_role('heading',name='Your goal',exact=True)).not_to_be_visible()
    await page.get_by_text('How to play',exact=True).click();await expect(page.get_by_role('heading',name='Your goal',exact=True)).to_be_visible()
    await page.get_by_text('How to play',exact=True).click()
    if game=='solitaire':
     await page.get_by_role('button',name='Draw one (24)',exact=True).click();await expect(page.get_by_role('button',name='Draw one (23)',exact=True)).to_be_visible()
    await page.reload();await expect(toggle).not_to_be_checked()
    if game=='hong-kong-mahjong': await page.screenshot(path='/tmp/jc-guided-normal.png',full_page=True)
    await page.get_by_role('button',name='End game',exact=True).click();await page.get_by_role('button',name='End game for everyone',exact=True).click();await expect(page.get_by_role('heading',name='Game ended',exact=True)).to_be_visible()
    # A new room on this browser inherits its opt-in, not the host's setting for other seats.
    if game=='hong-kong-mahjong':
     await toggle.check();await page.goto(base+'/play');await page.wait_for_load_state('networkidle');await page.get_by_label('Game',exact=True).select_option('builtin-solitaire');await page.get_by_label('Your name',exact=True).fill('Cross-game QA');await page.get_by_role('button',name='Create room',exact=True).click();await expect(page.get_by_role('checkbox',name=re.compile('^Guided mode'))).to_be_checked()
     await page.get_by_role('button',name='End game',exact=True).click();await page.get_by_role('button',name='End game for everyone',exact=True).click()
    print(json.dumps({'game':game,'default_normal':True,'toggle_persists':True,'controls_preserved':True}),flush=True)
    for ctx in contexts: await ctx.close()
   assert not errors,errors
   print(json.dumps({'errors':errors,'games':len(CASES)}),flush=True)
  finally: await browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--base-url',required=True);parser.add_argument('--browser',required=True);args=parser.parse_args();asyncio.run(run(args.base_url,args.browser))
