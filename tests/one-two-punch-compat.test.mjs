import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { activityAllowed } from '../scripts/policy.mjs';
import { configureOneTwoPunch } from '../scripts/one-two-punch.mjs';

function fixture() {
  const cls = { type: 'class', system: { identifier: 'pugilist', levels: 4 }, flags: { plutonium: {
    page: 'classes.html', hash: 'pugilist_pugilist2024', source: 'Pugilist2024' } } };
  const actor = { uuid: 'Actor.kyros', type: 'character', isOwner: true, items: [] };
  const moxie = { id: 'Auj8h5ZLVO5K1dju', name: 'Moxie', type: 'feat', flags: { plutonium: {
    page: 'classFeature', hash: 'moxie_pugilist_pugilist2024_2_pugilist2024', source: 'Pugilist2024'
  } }, system: { identifier: 'moxie', uses: {
    max: '@scale.pugilist.moxie', spent: 2, recovery: [{ period: 'sr', type: 'recoverAll' }]
  }, activities: {} }, actor };
  const activity = { id: 'dnd5eactivity001', name: 'One-Two Punch', type: 'utility', actor, item: moxie,
    activation: { type: 'bonus' }, consumption: { targets: [
      { type: 'itemUses', target: 'Auj8h5ZLVO5K1dju', value: '1' }
    ] } };
  moxie.system.activities[activity.id] = activity;
  moxie.update = async changes => {
    for (const [key, value] of Object.entries(changes)) {
      const parts = key.split('.');
      if (parts.at(-1).startsWith('-=')) {
        const target = parts.at(-1).slice(2);
        let parent = moxie;
        for (const part of parts.slice(0, -1)) parent = parent[part];
        delete parent[target];
      } else {
        let parent = moxie;
        for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
        parent[parts.at(-1)] = structuredClone(value);
      }
    }
  };
  actor.items = [cls, moxie];
  return { actor, moxie, activity };
}

test('preview does not change the original Moxie or its activity', async () => {
  const { actor, moxie, activity } = fixture();
  const old = structuredClone({ flags: moxie.flags, activity: activity.consumption,
    uses: moxie.system.uses });
  const preview = await configureOneTwoPunch(actor);
  assert.equal(preview.status, 'ready');
  assert.deepEqual({ flags: moxie.flags, activity: activity.consumption,
    uses: moxie.system.uses }, old);
});

test('only explicitly authorized GM can install exact item-level DAS Flurry', async () => {
  const { actor, moxie } = fixture();
  await assert.rejects(configureOneTwoPunch(actor, { apply: true }), /Somente o Mestre/);
  assert.equal((await configureOneTwoPunch(actor, { apply: true, isGM: true })).status, 'installed');
  assert.deepEqual(moxie.flags['dnd5e-combat'].flurry,
    { activity: 'dnd5eactivity001', strikes: 2 });
  assert.deepEqual(moxie.flags[MODULE_ID].oneTwoIntegration, { version: 1 });
  assert.equal((await configureOneTwoPunch(actor, { apply: true, isGM: true })).status, 'installed');
});

test('DAS can use original One-Two only after registration; other activities unaffected', async () => {
  const { actor, activity } = fixture();
  const api = { inspect: () => [] };
  assert.equal(activityAllowed(activity, api), false);
  await configureOneTwoPunch(actor, { apply: true, isGM: true });
  assert.equal(activityAllowed(activity, api), true);
  const other = { ...activity, id: 'dnd5eactivity002' };
  // Stick and Move must not spend Moxie until its own DAS integration is enabled.
  assert.equal(activityAllowed(other, api), false);
});

test('greater flurryStrikes from another feature cannot grant a third attack', async () => {
  const { actor, activity } = fixture();
  await configureOneTwoPunch(actor, { apply: true, isGM: true });
  assert.equal(activityAllowed(activity, { inspect: () => [{ entry: { flurryStrikes: 3 } }] }), false);
});

test('RPGUp fallback One-Two cannot be used together with imported Moxie', async () => {
  const { actor } = fixture();
  const addon = { type: 'feat', system: { identifier: 'rpgup-pugilist-one-two-punch' },
    flags: { [MODULE_ID]: { key: 'oneTwoPunch' } }, actor };
  actor.items.push(addon);
  const fallback = { type: 'utility', id: 'rpgupOneTwoAct01', actor, item: addon };
  assert.equal(activityAllowed(fallback), false);
});

test('revert removes only our two flags; never deletes or rewrites native activity', async () => {
  const { actor, moxie, activity } = fixture();
  const source = structuredClone({ activity: activity.consumption, uses: moxie.system.uses });
  await configureOneTwoPunch(actor, { apply: true, isGM: true });
  assert.equal((await configureOneTwoPunch(actor, { apply: true, restore: true, isGM: true })).status, 'restored');
  assert.equal(moxie.flags['dnd5e-combat'].flurry, undefined);
  assert.equal(moxie.flags[MODULE_ID].oneTwoIntegration, undefined);
  assert.deepEqual({ activity: activity.consumption, uses: moxie.system.uses }, source);
});

test('existing DAS content or modified activity causes conflict without overwrite', async () => {
  const { actor, moxie, activity } = fixture();
  moxie.flags['dnd5e-combat'] = { flurry: { activity: 'someOtherAct0001', strikes: 3 } };
  assert.equal((await configureOneTwoPunch(actor, { apply: true, isGM: true })).status, 'conflict');
  delete moxie.flags['dnd5e-combat'];
  activity.consumption.targets[0].value = '2';
  assert.equal((await configureOneTwoPunch(actor)).status, 'unsupported-activity');
});

test('prepared numeric Moxie max preserves source formula and allows installation', async () => {
  const { actor, moxie } = fixture();
  moxie._source = { system: { uses: { max: '@scale.pugilist.moxie' } } };
  moxie.system.uses.max = 3;
  assert.equal((await configureOneTwoPunch(actor)).status, 'ready');
  assert.equal((await configureOneTwoPunch(actor, { apply: true, isGM: true })).status, 'installed');
  moxie._source.system.uses.max = '@scale.other.wrong';
  assert.equal((await configureOneTwoPunch(actor)).status, 'unsupported-activity');
});
