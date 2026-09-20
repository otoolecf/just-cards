"""Verify an authorized deployment using two mobile contexts and clean up test rooms.
Usage: python deployment_smoke.py --base-url https://example.workers.dev --browser /path/to/chromium
Reads the owner key from the ignored local .dev.vars file without printing it.
Does not invoke paid AI generation or modify pre-existing games.
"""
import argparse
import json
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def owner_key():
    for line in Path('.dev.vars').read_text().splitlines():
        if line.startswith('OWNER_ACCESS_KEY='):
            return line.split('=', 1)[1].strip().strip('"\'')
    raise RuntimeError('Configure the local owner key before deployment smoke testing')


def run(base, executable):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=executable)
        host_ctx = browser.new_context(viewport={'width': 390, 'height': 844})
        guest_ctx = browser.new_context(viewport={'width': 390, 'height': 844})
        admin = browser.new_context(viewport={'width': 390, 'height': 844})
        host, guest = host_ctx.new_page(), guest_ctx.new_page()
        errors = []
        for page in [host, guest]:
            page.on('pageerror', lambda e: errors.append(str(e)))
        code = token = copy_id = None
        try:
            assert host_ctx.request.get(base + '/api/rulesets').ok
            for method in ['PATCH', 'DELETE']:
                denied = host_ctx.request.fetch(base + '/api/rulesets/builtin-six-card-golf', method=method, data={})
                assert denied.status == 403
            assert host_ctx.request.post(base + '/api/rulesets/generate', data={}).status == 403
            assert host_ctx.request.post(base + '/api/rulesets/%67enerate', data={}).status == 403
            assert admin.request.post(base + '/api/owner/session', data={'key': owner_key()}).ok
            cookie = next(c for c in admin.cookies() if c['name'] == 'jc_owner')
            assert cookie['secure'] and cookie['httpOnly'] and cookie['sameSite'] == 'Strict'
            copy = admin.request.post(base + '/api/rulesets/builtin-six-card-golf', data={'name': 'Deployment verification ' + uuid.uuid4().hex[:8]})
            assert copy.ok
            record = copy.json()
            copy_id = record['id']
            updated = admin.request.patch(base + '/api/rulesets/' + copy_id, data={'name': 'Deployment verification renamed', 'archived': False, 'expectedUpdatedAt': record['updatedAt']})
            assert updated.ok
            assert host_ctx.request.patch(base + '/api/rulesets/' + copy_id, data={}).status == 403
            print('Public catalog and owner-only edits verified; owner cookie is Secure and HttpOnly.', flush=True)
            host.goto(base + '/play')
            host.wait_for_load_state('networkidle')
            expect(host.get_by_role('button', name='Import rules', exact=True)).to_have_count(0)
            host.get_by_label('Game', exact=True).select_option('builtin-six-card-golf')
            host.get_by_label('Your name', exact=True).fill('Deployment host')
            host.get_by_role('button', name='Create room', exact=True).click()
            expect(host.get_by_test_id('room-code')).to_be_visible()
            code = host.get_by_test_id('room-code').inner_text()
            token = host.evaluate('(code)=>localStorage.getItem(`jc-seat-${code}`)', code)
            guest.goto(host.url)
            guest.get_by_label('Your name', exact=True).fill('Deployment guest')
            guest.get_by_role('button', name='Join room', exact=True).click()
            expect(host.get_by_text('Deployment guest', exact=True)).to_be_visible()
            expect(host.get_by_text('Live', exact=True)).to_be_visible()
            host.get_by_role('button', name='Deal cards', exact=True).click()
            for page in [host, guest]:
                page.get_by_role('button', name='Your card 1: Hidden', exact=True).click()
                page.get_by_role('button', name='Your card 2: Hidden', exact=True).click()
            guest.get_by_role('button', name='Draw from stock', exact=False).click()
            expect(guest.get_by_test_id('drawn-card')).to_be_visible()
            guest.get_by_role('button', name='Your card 3: Hidden', exact=True).click()
            expect(host.get_by_role('button', name='Draw from stock', exact=False)).to_be_enabled()
            guest.reload()
            expect(guest.get_by_test_id('my-hand').get_by_role('button')).to_have_count(6)
            expect(guest.get_by_text('Live', exact=True)).to_be_visible()
            for slot in range(4, 7):
                host.get_by_role('button', name='Draw from stock', exact=False).click()
                host.get_by_role('button', name='Discard drawn card', exact=True).click()
                guest.get_by_role('button', name='Draw from stock', exact=False).click()
                guest.get_by_role('button', name=f'Your card {slot}: Hidden', exact=True).click()
            expect(host.get_by_role('heading', name='Round scores', exact=True)).to_be_visible()
            expect(guest.get_by_role('heading', name='Round scores', exact=True)).to_be_visible()
            for page in [host, guest]:
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert not errors, errors
            guest.screenshot(path='/tmp/just-cards-live-round.png', full_page=True)
            print('Two-phone live Golf round, private cards, pickup/discard, scoring, and reload verified.', flush=True)
        finally:
            if code and token:
                headers = {'authorization': 'Bearer ' + token}
                r = host_ctx.request.get(base + '/api/rooms/' + code, headers=headers).json()
                ended = host_ctx.request.post(base + '/api/rooms/' + code, headers=headers, data={'type': 'end_game', 'revision': r['revision'], 'requestId': str(uuid.uuid4())})
                assert ended.ok
                assert ended.json()['closed']
                print('Test room ended; its capacity slot was released.', flush=True)
            if copy_id:
                r = admin.request.get(base + '/api/rulesets/' + copy_id).json()
                archived = admin.request.patch(base + '/api/rulesets/' + copy_id, data={'name': r['name'], 'archived': True, 'expectedUpdatedAt': r['updatedAt']})
                assert archived.ok
                assert admin.request.delete(base + '/api/rulesets/' + copy_id, data={'expectedUpdatedAt': archived.json()['updatedAt']}).ok
                print('Temporary test ruleset deleted.', flush=True)
            host_ctx.close()
            guest_ctx.close()
            admin.close()
            browser.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--browser', required=True)
    args = parser.parse_args()
    run(args.base_url.rstrip('/'), args.browser)
