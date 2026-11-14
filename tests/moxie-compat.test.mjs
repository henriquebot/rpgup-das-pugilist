import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { importedMoxie, feature, pugilistLevel, moxieDiagnostics, actorDiagnostics } from '../scripts/policy.mjs';

const cls = levels => ({ type: 'class', system: { identifier: 'pugilist', levels },
  flags: { plutonium: { source: 'Pugilist2024', page: 'classes.html', hash: 'pugilist_pugilist2024' } } });
const moxie = (spent = 0) => ({ type: 'feat', system: {
  identifier: 'moxie', uses: { max: '@scale.pugilist.moxie', spent, recovery: [{ period: 'sr', type: 'recoverAll' }] },
  activities: Object.fromEntries(['Brace Up', 'One-Two Punch', 'Stick and Move'].map((name, n) => [
    `dnd5eactivity00${n}`, { _id: `dnd5eactivity00${n}`, name, type: n ? 'utility' : 'heal',
      activation: { type: 'bonus' }, consumption: { targets: [{ type: 'itemUses', target: 'originalMoxieId', value: '1' }] } }
  ]))
}, flags: { plutonium: { source: 'Pugilist2024', page: 'classFeature',
  hash: 'moxie_pugilist_pugilist2024_2_pugilist2024' } } });
function pugilist(level = 4, spent = 0) {
  const actor = { type: 'character', items: [cls(level), moxie(spent)] };
  actor.items[1].id = 'originalMoxieId';
  return actor;
}
test('recognizes only the exact 5etools Moxie import in a real imported Pugilist class', () => {
  const actor = pugilist(4, 3);
  assert.equal(pugilistLevel(actor), 4);
  assert.equal(importedMoxie(actor.items[1]), true);
  assert.equal(feature(actor, 'moxie'), actor.items[1]);
  assert.equal(moxieDiagnostics(actor).expectedMax, 3);
  assert.equal(moxieDiagnostics(actor).spent, 3);
  assert.equal(moxieDiagnostics(actor).expectedAvailable, 0);
  actor.items[1].flags.plutonium.hash = 'other';
  assert.equal(feature(actor, 'moxie'), null);
});
test('original resource wins over duplicate addon feature without altering either item', () => {
  const actor = pugilist();
  const source = actor.items[1];
  const snapshot = structuredClone(source);
  actor.items.push({ type: 'feat', system: { identifier: 'rpgup-pugilist-moxie', uses: { max: '4', spent: 2 } },
    flags: { [MODULE_ID]: { key: 'moxie' } } });
  assert.equal(feature(actor, 'moxie'), source);
  assert.equal(moxieDiagnostics(actor).addonCount, 1);
  assert.deepEqual(source, snapshot);
});
test('two original Moxie resources are ambiguous; other Pugilist sources are not recognized', () => {
  const actor = pugilist();
  actor.items.push(moxie());
  assert.equal(feature(actor, 'moxie'), null);
  actor.items.pop();
  actor.items[0].flags.plutonium.source = 'UnrelatedClass';
  assert.equal(feature(actor, 'moxie'), null);
});
test('Moxie resource scales and refreshes without modifying its native recovery', () => {
  for (const [level, expected] of [[1, 0], [2, 2], [3, 2], [4, 3], [5, 3], [6, 4]]) {
    const actor = pugilist(level);
    const x = moxieDiagnostics(actor);
    assert.equal(x.expectedMax, expected);
    assert.equal(x.source, level < 2 ? 'ausente' : '5etools/Plutonium');
    if (level >= 2) assert.deepEqual(feature(actor, 'moxie').system.uses.recovery, [{ period: 'sr', type: 'recoverAll' }]);
  }
  const actor = pugilist(4, 3);
  actor.items[1].system.uses.spent = 0;  // The native dnd5e rest process handles recovery.
  assert.equal(moxieDiagnostics(actor).expectedAvailable, 3);
});
test('three original activities, their exact IDs, bonus action, and itemUses targets are preserved', () => {
  const actor = pugilist(4);
  const report = actorDiagnostics(actor).moxie;
  assert.deepEqual(report.activities.map(a => a.name), ['Brace Up', 'One-Two Punch', 'Stick and Move']);
  assert.deepEqual(report.activities.map(a => a.type), ['heal', 'utility', 'utility']);
  for (const a of report.activities) assert.deepEqual(a.costs, [{ type: 'itemUses', target: 'originalMoxieId', value: '1' }]);
  assert.equal(Object.keys(actor.items[1].system.activities).length, 3);
});
test('bad Moxie counts are diagnosed, without spending or resetting resources', () => {
  const actor = pugilist(4, 4);
  assert.equal(moxieDiagnostics(actor).requiresReview, true);
  assert.equal(actor.items[1].system.uses.spent, 4);
  actor.items[1].system.uses.spent = -1;
  assert.equal(moxieDiagnostics(actor).requiresReview, true);
});
