import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocuments } from '../src/documents.mjs';
import { MODULE_ID, IDENTIFIERS as I, ACTIVITY_IDS as A } from '../src/ids.mjs';
import { createAutomation, heldVictims, redirectRange, QUERY } from '../scripts/automation.mjs';

const DAS = 'dnd5e-combat';
const clone = value => structuredClone(value);

function harness({ answers = [], bonus = [], reaction = true, gap = 1 } = {}) {
  const registry = new Map(), cards = [], rolls = [], prompts = [], errors = [];
  let serial = 0;
  const gm = { id: 'gm', active: true, isGM: true };
  const users = Object.assign([gm], { activeGM: gm });
  const scenes = new Map(), messages = new Map();
  class FakeRoll {
    static replaceFormulaData(formula) { return formula; }
    constructor(formula, data) { this.formula = formula; this.data = data; this.total = bonus.shift() ?? 1; }
    async evaluate() { return this; }
    async toMessage(data) { rolls.push(data); return data; }
  }
  const env = {
    CONFIG: { queries: {} }, Roll: FakeRoll,
    console: { error: (...args) => errors.push(args) },
    foundry: { utils: { escapeHTML: String }, applications: { api: { DialogV2: { wait: async data => {
      prompts.push(data);
      const wanted = answers.shift() ?? 'no';
      const index = data.buttons.findIndex((button, i) => button.action === wanted || button.action === `pick${i}` && wanted === button.label);
      if (wanted === null) return null;
      if (index >= 0) return data.buttons[index].action;
      const option = wanted === 'yes' ? 1 : wanted === 'both' ? data.buttons.length - 1 : 0;
      return data.buttons[option]?.action ?? null;
    } } } } },
    game: {
      user: gm, users, scenes, messages, combat: null,
      modules: new Map([[DAS, { api: { gap: (...args) => typeof gap === 'function' ? gap(...args) : { cells: gap }, ui: { budget: () => ({ reaction }) } } }]]),
      dnd5e: { utils: { convertLength: (n, from, to) => from === to ? n : from === 'm' && to === 'ft' ? n * 3.28084 : n / 3.28084 } }
    },
    fromUuidSync: uuid => registry.get(uuid) ?? null,
    ChatMessage: { implementation: {
      getSpeaker: ({ token, actor }) => token ? { scene: token.parent.id, token: token.id } : { actor: actor?.id },
      create: async data => { const message = { id: `card${++serial}`, ...data }; cards.push(message); return message; }
    } }
  };
  const register = doc => { if (doc?.uuid) registry.set(doc.uuid, doc); return doc; };
  const makeActor = ({ name = 'Pugilist', owner = true, subclass = true, level = 6 } = {}) => {
    const actor = {
      id: `actor${++serial}`, name, uuid: `Actor.actor${serial}`, isOwner: owner, flags: {}, effects: [], statuses: new Set(),
      system: { abilities: { str: { mod: 4 } }, skills: { ath: { ability: 'str' } }, attributes: { hp: { value: 30 }, ac: { value: 16 } } },
      getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
      async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = value; return value; },
      testUserPermission: () => false,
      getRollData: () => ({ scale: { pugilist: { fisticuffs: '1d10' } } }),
      async updateEmbeddedDocuments(_type, changes) {
        for (const change of changes) {
          const item = this.items.get(change._id);
          if (item && Object.hasOwn(change, 'system.uses.spent')) item.system.uses.spent = change['system.uses.spent'];
        }
        return changes;
      }
    };
    const docs = createDocuments().filter(doc => subclass || doc.system.identifier !== I.squaredCircle).map(clone);
    const cls = docs.find(doc => doc.system.identifier === I.pugilist);
    cls.system.levels = level;
    const itemList = docs.map(item => {
      item.id = item._id; item.uuid = `${actor.uuid}.Item.${item.id}`; item.actor = actor;
      item.system.uses ??= { max: 0, spent: 0, recovery: [] };
      item.system.uses.max = item.system.identifier === I.moxie ? 4 : Number(item.system.uses.max) || item.system.uses.max;
      Object.defineProperty(item.system.uses, 'value', { configurable: true, get() { return Math.max(0, (Number(this.max) || 0) - (Number(this.spent) || 0)); } });
      item.system.getCardData = async ({ activity }) => ({ activity: activity.id, title: item.name });
      const activities = Object.values(item.system.activities ?? {}).map(data => {
        const activity = { ...data, id: data._id, item, actor, calls: [], attackCalls: [],
          getRollData: () => actor.getRollData(), getUsageToken: () => actor.token,
          async use(...args) {
            this.calls.push(args);
            for (const cost of this.consumption?.targets ?? []) {
              const target = cost.target ? actor.items.find(i => i.system.identifier === cost.target) : item;
              if (target) target.system.uses.spent = (Number(target.system.uses.spent) || 0) + Number(cost.value || 0);
            }
            if (item.system.identifier === I.haymaker) (actor.flags[DAS] ??= {}).maxDamage = true;
            return { message: { id: `use${++serial}` } };
          },
          async rollAttack(...args) { this.attackCalls.push(args); return { total: 15 }; }
        };
        register(activity); activity.uuid = `${item.uuid}.Activity.${activity.id}`; register(activity);
        return activity;
      });
      item.system.activities = new Map(activities.map(activity => [activity.id, activity]));
      register(item);
      return item;
    });
    actor.items = Object.assign(itemList, { get: id => itemList.find(item => item.id === id) });
    register(actor);
    return actor;
  };
  const makeToken = (actor, { id = `token${++serial}`, scene = null, name = actor.name } = {}) => {
    scene ??= { id: `scene${++serial}`, uuid: `Scene.scene${serial}`, grid: { distance: 5, units: 'ft' }, tokens: new Map() };
    scenes.set(scene.id, scene);
    const token = { id, uuid: `${scene.uuid}.Token.${id}`, name, actor, parent: scene, texture: { src: 'token.webp' } };
    scene.tokens.set(id, token); actor.token = token; register(token); return token;
  };
  const hold = (source, victim) => {
    const effect = { uuid: `${victim.actor.uuid}.ActiveEffect.grappled${++serial}`, statuses: new Set(['grappled']) };
    victim.actor.effects.push(effect); register(effect);
    source.actor.effects.push({ uuid: `${source.actor.uuid}.ActiveEffect.mark${serial}`, flags: { [DAS]: { grappling: { target: victim.uuid, effect: effect.uuid } } } });
    return effect;
  };
  const item = (actor, key) => actor.items.find(entry => entry.flags?.[MODULE_ID]?.key === key);
  const activity = (actor, key, id) => item(actor, key).system.activities.get(id);
  return { env, users, registry, cards, rolls, prompts, errors, makeActor, makeToken, hold, item, activity, messages, scenes };
}

test('paired DAS grapple marks select only living victims in the same scene', () => {
  const h = harness(), actor = h.makeActor(), source = h.makeToken(actor);
  const validActor = h.makeActor({ name: 'Valid' }), valid = h.makeToken(validActor, { scene: source.parent });
  const otherActor = h.makeActor({ name: 'Other' }), other = h.makeToken(otherActor);
  h.hold(source, valid); h.hold(source, other);
  actor.effects.push({ flags: { [DAS]: { grappling: { target: valid.uuid, effect: 'missing' } } } });
  assert.deepEqual(heldVictims(h.env, source), [valid]);
  validActor.system.attributes.hp.value = 0;
  assert.deepEqual(heldVictims(h.env, source), []);
});

test('redirect range uses the public DAS gap and dnd5e unit conversion', () => {
  const h = harness({ gap: 2 }), attacker = h.makeToken(h.makeActor()), victim = h.makeToken(h.makeActor(), { scene: attacker.parent });
  const activity = h.activity(attacker.actor, 'unarmed', A.attack);
  assert.deepEqual(redirectRange(h.env, attacker, victim, activity, { rolls: [{ options: {} }] }), { valid: false, longRange: false, distance: 10, normal: 5, maximum: 5 });
  activity.item.system.range.reach = 5; activity.item.system.range.units = 'm';
  assert.equal(redirectRange(h.env, attacker, victim, activity, { rolls: [{ options: {} }] }).valid, true);
  assert.equal(redirectRange(h.env, attacker, h.makeToken(h.makeActor()), activity, {}).valid, false);
});

test('Swagger spends on success, refunds and locks on persistent failure, and ignores unknown DC or repeats', async () => {
  const success = harness({ answers: ['yes'], bonus: [3] }), actor = success.makeActor();
  const automation = createAutomation(success.env), roll = { total: 8, options: { target: 10 }, data: { abilityId: 'str' } };
  await automation.swagger([roll], { subject: actor }); await automation.idle();
  assert.equal(success.item(actor, 'moxie').system.uses.spent, 1);
  assert.equal(success.item(actor, 'swagger').system.uses.spent, 0);
  assert.equal(success.rolls.length, 1);
  await automation.swagger([roll], { subject: actor }); await automation.idle();
  assert.equal(success.prompts.length, 1);

  const failed = harness({ answers: ['yes'], bonus: [1] }), actor2 = failed.makeActor(), auto2 = createAutomation(failed.env);
  await auto2.swagger([{ total: 8, options: { target: 10 }, data: { abilityId: 'con' } }], { subject: actor2 }); await auto2.idle();
  assert.equal(failed.item(actor2, 'moxie').system.uses.spent, 0);
  assert.equal(failed.item(actor2, 'swagger').system.uses.spent, 1);
  await auto2.swagger([{ total: 2, options: {}, data: { abilityId: 'str' } }], { subject: actor2 });
  assert.equal(failed.prompts.length, 1);
});

test('Swagger cancellation and insufficient resources make no document changes', async () => {
  const h = harness({ answers: ['no'] }), actor = h.makeActor(), automation = createAutomation(h.env);
  await automation.swagger([{ total: 1, options: { target: 12 }, data: { abilityId: 'dex' } }], { subject: actor }); await automation.idle();
  assert.equal(h.item(actor, 'moxie').system.uses.spent, 0);
  h.item(actor, 'moxie').system.uses.spent = 4;
  await automation.swagger([{ total: 1, options: { target: 12 }, data: { abilityId: 'cha' } }], { subject: actor });
  assert.equal(h.prompts.length, 1);
});

test('event decisions are queried from the connected owner and fail closed on disconnect', async () => {
  const h = harness({ bonus: [20] }), actor = h.makeActor(), queries = [];
  const player = { id: 'player', active: true, isGM: false, query: async (name, payload) => { queries.push([name, payload]); return 'yes'; } };
  h.users.push(player); actor.testUserPermission = user => user === player;
  const auto = createAutomation(h.env);
  await auto.swagger([{ total: 1, options: { target: 12 }, data: { abilityId: 'str' } }], { subject: actor }); await auto.idle();
  assert.equal(queries.length, 1); assert.equal(queries[0][0], QUERY); assert.equal(h.prompts.length, 0);
  assert.equal(h.item(actor, 'moxie').system.uses.spent, 1);

  const h2 = harness(), actor2 = h2.makeActor(), disconnected = { id: 'player', active: true, isGM: false, query: async () => { throw new Error('offline'); } };
  h2.users.push(disconnected); actor2.testUserPermission = user => user === disconnected;
  const auto2 = createAutomation(h2.env);
  await auto2.swagger([{ total: 1, options: { target: 12 }, data: { abilityId: 'str' } }], { subject: actor2 }); await auto2.idle();
  assert.equal(h2.item(actor2, 'moxie').system.uses.spent, 0); assert.equal(h2.prompts.length, 0);
});

test('Haymaker always replays once, and only acceptance pays and arms DAS', async () => {
  const no = harness({ answers: ['no'] }), actor = no.makeActor(), attack = no.activity(actor, 'unarmed', A.attack), auto = createAutomation(no.env);
  assert.equal(auto.haymaker(attack, {}, {}, {}), false); await auto.idle();
  assert.equal(attack.calls.length, 1); assert.equal(no.item(actor, 'moxie').system.uses.spent, 0);
  const yes = harness({ answers: ['yes'] }), actor2 = yes.makeActor(), attack2 = yes.activity(actor2, 'unarmed', A.attack), auto2 = createAutomation(yes.env);
  assert.equal(auto2.haymaker(attack2, {}, {}, {}), false); await auto2.idle();
  assert.equal(yes.item(actor2, 'moxie').system.uses.spent, 1); assert.equal(actor2.flags[DAS].maxDamage, true); assert.equal(attack2.calls.length, 1);
  assert.equal(auto2.haymaker(attack2, { [MODULE_ID]: { haymakerBypass: true } }, {}, {}), undefined);
});

test('Compression Lock creates one exact-target card per held victim once per turn', async () => {
  const h = harness({ answers: ['yes'] }), actor = h.makeActor(), token = h.makeToken(actor);
  const v1 = h.makeToken(h.makeActor({ name: 'A' }), { scene: token.parent }), v2 = h.makeToken(h.makeActor({ name: 'B' }), { scene: token.parent });
  h.hold(token, v1); h.hold(token, v2);
  const combatant = { id: 'c1', actor, token }, combat = { id: 'combat', combatants: new Map([['c1', combatant]]) };
  const automation = createAutomation(h.env), current = { round: 1, turn: 0, combatantId: 'c1' };
  automation.compression(combat, null, current); await automation.idle();
  assert.equal(h.cards.length, 2); assert.deepEqual(h.cards.map(card => card.system.targets[0].token), [v1.uuid, v2.uuid]);
  automation.compression(combat, null, current); await automation.idle();
  assert.equal(h.cards.length, 2);
});

test('Compression cancellation, unrelated grapple conditions, and non-GM clients do nothing', async () => {
  const h = harness({ answers: ['no'] }), actor = h.makeActor(), token = h.makeToken(actor);
  actor.effects.push({ statuses: new Set(['grappling']) });
  const combat = { id: 'combat', combatants: new Map([['c1', { id: 'c1', actor, token }]]) }, auto = createAutomation(h.env);
  auto.compression(combat, null, { round: 1, turn: 0, combatantId: 'c1' }); await auto.idle();
  assert.equal(h.prompts.length, 0); assert.equal(h.cards.length, 0);
  h.env.game.user = { id: 'player' };
  const victim = h.makeToken(h.makeActor(), { scene: token.parent }); h.hold(token, victim);
  auto.compression(combat, null, { round: 1, turn: 1, combatantId: 'c1' }); await auto.idle();
  assert.equal(h.cards.length, 0);
});

test('Stop and Drop offers both only without mastery; repeated resolutions never duplicate cards', async () => {
  const h = harness({ answers: ['both'] }), actor = h.makeActor(), source = h.makeToken(actor), target = h.makeToken(h.makeActor({ name: 'Target' }), { scene: source.parent });
  const attack = h.activity(actor, 'unarmed', A.attack), message = { id: 'attack1', speaker: { scene: source.parent.id, token: source.id }, system: { mastery: null } };
  h.messages.set(message.id, message);
  const resolution = { id: 'r1', step: 'done', plan: { attack: true }, activity: attack.uuid, attack: { messageId: message.id }, targets: [{ hit: true, token: target.uuid }] };
  const auto = createAutomation(h.env); auto.resolution(resolution); await auto.idle();
  assert.equal(h.cards.length, 2);
  auto.resolution(resolution); await auto.idle(); assert.equal(h.cards.length, 2);

  const mastered = harness({ answers: ['both'] }), actor2 = mastered.makeActor(), source2 = mastered.makeToken(actor2), target2 = mastered.makeToken(mastered.makeActor(), { scene: source2.parent });
  const attack2 = mastered.activity(actor2, 'unarmed', A.attack), message2 = { id: 'attack2', speaker: { scene: source2.parent.id, token: source2.id }, system: { mastery: 'sap' } };
  mastered.messages.set(message2.id, message2);
  createAutomation(mastered.env).resolution({ id: 'r2', step: 'done', plan: { attack: true }, activity: attack2.uuid, attack: { messageId: message2.id }, targets: [{ hit: true, token: target2.uuid }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(mastered.prompts[0].buttons.length, 3); assert.equal(mastered.cards.length, 1);
});

test('Heavy Hitter rejects misses, multiple hits, foreign attacks, and cancellation', async () => {
  const h = harness({ answers: ['no'] }), actor = h.makeActor(), source = h.makeToken(actor), target = h.makeToken(h.makeActor(), { scene: source.parent });
  const message = { id: 'a', speaker: { scene: source.parent.id, token: source.id }, system: {} }; h.messages.set('a', message);
  const auto = createAutomation(h.env), attack = h.activity(actor, 'unarmed', A.attack);
  auto.resolution({ id: 'miss', step: 'done', plan: { attack: true }, activity: attack.uuid, attack: { messageId: 'a' }, targets: [{ hit: false, token: target.uuid }] });
  auto.resolution({ id: 'multi', step: 'done', plan: { attack: true }, activity: attack.uuid, attack: { messageId: 'a' }, targets: [{ hit: true, token: target.uuid }, { hit: true, token: target.uuid }] });
  auto.resolution({ id: 'mixed', step: 'done', plan: { attack: true }, activity: attack.uuid, attack: { messageId: 'a' }, targets: [{ hit: true, token: target.uuid }, { hit: false, token: target.uuid }] });
  const foreign = { uuid: 'Actor.foreign.Item.weapon.Activity.attack', type: 'attack', actor, item: { flags: {}, system: {} } };
  h.registry.set(foreign.uuid, foreign);
  auto.resolution({ id: 'foreign', step: 'done', plan: { attack: true }, activity: foreign.uuid, attack: { messageId: 'a' }, targets: [{ hit: true, token: target.uuid }] });
  auto.resolution({ id: 'cancel', step: 'done', plan: { attack: true }, activity: attack.uuid, attack: { messageId: 'a' }, targets: [{ hit: true, token: target.uuid }] });
  await auto.idle(); assert.equal(h.cards.length, 0); assert.equal(h.prompts.length, 1);
});

test('Meat Shield validates held victim, range, reaction and Moxie before one paid redirect', async () => {
  const h = harness({ answers: ['yes'], gap: (_a, b) => ({ cells: b.name === 'Shield' ? 1 : 3 }) }), defender = h.makeActor(), reactor = h.makeToken(defender);
  const attackerActor = h.makeActor({ name: 'Attacker' }), attacker = h.makeToken(attackerActor, { scene: reactor.parent });
  const victim = h.makeToken(h.makeActor({ name: 'Shield' }), { scene: reactor.parent }); h.hold(reactor, victim);
  const far = h.makeToken(h.makeActor({ name: 'Far' }), { scene: reactor.parent }); h.hold(reactor, far);
  const attack = h.activity(attackerActor, 'unarmed', A.attack), message = { id: 'miss1', speaker: { scene: attacker.parent.id, token: attacker.id }, system: {}, rolls: [{ options: {} }] };
  h.messages.set(message.id, message); h.env.game.combat = { started: false };
  const resolution = { id: 'redirect1', step: 'missed', plan: { attack: true }, activity: attack.uuid, attack: { messageId: message.id }, targets: [{ hit: false, token: reactor.uuid }] };
  const auto = createAutomation(h.env); auto.resolution(resolution); await auto.idle();
  assert.equal(h.prompts[0].buttons.length, 2);
  assert.equal(h.item(defender, 'moxie').system.uses.spent, 1);
  assert.equal(h.activity(defender, 'meatShield', A.meatShield).calls.length, 1);
  assert.equal(attack.calls.length, 1); assert.equal(attack.attackCalls.length, 1);
  assert.equal(attack.attackCalls[0][2].data.system.targets[0].token, victim.uuid);
  assert.equal(attack.attackCalls[0][0].target, victim.actor.system.attributes.ac.value);
  auto.resolution(resolution); await auto.idle(); assert.equal(attack.attackCalls.length, 1);
});

test('Meat Shield cancellation and invalid preconditions never spend or reroll', async () => {
  for (const scenario of [
    { answers: ['no'], reaction: true, gap: 1, spent: 0 },
    { answers: ['yes'], reaction: false, gap: 1, spent: 0 },
    { answers: ['yes'], reaction: true, gap: 3, spent: 0 },
    { answers: ['yes'], reaction: true, gap: 1, spent: 4 },
    { answers: ['yes'], reaction: true, gap: 1, spent: 0, attackerHeld: true }
  ]) {
    const h = harness(scenario), defender = h.makeActor(), reactor = h.makeToken(defender);
    const attackerActor = h.makeActor(), attacker = h.makeToken(attackerActor, { scene: reactor.parent });
    const victim = h.makeToken(h.makeActor(), { scene: reactor.parent }); h.hold(reactor, victim);
    if (scenario.attackerHeld) h.hold(reactor, attacker);
    h.item(defender, 'moxie').system.uses.spent = scenario.spent;
    const attack = h.activity(attackerActor, 'unarmed', A.attack), message = { id: 'm', speaker: { scene: attacker.parent.id, token: attacker.id }, system: {}, rolls: [{ options: {} }] };
    h.messages.set('m', message); h.env.game.combat = scenario.reaction ? { started: false } : { started: true, getCombatantsByActor: () => [{ id: 'c' }], combatant: { id: 'c' } };
    const auto = createAutomation(h.env); auto.resolution({ id: `r${scenario.reaction}${scenario.gap}${scenario.spent}`, step: 'missed', plan: { attack: true }, activity: attack.uuid, attack: { messageId: 'm' }, targets: [{ hit: false, token: reactor.uuid }] });
    await auto.idle(); assert.equal(attack.attackCalls.length, 0); assert.equal(h.activity(defender, 'meatShield', A.meatShield).calls.length, 0);
  }
});

test('query registration exposes only the module-owned public query key', () => {
  const h = harness(), auto = createAutomation(h.env);
  auto.registerQuery();
  assert.equal(typeof h.env.CONFIG.queries[QUERY], 'function');
  assert.deepEqual(Object.keys(h.env.CONFIG.queries), [QUERY]);
});
