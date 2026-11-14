import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { importedPugilistClass, importedFisticuffs, pugilistLevel, feature,
  fisticuffsEligible, applyFisticuffsDamage, activityAllowed, actorDiagnostics } from '../scripts/policy.mjs';

const cls = (levels = 4) => ({ type: 'class', system: { identifier: 'pugilist', levels },
  flags: { plutonium: { page: 'classes.html', source: 'Pugilist2024', hash: 'pugilist_pugilist2024' } } });
const fists = () => ({ type: 'feat', system: { identifier: 'fisticuffs', activities: {
  dnd5eactivity000: { name: 'Pugilist Weapon', type: 'enchant' },
  dnd5eactivity001: { name: 'Improvised Pugilist Weapon', type: 'enchant' }
} }, flags: { plutonium: { page: 'classFeature', source: 'Pugilist2024',
  hash: 'fisticuffs_pugilist_pugilist2024_1_pugilist2024' } } });
const unarmed = () => ({ type: 'weapon', system: { identifier: 'unarmed-strike-pugilist', equipped: true,
  type: { value: 'natural' }, damage: { base: { custom: { formula: '@scale.pugilist.fisticuffs + @mod' } } } },
  flags: { plutonium: { page: 'items.html', source: 'Pugilist2024',
    hash: 'unarmed%20strike%20(pugilist)_pugilist2024' } } });
function kyros(level = 4) {
  const actor = { items: [cls(level), fists(), unarmed()], system: { abilities: { str: { mod: 4 } } } };
  for (const item of actor.items) item.actor = actor;
  return actor;
}
const attack = (actor, item = actor.items[2]) => ({ type: 'attack', item, actor,
  attack: { type: { classification: item.system.type?.value === 'natural' ? 'unarmed' : 'weapon' } } });
const damage = (subject, formula) => ({ subject, rolls: [{ base: true, parts: [formula], data: { mod: 4 } }] });

test('Kyros original import is recognized by stable Plutonium metadata, never by translated names', () => {
  const actor = kyros();
  assert.equal(importedPugilistClass(actor.items[0]), true);
  assert.equal(importedFisticuffs(actor.items[1]), true);
  assert.equal(pugilistLevel(actor), 4);
  assert.equal(feature(actor, 'fisticuffs'), actor.items[1]);
  assert.equal(fisticuffsEligible(actor), true);
  assert.equal(actorDiagnostics(actor).fisticuffs.source, '5etools/Plutonium');
  assert.deepEqual(Object.values(actor.items[1].system.activities).map(a => a.type), ['enchant', 'enchant']);
  assert.equal(feature(actor, 'ironChin'), null);
});
test('original Fisticuffs takes precedence over optional RPGUp fallback without editing either', () => {
  const actor = kyros();
  const snapshot = JSON.stringify({system:actor.items[1].system,flags:actor.items[1].flags});
  actor.items.push({ type: 'feat', system: { identifier: 'rpgup-pugilist-fisticuffs' },
    flags: { [MODULE_ID]: { key: 'fisticuffs', schemaVersion: 1 } } });
  assert.equal(feature(actor, 'fisticuffs'), actor.items[1]);
  assert.equal(actorDiagnostics(actor).fisticuffs.addonCount, 1);
  assert.equal(activityAllowed({ type: 'enchant', actor, item: actor.items.at(-1) }), false);
  assert.equal(JSON.stringify({system:actor.items[1].system,flags:actor.items[1].flags}), snapshot);
});
test('duplicate 5etools classes or abilities fail closed', () => {
  const actor = kyros();
  actor.items.push(cls(4));
  assert.equal(pugilistLevel(actor), 0);
  actor.items.pop();
  actor.items.push(fists());
  assert.equal(feature(actor, 'fisticuffs'), null);
});
test('different class/homebrew source does not activate any Fisticuffs', () => {
  const actor = kyros();
  actor.items[0].flags.plutonium.source = 'OtherBook';
  assert.equal(pugilistLevel(actor), 0);
  assert.equal(fisticuffsEligible(actor), false);
  actor.items[0].flags.plutonium.source = 'Pugilist2024';
  actor.items[1].flags.plutonium.hash = 'renamed-copy';
  assert.equal(feature(actor, 'fisticuffs'), null);
  assert.equal(fisticuffsEligible(actor), false);
});
test('unarmed 5etools scaled formula is left alone while eligible and suppressed with a shield', () => {
  const actor = kyros();
  const src = actor.items[2].system.damage.base.custom.formula;
  let config = damage(attack(actor), src);
  applyFisticuffsDamage(config);
  assert.equal(config.rolls[0].parts[0], src);
  actor.items.push({ type: 'equipment', system: { type: { value: 'shield' }, equipped: true } });
  config = damage(attack(actor), src);
  applyFisticuffsDamage(config);
  assert.equal(config.rolls[0].parts[0], '1 + @mod');
  assert.equal(actor.items[2].system.damage.base.custom.formula, src);
});
test('original simple weapons gain 1d8 at L4 and 1d10 at L5, once, without altering document', () => {
  for (const [level, die] of [[4, 8], [5, 10]]) {
    const actor = kyros(level);
    const weapon = { type: 'weapon', system: { identifier: 'club', equipped: false, type: { value: 'simpleM' } } };
    const original = JSON.stringify(weapon);
    const config = damage(attack(actor, weapon), '1d4 + @mod');
    applyFisticuffsDamage(config);
    applyFisticuffsDamage(config);
    assert.equal(config.rolls[0].parts[0], `1d${die} + @mod`);
    assert.equal(JSON.stringify(weapon), original);
  }
});
test('legacy Fisticuffs enchant activities are gated by equipment conditions', () => {
  const actor = kyros();
  const activity = { type: 'enchant', actor, item: actor.items[1] };
  assert.equal(activityAllowed(activity), true);
  actor.items.push({ type: 'equipment', system: { type: { value: 'medium' }, equipped: true } });
  assert.equal(activityAllowed(activity), false);
  actor.items.pop();
  actor.items.push({ type: 'weapon', system: { identifier: 'longsword', type: { value: 'martialM' }, equipped: true } });
  assert.equal(activityAllowed(activity), false);
});
