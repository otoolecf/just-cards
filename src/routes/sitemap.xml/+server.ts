import type { RequestHandler } from './$types';
import { getDefaultRulesetService } from '$lib/rulesets/default-service';
import { publicOrigin } from '$lib/site/metadata';

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => ({
 '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
}[char]!));

export const GET: RequestHandler = async ({ platform }) => {
 const rulesets = await (await getDefaultRulesetService(platform)).list();
 const paths = ['/', '/play', ...rulesets.map((ruleset) => `/play/${encodeURIComponent(ruleset.id)}`)];
 return new Response(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeXml(publicOrigin + path)}</loc></url>`).join('')}</urlset>`,
  { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } }
 );
};
