// Contract checks against public source, not in-Foundry animation integration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const animationPath = resolve(process.env.DAS_ANIMATIONS ?? resolve(root, ".research/darsh-animations"));
const available = existsSync(resolve(animationPath, "module/scripts/core/registry.mjs"));
const load = path => import(pathToFileURL(resolve(animationPath, path)).href);

test("DAS Animations reference is available in CI", () => {
  if (process.env.CI) assert.ok(available, "Clone DAS Animations v0.16.3, or set DAS_ANIMATIONS");
});

test("DAS 0.16.3 recognizes native unarmed classification independently of translated names", { skip: !available }, async () => {
  const { weaponRecipe, strikeForm } = await load("module/scripts/core/strikes.mjs");
  for (const keys of [[], ["punhos"], ["coupdepoing"], ["unarmedstrike"]]) {
    const summary = { itemType: "feat", classification: "unarmed", attackType: "melee", keys, damageTypes: ["bludgeoning"] };
    assert.equal(strikeForm(summary), "melee");
    assert.equal(weaponRecipe(summary)?.family, "unarmed");
  }
  assert.equal(weaponRecipe({ itemType: "feat", classification: "spell", attackType: "melee", keys: ["punhos"] }), null);
});

test("improvised melee attacks use an existing DAS recipe without custom premium paths", { skip: !available }, async () => {
  const { weaponRecipe } = await load("module/scripts/core/strikes.mjs");
  const choice = weaponRecipe({ itemType: "weapon", weaponType: "improv", classification: "weapon", attackType: "melee", damageTypes: ["bludgeoning"] });
  assert.equal(choice?.family, "generic:bludgeoning");
  assert.ok(choice.recipe.animation.length > 0);
  assert.ok(choice.recipe.animation.every(name => name.startsWith("jb2a.")));
});

test("the optional animation registration schema accepts an empty extension and rejects invented triggers", { skip: !available }, async () => {
  const { checkRegistration } = await load("module/scripts/core/registry.mjs");
  assert.deepEqual(checkRegistration({ animations: {} }).errors, []);
  const invalid = checkRegistration({ animations: { "rpgup-test": [{ trigger: "pugilistHaymaker", alias: "weapon.invented" }] } });
  assert.ok(invalid.errors.length > 0);
  assert.deepEqual(invalid.table.animations, {});
});

test("DAS visual source detection safely reports optional modules absent", { skip: !available }, async () => {
  const { blfxActive, jb2aActive, psfxActive, aaActive } = await load("module/scripts/runtime/shared.mjs");
  const oldGame = globalThis.game;
  const oldSequence = globalThis.Sequence;
  const oldAA = globalThis.AutomatedAnimations;
  try {
    globalThis.game = { modules: new Map() };
    delete globalThis.Sequence;
    delete globalThis.AutomatedAnimations;
    assert.equal(blfxActive(), false);
    assert.equal(jb2aActive(), false);
    assert.equal(psfxActive(), false);
    assert.equal(aaActive(), false);
    // Installed assets cannot activate a backend without its renderer.
    globalThis.game.modules.set("boss-loot-assets-premium", { active: true });
    globalThis.game.modules.set("jb2a_patreon", { active: true });
    assert.equal(blfxActive(), false);
    assert.equal(jb2aActive(), false);
  } finally {
    if (oldGame === undefined) delete globalThis.game; else globalThis.game = oldGame;
    if (oldSequence === undefined) delete globalThis.Sequence; else globalThis.Sequence = oldSequence;
    if (oldAA === undefined) delete globalThis.AutomatedAnimations; else globalThis.AutomatedAnimations = oldAA;
  }
});
