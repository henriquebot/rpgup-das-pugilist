import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { compilePack } from '@foundryvtt/foundryvtt-cli';
import { zipSync } from 'fflate';
import { createDocuments } from '../src/documents.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.resolve(root, 'dist');
const out = path.join(dist, 'rpgup-das-pugilist');
// Deletion is confined to this project's generated output, never a Foundry Data directory.
if (path.dirname(dist) !== path.resolve(root) || path.basename(dist) !== 'dist') throw new Error('Unsafe output path');
// OneDrive can mark generated directories read-only on Windows. Clear only
// this verified output tree's read-only attribute before replacing it.
async function writableOutput(dir) {
  if (!(await fs.stat(dir).catch(() => null))) return;
  const real = await fs.realpath(dir);
  if (real !== dist && !real.startsWith(dist + path.sep)) throw new Error('Output escapes dist');
  await fs.chmod(dir, 0o777);
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) await writableOutput(target);
    else await fs.chmod(target, 0o666);
  }
}
if (process.platform === 'win32') await writableOutput(dist);
await fs.rm(dist, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
await fs.mkdir(out, { recursive: true });
for (const name of ['module.json', 'scripts', 'lang', 'README.md', 'LICENSE', 'docs']) {
  await fs.cp(path.join(root, name), path.join(out, name), { recursive: true });
}
await fs.mkdir(path.join(out, 'src'), { recursive: true });
await fs.copyFile(path.join(root, 'src/ids.mjs'), path.join(out, 'src/ids.mjs'));
const sourceDir = path.join(dist, 'pack-source');
await fs.mkdir(sourceDir);
const docs = createDocuments();
for (const doc of docs) {
  const packed = { ...doc, _key: `!items!${doc._id}`,
    effects: doc.effects.map(effect => ({ ...effect, _key: `!items.effects!${doc._id}.${effect._id}` })) };
  await fs.writeFile(path.join(sourceDir, `${doc._id}.json`), JSON.stringify(packed, null, 2));
}
await compilePack(sourceDir, path.join(out, 'packs/pugilist'));
await fs.copyFile(path.join(root, 'module.json'), path.join(dist, 'module.json'));

async function entries(dir, prefix = '') {
  const result = {};
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await entries(path.join(dir, entry.name), `${key}/`));
    else result[key] = [new Uint8Array(await fs.readFile(path.join(dir, entry.name))), { mtime: new Date('2026-01-01T00:00:00Z') }];
  }
  return result;
}
const archive = zipSync(await entries(out), { level: 9 });
const archiveName = 'rpgup-das-pugilist.zip';
await fs.writeFile(path.join(dist, archiveName), archive);
await fs.writeFile(path.join(dist, 'SHA256SUMS'), `${createHash('sha256').update(archive).digest('hex')}  ${archiveName}\n`);
console.log(`Built ${docs.length} Item documents and ${archive.length} byte archive in dist/`);
