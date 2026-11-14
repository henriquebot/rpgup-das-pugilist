import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { importedUnarmed, originalStrikeReady, nativeGrappleShoveReady, inspectUnarmed } from '../scripts/unarmed.mjs';

const flags = { plutonium: { page: 'items.html', source: 'Pugilist2024', hash: 'unarmed%20strike%20(pugilist)_pugilist2024' } };
const activity = (id, type) => ({ id, type: 'attack', activation: { type },
  attack: { type: { classification: 'unarmed', value: 'melee' } },
  damage: { includeBase: true }, consumption: { targets: [] } });
const save = (id, kind) => ({ id, type: 'save', activation: { type: 'special' },
  save: { ability: [kind], dc: { formula: 'max(@abilities.str.dc)' } },
  consumption: { targets: [] } });
function fixture() {
  const actor = { type: 'character', uuid: 'Actor.Kyros', items: [] };
  const originals = {
    id: 'qIsIckd9UXvIsozv', type: 'weapon', name: 'Unarmed Strike (Pugilist)',
    flags: structuredClone(flags), system: { identifier: 'unarmed-strike-pugilist',
      damage: { base: { custom: { enabled: true, formula: '@scale.pugilist.fisticuffs + @mod' } } },
      activities: {} }
  };
  originals.system.activities.dnd5eactivity000 = activity('dnd5eactivity000', 'action');
  originals.system.activities.dnd5eactivity001 = activity('dnd5eactivity001', 'bonus');
  for (let i = 2; i <= 7; i++) originals.system.activities[`dnd5eactivity00${i}`] = save(`dnd5eactivity00${i}`, i % 2 ? 'dex' : 'str');
  const native = { id: 'dHplSlFqePTjQcuu', type: 'weapon', flags: { 'dnd5e-combat': { basicAction: 'unarmed' } },
    system: { identifier: 'unarmed-strike', activities: { dnd5eCombatGrShv: {
      id: 'dnd5eCombatGrShv', type: 'save', activation: { type: 'action' },
      save: { ability: ['str', 'dex'], dc: { calculation: 'str' } },
      consumption: { targets: [] },
      effects: ['dnd5eCombatGrapl', 'dnd5eCombatProne', 'dnd5eCombatPush0'].map(_id => ({ _id }))
    } } },
    effects: [{ id: 'dnd5eCombatPush0', flags: { 'dnd5e-combat': { push: { distance: 5, units: 'ft' } } } }]
  };
  actor.items = [originals, native];
  return { actor, originals, native };
}
test('the exact 5etools imported weapon is recognized without matching a displayed name', () => {
  const { originals } = fixture();
  assert.equal(importedUnarmed(originals), true);
  originals.name = 'Golpe Desarmado (Pugilista)';
  assert.equal(importedUnarmed(originals), true);
  originals.flags.plutonium.hash = 'other';
  assert.equal(importedUnarmed(originals), false);
});
test('original action and bonus-action attacks both retain Fisticuffs class scale', () => {
  const { originals } = fixture();
  assert.equal(originalStrikeReady(originals), true);
  assert.equal(originals.system.activities.dnd5eactivity000.activation.type, 'action');
  assert.equal(originals.system.activities.dnd5eactivity001.activation.type, 'bonus');
  assert.equal(originals.system.damage.base.custom.formula, '@scale.pugilist.fisticuffs + @mod');
  assert.equal(Object.keys(originals.system.activities).length, 8);
});
test('an invalid imported attack or changed damage formula refuses compatibility', () => {
  const { originals } = fixture();
  originals.system.activities.dnd5eactivity001.activation.type = 'reaction';
  assert.equal(originalStrikeReady(originals), false);
  originals.system.activities.dnd5eactivity001.activation.type = 'bonus';
  originals.system.damage.base.custom.formula = '3d20';
  assert.equal(originalStrikeReady(originals), false);
});
test('DAS native Grapple/Shove provides one STR/DEX save and all three exclusive outcomes', () => {
  const { actor } = fixture();
  assert.equal(nativeGrappleShoveReady(actor), true);
  assert.equal(inspectUnarmed(actor).nativeGrappleShoveActivityId, 'dnd5eCombatGrShv');
});
test('missing or modified native Push outcome is reported rather than silently accepted', () => {
  const { actor, native } = fixture();
  native.effects[0].flags['dnd5e-combat'].push.distance = 10;
  assert.equal(nativeGrappleShoveReady(actor), false);
  assert.equal(inspectUnarmed(actor).requiresReview, true);
});
test('incorrect native saving throw DC, missing effect or resource cost fails closed', () => {
  for (const change of [
    save => { save.save.dc.calculation = 'dex'; },
    save => { save.effects.pop(); },
    save => { save.consumption.targets.push({ type: 'itemUses', value: '1' }); }
  ]) {
    const { actor, native } = fixture();
    change(native.system.activities.dnd5eCombatGrShv);
    assert.equal(nativeGrappleShoveReady(actor), false);
  }
});
test('two DAS-generated unarmed weapons are ambiguous', () => {
  const { actor, native } = fixture();
  actor.items.push({ ...native });
  assert.equal(nativeGrappleShoveReady(actor), false);
  assert.equal(inspectUnarmed(actor).nativeDASCount, 2);
});
test('read-only diagnostics report exactly six legacy saves and do not touch item data', () => {
  const { actor } = fixture();
  const original = structuredClone(actor.items);
  const report = inspectUnarmed(actor);
  assert.equal(report.source, '5etools/Plutonium');
  assert.equal(report.originalAttackReady, true);
  assert.equal(report.attackId, 'dnd5eactivity000');
  assert.equal(report.bonusAttackId, 'dnd5eactivity001');
  assert.deepEqual(report.blockedImportedSaves,
    ['dnd5eactivity002','dnd5eactivity003','dnd5eactivity004','dnd5eactivity005','dnd5eactivity006','dnd5eactivity007']);
  assert.equal(report.requiresReview, false);
  assert.deepEqual(actor.items, original);
});
test('a duplicate RPGUp item never changes the source or inserts any new activity', () => {
  const { actor, originals } = fixture();
  actor.items.push({ type: 'weapon', system: { identifier: 'unarmed-strike', activities: {} },
    flags: { [MODULE_ID]: { key: 'unarmed' } } });
  assert.equal(inspectUnarmed(actor).source, '5etools/Plutonium');
  assert.equal(inspectUnarmed(actor).originalId, originals.id);
  assert.equal(inspectUnarmed(actor).addonCount, 1);
  assert.equal(Object.keys(originals.system.activities).length, 8);
});
test('an imported duplicate is reported without deciding which copy to migrate', () => {
  const { actor, originals } = fixture();
  actor.items.push(structuredClone(originals));
  const report = inspectUnarmed(actor);
  assert.equal(report.originalCount, 2);
  assert.equal(report.requiresReview, true);
});
