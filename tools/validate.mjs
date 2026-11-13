import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { ClassicLevel } from 'classic-level';
import { unzipSync, strFromU8 } from 'fflate';
import { extractPack } from '@foundryvtt/foundryvtt-cli';
import { createDocuments } from '../src/documents.mjs';

const root = path.resolve(import.meta.dirname, '..');
const zip = unzipSync(new Uint8Array(await fs.readFile(path.join(root, 'dist/rpgup-das-pugilist.zip'))));
const manifest = JSON.parse(strFromU8(zip['module.json']));
assert.equal(manifest.id, 'rpgup-das-pugilist');
for (const file of [...manifest.esmodules, ...manifest.languages.map(l => l.path), 'README.md', 'LICENSE', 'src/ids.mjs']) assert.ok(zip[file], file);
for (const name of Object.keys(zip)) assert.ok(!name.startsWith('/') && !name.includes('..') && !name.includes('.research') && !name.includes('node_modules'), name);
const expected = createDocuments();
const db = new ClassicLevel(path.join(root, 'dist/rpgup-das-pugilist/packs/pugilist'), { valueEncoding: 'json' });
try {
  await db.open();
  let count = 0;
  for await (const [key, value] of db.iterator()) {
    if (!key.startsWith('!items!')) continue;
    assert.ok(expected.some(d => d._id === value._id), key);
    assert.match(value._id, /^[A-Za-z0-9]{16}$/);
    const source = expected.find(d => d._id === value._id);
    assert.deepEqual(value.effects, source.effects.map(e => e._id));
    for (const effect of source.effects) {
      assert.deepEqual(await db.get(`!items.effects!${source._id}.${effect._id}`), effect);
    }
    count++;
  }
  assert.equal(count, expected.length);
  console.log(`Validated ZIP, manifest and ${count} real LevelDB Item records.`);
} finally { await db.close(); }

// Official compile/extract round trip checks the complete document hierarchy,
// not just the number of records or a sample ID.
const extracted = path.join(root, 'dist/roundtrip');
await extractPack(path.join(root, 'dist/rpgup-das-pugilist/packs/pugilist'), extracted);
const stripKeys = (key, value) => key === '_key' ? undefined : value;
for (const name of await fs.readdir(extracted)) {
  const actual = JSON.parse(await fs.readFile(path.join(extracted, name), 'utf8'), stripKeys);
  assert.deepEqual(actual, expected.find(d => d._id === actual._id), actual.name);
}
console.log('Official CLI round trip preserved every Item, activity, advancement and embedded effect.');
