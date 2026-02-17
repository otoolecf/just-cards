const CACHE_NAME = 'just-cards-v1';
const PRECACHE_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/robots.txt'];

self.addEventListener('install', (event) => {
	self.skipWaiting();
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined)
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== CACHE_NAME)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET' || request.url.startsWith('http') === false) {
		return;
	}

	event.respondWith(
		fetch(request)
			.then((response) => {
				if (response && response.status === 200) {
					const copy = response.clone();
					caches
						.open(CACHE_NAME)
						.then((cache) => cache.put(request, copy))
						.catch(() => undefined);
				}
				return response;
			})
			.catch(async () => {
				const cached = await caches.match(request);
				if (cached) {
					return cached;
				}
				if (request.mode === 'navigate') {
					return caches.match('/') || Response.error();
				}
				return Response.error();
			})
	); 
});
