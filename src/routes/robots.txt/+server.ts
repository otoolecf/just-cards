import { publicOrigin } from '$lib/site/metadata';

export const GET = () => new Response(
 `User-agent: *\nDisallow:\n\nSitemap: ${publicOrigin}/sitemap.xml\n`,
 { headers: { 'content-type': 'text/plain; charset=utf-8' } }
);
