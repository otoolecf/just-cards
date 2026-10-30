import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

if (!process.env.PLAYWRIGHT_BASE_URL) process.env.E2E_OWNER_ACCESS_KEY ??= randomUUID();

export default defineConfig({
	testDir: 'tests/e2e',
	workers: 1,
	timeout: 120_000,
	expect: {
		// Vite uses HTTP fallback, whose idle polling interval reaches 30 seconds.
		timeout: 35000
	},
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5186',
		trace: 'on-first-retry'
	},
	webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
		command: 'node scripts/e2e-server.mjs',
		url: 'http://127.0.0.1:5186',
		reuseExistingServer: false,
		timeout: 120_000
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	]
});
