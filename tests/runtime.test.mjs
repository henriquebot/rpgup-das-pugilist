// Node lifecycle harness with document/hook doubles. These tests do not run a
// Foundry server, sockets, dnd5e's activity executor, or the DAS combat engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { install, compatible } from '../scripts/main.mjs';
import { createRuntime } from '../scripts/runtime.mjs';
import { createDocuments } from '../src/documents.mjs';
import { MODULE_ID, ACTIVITY_IDS as A } from '../src/ids.mjs';

const get = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
function set(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((current, key) => current[key] ??= {}, object);
  parent[last] = structuredClone(value);
}

class HooksHarness {
  nextId = 0;
  listeners = new Map();
  on(name, fn) {
    const listeners = this.listeners.get(name) ?? new Map();
    const id = ++this.nextId;
    listeners.set(id, fn);
    this.listeners.set(name, listeners);
    return id;
  }
  off(name, id) { this.listeners.get(name)?.delete(id); }
  call(name, ...args) {
    for (const fn of this.listeners.get(name)?.values() ?? []) if (fn(...args) === false) return false;
    return true;
  }
}

function actor({ level = 6, value = 15, max = 40, temp = 0, id = 'pugilist' } = {}) {
  const actor = {
    uuid: `Actor.${id}`, isOwner: true,
    system: { attributes: { hp: { value, max, temp }, ac: { formulas: [] }, exhaustion: 0 }, abilities: { str: { mod: 3 }, con: { mod: 2 } } },
    flags: {}, updates: [], embeddedUpdates: [],
    testUserPermission: user => user?.id === 'player',
    getFlag(scope, key) { return get(this.flags, `${scope}.${key}`); },
    async update(changes) {
      this.updates.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) set(this, path, value);
      return this;
    },
    async updateEmbeddedDocuments(type, updates) {
      assert.equal(type, 'Item');
      this.embeddedUpdates.push(structuredClone(updates));
      for (const update of updates) {
        const item = this.items.find(i => i.id === update._id);
        assert.ok(item);
        for (const [path, value] of Object.entries(update)) if (path !== '_id') set(item, path, value);
      }
    }
  };
  actor.items = createDocuments().map(data => {
    const item = structuredClone(data);
    item.id = item._id;
    item.actor = actor;
    if (item.type === 'class') item.system.levels = level;
    item.activities = Object.values(item.system.activities ?? {}).map(data => ({ ...data, id: data._id, item, actor }));
    return item;
  });
  return actor;
}
const item = (actor, key) => actor.items.find(item => item.flags[MODULE_ID]?.key === key);
const activity = (actor, key, activityId) => item(actor, key).activities.find(activity => activity.id === activityId);
const mark = (actor, value) => set(actor, `flags.${MODULE_ID}.tempHp`, value);

function environment(actor, { player = false } = {}) {
  const gm = { id: 'gm', active: true, isGM: true };
  const user = player ? { id: 'player', active: true, isGM: false } : gm;
  const users = [gm, { id: 'player', active: true, isGM: false }];
  users.activeGM = gm;
  const registrations = [];
  const removals = [];
  const errors = [];
  const warnings = [];
  const content = {
    register(source, table, options) { registrations.push({ source, table, options }); return { accepted: Object.keys(table), rejected: {}, sources: Object.keys(options?.sources ?? {}), rejectedSources: [] }; },
    unregister(source) { removals.push(source); }
  };
  const env = {
    Hooks: new HooksHarness(),
    game: { version: '14.370', system: { id: 'dnd5e', version: '6.1.1' }, user, users, actors: actor ? [actor] : [], time: { worldTime: 1000 },
      i18n: { localize: key => key }, modules: new Map([
        ['dnd5e-combat', { active: true, version: '0.290.0', api: { content } }], [MODULE_ID, { active: true }]
      ]) },
    foundry: { utils: { getProperty: get } },
    console: { error: error => errors.push(error) }, ui: { notifications: { warn: message => warnings.push(message) } },
    registrations, removals, errors, warnings
  };
  return env;
}

test('exact version checks gate setup registration and all owned roll hooks', () => {
  const pc = actor();
  const env = environment(pc);
  env.game.system.version = '6.0.6';
  assert.equal(compatible(env.game), false);
  const api = install(env);
  env.Hooks.call('dnd5e-combat.registerContent', env.game.modules.get('dnd5e-combat').api.content.register);
  const config = { subject: activity(pc, 'unarmed', A.attack), rolls: [{ base: true, parts: ['1 + @mod'], data: { mod: 3 } }] };
  env.Hooks.call('dnd5e.preRollDamageV2', config);
  assert.equal(env.registrations.length, 0);
  assert.equal(config.rolls[0].parts[0], '1 + @mod');
  assert.equal(api.diagnostics().enabled, false);
});

test('compatibility requires the audited Foundry, dnd5e and DAS versions', () => {
  const env = environment(actor());
  assert.equal(compatible(env.game), true);
  env.game.modules.get('dnd5e-combat').version = '0.289.0';
  assert.equal(compatible(env.game), false);
  env.game.modules.get('dnd5e-combat').version = '0.290.0';
  env.game.version = '14.369';
  assert.equal(compatible(env.game), false);
  env.game.version = '14.370';
  env.game.system.version = '6.1.0';
  assert.equal(compatible(env.game), false);
  env.game.system.version = '6.1.1';
  env.game.modules.get('dnd5e-combat').active = false;
  assert.equal(compatible(env.game), false);
});

test('setup registers once, ready does not duplicate it, and shutdown removes all listeners', () => {
  const env = environment(actor());
  const api = install(env);
  env.Hooks.call('dnd5e-combat.registerContent', env.game.modules.get('dnd5e-combat').api.content.register);
  env.Hooks.call('ready');
  assert.equal(env.registrations.length, 1);
  assert.equal(env.registrations[0].source, MODULE_ID);
  api.shutdown();
  assert.equal([...env.Hooks.listeners.values()].reduce((n, listeners) => n + listeners.size, 0), 0);
  assert.equal(env.removals.at(-1), MODULE_ID);
  assert.equal(api.diagnostics().enabled, false);
});

test('rejected content fails closed and unregisters the module source', () => {
  const env = environment(actor());
  const api = install(env);
  env.Hooks.call('dnd5e-combat.registerContent', () => ({ rejected: { bad: ['invalid'] }, rejectedSources: [] }));
  assert.equal(api.diagnostics().enabled, false);
  assert.equal(env.removals.at(-1), MODULE_ID);
  assert.equal(env.errors.length, 1);
});

test('Iron Chin hook adds one alternative derived formula and leaves other formulas intact', () => {
  const pc = actor();
  const env = environment(pc);
  install(env);
  const other = { formula: '13 + @abilities.dex.mod', label: 'Other formula' };
  pc.system.attributes.ac.formulas.push(other);
  const change = { key: `flags.${MODULE_ID}.ironChin`, value: 'true' };
  env.Hooks.call('applyActiveEffect', pc, change);
  env.Hooks.call('applyActiveEffect', pc, change);
  assert.equal(pc.system.attributes.ac.formulas.length, 2);
  assert.equal(pc.system.attributes.ac.formulas[0], other);
  assert.equal(pc.system.attributes.ac.formulas[1].formula, '12 + @abilities.con.mod');
  assert.equal(pc.system.attributes.ac.formulas[1].shielded, false);
  assert.equal(pc.updates.length, 0);
});

test('armor and class guards prevent Iron Chin and Fisticuffs changes to ineligible actors', () => {
  for (const mode of ['shield', 'medium', 'heavy', 'foreign']) {
    const pc = actor();
    if (mode === 'foreign') pc.items = pc.items.filter(i => i.type !== 'class');
    else pc.items.push({ type: 'equipment', system: { equipped: true, type: { value: mode } } });
    const env = environment(pc);
    install(env);
    env.Hooks.call('applyActiveEffect', pc, { key: `flags.${MODULE_ID}.ironChin` });
    const config = { subject: activity(pc, 'unarmed', A.attack), rolls: [{ base: true, parts: ['1 + @mod'], data: { mod: 3 } }] };
    env.Hooks.call('dnd5e.preRollDamageV2', config);
    assert.equal(pc.system.attributes.ac.formulas.length, 0, mode);
    assert.equal(config.rolls[0].parts[0], '1 + @mod', mode);
  }
});

test('Node hook ordering selects Fisticuffs before the real Core pure damage maximizer', async t => {
  const core = resolve(process.env.DAS_CORE ?? '.research/dnd5e-combat', 'module/scripts/core/max-dice.mjs');
  if (!existsSync(core)) return t.skip('DAS Core reference unavailable');
  const { maximizeDice } = await import(pathToFileURL(core).href);
  const pc = actor({ level: 5 });
  const env = environment(pc);
  install(env); // module evaluation, before Core installs its init-time router
  env.Hooks.on('dnd5e.preRollDamageV2', config => {
    for (const roll of config.rolls) roll.parts = roll.parts.map(maximizeDice);
  });
  const config = { subject: activity(pc, 'unarmed', A.attack), rolls: [
    { base: true, parts: ['1 + @mod'], data: { mod: 3 } }, { parts: ['2d6'], data: {} }
  ] };
  env.Hooks.call('dnd5e.preRollDamageV2', config);
  assert.equal(config.rolls[0].parts[0], '(1*10) + @mod');
  assert.equal(config.rolls[0].data.mod, 3);
  assert.equal(config.rolls[1].parts[0], '(2*6)');
  assert.equal(item(pc, 'unarmed').system.damage.base.custom.formula, '1 + @mod');
});

test('Bloodied postUse restores Moxie once and grants level-scaled temporary HP', async () => {
  const pc = actor({ level: 6 });
  item(pc, 'moxie').system.uses.spent = 4;
  const env = environment(pc);
  const api = install(env);
  const own = activity(pc, 'bloodied', A.bloodied);
  const result = { message: { id: 'bloodied-one' } };
  env.Hooks.call('dnd5e.postUseActivity', own, {}, result);
  env.Hooks.call('dnd5e.postUseActivity', own, {}, result);
  await api.idle();
  assert.equal(item(pc, 'moxie').system.uses.spent, 0);
  assert.equal(pc.embeddedUpdates.length, 1);
  assert.equal(pc.system.attributes.hp.temp, 24);
  assert.deepEqual(pc.getFlag(MODULE_ID, 'tempHp'), { source: 'bloodied', remaining: 24, expiresAt: null, shortRest: true });
  const afterReload = createRuntime(env);
  await afterReload.bloodied(own, {}, result);
  assert.equal(pc.embeddedUpdates.length, 1);
});

test('cancelled and ineligible Bloodied uses do not mutate documents', async () => {
  const pc = actor({ level: 1 });
  const env = environment(pc);
  const runtime = createRuntime(env);
  await runtime.bloodied(activity(pc, 'bloodied', A.bloodied), {}, { message: { id: 'too-early' } });
  await runtime.bloodied(activity(pc, 'bloodied', A.bloodied), {}, null);
  assert.equal(pc.updates.length, 0);
  assert.equal(pc.embeddedUpdates.length, 0);
});

test('Bloodied appends numeric results once to its original private card', async () => {
  const pc = actor({ level: 6 });
  item(pc, 'moxie').system.uses.spent = 4;
  const runtime = createRuntime(environment(pc));
  const writes = [];
  const message = { id: 'bloodied-private', content: '<p>Uso</p>', whisper: ['gm'], flags: {},
    getFlag(scope, key) { return get(this.flags, `${scope}.${key}`); },
    async update(changes) {
      writes.push(structuredClone(changes));
      for (const [path, value] of Object.entries(changes)) set(this, path, value);
    }
  };
  await runtime.bloodied(activity(pc, 'bloodied', A.bloodied), {}, { message });
  await runtime.bloodied(activity(pc, 'bloodied', A.bloodied), {}, { message });
  assert.equal(writes.length, 1);
  assert.match(message.content, /Moxie recuperada: 4/);
  assert.match(message.content, /concedidos: 24 \(total atual: 24\)/);
  assert.deepEqual(message.whisper, ['gm']);
  assert.equal(Object.hasOwn(writes[0], 'whisper'), false);
});

test('Bloodied above half HP restores Moxie without replacing existing temporary HP', async () => {
  const pc = actor({ value: 30, temp: 30 });
  const runtime = createRuntime(environment(pc));
  await runtime.bloodied(activity(pc, 'bloodied', A.bloodied), {}, { message: { id: 'not-bloodied' } });
  assert.equal(pc.system.attributes.hp.temp, 30);
  assert.equal(pc.getFlag(MODULE_ID, 'tempHp'), undefined);
  assert.equal(pc.embeddedUpdates.length, 1);
});

test('failed Bloodied document writes can retry without duplicating a successful grant', async () => {
  const pc = actor();
  const normalUpdate = pc.update;
  pc.update = async () => { throw new Error('write failed'); };
  const runtime = createRuntime(environment(pc));
  const args = [activity(pc, 'bloodied', A.bloodied), {}, { message: { id: 'retry-one' } }];
  await assert.rejects(runtime.bloodied(...args), /write failed/);
  pc.update = normalUpdate;
  await runtime.bloodied(...args);
  await runtime.bloodied(...args);
  assert.equal(pc.system.attributes.hp.temp, 24);
  assert.equal(pc.updates.length, 1);
});

test('Brace Up resolves a public ChatMessage activity and records a ten-minute expiry', () => {
  const pc = actor();
  const env = environment(pc);
  const runtime = createRuntime(env);
  const own = activity(pc, 'braceUp', A.braceUp);
  const message = { system: { activity: { id: own.id, uuid: 'Actor.pugilist.Item.brace.Activity.use' } }, getAssociatedActivity: () => own };
  const changes = { 'system.attributes.hp.temp': 12 };
  runtime.trackTemporaryHp(pc, -12, changes, { origin: message });
  assert.deepEqual(changes[`flags.${MODULE_ID}.tempHp`], { source: 'braceUp', remaining: 12, expiresAt: 1600, shortRest: false });
});

test('ordinary healing and zero damage preserve tracked temporary HP through preUpdateActor', async () => {
  const pc = actor({ temp: 12 });
  const runtime = createRuntime(environment(pc));
  mark(pc, { source: 'braceUp', remaining: 12, expiresAt: 1600, shortRest: false });
  for (const amount of [0, -5]) {
    const changes = { 'system.attributes.hp.temp': 12 };
    runtime.trackTemporaryHp(pc, amount, changes, {});
    runtime.manualTemporaryHp(pc, changes);
    await pc.update(changes);
    assert.equal(pc.getFlag(MODULE_ID, 'tempHp').expiresAt, 1600);
  }
});

test('damage preserves provenance for the remaining HP and replacements relinquish it', async () => {
  const pc = actor({ temp: 12 });
  const runtime = createRuntime(environment(pc));
  mark(pc, { source: 'braceUp', remaining: 12, expiresAt: 1600, shortRest: false });
  const damage = { 'system.attributes.hp.temp': 7 };
  runtime.trackTemporaryHp(pc, 5, damage, {});
  runtime.manualTemporaryHp(pc, damage);
  await pc.update(damage);
  assert.equal(pc.getFlag(MODULE_ID, 'tempHp').remaining, 7);
  const replacement = { 'system.attributes.hp.temp': 20 };
  runtime.trackTemporaryHp(pc, -20, replacement, { origin: { getAssociatedActivity: () => undefined } });
  assert.equal(replacement[`flags.${MODULE_ID}.tempHp`], null);
  const directEdit = { system: { attributes: { hp: { temp: 5 } } } };
  runtime.manualTemporaryHp(pc, directEdit);
  assert.equal(directEdit[`flags.${MODULE_ID}.tempHp`], null);
});

test('world-time expiry affects only owned unchanged temporary HP and is idempotent', async () => {
  const pc = actor({ temp: 12 });
  const env = environment(pc);
  const runtime = createRuntime(env);
  mark(pc, { source: 'braceUp', remaining: 12, expiresAt: 1600, shortRest: false });
  await runtime.expireAll();
  assert.equal(pc.updates.length, 0);
  env.game.time.worldTime = 1600;
  await Promise.all([runtime.expireAll(), runtime.expireAll()]);
  assert.equal(pc.system.attributes.hp.temp, 0);
  assert.equal(pc.updates.length, 1);
  mark(pc, { source: 'braceUp', remaining: 7, expiresAt: 1600, shortRest: false });
  pc.system.attributes.hp.temp = 20;
  await runtime.expireAll();
  assert.equal(pc.system.attributes.hp.temp, 20);
  assert.equal(pc.getFlag(MODULE_ID, 'tempHp'), null);
});

test('only the elected authority handles broadcast time updates', async () => {
  const pc = actor({ temp: 12 });
  const env = environment(pc, { player: true });
  env.game.time.worldTime = 1700;
  mark(pc, { source: 'braceUp', remaining: 12, expiresAt: 1600, shortRest: false });
  await createRuntime(env).expireAll();
  assert.equal(pc.system.attributes.hp.temp, 12);
  assert.equal(pc.updates.length, 0);
});

test('without a connected GM the first active owner handles time expiry', async () => {
  const pc = actor({ temp: 12 });
  const env = environment(pc, { player: true });
  env.game.users.activeGM = null;
  env.game.time.worldTime = 1700;
  mark(pc, { source: 'braceUp', remaining: 12, expiresAt: 1600, shortRest: false });
  await createRuntime(env).expireAll();
  assert.equal(pc.system.attributes.hp.temp, 0);
  assert.equal(pc.updates.length, 1);
});

test('a player cannot expire another actor through a local rest hook', async () => {
  const pc = actor({ temp: 24 });
  pc.isOwner = false;
  pc.testUserPermission = () => false;
  mark(pc, { source: 'bloodied', remaining: 24, expiresAt: null, shortRest: true });
  await createRuntime(environment(pc, { player: true })).rest(pc, {}, { type: 'short' });
  assert.equal(pc.system.attributes.hp.temp, 24);
  assert.equal(pc.updates.length, 0);
});

test('a locally resting player expires Bloodied HP even with a GM connected', async () => {
  const pc = actor({ temp: 24 });
  const env = environment(pc, { player: true });
  const api = install(env);
  mark(pc, { source: 'bloodied', remaining: 24, expiresAt: null, shortRest: true });
  env.Hooks.call('dnd5e.restCompleted', pc, {}, { type: 'short' });
  await api.idle();
  assert.equal(pc.system.attributes.hp.temp, 0);
  assert.equal(pc.getFlag(MODULE_ID, 'tempHp'), null);
  assert.throws(() => api.diagnostics(), /somente ao Mestre/);
});

test('short rest preserves unexpired Brace Up; long rest expires its tracked HP', async () => {
  const pc = actor({ temp: 12 });
  const runtime = createRuntime(environment(pc));
  mark(pc, { source: 'braceUp', remaining: 12, expiresAt: 1600, shortRest: false });
  await runtime.rest(pc, {}, { type: 'short' });
  assert.equal(pc.system.attributes.hp.temp, 12);
  await runtime.rest(pc, {}, { type: 'long' });
  assert.equal(pc.system.attributes.hp.temp, 0);
});

test('disabled module leaves attack, AC and temporary HP hooks inert', async () => {
  const pc = actor({ temp: 12 });
  const env = environment(pc);
  env.game.modules.get(MODULE_ID).active = false;
  const api = install(env);
  mark(pc, { source: 'bloodied', remaining: 12, expiresAt: null, shortRest: true });
  env.Hooks.call('applyActiveEffect', pc, { key: `flags.${MODULE_ID}.ironChin` });
  env.Hooks.call('dnd5e.postUseActivity', activity(pc, 'bloodied', A.bloodied), {}, { message: { id: 'disabled-use' } });
  env.Hooks.call('dnd5e.restCompleted', pc, {}, { type: 'short' });
  await api.idle();
  assert.equal(pc.system.attributes.ac.formulas.length, 0);
  assert.equal(pc.updates.length, 0);
  assert.equal(pc.embeddedUpdates.length, 0);
  assert.equal(pc.system.attributes.hp.temp, 12);
});
