import { cpSync, readFileSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve('.');
const sandbox = mkdtempSync(join(tmpdir(), 'just-cards-e2e-'));
for (const name of ['src', 'static', 'scripts', 'migrations', 'package.json', 'svelte.config.js', 'vite.config.ts', 'tsconfig.json', 'wrangler.jsonc']) {
 cpSync(join(root, name), join(sandbox, name), { recursive: true });
}
// Exercise the local adapters, without a Cloudflare proxy that cannot host our DOs.
const svelteConfig = join(sandbox, 'svelte.config.js');
writeFileSync(svelteConfig, readFileSync(svelteConfig, 'utf8').replace('adapter: adapter()', 'adapter: { ...adapter(), emulate: undefined }'));
symlinkSync(join(root, 'node_modules'), join(sandbox, 'node_modules'), 'dir');
const child = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'dev', '--host', '127.0.0.1', '--port', '5186', '--strictPort'], {
 cwd: sandbox, stdio: 'inherit', env: {...process.env, OWNER_ACCESS_KEY: process.env.E2E_OWNER_ACCESS_KEY, ROOM_MAX_ACTIVE: '1000', ROOM_CREATIONS_PER_HOUR: '1000', LLM_LIVE: '0', EMBED_LIVE: '0', OPENAI_API_KEY: '', RULESET_SQLITE_PATH: join(sandbox, '.local/rulesets.sqlite')}
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { rmSync(sandbox, { recursive: true, force: true }); process.exit(code ?? 0); });
