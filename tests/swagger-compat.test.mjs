import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedSwagger } from '../scripts/policy.mjs';
import { originalSwaggerSetup, originalSwaggerAllowed, resolveOriginalSwagger } from '../scripts/swagger.mjs';

function fixture({ bonus = 2, level = 4, moxieSpent = 0 } = {}) {
  const actor = { uuid: 'Actor.ftj9Mpxn7j1iWs5N', type: 'character', items: [] };
  const cls = { type: 'class', system: { identifier: 'pugilist', levels: level }, flags: { plutonium: {
    page: 'classes.html', source: 'Pugilist2024', hash: 'pugilist_pugilist2024' } } };
  const moxie = { id: 'Auj8h5ZLVO5K1dju', type: 'feat', system: {
    identifier: 'moxie', uses: { max: '@scale.pugilist.moxie', spent: moxieSpent }, activities: {}
  }, flags: { plutonium: { page: 'classFeature', source: 'Pugilist2024',
    hash: 'moxie_pugilist_pugilist2024_2_pugilist2024' } } };
  const item = { id: 'wH7vzvZYUgCDKtdy', type: 'feat', system: {
    identifier: 'swagger-streak', uses: { max: '1', spent: 0, recovery: [{ period: 'sr', type: 'recoverAll' }] },
    activities: {}
  }, flags: { plutonium: { page: 'classFeature', source: 'Pugilist2024',
    hash: 'swagger%20streak_pugilist_pugilist2024_2_pugilist2024' } } };
  const calls = { rolls: 0, use: 0, end: 0 };
  const use = { id: 'dnd5eactivity000', type: 'utility', actor, item, activation: { type: 'special' },
    roll: { formula: '@scale.pugilist.fisticuffs' },
    consumption: { targets: [{ type: 'itemUses', target: moxie.id, value: '1' }] },
    async rollFormula() { calls.rolls++; return bonus == null ? null : [{ total: bonus }]; },
    async use(config) { assert.equal(originalSwaggerAllowed(use, config), true); calls.use++; moxie.system.uses.spent += 1; return { message: { id: 'native-use' } }; }
  };
  const end = { id: 'dnd5eactivity001', type: 'utility', actor, item, activation: { type: 'special' },
    consumption: { targets: [
      { type: 'itemUses', target: moxie.id, value: '-1' },
      { type: 'itemUses', value: '1' }
    ] },
    async use(config) { assert.equal(originalSwaggerAllowed(end, config), true); calls.end++; moxie.system.uses.spent -= 1; item.system.uses.spent += 1; return { message: { id: 'native-end' } }; }
  };
  item.system.activities[use.id] = use;
  item.system.activities[end.id] = end;
  actor.items = [cls, moxie, item];
  return { actor, cls, moxie, item, use, end, calls };
}

test('recognizes exact imported original Swagger Streak, not translated names', () => {
  const f = fixture();
  assert.equal(importedSwagger(f.item), true);
  assert.equal(feature(f.actor, 'swagger'), f.item);
  const pair = originalSwaggerSetup(f.actor);
  assert.equal(pair.use, f.use); assert.equal(pair.end, f.end);
  f.item.flags.plutonium.hash = 'not-the-original';
  assert.equal(feature(f.actor, 'swagger'), null);
  assert.equal(originalSwaggerSetup(f.actor), null);
});

test('native activities are gated against unsanctioned direct clicks', () => {
  const f = fixture();
  assert.equal(originalSwaggerAllowed(f.use), false);
  assert.equal(originalSwaggerAllowed(f.end), false);
  assert.equal(originalSwaggerAllowed(f.use, { [MODULE_ID]: { automation: 'swaggerUse' } }), true);
  assert.equal(originalSwaggerAllowed(f.end, { [MODULE_ID]: { automation: 'swaggerEnd' } }), true);
});

test('success spends one Moxie, preserves the original feature use', async () => {
  const f = fixture({ bonus: 3 });
  const result = await resolveOriginalSwagger(f.actor, { total: 8, dc: 10 });
  assert.deepEqual(result, { status: 'success', total: 8, bonus: 3, adjusted: 11, dc: 10, success: true });
  assert.equal(f.moxie.system.uses.spent, 1);
  assert.equal(f.item.system.uses.spent, 0);
  assert.deepEqual(f.calls, { rolls: 1, use: 1, end: 0 });
});

test('persistent failure refunds Moxie using original End Streak, locking one/rest use', async () => {
  const f = fixture({ bonus: 1 });
  const result = await resolveOriginalSwagger(f.actor, { total: 8, dc: 10 });
  assert.equal(result.status, 'failed-and-locked');
  assert.equal(result.adjusted, 9);
  assert.equal(f.moxie.system.uses.spent, 0);
  assert.equal(f.item.system.uses.spent, 1);
  assert.deepEqual(f.calls, { rolls: 1, use: 1, end: 1 });
  assert.equal((await resolveOriginalSwagger(f.actor, { total: 8, dc: 10 })).status, 'no-uses');
});

test('cancelled formula roll spends nothing', async () => {
  const f = fixture({ bonus: null });
  const report = await resolveOriginalSwagger(f.actor, { total: 4, dc: 12 });
  assert.equal(report.status, 'roll-cancelled');
  assert.equal(f.calls.use, 0); assert.equal(f.calls.end, 0);
  assert.equal(f.moxie.system.uses.spent, 0);
});

test('only a confirmed failed check may consume Swagger', async () => {
  const f = fixture();
  assert.equal((await resolveOriginalSwagger(f.actor, { total: 11, dc: 10 })).status, 'not-confirmed-failure');
  assert.equal((await resolveOriginalSwagger(f.actor, { total: 8, dc: NaN })).status, 'not-confirmed-failure');
  assert.equal(f.calls.rolls, 0);
});

test('wrong costs, type, formula, source, duplicate item and insufficient Moxie fail closed', async () => {
  const f = fixture();
  f.use.consumption.targets[0].target = 'different-resource';
  assert.equal(originalSwaggerSetup(f.actor), null);
  f.use.consumption.targets[0].target = f.moxie.id;
  f.use.roll.formula = '1d4'; assert.equal(originalSwaggerSetup(f.actor), null);
  f.use.roll.formula = '@scale.pugilist.fisticuffs';
  f.actor.items.push(f.item); assert.equal(originalSwaggerSetup(f.actor), null);
  f.actor.items.pop();
  f.moxie.system.uses.spent = 3;
  assert.equal((await resolveOriginalSwagger(f.actor, { total: 8, dc: 10 })).status, 'no-uses');
});
