import test from 'node:test';
import assert from 'node:assert/strict';
import { createRulzusForceRefund } from '../scripts/rulzus-haymaker-force.mjs';

const ID = 'WZFriX7PU7LgtNBf';
const haymakerActivity = `Actor.${ID}.Item.nlqCQckbec30oU0u.Activity.utilityHaymclNe0`;
const attackActivity = `Actor.${ID}.Item.s9unMj0vdD7Lq70p.Activity.9NBgk9m9fXuGBzqM`;

function harness({ gm = true } = {}) {
  const resource = {
    id: 'n15NbdC47uOsjVuE', parent: { id: ID }, system: { uses: { spent: 4 } },
    async update(change) { this.system.uses.spent = change['system.uses.spent']; this.refunds++; },
    refunds: 0
  };
  const actor = { id: ID, uuid: `Actor.${ID}`, items: new Map([[resource.id, resource]]) };
  const game = {
    actors: new Map([[actor.id, actor]]),
    combat: null,
    user: { id: gm ? 'gm' : 'player' },
    users: { activeGM: { id: 'gm' } }
  };
  const api = createRulzusForceRefund({ game, console: { log() {} } });
  api.initialize();
  const click = () => {
    api.beforeUse({ id: 'utilityHaymclNe0', item: { id: 'nlqCQckbec30oU0u' }, actor });
    api.usageCard({
      type: 'usage', speaker: { actor: ID },
      system: { activity: { uuid: haymakerActivity } }
    });
  };
  const spend = () => {
    resource.system.uses.spent++;
    api.resourceUpdate(resource, { system: { uses: { spent: resource.system.uses.spent } } });
  };
  const resolution = ({ type = 'force', hit = true, id = attackActivity } = {}) => api.resolution({
    source: actor.uuid, step: hit ? 'done' : 'missed', plan: { attack: true },
    activity: id, targets: [{ hit }],
    damageRoll: { damages: [{ type, value: 15 }] }
  });
  return { api, actor, resource, click, spend, resolution };
}

test('Force hit refunds one spent Moxie for a maximum-damage attack', async () => {
  const h = harness();
  h.click(); h.spend();
  assert.equal(h.resource.system.uses.spent, 5);
  await h.resolution();
  assert.equal(h.resource.system.uses.spent, 4);
  assert.equal(h.resource.refunds, 1);
  await h.resolution();
  assert.equal(h.resource.refunds, 1);
});

test('Bonus Force attack receives the same single refund', async () => {
  const h = harness();
  h.click(); h.spend();
  await h.resolution({ id: `Actor.${ID}.Item.bd3WQ6jPu3SXmmcJ.Activity.K2f6Ix6yKT7U3UvN` });
  assert.equal(h.resource.system.uses.spent, 4);
});

test('Bludgeoning, miss, and unarmed damage without Haymaker are untouched', async () => {
  const a = harness(); a.click(); a.spend();
  await a.resolution({ type: 'bludgeoning' });
  assert.equal(a.resource.system.uses.spent, 5);
  const b = harness(); b.click(); b.spend();
  await b.resolution({ hit: false });
  assert.equal(b.resource.system.uses.spent, 5);
  const c = harness();
  await c.resolution();
  assert.equal(c.resource.system.uses.spent, 4);
});

test('Never doubles a native Core refund already applied before resolution', async () => {
  const h = harness(); h.click(); h.spend();
  h.resource.system.uses.spent = 4;
  h.api.resourceUpdate(h.resource, { system: { uses: { spent: 4 } } });
  await h.resolution();
  assert.equal(h.resource.refunds, 0);
  assert.equal(h.resource.system.uses.spent, 4);
});

test('GM is the only writer and a non-Haymaker attack forfeits the pending use', async () => {
  const h = harness({ gm: false }); h.click(); h.spend();
  await h.resolution();
  assert.equal(h.resource.refunds, 0);
  const x = harness(); x.click(); x.spend();
  await x.resolution({ id: `Actor.${ID}.Item.s9unMj0vdD7Lq70p.Activity.X96HnXRaVti0SXqJ` });
  await x.resolution();
  assert.equal(x.resource.refunds, 0);
});

test('Card after resource consumption still associates the correct spend', async () => {
  const h = harness();
  h.spend();
  h.api.usageCard({
    type: 'usage', speaker: { actor: ID },
    system: { activity: { uuid: haymakerActivity } }
  });
  await h.resolution();
  assert.equal(h.resource.system.uses.spent, 4);
});
