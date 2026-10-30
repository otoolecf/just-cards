import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/**
 * @param {string[]} args
 * @param {{run?: (command: string, args: string[]) => {status: number | null, error?: Error}, exists?: (path: string) => boolean, report?: (message: string) => void}} dependencies
 */
export function runDeployment(args, dependencies = {}) {
 const run = dependencies.run ?? ((command, argv) => spawnSync(command, argv, { stdio: 'inherit' }));
 const exists = dependencies.exists ?? existsSync;
 const report = dependencies.report ?? console.error;
 let config;
 let dryRun = false;
 for (let index = 0; index < args.length; index++) {
  if (args[index] === '--config' && !config && args[index + 1] && !args[index + 1].startsWith('--')) {
   config = resolve(args[++index]);
  } else if (args[index] === '--dry-run' && !dryRun) {
   dryRun = true;
  } else {
   report('Usage: npm run cf:deploy -- --config <private-config> [--dry-run]');
   return 1;
  }
 }
 if (!config || config === resolve('wrangler.jsonc') || !exists(config)) {
  report('Choose an existing private deployment config with --config. The source wrangler.jsonc is a template; follow docs/deployment.md.');
  return 1;
 }
 const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
 const build = process.env.npm_execpath
  ? { command: process.execPath, args: [process.env.npm_execpath, 'run', 'build'] }
  : { command: 'npm', args: ['run', 'build'] };
 const plan = [
  build,
  { command: process.execPath, args: [wrangler, 'deploy', '--dry-run', '--config', config] },
  ...(!dryRun ? [
   { command: process.execPath, args: [wrangler, 'd1', 'migrations', 'apply', 'RULESETS_DB', '--remote', '--config', config] },
   { command: process.execPath, args: [wrangler, 'deploy', '--config', config] }
  ] : [])
 ];
 for (const step of plan) {
  const result = run(step.command, step.args);
  if (result.error || result.status !== 0) {
   report('Deployment stopped after a failed command. No later steps were run.');
   return result.status || 1;
  }
 }
 return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
 process.exitCode = runDeployment(process.argv.slice(2));
}
