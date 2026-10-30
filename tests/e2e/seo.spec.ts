import { expect, test } from '@playwright/test';

const origin = 'https://justcards.app';
for (const [path, title, phrase] of [
 ['/', 'Just Cards — Card Game Scorekeeper', 'Keep score for in-person card games'],
 ['/play', 'Just Cards — Virtual Card Tables', 'Play card games together on a virtual table']
]) {
 test(`search and sharing metadata ${path}`, async ({ page, request }) => {
  const response = await request.get(`${path}?session=private-value`);
  const html = await response.text();
  expect(html).toContain(title);
  expect(html).toContain('name="description"');
  expect(html).toContain('property="og:title"');
  expect(html).toContain('name="twitter:card"');
  await page.goto(`${path}?session=private-value`);
  await expect(page).toHaveTitle(title);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', new RegExp(phrase));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}${path}`);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${origin}${path}`);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${origin}/icon-512.png`);
  await expect(page.getByText(new RegExp(phrase)).first()).toBeVisible();
 });
}

test('indexing boundaries, sitemap and navigation', async ({ page, request }) => {
 const roomHtml = await (await request.get('/play/room/SEO123?token=private-value')).text();
 expect(roomHtml).toContain('name="robots" content="noindex"');
 expect(roomHtml).toContain(`rel="canonical" href="${origin}/play"`);
 await page.goto('/owner');
 await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
 await page.goto('/');
 await page.getByRole('link', { name: 'Play', exact: true }).click();
 await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Just Cards — Virtual Card Tables');
 expect(await page.locator('link[rel="canonical"]').count()).toBe(1);
 const robots = await (await request.get('/robots.txt')).text();
 expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
 const response = await request.get('/sitemap.xml');
 expect(response.ok()).toBe(true);
 expect(response.headers()['content-type']).toContain('application/xml');
 const sitemap = await response.text();
 expect(sitemap).toContain(`<loc>${origin}/</loc>`);
 expect(sitemap).toContain(`<loc>${origin}/play</loc>`);
 expect(sitemap).toContain(`${origin}/play/`);
 expect(sitemap).not.toContain('/owner');
 expect(sitemap).not.toContain('/room/');
 const rulesetUrl = sitemap.match(/<loc>(https:\/\/justcards.app\/play\/[^<]+)<\/loc>/)![1];
 await page.goto(new URL(rulesetUrl).pathname);
 expect(await page.locator('meta[name="robots"]').count()).toBe(0);
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', rulesetUrl);
});
