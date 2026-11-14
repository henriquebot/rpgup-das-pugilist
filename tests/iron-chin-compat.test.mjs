import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { importedIronChin, feature, applyIronChin, pugilistLevel } from '../scripts/policy.mjs';
import { migrateIronChin } from '../scripts/iron-chin.mjs';

function fixture() {
  const cls = { type: 'class', system: { identifier: 'pugilist', levels: 4 },
    flags: { plutonium: { page: 'classes.html', source: 'Pugilist2024', hash: 'pugilist_pugilist2024' } } };
  const effect = { id: 'R9071y00sXW7T5EO', type: 'base', transfer: true, disabled: false,
    system: { changes: [
      { _id: 'zXpMZoWP0dHpqnv2', key: 'system.attributes.ac.calc', value: 'custom', type: 'override', phase: 'initial' },
      { _id: 'pB7hF6PajEhPI4XQ', key: 'system.attributes.ac.formula', value: '12 + @abilities.con.mod', type: 'override', phase: 'initial' }
    ] }, flags: {}, toObject() { return { system: { changes: structuredClone(this.system.changes) } }; } };
  const otherEffect = { id: 'unrelatedFx000001', type: 'base', transfer: false, system: { changes: [] }, flags: {} };
  const item = { id: 'B1hBCMdeTX45TgZZ', type: 'feat', name: 'Iron Chin', system: { identifier: 'iron-chin' },
    flags: { plutonium: { source: 'Pugilist2024', page: 'classFeature', hash: 'iron%20chin_pugilist_pugilist2024_1_pugilist2024' } },
    effects: [effect, otherEffect], calls: [],
    async updateEmbeddedDocuments(name, updates) {
      this.calls.push({ name, updates: structuredClone(updates) });
      for (const update of updates) {
        const target = this.effects.find(e => e.id === update._id);
        target.system.changes = structuredClone(update['system.changes']);
        for (const [key, value] of Object.entries(update)) {
          if (key === `flags.${MODULE_ID}.legacyIronChinOriginal`) (target.flags[MODULE_ID] ??= {}).legacyIronChinOriginal = structuredClone(value);
          if (key === `flags.${MODULE_ID}.-=legacyIronChinOriginal`) delete target.flags[MODULE_ID]?.legacyIronChinOriginal;
        }
      }
    }
  };
  const actor = { type: 'character', isOwner: true, items: [cls, item], system: {
    attributes: { ac: { formulas: [] } }, abilities: { con: { mod: 3 } }
  } };
  return { actor, item, effect, otherEffect };
}

test('recognizes exact Iron Chin from Kyros without requiring an RPGUp duplicate', () => {
  const { actor, item } = fixture();
  assert.equal(importedIronChin(item), true);
  assert.equal(pugilistLevel(actor), 4);
  assert.equal(feature(actor, 'ironChin'), item);
  item.flags.plutonium.hash = 'some-other-feature';
  assert.equal(feature(actor, 'ironChin'), null);
});

test('migration preview makes no changes; exact old AC overrides are recognized', async () => {
  const { actor, item, effect } = fixture();
  const before = JSON.stringify(effect.system.changes);
  const preview = await migrateIronChin(actor);
  assert.equal(preview.status, 'ready');
  assert.equal(preview.next, 'migrate');
  assert.equal(JSON.stringify(effect.system.changes), before);
  assert.equal(item.calls.length, 0);
});

test('only GM explicitly applying migrates two old overrides into one custom change; original is saved', async () => {
  const { actor, item, effect, otherEffect } = fixture();
  const before = structuredClone(effect.system.changes);
  const otherBefore = structuredClone(otherEffect);
  await assert.rejects(migrateIronChin(actor, { apply: true, isGM: false }), /Somente o Mestre/);
  const result = await migrateIronChin(actor, { apply: true, isGM: true });
  assert.equal(result.status, 'migrated');
  assert.equal(item.calls.length, 1);
  assert.equal(item.calls[0].name, 'ActiveEffect');
  assert.equal(effect.system.changes.length, 1);
  assert.equal(effect.system.changes[0].key, `flags.${MODULE_ID}.ironChin`);
  assert.equal(effect.system.changes[0].type, 'custom');
  assert.deepEqual(effect.flags[MODULE_ID].legacyIronChinOriginal.changes, before);
  assert.deepEqual(otherEffect, otherBefore);
  assert.equal((await migrateIronChin(actor, { apply: true, isGM: true })).status, 'migrated');
  assert.equal(item.calls.length, 1);
});

test('migrated custom change grants one formula only with no shield and light/no armor', () => {
  const { actor } = fixture();
  const change = { key: `flags.${MODULE_ID}.ironChin` };
  applyIronChin(actor, change); applyIronChin(actor, change);
  assert.equal(actor.system.attributes.ac.formulas.length, 1);
  assert.equal(actor.system.attributes.ac.formulas[0].formula, '12 + @abilities.con.mod');
  actor.items.push({ type: 'equipment', system: { equipped: true, type: { value: 'shield' } } });
  actor.system.attributes.ac.formulas = [];
  applyIronChin(actor, change);
  assert.equal(actor.system.attributes.ac.formulas.length, 0);
  actor.items.pop();
  actor.items.push({ type: 'equipment', system: { equipped: true, type: { value: 'medium' } } });
  applyIronChin(actor, change);
  assert.equal(actor.system.attributes.ac.formulas.length, 0);
  actor.items[2].system.type.value = 'light';
  applyIronChin(actor, change);
  assert.equal(actor.system.attributes.ac.formulas.length, 1);
});

test('restore explicitly returns original effect changes for uninstall without altering other effects', async () => {
  const { actor, item, effect } = fixture();
  const before = structuredClone(effect.system.changes);
  await migrateIronChin(actor, { apply: true, isGM: true });
  assert.equal((await migrateIronChin(actor, { restore: true })).next, 'restore');
  assert.equal(item.calls.length, 1);
  assert.equal((await migrateIronChin(actor, { apply: true, restore: true, isGM: true })).status, 'restored');
  assert.deepEqual(effect.system.changes, before);
  assert.equal(item.calls.length, 2);
});

test('unknown/nonmatching/multiple Iron Chin effects are not touched', async () => {
  const { actor, item } = fixture();
  item.effects[0].system.changes[1].value = '13 + @abilities.con.mod';
  const result = await migrateIronChin(actor, { apply: true, isGM: true });
  assert.equal(result.status, 'unsupported-effect');
  assert.equal(item.calls.length, 0);
});
