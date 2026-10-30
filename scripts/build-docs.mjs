import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const appUrl = process.env.PUBLIC_APP_URL;
let valid = false;
try {
  const url = new URL(appUrl);
  valid = ['https:', 'http:'].includes(url.protocol)
    && !url.username && !url.password && !/[\s<>()[\]\\]/.test(appUrl);
} catch {
  // Report configuration errors without echoing potentially sensitive values.
}
if (!valid) {
  throw new Error('PUBLIC_APP_URL must be an HTTP(S) URL without credentials or Markdown delimiters.');
}

const output = resolve(process.argv[2] ?? join(root, '.output/docs'));
async function render(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(relative, entry.name);
    if (entry.isDirectory()) {
      await render(join(directory, entry.name), path);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const source = await readFile(join(directory, entry.name), 'utf8');
      const target = join(output, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, source.replaceAll('{{PUBLIC_APP_URL}}', appUrl));
    }
  }
}
await render(join(root, 'docs'));
console.log('Documentation built successfully.');
