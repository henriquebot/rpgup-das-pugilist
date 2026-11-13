import test from "node:test";
import assert from "node:assert/strict";
import { documents, createDocuments } from "../src/documents.mjs";
import { IDS, IDENTIFIERS, ACTIVITY_IDS, EFFECT_IDS, MODULE_ID, PACK_ID } from "../src/ids.mjs";
import { CONTENT, SOURCES } from "../scripts/content.mjs";

const item = key => documents.find(d => d._id === IDS[key]);
const grantsAt = (key, level) => item(key).system.advancement.filter(a => a.type === "ItemGrant" && a.level <= level)
  .flatMap(a => a.configuration.items.map(i => i.uuid.split(".").at(-1)));

test("document generation is deterministic, unique and serializable", () => {
  assert.deepEqual(createDocuments(), documents);
  assert.deepEqual(JSON.parse(JSON.stringify(documents)), documents);
  assert.equal(documents.length, 22);
  assert.equal(new Set(documents.map(d => d._id)).size, documents.length);
  for (const group of [IDS, ACTIVITY_IDS, EFFECT_IDS]) for (const value of Object.values(group)) assert.match(value, /^[a-zA-Z0-9]{16}$/);
  for (const doc of documents) assert.equal(doc.flags[MODULE_ID].schemaVersion, 1);
});

test("all advancement grants resolve within the packaged compendium", () => {
  const known = new Set(documents.map(d => d._id));
  for (const doc of documents) for (const advance of doc.system.advancement ?? []) {
    if (advance.type !== "ItemGrant") continue;
    for (const entry of advance.configuration.items) {
      assert.match(entry.uuid, new RegExp(`^Compendium\\.${PACK_ID.replaceAll(".", "\\.")}\\.Item\\.`));
      assert.ok(known.has(entry.uuid.split(".").at(-1)), entry.uuid);
      assert.equal(entry.optional, false);
    }
  }
});

test("every feature is granted at its acquisition level and never before", () => {
  const classLevels = { fisticuffs: 1, ironChin: 1, unarmed: 1, moxie: 2, braceUp: 2, oneTwoPunch: 2, stickAndMove: 2, bloodied: 2, swagger: 2, heavyHitter: 3, digDeep: 4, extraAttack: 5, haymaker: 5, fueledFists: 6 };
  const subLevels = { groundwork: 3, compression: 3, inescapable: 3, stopAndDrop: 3, muscleMass: 3, meatShield: 6 };
  for (const [owner, table] of [["pugilist", classLevels], ["squaredCircle", subLevels]]) for (const [key, level] of Object.entries(table)) {
    assert.ok(grantsAt(owner, level).includes(IDS[key]), key);
    assert.ok(!grantsAt(owner, level - 1).includes(IDS[key]), key);
  }
  for (const owner of ["pugilist", "squaredCircle"]) assert.ok(item(owner).system.advancement.every(a => !a.level || a.level <= 6));
  for (const [key, level] of Object.entries({...classLevels,...subLevels})) for (const activity of Object.values(item(key).system.activities ?? {})) {
    assert.equal(activity.visibility.identifier, "pugilist");
    assert.deepEqual(activity.visibility.level, {min:level,max:6});
  }
});

test("native scales encode exact Moxie and Fisticuffs progression", () => {
  const advances = item("pugilist").system.advancement;
  const valueAt = (id, level) => Object.entries(advances.find(a => a.type === "ScaleValue" && a.configuration.identifier === id).configuration.scale)
    .filter(([start]) => +start <= level).at(-1)?.[1];
  assert.deepEqual([1,2,3,4,5,6].map(n => valueAt("moxie", n).value), [0,2,2,3,3,4]);
  assert.deepEqual([1,2,3,4,5,6].map(n => valueAt("fisticuffs", n).faces), [8,8,8,8,10,10]);
  assert.equal(item("moxie").system.uses.max, "@scale.pugilist.moxie");
  assert.deepEqual(item("moxie").system.uses.recovery, [{period:"sr",type:"recoverAll"}]);
});

test("explicit costs use native identifier remapping and are charged only on their activity", () => {
  for (const [key, id] of [["braceUp", "braceUp"], ["oneTwoPunch", "oneTwoPunch"], ["stickAndMove", "stickDash"], ["swagger", "swagger"], ["inescapable", "inescapable"], ["haymaker", "haymaker"]]) {
    const activity = item(key).system.activities[ACTIVITY_IDS[id]];
    assert.deepEqual(activity.consumption.targets.map(({type,target,value}) => ({type,target,value})), [{type:"itemUses",target:IDENTIFIERS.moxie,value:"1"}]);
  }
  for (const [key, id] of [["braceUp","braceUp"],["oneTwoPunch","oneTwoPunch"],["stickAndMove","stickDash"],["digDeep","digDeep"]])
    assert.equal(item(key).system.activities[ACTIVITY_IDS[id]].activation.type, "bonus");
  assert.equal(item("compression").system.activities[ACTIVITY_IDS.compression].activation.type, "special");
  for (const doc of documents) for (const activity of Object.values(doc.system.activities ?? {})) {
    if (activity.type !== "utility") assert.equal(activity.roll, undefined, `${activity.type} has no utility roll schema`);
  }
});

test("V14 effects and activity references have no dangling IDs or legacy changes", () => {
  for (const doc of documents) {
    const known = new Set(doc.effects.map(e => e._id));
    for (const activity of Object.values(doc.system.activities ?? {})) for (const effect of activity.effects) assert.ok(known.has(effect._id));
    for (const effect of doc.effects) {
      assert.equal(effect.changes, undefined);
      assert.ok(Array.isArray(effect.system.changes));
      assert.ok(effect.system.changes.every(c => c.phase === "initial" && typeof c.type === "string"));
    }
  }
  const dig = item("digDeep").effects[0];
  assert.equal(dig.duration.value, 600);
  assert.equal(dig.duration.units, "seconds");
  assert.equal(dig.transfer, false);
  assert.deepEqual(dig.system.changes.filter(c => c.key === "system.traits.dr.value").map(c => c.value).sort(), ["bludgeoning","piercing","slashing"]);
  assert.ok(dig.system.changes.every(c => c.key !== "system.attributes.exhaustion"));
  assert.deepEqual(dig.system.changes.filter(c => c.key === `flags.${MODULE_ID}.ignoreExhaustion`).map(({type,phase,value}) => ({type,phase,value})), [{type:"custom",phase:"initial",value:"true"}]);
});

test("Muscle Mass uses recorded native upgrade and ASI uses native advancement", () => {
  const muscle = item("squaredCircle").system.advancement.find(a => a.type === "Trait");
  assert.equal(muscle.level, 3);
  assert.equal(muscle.configuration.mode, "upgrade");
  assert.deepEqual(muscle.configuration.choices, [{count:1,pool:["skills:acr","skills:ath"]}]);
  assert.deepEqual(muscle.value.chosen, []);
  const asi = item("pugilist").system.advancement.find(a => a.type === "AbilityScoreImprovement");
  assert.equal(asi.level, 4);
  assert.equal(asi.configuration.points, 2);
});

test("unarmed actions remain Strength-based with independent grapple/shove effects", () => {
  const strike = item("unarmed");
  assert.equal(strike.system.identifier, "unarmed-strike");
  assert.equal(item("extraAttack").system.identifier, "extra-attack");
  assert.equal(strike.system.damage.base.custom.formula, "1 + @mod");
  for (const id of [ACTIVITY_IDS.attack,ACTIVITY_IDS.bonusAttack]) {
    assert.equal(strike.system.activities[id].attack.ability, "str");
    assert.equal(strike.system.activities[id].attack.type.classification, "unarmed");
  }
  assert.equal(strike.system.activities[ACTIVITY_IDS.bonusAttack].activation.type, "bonus");
  assert.deepEqual(strike.system.activities[ACTIVITY_IDS.grapple].effects, [{_id:EFFECT_IDS.grappled,onSave:false}]);
  assert.deepEqual(strike.system.activities[ACTIVITY_IDS.shove].effects, [{_id:EFFECT_IDS.prone,onSave:false},{_id:EFFECT_IDS.pushed,onSave:false}]);
  assert.deepEqual(strike.effects.find(e => e._id === EFFECT_IDS.pushed).flags["dnd5e-combat"].push, {distance:5,units:"ft"});
});

test("every DAS content source and activity reference resolves in the packaged documents", () => {
  const byIdentifier = new Map(documents.map(d => [d.system.identifier, d]));
  for (const [identifier, entry] of Object.entries(CONTENT)) {
    const doc = byIdentifier.get(identifier);
    assert.ok(doc, identifier);
    assert.equal(SOURCES[doc._id], identifier);
    const walk = value => {
      if (!value || typeof value !== "object") return;
      if (value.activity) {
        const owner = value.item ? byIdentifier.get(value.item) : doc;
        assert.ok(owner?.system.activities?.[value.activity], `${identifier}: ${value.activity}`);
      }
      for (const child of Object.values(value)) walk(child);
    };
    walk(entry);
  }
  const bloodied = item("bloodied").system.activities[ACTIVITY_IDS.bloodied];
  assert.equal(bloodied.activation.type, "reaction");
  assert.deepEqual(bloodied.consumption.targets.map(({type,target,value}) => ({type,target,value})), [{type:"itemUses",target:"",value:"1"}]);
});
