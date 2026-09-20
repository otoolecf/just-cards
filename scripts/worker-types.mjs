import {
	existsSync,
	mkdirSync,
	writeFileSync,
	readFileSync,
	appendFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';

// Keep generated runtime JS out of Svelte's checkJs traversal, including a clean checkout.
mkdirSync('.svelte-kit/cloudflare', { recursive: true });
for (const name of ['_worker', '_svelte-app'])
	writeFileSync(
		`.svelte-kit/cloudflare/${name}.d.ts`,
		'export { CardRoom } from "../../src/lib/server/card-room";\nexport { RoomAdmission } from "../../src/lib/server/room-admission-object";\ndeclare const worker: ExportedHandler<Env>;\nexport default worker;\n',
	);
if (!existsSync('.svelte-kit/cloudflare/_worker.js'))
	writeFileSync(
		'.svelte-kit/cloudflare/_worker.js',
		'export { CardRoom } from "../../src/lib/server/card-room.ts";\nexport { RoomAdmission } from "../../src/lib/server/room-admission-object.ts";\n',
	);
// Existing builds may predate the admission binding; type generation must still see its class.
if (
	!readFileSync('.svelte-kit/cloudflare/_worker.js', 'utf8').includes(
		'export { RoomAdmission }',
	)
) {
	appendFileSync(
		'.svelte-kit/cloudflare/_worker.js',
		'\nexport { RoomAdmission } from \"../../src/lib/server/room-admission-object.ts\";\n',
	);
}
execFileSync('node_modules/.bin/wrangler', ['types', '--include-runtime'], {
	stdio: 'inherit',
});
