/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';
const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `just-cards-offline-${version}`;
const assets = [...build, ...files.filter((f) => f !== '/sw.js')];
worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll([...assets, '/']);
			await worker.skipWaiting();
		})(),
	);
});
worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys())
				if (key.startsWith('just-cards-') && key !== CACHE)
					await caches.delete(key);
			await worker.clients.claim();
		})(),
	);
});
worker.addEventListener('fetch', (event) => {
	const { request } = event,
		url = new URL(request.url);
	if (request.method !== 'GET' || url.origin !== worker.location.origin) return;
	// The event outbox handles scores. Never cache API data or private room HTML.
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/play'))
		return;
	const isAsset = assets.includes(url.pathname);
	const isScorePage = request.mode === 'navigate' && url.pathname === '/';
	if (!isAsset && !isScorePage) return;
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (isAsset) {
				const cached = await cache.match(url.pathname);
				if (cached) return cached;
			}
			try {
				const response = await fetch(request);
				if (response.ok)
					await cache.put(isScorePage ? '/' : url.pathname, response.clone());
				if (!response.ok && isScorePage) {
					const cached = await cache.match('/');
					if (cached) return cached;
				}
				return response;
			} catch (error) {
				const cached = await cache.match(isScorePage ? '/' : url.pathname);
				if (cached) return cached;
				throw error;
			}
		})(),
	);
});
