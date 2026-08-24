import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const missing = [];

for (const match of index.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)) {
  const relative = match[1];
  if (!existsSync(join(root, relative))) missing.push(relative);
}

if (missing.length) {
  throw new Error(`index.html references missing files:\n${[...new Set(missing)].join('\n')}`);
}

const scripts = readdirSync(root)
  .filter(name => name.endsWith('.js'))
  .sort();

for (const script of scripts) {
  execFileSync(process.execPath, ['--check', join(root, script)], { stdio: 'inherit' });
}

console.log(`Static validation passed: ${scripts.length} JavaScript files and all local index.html assets.`);
