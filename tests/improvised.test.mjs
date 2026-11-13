import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { applyImprovisedSap, applyImprovisedTraining } from '../scripts/improvised.mjs';
import { documents } from '../src/documents.mjs';
import { IDS } from '../src/ids.mjs';

const coreRoot = resolve(process.env.DAS_ROOT ?? '.research/dnd5e-combat');
const systemRoot = resolve(process.env.DND5E_ROOT ?? '.research/dnd5e');
const { masteryEffect, markExpires } = await import(pathToFileURL(resolve(coreRoot, 'module/scripts/core/mastery.mjs')).href);
const { masteryOf } = await import(pathToFileURL(resolve(coreRoot, 'module/scripts/adapter/mastery.mjs')).href);
const doc = key => structuredClone(documents.find(item => item._id === IDS[key]));
function fixture(level=1) {
  const cls = doc('pugilist');
  cls.system.levels = level;
  const actor = { items: [cls, doc('fisticuffs')] };
  const item = { name: 'Cadeira', type: 'weapon', system: { identifier: 'cadeira', type: { value: 'improv' } } };
  return { subject: { type: 'attack', actor, item, attack: { type: { value: 'melee', classification: 'weapon' } } } };
}

test('Sap is occurrence-scoped for an eligible improvised Pugilist attack', () => {
  for (const level of [1,2,3,4,5,6]) {
    const config = fixture(level);
    const before = structuredClone(config.subject.item);
    applyImprovisedSap(config);
    assert.equal(config.mastery, 'sap');
    assert.deepEqual(config.subject.item, before);
    applyImprovisedSap(config);
    assert.equal(config.mastery, 'sap');
    const next = { subject: config.subject };
    assert.equal(next.mastery, undefined);
  }
});

test('improvised class training adds native occurrence proficiency once and preserves weapon data', () => {
  const config = fixture();
  config.subject.actor.system = { attributes: { prof: 2 } };
  config.subject.item.system.prof = { hasProficiency: false };
  config.rolls = [{ parts: ['2'], data: { extra: 1 } }];
  const before = structuredClone(config.subject.item);
  applyImprovisedTraining(config); applyImprovisedTraining(config);
  assert.deepEqual(config.rolls[0].parts, ['2', '@rpgupPugilistProf']);
  assert.equal(config.rolls[0].data.rpgupPugilistProf, 2);
  assert.deepEqual(config.subject.item, before);
  config.subject.item.system.prof.hasProficiency = true;
  const trained = { ...config, rolls: [{ parts: [], data: {} }] };
  applyImprovisedTraining(trained);
  assert.deepEqual(trained.rolls[0].parts, []);
  config.subject.actor.items = [];
  const foreign = { ...config, rolls: [{ parts: [], data: {} }] };
  applyImprovisedTraining(foreign);
  assert.deepEqual(foreign.rolls[0].parts, []);
});

test('Sap cannot affect another class, an ineligible weapon, armor, or spell', () => {
  const cases = [
    config => { config.subject.actor.items = []; },
    config => { config.subject.actor.items[0].system.levels = 0; },
    config => { config.subject.actor.items[0].system.levels = 7; },
    config => { config.subject.item.system.type.value = 'simpleM'; },
    config => { config.subject.item.system.type.value = 'natural'; },
    config => { config.subject.item.type = 'spell'; },
    config => { config.subject.type = 'save'; },
    config => { config.subject.attack.type.classification = 'unarmed'; },
    config => { config.subject.attack.type.classification = 'spell'; },
    config => { config.subject.actor.items.push({ type: 'equipment', system: { equipped: true, type: { value: 'shield' } } }); },
    config => { config.subject.actor.items.push({ type: 'equipment', system: { equipped: true, type: { value: 'medium' } } }); },
    config => { config.subject.actor.items.push({ type: 'equipment', system: { equipped: true, type: { value: 'heavy' } } }); },
    config => { config.subject.actor.items.push({ type: 'weapon', system: { equipped: true, type: { value: 'martialM' } } }); }
  ];
  for (const change of cases) {
    const config = fixture();
    change(config);
    applyImprovisedSap(config);
    assert.equal(config.mastery, undefined);
  }
  assert.doesNotThrow(() => applyImprovisedSap(null));
  assert.doesNotThrow(() => applyImprovisedSap({}));
});

test('Sap preserves an explicit mastery choice and recognizes translated item names', () => {
  for (const mastery of [false, '', 'push', 'sap']) {
    const config = { ...fixture(), mastery };
    config.subject.item.name = 'Chaise / Cadeira / Improvisada';
    applyImprovisedSap(config);
    assert.equal(config.mastery, mastery);
  }
  const thrown = fixture();
  thrown.subject.attack.type.value = 'ranged';
  applyImprovisedSap(thrown);
  assert.equal(thrown.mastery, 'sap');
});

test('native dnd5e 6.0.6 builder carries public config.mastery into the attack options', async () => {
  const source = await readFile(resolve(systemRoot, 'module/documents/activity/attack.mjs'), 'utf8');
  // Execute the exact pinned source method with service doubles, not an imitation
  // of its algorithm. This remains a Node contract check, never Foundry E2E.
  const method = source.match(/  _buildAttackConfig\(process, config, formData, index\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(method);
  const CONFIG = { Dice: { D20Roll: { mergeOptions: (base, options) => ({ ...base, ...options }) } } };
  const build = runInNewContext(`({${method}})._buildAttackConfig`, { CONFIG });
  const process = fixture();
  process.subject.actor.system = { attributes: { prof: 2 } };
  process.subject.item.system.prof = { hasProficiency: false };
  process.rolls = [{ parts: [], data: {} }];
  applyImprovisedSap(process);
  applyImprovisedTraining(process);
  const config = process.rolls[0];
  build.call({ actor: null, getAttackData: () => ({ parts: ['1d20'], data: {} }) }, process, config, null, 0);
  assert.equal(config.options.mastery, 'sap');
  assert.equal(config.data.rpgupPugilistProf, 2);
  assert.equal(config.parts.filter(part => part === '@rpgupPugilistProf').length, 1);
  assert.match(source, /const \{ ability, ammunition, mastery, attackMode: mode \} = rolls\[0\]\.options/);
  assert.match(source, /foundry\.utils\.setProperty\(messageConfig\.data, `system\.\$\{key\}`, value\)/);
});

test('DAS resolves the native Sap outcome on hits, skips misses, and expires it at the next own turn', () => {
  const mastery = masteryOf({ system: { mastery: 'sap' } });
  const outcome = { hit: true, damaged: true, melee: true, size: 'med', down: false };
  assert.equal(masteryEffect(mastery, outcome), 'sap');
  assert.equal(masteryEffect(mastery, { ...outcome, hit: false }), null);
  assert.equal(masteryEffect(mastery, { ...outcome, down: true }), null);
  assert.equal(markExpires(mastery, { moment: 'turnStart', sourceTurn: false }), false);
  assert.equal(markExpires(mastery, { moment: 'turnEnd', sourceTurn: true }), false);
  assert.equal(markExpires(mastery, { moment: 'turnStart', sourceTurn: true }), true);
});
