import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const references = JSON.parse(readFileSync(resolve(root, 'tools/references.json'), 'utf8'));
function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', cwd: root });
  if (result.status !== 0) throw new Error(result.stderr || 'git failed');
  return result.stdout.trim();
}
for (const [name, ref] of Object.entries(references)) {
  const dir = resolve(root, '.research', name);
  if (!existsSync(dir)) git(['clone', '--quiet', '--depth', '1', '--branch', ref.tag, ref.url, dir]);
  const actual = git(['-C', dir, 'rev-parse', 'HEAD']);
  if (actual !== ref.commit) throw new Error(`${name}: ${actual} is not pinned ${ref.commit}; research tree left untouched`);
  console.log(`${name}: ${actual}`);
}
