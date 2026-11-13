import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const core = path.resolve(process.env.DAS_CORE ?? '.research/dnd5e-combat');
const runner = path.join(core, 'node_modules/vitest/vitest.mjs');
if (!fs.existsSync(runner)) throw new Error('Install pinned upstream dev dependencies first: npm ci --ignore-scripts in .research/dnd5e-combat');
// Avoid saturating workers on a shared workstation. The upstream load test
// imports the complete engine; its 10s hook limit can expire under CPU contention.
const result = spawnSync(process.execPath, [runner, 'run', '--maxWorkers=4', '--hookTimeout=30000'], { cwd: core, stdio: 'inherit' });
process.exitCode = result.status ?? 1;
