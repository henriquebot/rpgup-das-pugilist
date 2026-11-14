import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedMuscleMass } from '../scripts/policy.mjs';
import { inspectMuscleMass, configureMuscleMass } from '../scripts/muscle-mass.mjs';

const provenance = (page, hash) => ({ plutonium: { page, source: 'Pugilist2024', hash } });
function fixture({ athletics = 1, acrobatics = 0 } = {}) {
  const actor = { type: 'character', uuid: 'Actor.ftj9Mpxn7j1iWs5N', isOwner: true, flags: {}, items: [],
    system: { skills: { ath: { value: athletics }, acr: { value: acrobatics } } }, calls: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(updates) {
      this.calls.push(structuredClone(updates));
      for (const [path, value] of Object.entries(updates)) {
        const parts = path.split('.'); let obj = this;
        for (const part of parts.slice(0, -1)) obj = obj[part] ??= {};
        const last = parts.at(-1);
        if (last.startsWith('-=')) delete obj[last.slice(2)];
        else obj[last] = structuredClone(value);
      }
    }
  };
  const cls = { type: 'class', system: { identifier: 'pugilist', levels: 4 },
    flags: provenance('classes.html', 'pugilist_pugilist2024') };
  const subclass = { type: 'subclass', system: { identifier: 'squared-circle', classIdentifier: 'pugilist' },
    flags: provenance('classes.html', 'pugilist_pugilist2024,state:sub_squared%20circle_pugilist2024=b1') };
  const item = { id: 'Md8sYfuaHBJX9psw', type: 'feat', name: 'Muscle Mass', system: {
    identifier: 'muscle-mass', description: { value: '<div class="ddb"><p>Original de Muscle Mass</p></div>' },
    activities: {}, advancement: {} },
    flags: provenance('subclassFeature', 'muscle%20mass_pugilist_pugilist2024_squared%20circle_pugilist2024_3_pugilist2024')
  };
  actor.items = [cls, subclass, item];
  return { actor, cls, subclass, item };
}

test('Kyros original Muscle Mass identified by stable import metadata, not name', () => {
  const f = fixture();
  assert.equal(importedMuscleMass(f.item), true);
  assert.equal(feature(f.actor, 'muscleMass'), f.item);
  f.item.name = 'Massa Muscular';
  assert.equal(feature(f.actor, 'muscleMass'), f.item);
  f.item.flags.plutonium.hash = 'another';
  assert.equal(feature(f.actor, 'muscleMass'), null);
});

test('preview without skill asks a choice and never changes character', async () => {
  const f = fixture();
  const before = structuredClone({ flags: f.actor.flags, item: f.item, skills: f.actor.system.skills });
  assert.deepEqual((await configureMuscleMass(f.actor)).choices, [
    { key: 'acr', label: 'Acrobacia' }, { key: 'ath', label: 'Atletismo' }
  ]);
  assert.equal(f.actor.calls.length, 0);
  assert.deepEqual({ flags: f.actor.flags, item: f.item, skills: f.actor.system.skills }, before);
});

test('Athletics class proficiency upgrades to expertise 1 to 2 and is reversible', async () => {
  const f = fixture();
  const html = f.item.system.description.value;
  const preview = await configureMuscleMass(f.actor, { skill: 'ath' });
  assert.equal(preview.status, 'ready');
  assert.equal(preview.previous, 1);
  assert.equal(preview.granted, 2);
  await assert.rejects(configureMuscleMass(f.actor, { skill: 'ath', apply: true }), /Somente o Mestre/);
  const applied = await configureMuscleMass(f.actor, { skill: 'ath', apply: true, isGM: true });
  assert.equal(applied.status, 'installed');
  assert.equal(f.actor.system.skills.ath.value, 2);
  assert.equal(f.actor.system.skills.acr.value, 0);
  assert.equal(f.actor.flags[MODULE_ID].muscleMassChoice.skill, 'ath');
  assert.equal(f.actor.calls.length, 1);
  assert.equal((await configureMuscleMass(f.actor, { skill: 'acr', apply: true, isGM: true })).status, 'installed');
  assert.equal(f.actor.calls.length, 1);
  assert.equal((await configureMuscleMass(f.actor, { restore: true, apply: true, isGM: true })).status, 'restored');
  assert.equal(f.actor.system.skills.ath.value, 1);
  assert.equal(f.actor.flags[MODULE_ID]?.muscleMassChoice, undefined);
  assert.equal(f.item.system.description.value, html);
});

test('Acrobatics without proficiency gains proficiency 0 to 1, never expertise', async () => {
  const f = fixture();
  const result = await configureMuscleMass(f.actor, { skill: 'acr', apply: true, isGM: true });
  assert.equal(result.granted, 1);
  assert.equal(f.actor.system.skills.acr.value, 1);
  assert.equal(f.actor.system.skills.ath.value, 1);
  await configureMuscleMass(f.actor, { restore: true, apply: true, isGM: true });
  assert.equal(f.actor.system.skills.acr.value, 0);
});

test('Already-expert skill is not increased above 2; choice still recorded', async () => {
  const f = fixture({ athletics: 2 });
  assert.equal((await configureMuscleMass(f.actor, { skill: 'ath', apply: true, isGM: true })).granted, 2);
  assert.equal(f.actor.system.skills.ath.value, 2);
  await configureMuscleMass(f.actor, { restore: true, apply: true, isGM: true });
  assert.equal(f.actor.system.skills.ath.value, 2);
});

test('Later changes by the player block a blind restore', async () => {
  const f = fixture();
  await configureMuscleMass(f.actor, { skill: 'acr', apply: true, isGM: true });
  f.actor.system.skills.acr.value = 2;
  assert.equal(inspectMuscleMass(f.actor).status, 'conflict');
  assert.equal((await configureMuscleMass(f.actor, { restore: true, apply: true, isGM: true })).status, 'conflict');
  assert.equal(f.actor.system.skills.acr.value, 2);
  assert.equal(f.actor.calls.length, 1);
});

test('Wrong source or subclass, low level or duplicate originals never edit actor', async () => {
  const f = fixture();
  f.cls.system.levels = 2;
  assert.equal(feature(f.actor, 'muscleMass'), null);
  f.cls.system.levels = 4;
  f.subclass.flags.plutonium.hash = 'other';
  assert.equal(feature(f.actor, 'muscleMass'), null);
  f.subclass.flags.plutonium.hash = 'pugilist_pugilist2024,state:sub_squared%20circle_pugilist2024=b1';
  f.actor.items.push({ ...f.item });
  assert.equal(feature(f.actor, 'muscleMass'), null);
  assert.equal((await configureMuscleMass(f.actor, { skill: 'ath', apply: true, isGM: true })).status, 'not-imported-muscle-mass');
  assert.equal(f.actor.calls.length, 0);
});

test('Invalid and unsupported skill ranks fail closed, no writes', async () => {
  const f = fixture();
  assert.equal((await configureMuscleMass(f.actor, { skill: 'str', apply: true, isGM: true })).status, 'invalid-skill');
  f.actor.system.skills.ath.value = 3;
  assert.equal((await configureMuscleMass(f.actor, { skill: 'ath', apply: true, isGM: true })).status, 'unsupported-skill-data');
  assert.equal(f.actor.calls.length, 0);
});

test('Non-owner actor and forged marker are never changed', async () => {
  const f = fixture();
  f.actor.isOwner = false;
  await assert.rejects(configureMuscleMass(f.actor, { skill: 'ath', apply: true, isGM: true }), /Somente o Mestre/);
  f.actor.isOwner = true;
  f.actor.flags[MODULE_ID] = { muscleMassChoice: { version: 1, skill: 'ath', itemId: 'another', before: 0, granted: 1 } };
  assert.equal(inspectMuscleMass(f.actor).status, 'conflict');
  assert.equal((await configureMuscleMass(f.actor, { restore: true, apply: true, isGM: true })).status, 'conflict');
  assert.equal(f.actor.calls.length, 0);
});
