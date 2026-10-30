import { chromium, devices } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();

const rulesetId = process.argv[2];
if (!rulesetId) throw new Error('rulesetId required');
const base = `http://127.0.0.1:4173/play/${rulesetId}`;

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: 'test-results/audit-mobile-1-initial.png', fullPage: true });

await page.evaluate(() => window.scrollTo(0, 360));
await page.waitForTimeout(400);
await page.screenshot({ path: 'test-results/audit-mobile-2-scrolled.png', fullPage: false });

const handCards = page.locator('.hand-scroll .play-card');
if ((await handCards.count()) > 2) {
  await handCards.nth(2).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/audit-mobile-3-selected-card.png', fullPage: false });
}

const quickTargets = page.locator('.hand-target-button');
if ((await quickTargets.count()) > 0) {
  await quickTargets.first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/audit-mobile-4-after-move.png', fullPage: false });
}

await page.locator('.surface-tab').filter({ hasText: 'Guide' }).first().click();
await page.waitForTimeout(350);
await page.screenshot({ path: 'test-results/audit-mobile-5-guide-tab.png', fullPage: false });

await browser.close();
