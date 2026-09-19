import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const index = readFileSync(join(root, 'index.html'), 'utf8');
const loader = readFileSync(join(root, 'app-loader.js'), 'utf8');
const missing = [];

for (const match of index.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)) {
  const relative = match[1];
  if (!existsSync(join(root, relative))) missing.push(relative);
}

const manifestSources = [...loader.matchAll(/\bsrc:\s*['"]\.\/([^'"?#]+)(?:[?#][^'"]*)?['"]/g)].map(match => match[1]);
for (const relative of manifestSources) {
  if (!existsSync(join(root, relative))) missing.push(relative);
}

const manifestIds = [...loader.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
const duplicates = values => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
const duplicateSources = duplicates(manifestSources);
const duplicateIds = duplicates(manifestIds);
if (duplicateSources.length || duplicateIds.length) {
  throw new Error(`app-loader.js contains duplicate entries:\n${[...duplicateSources, ...duplicateIds].join('\n')}`);
}

const persistenceGuardIndex = manifestSources.indexOf('src/persistence/project-persistence-guard.js');
const mobileSafeModeIndex = manifestSources.indexOf('src/persistence/mobile-safe-mode.js');
if (persistenceGuardIndex < 0 || mobileSafeModeIndex <= persistenceGuardIndex) {
  throw new Error('Mobile safe mode must load after the final project persistence guard.');
}

const temporaryAssetName = /(?:^|\/)[^/]*(?:-v\d+|-fix|-refine)(?:\.[a-z]+)$/i;
const unstableManifestSources = manifestSources.filter(source => temporaryAssetName.test(source));
const indexAssets = [...index.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)].map(match => match[1]);
const unstableIndexAssets = indexAssets.filter(source => temporaryAssetName.test(source));
if (unstableManifestSources.length || unstableIndexAssets.length) {
  throw new Error(`Active assets must use stable capability names:\n${[
    ...unstableManifestSources.map(name => `manifest/${name}`),
    ...unstableIndexAssets.map(name => `index/${name}`)
  ].join('\n')}`);
}

if (missing.length) {
  throw new Error(`index.html references missing files:\n${[...new Set(missing)].join('\n')}`);
}

const rootScripts = readdirSync(root).filter(name => name.endsWith('.js')).sort();
const unexpectedRootScripts = rootScripts.filter(name => name !== 'app-loader.js');
const loadedLegacyScripts = manifestSources.filter(source => source.startsWith('src/legacy/'));
if (unexpectedRootScripts.length || loadedLegacyScripts.length) {
  throw new Error(`JavaScript architecture boundary failed:\n${[
    ...unexpectedRootScripts.map(name => `root/${name}`),
    ...loadedLegacyScripts.map(name => `manifest/${name}`)
  ].join('\n')}`);
}

function collectJavaScript(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScript(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

const scripts = [
  ...rootScripts.map(name => join(root, name)),
  ...collectJavaScript(join(root, 'src'))
].sort();

const protectedFlows = [
  ['src/projects/projects.js', 'before-project-delete'],
  ['src/ui/app-ux.js', 'before-chapter-delete'],
  ['src/publishing/publishing-delete.js', 'before-publishing-delete'],
  ['src/source/source-flow.js', 'before-source-refresh']
];
const unguardedFlows = protectedFlows.filter(([relative, reason]) => {
  const source = readFileSync(join(root, relative), 'utf8');
  return !source.includes('prepareRecovery') || !source.includes(reason) || source.includes(`createWorkspaceRecoverySnapshot('${reason}')`);
});
if (unguardedFlows.length) {
  throw new Error(`High-risk flows must use StoryFlowProjectPersistence.prepareRecovery():\n${unguardedFlows
    .map(([relative, reason]) => `${relative}: ${reason}`)
    .join('\n')}`);
}

for (const script of scripts) {
  execFileSync(process.execPath, ['--check', script], { stdio: 'inherit' });
}

// A stylesheet has no syntax error to report: a comment that is never closed simply
// swallows everything after it until the next `*/`, and the browser loads the file without
// complaint. That is not hypothetical — deleting a rule once took its comment's closing
// marker with it and silently disabled 38 lines, including the ones that made the work
// switcher an overlay, for four commits. Nothing caught it, because every test that could
// have was reading markup rather than resolved style.
//
// Two shapes are findable from the text alone, and neither fires on this repository's
// comments today: a `/*` with nothing closing it, and a comment holding a declaration
// block — `{` … `prop:value; prop:value` … `}` — which is what a swallowed rule looks
// like from the outside. Prose that quotes a selector (`.field-label{display:block}`)
// carries one declaration and no `;`, so it stays quiet.
const stylesheets = [...index.matchAll(/href="\.\/([^"?#]+\.css)/g)].map(match => match[1]);
const DECLARATION_BLOCK = /\{[^{}]*:[^{}]*;[^{}]*:[^{}]*\}/;
const commentProblems = [];
for (const relative of stylesheets) {
  const text = readFileSync(join(root, relative), 'utf8');
  const lineOf = offset => text.slice(0, offset).split('\n').length;

  const closed = /\/\*[\s\S]*?\*\//g;
  let match;
  let consumed = 0;
  while ((match = closed.exec(text))) {
    consumed = closed.lastIndex;
    if (DECLARATION_BLOCK.test(match[0])) {
      commentProblems.push(`${relative}:${lineOf(match.index)} comment holds a declaration block — rules look commented out by accident`);
    }
  }
  const dangling = text.indexOf('/*', consumed);
  if (dangling >= 0) {
    commentProblems.push(`${relative}:${lineOf(dangling)} comment is never closed — everything after it is disabled`);
  }
}
if (commentProblems.length) {
  throw new Error(`Stylesheet comments disable rules:\n${commentProblems.join('\n')}`);
}

console.log(`Static validation passed: ${scripts.length} JavaScript files, ${manifestSources.length} ordered app modules, ${stylesheets.length} stylesheets and all local assets.`);
