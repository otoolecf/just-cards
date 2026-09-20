import { appendFileSync, copyFileSync, writeFileSync } from 'node:fs';

// The adapter owns _worker.js. Preserve its output, then wrap it for socket upgrades.
copyFileSync('.svelte-kit/cloudflare/_worker.js', '.svelte-kit/cloudflare/_svelte-app.js');
writeFileSync('.svelte-kit/cloudflare/_worker.js', `
import app from './_svelte-app.js';
import { socketResponse } from '../../src/lib/server/worker-sockets.ts';
export { CardRoom } from '../../src/lib/server/card-room.ts';
export { RoomAdmission } from '../../src/lib/server/room-admission-object.ts';
export default {
  fetch(request, env, ctx) { return socketResponse(request, env) ?? app.fetch(request, env, ctx); }
};
`);
for (const name of ['_worker', '_svelte-app']) {
  writeFileSync(`.svelte-kit/cloudflare/${name}.d.ts`, 'export { CardRoom } from "../../src/lib/server/card-room";\nexport { RoomAdmission } from "../../src/lib/server/room-admission-object";\ndeclare const worker: ExportedHandler<Env>;\nexport default worker;\n');
}
appendFileSync('.svelte-kit/cloudflare/.assetsignore', '\n_svelte-app.js\n*.d.ts\n');
