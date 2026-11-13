import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { CONTENT, SOURCES } from "../scripts/content.mjs";
import { IDENTIFIERS as I, ACTIVITY_IDS as A } from "../src/ids.mjs";

// Real, unmodified DAS source, pinned by tools/fetch-references.mjs / CI.
// These are schema/core contract tests in Node, never a Foundry gameplay claim.
const root = resolve(process.env.DAS_ROOT ?? ".research/dnd5e-combat");
const fromCore = path => import(pathToFileURL(resolve(root, "module/scripts", path)).href);
const { validateEntry, validateTable, validateSources } = await fromCore("core/content.mjs");
const { freshBudget, checkUse, spendUse } = await fromCore("core/turn.mjs");
const { maximizeDice } = await fromCore("core/max-dice.mjs");
const registry = await fromCore("content/index.mjs");

test("all module entries pass the actual DAS 0.282.1 validator", async () => {
  const manifest = JSON.parse(await readFile(resolve(root, "module/module.json"), "utf8"));
  assert.equal(manifest.version, "0.282.1");
  assert.deepEqual(validateTable(CONTENT), []);
  for (const [identifier, entry] of Object.entries(CONTENT)) {
    assert.deepEqual(validateEntry(entry), [], identifier);
  }
  assert.deepEqual(validateSources(SOURCES), []);
});

test("external table cannot replace another class or generic unarmed rules", () => {
  assert.ok(Object.keys(CONTENT).every(key => key.startsWith("rpgup-pugilist-")));
  assert.equal(CONTENT["unarmed-strike"], undefined);
  assert.equal(CONTENT["extra-attack"], undefined);
  assert.equal(Object.keys(SOURCES).length, Object.keys(CONTENT).length);
});

test("real DAS registry supports repeated registration and clean removal", () => {
  const source = "rpgup-das-pugilist-contract-test";
  const before = JSON.stringify(registry.CONTENT);
  const sourcesBefore = JSON.stringify(registry.SOURCES);
  try {
    registry.registerSources(source, SOURCES);
    registry.registerTable(source, CONTENT);
    assert.deepEqual(registry.registeredTables()[source], Object.keys(CONTENT));
    registry.registerSources(source, SOURCES);
    registry.registerTable(source, CONTENT);
    assert.deepEqual(registry.CONTENT[I.bloodied].triggers, CONTENT[I.bloodied].triggers);
    assert.equal(registry.CONTENT[I.bloodied].triggers.length, 1);
    assert.equal(registry.unregisterTable(source), true);
    assert.equal(JSON.stringify(registry.CONTENT), before);
    assert.equal(JSON.stringify(registry.SOURCES), sourcesBefore);
  } finally {
    registry.unregisterTable(source);
  }
});

test("conditional Heavy Hitter and Stop and Drop follow-ups stay out of the unconditional DAS table", () => {
  assert.equal(CONTENT[I.heavyHitter], undefined);
  assert.equal(CONTENT[I.stopAndDrop], undefined);
});

test("One-Two and Stick and Move reuse flurry and native basic actions", () => {
  assert.equal(CONTENT[I.oneTwoPunch].flurry.strikes, 2);
  assert.equal(CONTENT[I.stickAndMove].flurry.strikes, 1);
  assert.deepEqual(CONTENT[I.stickAndMove].basicActions[A.stickDash], { choose: ["dash", "disengage"] });
  assert.ok(!Object.values(CONTENT).some(entry => entry.martialArts));
});

test("the upstream action budget gives Extra Attack only to the Attack action", () => {
  const context = { isOwnTurn: true, attacksPerAction: 2 };
  const attack = { cost: "action", weaponAttack: true };
  const bonus = { cost: "bonus", weaponAttack: true };
  const reaction = { cost: "reaction", weaponAttack: true };
  let budget = freshBudget();
  budget = spendUse(budget, bonus, context);
  assert.deepEqual(budget.attacks, { granted: 0, used: 0 });
  assert.deepEqual(checkUse(budget, bonus, context), ["noBonus"]);
  budget = spendUse(budget, reaction, context);
  assert.deepEqual(budget.attacks, { granted: 0, used: 0 });
  assert.deepEqual(checkUse(budget, reaction, context), ["noReaction"]);
  budget = spendUse(budget, attack, context);
  assert.deepEqual(budget.attacks, { granted: 2, used: 1 });
  budget = spendUse(budget, attack, context);
  assert.deepEqual(checkUse(budget, attack, context), ["noAction"]);
});

test("Haymaker keeps flat modifiers while maximizing ordinary and critical dice", () => {
  const entry = CONTENT[I.haymaker].maxDamage;
  assert.equal(entry.refundOnHit, true);
  assert.deepEqual(entry.weapons, ["unarmed", "simpleM", "improv"]);
  assert.equal(maximizeDice("1d8 + @mod + 2"), "(1*8) + @mod + 2");
  assert.equal(maximizeDice("2d10 + 1d6 + @mod"), "(2*10) + (1*6) + @mod");
});

test("only the safe native grapple benefits remain in the DAS table", () => {
  assert.deepEqual(CONTENT[I.inescapable], { inescapable: { activity: A.inescapable } });
  assert.deepEqual(CONTENT[I.meatShield], { grappleCover: "half" });
  assert.equal(CONTENT[I.compression], undefined);
  assert.equal(CONTENT[I.swagger], undefined);
  assert.deepEqual(CONTENT[I.fueledFists].weaponDamageTypes, { weapons: ["unarmed", "improv"], types: ["force"] });
});

test("the actual validator rejects fictitious hooks and schema keys", () => {
  assert.ok(validateEntry({ pugilistBonusAttack: true }).length);
  assert.ok(validateEntry({ triggers: [{ on: "afterPugilistAttack", do: [{ type: "restoreMoxie" }] }] }).length);
});
