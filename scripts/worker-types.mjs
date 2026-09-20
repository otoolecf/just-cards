import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Keep generated runtime JS out of Svelte's checkJs traversal, including a clean checkout.
mkdirSync('.svelte-kit/cloudflare', { recursive: true });
for (const name of ['_worker', '_svelte-app']) writeFileSync(
	`.svelte-kit/cloudflare/${name}.d.ts`,
	'export { CardRoom } from "../../src/lib/server/card-room";\ndeclare const worker: ExportedHandler<Env>;\nexport default worker;\n'
);
if (!existsSync('.svelte-kit/cloudflare/_worker.js')) writeFileSync('.svelte-kit/cloudflare/_worker.js', 'export { CardRoom } from "../../src/lib/server/card-room.ts";\n');
execFileSync('node_modules/.bin/wrangler', ['types', '--include-runtime'], {
	stdio: 'inherit'
});
