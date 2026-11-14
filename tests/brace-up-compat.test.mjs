import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID, ACTIVITY_IDS as A } from '../src/ids.mjs';
import { sourceHealingActivity, isBraceUpHealing } from '../scripts/brace-up.mjs';
import { activityAllowed, feature } from '../scripts/policy.mjs';
import { createRuntime } from '../scripts/runtime.mjs';

function kyros() {
  const actor = { uuid: 'Actor.kyros', type: 'character', items: [] };
  const cls = { type: 'class', system: { identifier: 'pugilist', levels: 4 }, flags: { plutonium: {
    source: 'Pugilist2024', page: 'classes.html', hash: 'pugilist_pugilist2024'
  } } };
  const item = { type: 'feat', system: { identifier: 'moxie', uses: { max: '@scale.pugilist.moxie', spent: 3 },
    activities: {} }, flags: { plutonium: { source: 'Pugilist2024', page: 'classFeature',
    hash: 'moxie_pugilist_pugilist2024_2_pugilist2024' } }, actor };
  const activity = { id: 'dnd5eactivity000', type: 'heal', item, actor, healing: { types: new Set(['temphp']),
    custom: { enabled: true, formula: '@scale.pugilist.fisticuffs + @classes.pugilist.levels + @abilities.con.mod' } } };
  item.system.activities[activity.id] = activity;
  actor.items = [cls, item];
  return { actor, item, activity };
}
function runtimeEnv(actor) {
  const gm = { id: 'GM', isGM: true, active: true };
  const users = [gm]; users.activeGM = gm;
  return { game: { user: gm, users, actors: [actor], time: { worldTime: 1000 } },
    foundry: { utils: { getProperty: (o, path) => path.split('.').reduce((v, k) => v?.[k], o) } } };
}
function attachHealth(actor, temp = 0) {
  actor.system = { ...actor.system, attributes: { hp: { value: 35, max: 52, temp } } };
  actor.flags = {};
  actor.getFlag = (scope, key) => actor.flags?.[scope]?.[key];
  actor.update = async changes => {
    for (const [path, value] of Object.entries(changes)) {
      const parts = path.split('.');
      let parent = actor;
      for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
      parent[parts.at(-1)] = value;
    }
  };
  return actor;
}
function originatingCard(activity) {
  const usage = { getAssociatedActivity: () => activity };
  return { getAssociatedActivity: () => undefined, getOriginatingMessage: () => usage };
}
test('exact 5etools Brace Up source and activity are recognized', () => {
  const { actor, item, activity } = kyros();
  assert.equal(feature(actor, 'moxie'), item);
  assert.equal(activityAllowed(activity), true);
  assert.equal(isBraceUpHealing(activity, actor), true);
  assert.equal(item.system.uses.spent, 3);
});
test('native healing roll resolves its original usage card', () => {
  const { activity } = kyros();
  const usage = { getAssociatedActivity: () => activity };
  const roll = { getAssociatedActivity: () => undefined, getOriginatingMessage: () => usage };
  assert.equal(sourceHealingActivity({ originatingMessage: roll }), activity);
  assert.equal(sourceHealingActivity({ origin: usage }), activity);
});
test('unrelated healing and unrelated Moxie are left alone', () => {
  const { actor, activity, item } = kyros();
  assert.equal(isBraceUpHealing(activity, { ...actor, uuid: 'Actor.other' }), false);
  assert.equal(isBraceUpHealing({ ...activity, healing: { types: ['healing'] } }, actor), false);
  assert.equal(isBraceUpHealing({ ...activity, id: 'dnd5eactivity001' }, actor), false);
  item.flags.plutonium.hash = 'other';
  assert.equal(isBraceUpHealing(activity, actor), false);
  assert.equal(activityAllowed(activity), true);
});
test('fallback Brace Up is disabled when the original source is selected', () => {
  const { actor, activity } = kyros();
  const fallback = { type: 'feat', system: { identifier: 'rpgup-pugilist-brace-up' },
    flags: { [MODULE_ID]: { key: 'braceUp' } } };
  actor.items.push(fallback);
  const a = { id: A.braceUp, type: 'heal', item: fallback, actor, healing: { types: ['temphp'] } };
  assert.equal(isBraceUpHealing(a, actor), false);
  assert.equal(activityAllowed(a), false);
  actor.items = actor.items.filter(i => i !== activity.item);
  assert.equal(isBraceUpHealing(a, actor), true);
  assert.equal(activityAllowed(a), true);
});
test('invalid class levels and duplicate original Moxie fail closed', () => {
  const { actor, item, activity } = kyros();
  actor.items[0].system.levels = 1;
  assert.equal(isBraceUpHealing(activity, actor), false);
  assert.equal(activityAllowed(activity), false);
  actor.items[0].system.levels = 4;
  actor.items.push({ ...item });
  assert.equal(isBraceUpHealing(activity, actor), false);
  assert.equal(activityAllowed(activity), false);
});
test('temporary HP from original Brace Up expires after 600 seconds', async () => {
  const { actor, activity } = kyros(); attachHealth(actor);
  const env = runtimeEnv(actor); const runtime = createRuntime(env);
  const updates = { 'system.attributes.hp.temp': 11 };
  runtime.trackTemporaryHp(actor, -11, updates, { originatingMessage: originatingCard(activity) });
  assert.deepEqual(updates[`flags.${MODULE_ID}.tempHp`], {
    source: 'braceUp', remaining: 11, expiresAt: 1600, shortRest: false
  });
  await actor.update(updates);
  env.game.time.worldTime = 1599;
  await runtime.expire(actor);
  assert.equal(actor.system.attributes.hp.temp, 11);
  env.game.time.worldTime = 1600;
  await runtime.expire(actor);
  assert.equal(actor.system.attributes.hp.temp, 0);
  assert.equal(actor.getFlag(MODULE_ID, 'tempHp'), null);
});
test('new temporary HP from another source is never removed', async () => {
  const { actor, activity } = kyros(); attachHealth(actor);
  const env = runtimeEnv(actor); const runtime = createRuntime(env);
  const updates = { 'system.attributes.hp.temp': 10 };
  runtime.trackTemporaryHp(actor, -10, updates, { originatingMessage: originatingCard(activity) });
  await actor.update(updates);
  const replacement = { 'system.attributes.hp.temp': 15 };
  runtime.trackTemporaryHp(actor, -15, replacement, { origin: {
    getAssociatedActivity: () => ({ type: 'heal', actor, item: { system: { identifier: 'unrelated-heal' } }, healing: { types: ['temphp'] } })
  } });
  await actor.update(replacement);
  env.game.time.worldTime = 2000;
  await runtime.expire(actor);
  assert.equal(actor.system.attributes.hp.temp, 15);
});
test('original data, formula, spending and activity are never mutated', async () => {
  const { actor, item, activity } = kyros(); attachHealth(actor);
  const before = { uses: structuredClone(item.system.uses), flags: structuredClone(item.flags), formula: activity.healing.custom.formula };
  const runtime = createRuntime(runtimeEnv(actor));
  runtime.trackTemporaryHp(actor, -12, { 'system.attributes.hp.temp': 12 }, { originatingMessage: originatingCard(activity) });
  assert.deepEqual(item.system.uses, before.uses);
  assert.deepEqual(item.flags, before.flags);
  assert.equal(activity.healing.custom.formula, before.formula);
});
