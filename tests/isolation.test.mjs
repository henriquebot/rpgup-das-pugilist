// Static regression checks. These do not certify runtime combat behavior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runtime = resolve(root, "scripts");
const walk = dir => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? walk(resolve(dir, entry.name)) : entry.name.endsWith(".mjs") ? [resolve(dir, entry.name)] : []) : [];
const source = () => walk(runtime).map(path => ({ path: relative(root, path), text: readFileSync(path, "utf8") }));

test("runtime exists and is bundled as ES modules", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "module.json"), "utf8"));
  assert.equal(manifest.id, "rpgup-das-pugilist");
  assert.ok(manifest.esmodules?.length > 0);
  for (const file of manifest.esmodules) {
    assert.ok(file.startsWith("scripts/"));
    assert.ok(existsSync(resolve(root, file)), `Missing runtime ${file}`);
  }
});

test("visual and sheet integrations are never mandatory dependencies", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "module.json"), "utf8"));
  const required = new Set((manifest.relationships?.requires ?? []).map(dependency => dependency.id));
  assert.ok(required.has("dnd5e-combat"));
  for (const id of ["darsh-homebrew", "darsh-dnd-ui", "darsh-animations", "boss-loot-assets-premium", "blfx-assets-pack01", "sequencer", "JB2A_DnD5e", "jb2a_patreon", "tidy5e-sheet", "babele"]) {
    assert.equal(required.has(id), false, `${id} must remain optional`);
  }
});

test("runtime imports neither upstream internals nor premium code", () => {
  for (const { path, text } of source()) {
    const imports = [...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)].map(match => match[1]);
    for (const specifier of imports) {
      assert.equal(/(?:\.research|modules\/(?:dnd5e-combat|darsh-|boss-loot)|animationMap\.js|systems\/dnd5e\/module)/i.test(specifier), false, `${path}: internal import ${specifier}`);
      assert.equal(/^(?:https?:|file:|[A-Z]:[\\/])/i.test(specifier), false, `${path}: external runtime import ${specifier}`);
    }
  }
});

test("runtime has no monkey patches, arbitrary evaluation, or duplicate animation player", () => {
  for (const { path, text } of source()) {
    const rules = [
      [/\blibWrapper\b/, "libWrapper"],
      [/\.prototype\.[\w$]+\s*=/, "prototype mutation"],
      [/Object\.defineProperty\s*\(\s*(?:CONFIG|Actor|Item|Token|Combat|foundry)\b/, "global property replacement"],
      [/\beval\s*\(|\bnew\s+Function\s*\(/, "dynamic evaluation"],
      [/\bnew\s+Sequence\s*\(/, "independent visual playback"],
      [/Hooks\.call(?:All)?\s*\(\s*["']blfx\.register\.CustomAutoRec["']/, "direct BLFX synchronization"]
    ];
    for (const [pattern, label] of rules) assert.equal(pattern.test(text), false, `${path}: ${label}`);
  }
});

test("runtime never writes foreign module settings or flags", () => {
  for (const { path, text } of source()) {
    const settings = [...text.matchAll(/game\.settings\.set\s*\(\s*["']([^"']+)["']/g)].map(match => match[1]);
    const flags = [...text.matchAll(/\.(?:setFlag|unsetFlag)\s*\(\s*["']([^"']+)["']/g)].map(match => match[1]);
    for (const scope of [...settings, ...flags]) assert.equal(scope, "rpgup-das-pugilist", `${path}: writes foreign scope ${scope}`);
  }
});
