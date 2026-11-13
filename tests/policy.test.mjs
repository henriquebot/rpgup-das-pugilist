import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocuments } from '../src/documents.mjs';
import { MODULE_ID, ACTIVITY_IDS as A } from '../src/ids.mjs';
import { MIN_LEVEL, ownedKey, feature, pugilistLevel, weaponKind, fisticuffsEligible, activityAllowed,
  applyFisticuffsDamage, applyIronChin, applyDigDeep, actorDiagnostics } from '../scripts/policy.mjs';

function actorAt(level = 1) {
  const items = createDocuments();
  const cls = items.find(i => i.type === 'class');
  cls.system.levels = level;
  const actor = { uuid: 'Actor.test', items, effects: [], system: {
    abilities: { str: { mod: 3 }, con: { mod: 2 } }, traits: { ci: { value: new Set() } },
    attributes: { ac: { formulas: [] }, exhaustion: 0 }
  } };
  for (const i of items) { i.id = i._id; i.actor = actor; }
  return actor;
}
const item = (actor, key) => actor.items.find(i => ownedKey(i) === key);
function activity(actor, kind = 'unarmed') {
  const weapon = kind === 'unarmed' ? item(actor, 'unarmed') : { type: 'weapon', system: { type: { value: kind } } };
  return { id: A.attack, type: 'attack', actor, item: weapon,
    attack: { type: { value: 'melee', classification: kind === 'unarmed' ? 'unarmed' : 'weapon' } } };
}

for (let level = 1; level <= 6; level++) {
  test(`features enforce acquisition thresholds at Pugilist level ${level}`, () => {
    const actor = actorAt(level);
    for (const [key, minimum] of Object.entries(MIN_LEVEL)) assert.equal(Boolean(feature(actor, key)), level >= minimum, key);
  });
}

test('unknown, out-of-scope and duplicate classes never activate complementary mechanics', () => {
  const actor = actorAt(1);
  assert.equal(pugilistLevel(actor), 1);
  const cls = item(actor, 'pugilist');
  delete cls.flags[MODULE_ID];
  assert.equal(pugilistLevel(actor), 0);
  cls.flags[MODULE_ID] = { key: 'pugilist' };
  cls.system.levels = 7;
  assert.equal(pugilistLevel(actor), 0);
  cls.system.levels = 2;
  actor.items.push(structuredClone({ type: 'class', system: { identifier: 'pugilist', levels: 2 } }));
  assert.equal(pugilistLevel(actor), 0);
});

test('subclass features require Squared Circle and duplicates never get applied twice', () => {
  const actor = actorAt(6);
  actor.items = actor.items.filter(i => ownedKey(i) !== 'squaredCircle');
  assert.equal(feature(actor, 'meatShield'), null);
  assert.ok(feature(actor, 'fueledFists'));
  actor.items.push({ system: { identifier: item(actor, 'fisticuffs').system.identifier } });
  assert.equal(feature(actor, 'fisticuffs'), null);
  assert.ok(actorDiagnostics(actor).duplicates.includes('fisticuffs'));
});

test('equipment requirements distinguish light armor, shields and ineligible equipped weapons', () => {
  const actor = actorAt(1);
  const equipment = { type: 'equipment', system: { equipped: true, type: { value: 'light' } } };
  actor.items.push(equipment);
  assert.equal(fisticuffsEligible(actor), true);
  for (const type of ['medium', 'heavy', 'shield']) {
    equipment.system.type.value = type;
    assert.equal(fisticuffsEligible(actor), false, type);
  }
  equipment.system.equipped = false;
  const weapon = { type: 'weapon', system: { equipped: true, type: { value: 'martialM' } } };
  actor.items.push(weapon);
  assert.equal(fisticuffsEligible(actor), false);
  weapon.system.type.value = 'simpleM';
  assert.equal(fisticuffsEligible(actor), true);
  weapon.system.type.value = 'improv';
  assert.equal(fisticuffsEligible(actor), true);
});

test('bonus strike and Dig Deep voluntary recharge have explicit native-use guards', () => {
  const actor = actorAt(4);
  const bonus = activity(actor); bonus.id = A.bonusAttack;
  assert.equal(activityAllowed(bonus), true);
  actor.items.push({ type: 'equipment', system: { equipped: true, type: { value: 'shield' } } });
  assert.equal(activityAllowed(bonus), false);
  const dig = item(actor, 'digDeep');
  const recharge = { id: A.digRecharge, item: dig, actor };
  assert.equal(activityAllowed(recharge), false);
  dig.system.uses.spent = 1;
  assert.equal(activityAllowed(recharge), true);
  actor.system.attributes.exhaustion = 6;
  assert.equal(activityAllowed(recharge), false);
});

test('event activities run only with the module automation marker', () => {
  const actor = actorAt(6);
  for (const key of ['swagger', 'compression', 'meatShield']) {
    const event = { item: item(actor, key), actor };
    assert.equal(activityAllowed(event), false);
    assert.equal(activityAllowed(event, null, { [MODULE_ID]: { automation: key } }), true);
  }
  assert.equal(activityAllowed({ item: { type: 'spell', system: { identifier: 'fireball' } } }), true);
});

test('external flurry enhancements cannot grant extra free Pugilist attacks in multiclass characters', () => {
  const actor = actorAt(6);
  const enhanced = { inspect: checked => {
    assert.equal(checked, actor);
    return [{ identifier: 'heightened-focus', entry: { flurryStrikes: 3 } }];
  } };
  for (const key of ['oneTwoPunch', 'stickAndMove']) assert.equal(activityAllowed({ item: item(actor, key), actor }, enhanced), false);
  assert.equal(activityAllowed({ item: item(actor, 'oneTwoPunch'), actor }, { inspect: () => [] }), true);
});

test('Fisticuffs changes only the native base part and never duplicates Strength or bonus dice', () => {
  for (const [level, die] of [[1, 8], [4, 8], [5, 10], [6, 10]]) {
    const actor = actorAt(level);
    const config = { subject: activity(actor), rolls: [{ base: true, parts: ['1 + @mod', '2'], data: { mod: 3 } },
      { parts: ['1d6'], data: {} }] };
    applyFisticuffsDamage(config);
    applyFisticuffsDamage(config);
    assert.deepEqual(config.rolls[0].parts, [`1d${die} + @mod`, '2']);
    assert.equal(config.rolls[0].data.mod, 3);
    assert.deepEqual(config.rolls[1].parts, ['1d6']);
    assert.equal(item(actor, 'unarmed').system.damage.base.custom.formula, '1 + @mod');
  }
});

test('simple melee and improvised base dice upgrade; larger dice and complex imported formulas stay intact', () => {
  const actor = actorAt(5);
  for (const kind of ['simpleM', 'improv']) {
    const config = { subject: activity(actor, kind), rolls: [{ base: true, parts: ['1d4 + 1', '@mod'], data: {} }] };
    applyFisticuffsDamage(config);
    assert.deepEqual(config.rolls[0].parts, ['1d10 + 1', '@mod']);
    config.rolls[0].parts[0] = '1d12';
    applyFisticuffsDamage(config);
    assert.equal(config.rolls[0].parts[0], '1d12');
    config.rolls[0].parts[0] = '2d4';
    applyFisticuffsDamage(config);
    assert.equal(config.rolls[0].parts[0], '2d4');
  }
  assert.equal(weaponKind(activity(actor, 'martialM')), null);
});

test('Fisticuffs leaves armored Pugilists and other classes unchanged', () => {
  const actor = actorAt(1);
  actor.items.push({ type: 'equipment', system: { equipped: true, type: { value: 'heavy' } } });
  const config = { subject: activity(actor), rolls: [{ base: true, parts: ['1 + @mod'], data: { mod: 3 } }] };
  applyFisticuffsDamage(config);
  assert.equal(config.rolls[0].parts[0], '1 + @mod');
  actor.items = actor.items.filter(i => ownedKey(i) !== 'pugilist');
  applyFisticuffsDamage(config);
  assert.equal(config.rolls[0].parts[0], '1 + @mod');
});

test('Iron Chin adds one alternative formula, retaining other formulas and bonuses', () => {
  const actor = actorAt(1);
  const ac = actor.system.attributes.ac;
  ac.formulas.push({ formula: '10 + @abilities.dex.mod' }); ac.bonus = 2;
  const change = { key: `flags.${MODULE_ID}.ironChin` };
  applyIronChin(actor, change); applyIronChin(actor, change);
  assert.equal(ac.formulas.length, 2);
  assert.equal(ac.formulas[1].formula, '12 + @abilities.con.mod');
  assert.equal(ac.formulas[1].shielded, false);
  assert.equal(ac.bonus, 2);
  actor.items.push({ type: 'equipment', system: { equipped: true, type: { value: 'shield' } } });
  ac.formulas = [];
  applyIronChin(actor, change);
  assert.deepEqual(ac.formulas, []);
});

test('Dig Deep suppresses only exhaustion 1–5 in derived immunity data, preserving the recorded condition', () => {
  for (let level = 0; level <= 6; level++) {
    const actor = actorAt(4);
    const recorded = { type: 'condition', system: { type: 'exhaustion', level }, disabled: false };
    actor.effects.push(recorded);
    actor.system.attributes.exhaustion = level;
    const before = JSON.stringify(recorded);
    applyDigDeep(actor, { key: `flags.${MODULE_ID}.ignoreExhaustion` });
    assert.equal(actor.system.traits.ci.value.has('exhaustion'), level >= 1 && level < 6, String(level));
    assert.equal(actor.system.attributes.exhaustion, level);
    assert.equal(JSON.stringify(recorded), before);
    // Foundry prepares a fresh derived Set on removal/expiry; no document data
    // or persistent immunity is written by this adapter.
    actor.system.traits.ci.value = new Set();
    assert.equal(actor.system.traits.ci.value.has('exhaustion'), false);
  }
});

test('Dig Deep ignores unrelated custom effects and actors below acquisition level', () => {
  const actor = actorAt(3);
  actor.effects.push({ type: 'condition', system: { type: 'exhaustion', level: 5 } });
  applyDigDeep(actor, { key: `flags.${MODULE_ID}.ignoreExhaustion` });
  assert.equal(actor.system.traits.ci.value.has('exhaustion'), false);
  item(actor, 'pugilist').system.levels = 4;
  applyDigDeep(actor, { key: 'flags.otherModule.ignoreExhaustion' });
  assert.equal(actor.system.traits.ci.value.has('exhaustion'), false);
});
