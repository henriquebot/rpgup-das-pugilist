import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_ID } from '../src/ids.mjs';
import { activityAllowed } from '../scripts/policy.mjs';
import { configureStickAndMove, originalStickAllowed, createStickAndMoveIntegration } from '../scripts/stick-and-move.mjs';

const DAS = 'dnd5e-combat';
function fixture() {
  const cls = { type: 'class', system: { identifier: 'pugilist', levels: 4 }, flags: { plutonium: {
    page: 'classes.html', hash: 'pugilist_pugilist2024', source: 'Pugilist2024'
  } } };
  const actor = { type: 'character', uuid: 'Actor.Kyros', isOwner: true, flags: {}, items: [],
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = structuredClone(value); },
    async unsetFlag(scope, key) { delete this.flags?.[scope]?.[key]; }
  };
  const item = { type: 'feat', id: 'Auj8h5ZLVO5K1dju', name: 'Moxie', actor, flags: { plutonium: {
    source: 'Pugilist2024', page: 'classFeature', hash: 'moxie_pugilist_pugilist2024_2_pugilist2024'
  } }, system: { identifier: 'moxie', uses: { max: '@scale.pugilist.moxie', spent: 1,
    recovery: [{ period: 'sr', type: 'recoverAll' }] }, activities: {} } };
  item.update = async updates => {
    for (const [path, value] of Object.entries(updates)) {
      const parts = path.split('.');
      let target = item;
      for (const name of parts.slice(0, -1)) target = target[name] ??= {};
      const last = parts.at(-1);
      if (last.startsWith('-=')) delete target[last.slice(2)];
      else target[last] = structuredClone(value);
    }
  };
  const stick = { id: 'dnd5eactivity002', name: 'Stick and Move', type: 'utility', actor, item,
    activation: { type: 'bonus' }, consumption: { targets: [{ type: 'itemUses', value: '1', target: item.id }] } };
  const oneTwo = { id: 'dnd5eactivity001', name: 'One-Two Punch', type: 'utility', actor, item,
    activation: { type: 'bonus' }, consumption: { targets: [{ type: 'itemUses', value: '1', target: item.id }] } };
  item.system.activities[stick.id] = stick;
  item.system.activities[oneTwo.id] = oneTwo;
  const unarmed = { id: 'attackOriginal001', type: 'attack', actor, item: { name: 'Unarmed Strike (Pugilist)' },
    activation: { type: 'action' }, attack: { type: { classification: 'unarmed', value: 'melee' } } };
  const bonusAttack = { ...unarmed, id: 'bonusOriginal000', activation: { type: 'bonus' } };
  actor.items = [cls, item];
  const combatant = { id: 'C1', actor };
  const env = { game: { combat: { id: 'Fight1', round: 3, turn: 1, started: true, combatant } } };
  const integration = createStickAndMoveIntegration(env);
  const message = (id, choice = 'dash') => ({ id, getFlag: (module, key) => module === DAS && key === 'basicChoice' ? choice : undefined });
  return { actor, cls, item, stick, oneTwo, unarmed, bonusAttack, env, integration, message };
}

test('preview never changes original item; exact imported Stick and Move is eligible', async () => {
  const { actor, item, stick } = fixture();
  const before = structuredClone({ flags: item.flags, uses: item.system.uses, activation: stick.activation, consumption: stick.consumption });
  const result = await configureStickAndMove(actor);
  assert.equal(result.status, 'ready');
  assert.equal(result.activityId, 'dnd5eactivity002');
  assert.equal(activityAllowed(stick), false);
  assert.deepEqual({ flags: item.flags, uses: item.system.uses, activation: stick.activation, consumption: stick.consumption }, before);
});

test('GM opt-in installs only native basicActions choice; preserves One-Two flurry', async () => {
  const { actor, item, stick } = fixture();
  item.flags[DAS] = { flurry: { activity: 'dnd5eactivity001', strikes: 2 } };
  await assert.rejects(configureStickAndMove(actor, { apply: true }), /Somente o Mestre/);
  assert.equal((await configureStickAndMove(actor, { apply: true, isGM: true })).status, 'installed');
  assert.deepEqual(item.flags[DAS].basicActions, { dnd5eactivity002: { choose: ['dash', 'disengage'] } });
  assert.deepEqual(item.flags[DAS].flurry, { activity: 'dnd5eactivity001', strikes: 2 });
  assert.equal(activityAllowed(stick), true);
  assert.equal(originalStickAllowed(stick), true);
  assert.equal((await configureStickAndMove(actor, { apply: true, isGM: true })).status, 'installed');
});

test('normal Stick and Move card records exactly one free strike on current turn', async () => {
  const f = fixture();
  await configureStickAndMove(f.actor, { apply: true, isGM: true });
  await f.integration.postUse(f.stick, {}, { message: f.message('stick-use', 'disengage') });
  const pending = f.actor.getFlag(MODULE_ID, 'stickMovePending');
  assert.deepEqual(pending, { itemId: f.item.id, messageId: 'stick-use', turn: 'Fight1:3:1:C1' });
  const usage = {};
  f.integration.preUse(f.unarmed, usage);
  assert.equal(usage[DAS].cost, 'free');
  assert.equal(usage[MODULE_ID].stickMoveGrant, 'stick-use');
  await f.integration.postUse(f.unarmed, usage, { message: f.message('strike-use') });
  assert.equal(f.actor.getFlag(MODULE_ID, 'stickMovePending'), undefined);
  const second = {};
  f.integration.preUse(f.unarmed, second);
  assert.equal(second[DAS], undefined);
});

test('Dash or Disengage can be chosen, but an absent choice never grants a strike', async () => {
  const f = fixture();
  await configureStickAndMove(f.actor, { apply: true, isGM: true });
  await f.integration.postUse(f.stick, {}, { message: f.message('none', null) });
  assert.equal(f.actor.getFlag(MODULE_ID, 'stickMovePending'), undefined);
  await f.integration.postUse(f.stick, { [DAS]: { basicChoice: 'dash' } }, { message: f.message('dash', undefined) });
  assert.equal(f.actor.getFlag(MODULE_ID, 'stickMovePending')?.messageId, 'dash');
});

test('cancelled strike does not consume the grant before postUse', async () => {
  const f = fixture();
  await configureStickAndMove(f.actor, { apply: true, isGM: true });
  await f.integration.postUse(f.stick, {}, { message: f.message('stick-use') });
  const usage = {};
  f.integration.preUse(f.unarmed, usage);
  assert.equal(usage[DAS]?.cost, 'free');
  assert.equal(f.actor.getFlag(MODULE_ID, 'stickMovePending')?.messageId, 'stick-use');
  const retry = {};
  f.integration.preUse(f.unarmed, retry);
  assert.equal(retry[DAS]?.cost, 'free');
});

test('never replaces an explicit cost, nor grants free bonus-action or non-unarmed attacks', async () => {
  const f = fixture();
  await configureStickAndMove(f.actor, { apply: true, isGM: true });
  await f.integration.postUse(f.stick, {}, { message: f.message('stick-use') });
  const explicit = { [DAS]: { cost: 'reaction' } };
  f.integration.preUse(f.unarmed, explicit);
  assert.equal(explicit[DAS].cost, 'reaction');
  const bonus = {};
  f.integration.preUse(f.bonusAttack, bonus);
  assert.equal(bonus[DAS], undefined);
  const weapon = {};
  f.integration.preUse({ ...f.unarmed, attack: { type: { classification: 'weapon' } } }, weapon);
  assert.equal(weapon[DAS], undefined);
});

test('turn change or wrong actor prevents using old free strike marker', async () => {
  const f = fixture();
  await configureStickAndMove(f.actor, { apply: true, isGM: true });
  await f.integration.postUse(f.stick, {}, { message: f.message('stick-use') });
  f.env.game.combat.round = 4;
  const config = {};
  f.integration.preUse(f.unarmed, config);
  assert.equal(config[DAS], undefined);
  f.env.game.combat.round = 3;
  f.env.game.combat.combatant = { id: 'C2', actor: { uuid: 'Actor.other' } };
  f.integration.preUse(f.unarmed, {});
  assert.equal(config[DAS], undefined);
});

test('out of combat cannot create a stray extra strike', async () => {
  const f = fixture();
  await configureStickAndMove(f.actor, { apply: true, isGM: true });
  f.env.game.combat.started = false;
  await f.integration.postUse(f.stick, {}, { message: f.message('stick-outside') });
  assert.equal(f.actor.getFlag(MODULE_ID, 'stickMovePending'), undefined);
});

test('pre-existing DAS basicActions on the item causes conflict, never overwritten', async () => {
  const { actor, item } = fixture();
  item.flags[DAS] = { flurry: { activity: 'dnd5eactivity001', strikes: 2 },
    basicActions: { unrelatedActivity: 'dodge' } };
  const before = structuredClone(item.flags[DAS]);
  const result = await configureStickAndMove(actor, { apply: true, isGM: true });
  assert.equal(result.status, 'conflict');
  assert.deepEqual(item.flags[DAS], before);
});

test('changed activity cost or duplicate original Moxie fails closed', async () => {
  const { actor, item, stick } = fixture();
  stick.consumption.targets[0].value = '2';
  assert.equal((await configureStickAndMove(actor)).status, 'unsupported-activity');
  stick.consumption.targets[0].value = '1';
  actor.items.push(item);
  assert.equal((await configureStickAndMove(actor)).status, 'not-original-moxie');
});

test('restore removes only owned item flags, One-Two and native activities remain intact', async () => {
  const f = fixture();
  f.item.flags[DAS] = { flurry: { activity: 'dnd5eactivity001', strikes: 2 } };
  const activities = structuredClone({ stick: f.stick.consumption, oneTwo: f.oneTwo.consumption });
  await configureStickAndMove(f.actor, { apply: true, isGM: true });
  await f.integration.postUse(f.stick, {}, { message: f.message('stick-use') });
  assert.equal((await configureStickAndMove(f.actor, { apply: true, restore: true, isGM: true })).status, 'restored');
  assert.deepEqual(f.item.flags[DAS].flurry, { activity: 'dnd5eactivity001', strikes: 2 });
  assert.equal(f.item.flags[DAS].basicActions, undefined);
  assert.equal(f.actor.getFlag(MODULE_ID, 'stickMovePending'), undefined);
  assert.equal(activityAllowed(f.stick), false);
  assert.deepEqual({ stick: f.stick.consumption, oneTwo: f.oneTwo.consumption }, activities);
});
