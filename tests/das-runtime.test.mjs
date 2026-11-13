import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CONTENT, SOURCES } from "../scripts/content.mjs";
import { IDENTIFIERS as I, ACTIVITY_IDS as A } from "../src/ids.mjs";

// Execute actual upstream runtime functions with minimal document/service doubles.
// This verifies call contracts and behavior in Node; no Foundry canvas, network,
// player clients, real DiceRoll or document database is running here.
const root = resolve(process.env.DAS_ROOT ?? ".research/dnd5e-combat");
const upstream = path => import(pathToFileURL(resolve(root, "module/scripts", path)).href);
const registry = await upstream("content/index.mjs");
const { followUpsFor, followUpCombos } = await upstream("runtime/follow-ups.mjs");
const { grapplerOf, victimsOf } = await upstream("adapter/grapple.mjs");
const { inescapableFor, grappleRulesOf } = await upstream("adapter/grapple-rules.mjs");
const { coverFor, setCoverAvailable } = await upstream("adapter/cover.mjs");
const { normalize, select } = await upstream("core/triggers.mjs");
const { eligibleReactions } = await upstream("core/reaction.mjs");
const { grappleHolds } = await upstream("core/conditions.mjs");
const { registerManeuverDice } = await upstream("runtime/maneuver-dice.mjs");

const coreId = "dnd5e-combat";
const source = "rpgup-runtime-contract";
const documents = new Map();
const handlers = new Map();
let answer = "no";
let questions = 0;
const collection = list => Object.assign(list, { get: id => list.find(x => x.id === id) });
const uses = (max, spent=0) => ({ max, spent, get value() { return this.max - this.spent; } });
const tick = () => new Promise(resolve => setImmediate(resolve));

function item(identifier, id, extra={}) {
  return { id, uuid: `Actor.pugilist.Item.${id}`, name: "Nome traduzido", type: "feat", effects: [], flags: {},
    system: { identifier, activities: new Map(), uses: uses(0), ...extra },
    async update(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (key === "system.uses.spent") this.system.uses.spent = value;
      }
      return this;
    }
  };
}

function actor(items=[]) {
  const flags = new Map();
  const actor = { id: "pugilist", uuid: "Actor.pugilist", name: "Pugilista", type: "character", effects: [], statuses: new Set(),
    items: collection(items), system: {}, testUserPermission: () => true,
    getFlag: (scope, key) => flags.get(`${scope}.${key}`),
    async setFlag(scope, key, value) { flags.set(`${scope}.${key}`, value); },
    async unsetFlag(scope, key) { flags.delete(`${scope}.${key}`); }
  };
  for (const own of items) own.actor = actor;
  documents.set(actor.uuid, actor);
  return actor;
}

test("DAS runtime behavior against environment doubles (not Foundry E2E)", async t => {
  const original = Object.fromEntries(["game", "foundry", "Hooks", "fromUuidSync", "canvas", "CONFIG"].map(k => [k, globalThis[k]]));
  const player = { id: "player", active: true, isGM: false, name: "Jogador", async query() { questions++; return { id: answer }; } };
  globalThis.game = { settings: { get: () => undefined }, user: { id: "gm", isGM: true },
    users: Object.assign(collection([player]), { activeGM: { isSelf: true } }),
    i18n: { format: key => key, localize: key => key }, combat: { id: "combat", started: true, round: 1, turn: 0 }, messages: new Map() };
  globalThis.Hooks = { on: (name, handler) => handlers.set(name, handler), callAll: () => {} };
  globalThis.fromUuidSync = uuid => documents.get(uuid) ?? null;
  globalThis.foundry = { utils: { randomID: () => "contractquery001", getProperty: (object, path) => path.split(".").reduce((x,k) => x?.[k], object) } };
  globalThis.CONFIG = { Canvas: { polygonBackends: { move: { testCollision: (a,b,options) => options.mode === "closest" ? null : false } } } };
  registry.registerSources(source, SOURCES);
  registry.registerTable(source, CONTENT);
  try {
    await t.test("Heavy Hitter uses the real runtime, filters weapons, and has no duplicate combinations", () => {
      const feature = item(I.heavyHitter, "heavyhittertest01");
      const unarmed = item("unarmed-strike", "unarmedtest00001");
      unarmed.type = "weapon";
      const grapple = { id: A.grapple, uuid: `${unarmed.uuid}.Activity.${A.grapple}` };
      const shove = { id: A.shove, uuid: `${unarmed.uuid}.Activity.${A.shove}` };
      unarmed.system.activities = new Map([[A.grapple, grapple], [A.shove, shove]]);
      const own = actor([feature, unarmed]);
      const attack = { item: unarmed, attack: { type: { classification: "unarmed" } } };
      const offer = followUpsFor(own, attack);
      assert.equal(offer.choose, 1);
      assert.deepEqual(offer.activities, [grapple, shove]);
      assert.deepEqual(followUpCombos(offer.activities, offer.choose), [[grapple], [shove]]);
      assert.equal(followUpsFor(own, { item: { system: { type: { value: "simpleM" } } } }), null);
      assert.equal(followUpsFor(actor([unarmed]), attack), null);
    });

    await t.test("grapple ownership and scene filter reject unrelated Grappled conditions", () => {
      const own = actor();
      const scene = {}, otherScene = {};
      const victim1 = { uuid: "Scene.one.Token.victim1", parent: scene };
      const victim2 = { uuid: "Scene.one.Token.victim2", parent: scene };
      const elsewhere = { uuid: "Scene.two.Token.victim3", parent: otherScene };
      for (const value of [victim1, victim2, elsewhere]) documents.set(value.uuid, value);
      const token = { actor: own, parent: scene };
      assert.deepEqual(victimsOf(token), []);
      const mark = target => ({ getFlag: (scope,key) => scope === coreId && key === "grappling" ? { target } : null });
      own.effects = [mark(victim1.uuid)];
      assert.deepEqual(victimsOf(token), [victim1]);
      own.effects.push(mark(victim2.uuid), mark(elsewhere.uuid));
      assert.deepEqual(victimsOf(token), [victim1, victim2]);
      const origin = { actor: own };
      documents.set("Actor.pugilist.Item.unarmed.Activity.grapple", origin);
      assert.equal(grapplerOf({ statuses: new Set(["grappled"]) }), null);
      assert.equal(grapplerOf({ system: { origin: { activity: "Actor.pugilist.Item.unarmed.Activity.grapple" } } }), own);
      assert.equal(grappleHolds({ grapplerStatuses: [], withinReach: true }), true);
      assert.equal(grappleHolds({ grapplerStatuses: ["incapacitated"], withinReach: true }), false);
      assert.equal(grappleHolds({ grapplerStatuses: [], withinReach: false }), false);
    });

    await t.test("Inescapable refusal spends nothing, acceptance spends one, zero Moxie never asks", async () => {
      const reserve = item(I.moxie, "moxietest0000001", { uses: uses(2) });
      const feature = item(I.inescapable, "inescapabletest1");
      const own = actor([reserve, feature]);
      feature.system.activities.set(A.inescapable, { id: A.inescapable, item: feature, actor: own,
        consumption: { targets: [{ type: "itemUses", target: I.moxie, value: "1" }] } });
      assert.equal(grappleRulesOf(own).inescapable.item, feature);
      answer = "no";
      assert.equal(await inescapableFor(own, "Alvo"), false);
      assert.equal(reserve.system.uses.spent, 0);
      answer = "yes";
      assert.equal(await inescapableFor(own, "Alvo"), true);
      assert.equal(reserve.system.uses.spent, 1);
      reserve.system.uses.spent = 2;
      const before = questions;
      assert.equal(await inescapableFor(own, "Alvo"), false);
      assert.equal(questions, before);
      assert.equal(await inescapableFor(actor(), "Alvo"), false);
    });

    await t.test("Bloodied reaction entry is available only for the damage window and a free reaction", () => {
      const declarations = CONTENT[I.bloodied].triggers.map(normalize);
      assert.equal(select(declarations, "isDamaged").length, 1);
      assert.equal(select(declarations, "isMissed").length, 0);
      assert.equal(eligibleReactions(declarations, "isDamaged", { reactionAvailable: true }).length, 1);
      assert.equal(eligibleReactions(declarations, "isDamaged", { reactionAvailable: false }).length, 0);
      assert.equal(eligibleReactions(declarations, "isDamaged", { reactionAvailable: true, incapacitated: true }).length, 0);
    });

    await t.test("Meat Shield runtime adds conditional cover only against creatures not held", () => {
      const feature = item(I.meatShield, "meatshieldtest01");
      const own = actor([feature]);
      const scene = { grid: { size: 100, sizeX: 100, sizeY: 100, distance: 5 }, regions: [], tokens: [] };
      const token = (uuid, actor, x) => ({ uuid, name: uuid, actor, parent: scene, _source: { x, y: 0, width: 1, height: 1, elevation: 0 } });
      const target = token("Scene.one.Token.pugilist", own, 500);
      const outsider = token("Scene.one.Token.outsider", actor(), 0);
      const victim = token("Scene.one.Token.victim", actor(), 100);
      scene.tokens = [target, outsider, victim];
      documents.set(victim.uuid, victim);
      globalThis.canvas = { ready: true, scene };
      setCoverAvailable(true);
      assert.equal(coverFor(outsider, target, { quiet: true }), null);
      own.effects = [{ getFlag: (scope,key) => key === "grappling" ? { target: victim.uuid } : null }];
      assert.equal(coverFor(outsider, target, { quiet: true }).degree, "half");
      assert.equal(coverFor(outsider, target, { quiet: true }).bonus, 2);
      assert.equal(coverFor(victim, target, { quiet: true }), null);
      const secondVictim = token("Scene.one.Token.victim2", actor(), 200);
      const secondAttacker = token("Scene.one.Token.outsider2", actor(), 1000);
      scene.tokens.push(secondVictim, secondAttacker);
      documents.set(secondVictim.uuid, secondVictim);
      own.effects.push({ getFlag: (scope,key) => key === "grappling" ? { target: secondVictim.uuid } : null });
      assert.equal(coverFor(secondVictim, target, { quiet: true }), null);
      assert.equal(coverFor(secondAttacker, target, { quiet: true }).bonus, 2);
      registry.unregisterTable(source);
      assert.equal(coverFor(outsider, target, { quiet: true }), null);
      registry.registerTable(source, CONTENT);
      own.items = collection([]);
      assert.equal(coverFor(outsider, target, { quiet: true }), null);
    });

    await t.test("Haymaker real hooks arm once, refund once on damage, and discard on a miss", async () => {
      const reserve = item(I.moxie, "moxietest0000001", { uses: uses(4, 1) });
      const feature = item(I.haymaker, "haymakertest0001");
      const own = actor([reserve, feature]);
      const haymaker = { id: A.haymaker, item: feature, actor: own,
        consumption: { targets: [{ type: "itemUses", target: reserve.id, value: "1" }] } };
      feature.system.activities.set(A.haymaker, haymaker);
      const strikeItem = item("unarmed-strike", "unarmedtest00001", { type: { value: "natural" } });
      strikeItem.type = "weapon";
      const strike = { type: "attack", uuid: "Actor.pugilist.Item.unarmed.Activity.attack", actor: own, item: strikeItem,
        attack: { type: { classification: "unarmed" } } };
      documents.set(strike.uuid, strike);
      registerManeuverDice();
      handlers.get("dnd5e.postUseActivity")(haymaker, {}, {});
      await tick();
      assert.ok(own.getFlag(coreId, "maxDamage"));
      const ineligibleWeapon = { ...strike, item: { type: "weapon", system: { type: { value: "martialM" } } },
        attack: { type: { classification: "weapon" } } };
      const irrelevant = { subject: ineligibleWeapon, rolls: [{ parts: ["1d12 + @mod"] }] };
      handlers.get("dnd5e.preRollDamageV2")(irrelevant, {}, {});
      assert.equal(irrelevant.rolls[0].parts[0], "1d12 + @mod");
      assert.ok(own.getFlag(coreId, "maxDamage"));
      const config = { subject: strike, rolls: [{ parts: ["2d10 + 1d6 + @mod"] }] };
      handlers.get("dnd5e.preRollDamageV2")(config, {}, {});
      assert.equal(config.rolls[0].parts[0], "(2*10) + (1*6) + @mod");
      assert.equal(reserve.system.uses.spent, 0);
      assert.equal(own.getFlag(coreId, "maxDamage"), undefined);
      const next = { subject: strike, rolls: [{ parts: ["1d10 + @mod"] }] };
      handlers.get("dnd5e.preRollDamageV2")(next, {}, {});
      assert.equal(next.rolls[0].parts[0], "1d10 + @mod");
      assert.equal(reserve.system.uses.spent, 0);
      reserve.system.uses.spent = 1;
      handlers.get("dnd5e.postUseActivity")(haymaker, {}, {});
      await tick();
      handlers.get("dnd5e-combat.resolution")({ id: "missed-haymaker", step: "missed", source: own.uuid,
        activity: strike.uuid, plan: { attack: true }, targets: [{ hit: false, token: "missing-token" }] });
      await tick();
      assert.equal(own.getFlag(coreId, "maxDamage"), undefined);
      assert.equal(reserve.system.uses.spent, 1);
      handlers.get("dnd5e.postUseActivity")(haymaker, {}, {});
      await tick();
      game.combat.turn = 1;
      const expired = { subject: strike, rolls: [{ parts: ["1d10 + @mod"] }] };
      handlers.get("dnd5e.preRollDamageV2")(expired, {}, {});
      assert.equal(expired.rolls[0].parts[0], "1d10 + @mod");
      assert.equal(own.getFlag(coreId, "maxDamage"), undefined);
      assert.equal(reserve.system.uses.spent, 1);
    });
  } finally {
    registry.unregisterTable(source);
    setCoverAvailable(false);
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
