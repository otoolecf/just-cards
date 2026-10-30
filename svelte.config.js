import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
 csp: {mode: 'auto', directives: {'script-src': ['self'], 'object-src': ['none'], 'base-uri': ['self'], 'frame-ancestors': ['self']}}
	}
};

export default config;
