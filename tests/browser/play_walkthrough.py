"""Play real deals through mobile browser controls on an isolated running QA server.
Usage: python play_walkthrough.py --base-url http://127.0.0.1:8788 --browser /path/to/chromium
Requires Python Playwright. Never reads hidden deck cards or submits gameplay through APIs.
"""
import argparse
import asyncio
import itertools
import json
import re
from collections import Counter
from playwright.async_api import async_playwright, expect

RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

def number(c, high=True):
    return 14 if high and c['rank'] == 'A' else RANKS.index(c['rank']) + 1

class Room:
    async def open(self, browser, base, game, count):
        self.contexts = []
        self.pages = []
        self.errors = []
        self.coverage = Counter()
        self.game = game
        for i in range(count):
            ctx = await browser.new_context(viewport={'width': 390, 'height': 844})
            page = await ctx.new_page()
            page.on('pageerror', lambda e: self.errors.append(str(e)))
            self.contexts.append(ctx)
            self.pages.append(page)
            if not i:
                await page.goto(base + '/play')
                await page.wait_for_load_state('networkidle')
                await page.get_by_label('Game', exact=True).select_option('builtin-' + game)
                await page.get_by_label('Your name').fill('Browser player 1')
                await page.get_by_role('button', name='Create room', exact=True).click()
                await page.get_by_test_id('room-code').wait_for()
                self.code = await page.get_by_test_id('room-code').inner_text()
                self.url = base + '/api/rooms/' + self.code
            else:
                await page.goto(base + '/play/room/' + self.code)
                await page.get_by_label('Your name').fill(f'Browser player {i+1}')
                await page.get_by_role('button', name='Join room', exact=True).click()
                await expect(page.get_by_role('heading', name='Join this table')).to_have_count(0)
            await page.wait_for_load_state('networkidle')
        self.tokens = [await p.evaluate('(code)=>localStorage.getItem("jc-seat-"+code)', self.code) for p in self.pages]
        self.ids = [(await self.view(i))['selfId'] for i in range(count)]
        await self.act(0, self.pages[0].get_by_role('button', name='Deal cards', exact=True))
        # Inspect rendered UI before choosing controls, and check the expanded guide.
        page = self.pages[0]
        await page.get_by_text('How to play', exact=True).click()
        await expect(page.get_by_role('heading', name='Your goal', exact=True)).to_be_visible()
        print(json.dumps({'game': game, 'headings': await page.locator('h2,h3').all_text_contents()}), flush=True)
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        await page.get_by_text('How to play', exact=True).click()
        return self

    async def view(self, i=0):
        response = await self.contexts[i].request.get(self.url, headers={'authorization': 'Bearer ' + self.tokens[i]})
        assert response.ok
        return await response.json()

    async def act(self, i, locator):
        page = self.pages[i]
        async with page.expect_response(lambda r: r.url == self.url and r.request.method == 'POST') as pending:
            await locator.click()
        response = await pending.value
        data = await response.json()
        assert response.ok, (self.game, response.status, data)
        await expect(page.locator('[role=alert]')).to_have_count(0)
        self.coverage['actions'] += 1
        return data

    async def finish(self):
        for page in self.pages:
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            await expect(page.locator('[role=alert]')).to_have_count(0)
        assert not self.errors, self.errors
        await self.pages[0].screenshot(path=f'/tmp/jc-walkthrough-{self.game}.png', full_page=True)
        print(json.dumps({'game': self.game, 'coverage': self.coverage, 'errors': self.errors}), flush=True)
        for ctx in self.contexts:
            await ctx.close()

    async def palace(self):
        for i, page in enumerate(self.pages):
            v = await self.view(i)
            for card in sorted(v['table']['hands'][self.ids[i]], key=number, reverse=True)[:3]:
                await page.locator(f'button[data-card-id="{card["id"]}"]').first.click()
            await self.act(i, page.get_by_role('button', name='Place three face up', exact=True))
        for turn in range(650):
            v = await self.view()
            t = v['table']
            if t['stage'] == 'game_end':
                assert len(t['winners']) == 1 and sum(t['scores'][-1].values()) == 1
                self.coverage['completed_deals'] += 1
                break
            i = self.ids.index(t['players'][t['turn']])
            v = await self.view(i); t = v['table']; me = self.ids[i]; page = self.pages[i]
            sh = t['shedding']; r = v['rules']['shedding']
            hand = t['hands'][me]; up = sh['up'][me]; cards = hand or up
            self.coverage['hand_turns' if hand else 'face_up_turns' if up else 'blind_turns'] += 1
            if not cards:
                await self.act(i, page.get_by_role('button', name='Reveal blind card 1', exact=True))
                continue
            top = t['discard'][-1] if t['discard'] else None
            def legal(c):
                if not top or (r['resetTwo'] and (c['rank'] == '2' or top['rank'] == '2')) or (r['burnTen'] and c['rank'] == '10'):
                    return True
                return number(c) <= 7 if r['lowSeven'] and top['rank'] == '7' else number(c) >= number(top)
            possible = sorted(filter(legal, cards), key=lambda c: 16 if c['rank'] in ['2','10'] else number(c))
            if not possible:
                self.coverage['pickups'] += 1
                await self.act(i, page.get_by_role('button', name='Pick up pile', exact=True))
            else:
                chosen = [c for c in cards if c['rank'] == possible[0]['rank']]
                for c in chosen:
                    await page.locator(f'button[data-card-id="{c["id"]}"]:enabled').first.click()
                self.coverage['played_' + chosen[0]['rank']] += 1
                if len(chosen) > 1: self.coverage['multiple_cards'] += 1
                after = await self.act(i, page.get_by_role('button', name=f'Play selected ({len(chosen)})', exact=True))
                if top and top['rank'] == '7': self.coverage['played_on_seven'] += 1
                if len(after['table']['shedding']['burned']) > len(sh['burned']): self.coverage['clears'] += 1
        else: raise AssertionError('Palace did not finish within 650 actions')
        await expect(self.pages[0].get_by_role('heading', name='Final scores', exact=True)).to_be_visible()
        await self.act(0, self.pages[0].get_by_role('button', name='Play again', exact=True))
        await expect(self.pages[0].get_by_role('heading', name='Your hand — select three face-up cards')).to_be_visible()

    async def bridge(self):
        page = self.pages[0]
        await page.get_by_role('combobox', name='Strain', exact=True).select_option('notrump')
        for i, label in [(0,'Bid 1NT'), (1,'Double'), (2,'Redouble'), (3,'Pass'), (0,'Pass'), (1,'Pass')]:
            await self.act(i, self.pages[i].get_by_role('button', name=label, exact=True))
        for play in range(52):
            v = await self.view(); t = v['table']; c = t['contract']; seat = t['players'][t['turn']]
            controller = c['declarer'] if seat == c['dummy'] else seat
            i = self.ids.index(controller); v = await self.view(i); t = v['table']; c = t['contract']
            hand = t['hands'][seat]
            suit = c['trick'][0]['card']['suit'] if c['trick'] else None
            legal = [x for x in hand if x['suit'] == suit] or hand
            if len(legal) < len(hand):
                illegal = next(x for x in hand if x['suit'] != suit)
                await expect(self.pages[i].locator(f'button[data-card-id="{illegal["id"]}"]')).to_be_disabled()
                self.coverage['follow_suit_checked'] += 1
            if seat == c['dummy']: self.coverage['dummy_plays'] += 1
            card = legal[0]
            await self.act(i, self.pages[i].locator(f'button[data-card-id="{card["id"]}"]'))
        t = (await self.view())['table']
        assert t['stage'] in ['round_end','game_end'] and sum(t['contract']['tricks']) == 13
        assert len(t['scores']) == 1 and len(t['contract']['played']) == 52
        self.coverage['completed_tricks'] = 13
        await expect(self.pages[0].get_by_role('heading', name='Round scores', exact=True)).to_be_visible()
        await self.act(0, page.get_by_role('button', name='Deal next round', exact=True))
        assert (await self.view())['table']['contract']['phase'] == 'auction'

    async def solitaire(self):
        page = self.pages[0]; seen = set(); recycled = 0
        for step in range(240):
            t = (await self.view())['table']; p = t['patience']
            if t['stage'] == 'game_end': break
            sources = [('waste', 0, len(t['discard'])-1, t['discard'][-1])] if t['discard'] else []
            for col, pile in enumerate(p['tableau']):
                sources += [('tableau', col, j, c) for j,c in enumerate(pile) if c.get('rank')]
            move = None
            for zone,col,j,card in sources:
                if zone == 'tableau' and j != len(p['tableau'][col])-1: continue
                for dest,pile in enumerate(p['foundations']):
                    if (not pile and card['rank']=='A') or (pile and pile[-1]['suit']==card['suit'] and number(card,False)==number(pile[-1],False)+1):
                        move = (card, f'Foundation {dest+1}', 'foundation'); break
                if move: break
            if not move:
                for zone,col,j,card in sources:
                    for dest,pile in enumerate(p['tableau']):
                        if zone=='tableau' and col==dest: continue
                        key = (card['id'],dest)
                        if key in seen: continue
                        red = lambda c:c['suit'] in ['hearts','diamonds']
                        legal = (not pile and card['rank']=='K' and (zone=='waste' or j>0)) or (pile and number(pile[-1],False)==number(card,False)+1 and red(pile[-1])!=red(card))
                        if legal:
                            seen.add(key); move=(card, f'To {dest+1}', 'sequence' if zone=='tableau' and j<len(p['tableau'][col])-1 else 'column'); break
                    if move: break
            if move:
                card,label,kind=move
                # Partially overlapped cards have their rank visible at the top.
                locator=page.locator(f'button[data-card-id="{card["id"]}"]')
                await locator.click(position={'x':15,'y':10})
                await self.act(0,page.get_by_role('button', name=re.compile('^'+label+r'(?: |$)')))
                self.coverage[kind+'_moves'] += 1
            elif t['stockCount']:
                await self.act(0,page.get_by_role('button',name=re.compile('^Draw one')))
                self.coverage['draws'] += 1
            elif t['discard'] and recycled<2:
                await self.act(0,page.get_by_role('button',name='Recycle waste',exact=True))
                recycled+=1; self.coverage['recycles']+=1
            else: break
        # Explicitly exercise recycling even if the move search used its budget.
        t = (await self.view())['table']
        if t['stage'] != 'game_end' and not self.coverage['recycles']:
            while t['stockCount']:
                await self.act(0,page.get_by_role('button',name=re.compile('^Draw one')))
                self.coverage['draws'] += 1
                t = (await self.view())['table']
            if t['discard']:
                count = len(t['discard'])
                after = await self.act(0,page.get_by_role('button',name='Recycle waste',exact=True))
                assert after['table']['stockCount'] == count and not after['table']['discard']
                self.coverage['recycles'] += 1
        await page.get_by_text('Table controls',exact=True).click()
        await page.get_by_role('button',name='Undo last play',exact=True).click()
        await self.act(0,page.get_by_role('button',name='Confirm undo',exact=True))
        self.coverage['undo']=1
        if (await self.view())['table']['stage'] != 'game_end':
            await page.get_by_text('Stuck?',exact=True).click()
            await self.act(0,page.get_by_role('button',name='Concede deal',exact=True))
        await expect(page.get_by_role('heading',name='Final scores',exact=True)).to_be_visible()
        await self.act(0,page.get_by_role('button',name='Play again',exact=True))

    async def rummy(self):
        def valid(cards):
            if len(cards)<3: return False
            if len(set(c['rank'] for c in cards))==1:
                return len(cards)<=4 and len(set(c['suit'] for c in cards))==len(cards)
            if len(set(c['suit'] for c in cards))!=1: return False
            for high in [False,True]:
                nums=sorted(number(c,high) for c in cards)
                if all(b==a+1 for a,b in zip(nums,nums[1:])): return True
            return False
        def meld(cards,required=None):
            for group in itertools.combinations(cards,3):
                if (not required or any(c['id']==required for c in group)) and valid(group): return group
            return None
        for turn in range(350):
            t=(await self.view())['table']
            if t['stage'] in ['round_end','game_end']:
                assert t['scores']; self.coverage['completed_rounds']+=1; break
            i=self.ids.index(t['players'][t['turn']]); v=await self.view(i); t=v['table']; me=self.ids[i]; page=self.pages[i]; hand=t['hands'][me]
            if t['stage']=='draw':
                pickup=None
                for card in reversed(t['discard']):
                    group=meld(hand+[card],card['id'])
                    if group: pickup=(card,group);break
                if pickup:
                    card,group=pickup
                    await page.locator('.discard-row').locator(f'button[data-card-id="{card["id"]}"]').click()
                    for c in group:
                        if c['id']!=card['id']: await page.get_by_test_id('my-hand').locator(f'button[data-card-id="{c["id"]}"]').click()
                    await self.act(i,page.get_by_role('button',name='Pick up & play new meld',exact=True))
                    self.coverage['discard_pickup_melds']+=1
                else:
                    await self.act(i,page.get_by_role('button',name=re.compile('^Draw from stock')))
                continue
            group=meld(hand)
            if group:
                for c in group: await page.get_by_test_id('my-hand').locator(f'button[data-card-id="{c["id"]}"]').click()
                await self.act(i,page.get_by_role('button',name='Play new meld',exact=True))
                self.coverage['new_melds']+=1;continue
            layoff=next(((c,j) for c in hand for j,m in enumerate(t['melds']) if valid(m['cards']+[c])),None)
            if layoff:
                c,j=layoff
                await page.get_by_test_id('my-hand').locator(f'button[data-card-id="{c["id"]}"]').click()
                await self.act(i,page.locator('.meld-group').nth(j).get_by_role('button',name='Add to this meld',exact=True))
                self.coverage['layoffs']+=1;continue
            c=max(hand,key=number)
            await page.get_by_test_id('my-hand').locator(f'button[data-card-id="{c["id"]}"]').click()
            await self.act(i,page.get_by_role('button',name='Discard selected',exact=True))
            self.coverage['discards']+=1
        else: raise AssertionError('Rummy round did not end')
        await expect(self.pages[0].get_by_role('heading',name=re.compile('^(Round|Final) scores$'))).to_be_visible()

async def main(args):
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=args.browser, headless=True)
        try:
            for game,n,method in [('palace-family',2,'palace'),('palace',2,'palace'),('bridge',4,'bridge'),('solitaire',1,'solitaire'),('500-rum',2,'rummy')]:
                if args.game and game != args.game: continue
                room=await Room().open(browser,args.base_url,game,n)
                try:
                    await getattr(room,method)()
                    await room.finish()
                except Exception:
                    await room.pages[0].screenshot(path='/tmp/jc-walkthrough-failure.png',full_page=True)
                    print(json.dumps({'failed_game':game,'coverage':room.coverage,'errors':room.errors}),flush=True)
                    raise
        finally: await browser.close()
if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',required=True)
    parser.add_argument('--browser',required=True)
    parser.add_argument('--game')
    asyncio.run(main(parser.parse_args()))
