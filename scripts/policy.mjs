import { MODULE_ID, IDENTIFIERS as I, ACTIVITY_IDS as A } from '../src/ids.mjs';

export const MIN_LEVEL = Object.freeze({ fisticuffs: 1, ironChin: 1, unarmed: 1, moxie: 2, braceUp: 2,
  oneTwoPunch: 2, stickAndMove: 2, bloodied: 2, swagger: 2, heavyHitter: 3, groundwork: 3,
  compression: 3, inescapable: 3, stopAndDrop: 3, muscleMass: 3, digDeep: 4, extraAttack: 5,
  haymaker: 5, fueledFists: 6, meatShield: 6 });
const SUBCLASS = new Set(['groundwork', 'compression', 'inescapable', 'stopAndDrop', 'muscleMass', 'meatShield']);
export const itemsOf = actor => Array.from(actor?.items ?? []);
// Restrict legacy support to the exact Pugilist 2024 import, never by translated names.
const legacy = (item, page, hash) => item?.flags?.plutonium?.source === 'Pugilist2024'
  && item.flags.plutonium.page === page && item.flags.plutonium.hash === hash;
export const importedPugilistClass = item => item?.type === 'class' && item.system?.identifier === 'pugilist'
  && legacy(item, 'classes.html', 'pugilist_pugilist2024');
export const importedFisticuffs = item => item?.type === 'feat' && item.system?.identifier === 'fisticuffs'
  && legacy(item, 'classFeature', 'fisticuffs_pugilist_pugilist2024_1_pugilist2024');
export const importedIronChin = item => item?.type === 'feat' && item.system?.identifier === 'iron-chin'
  && legacy(item, 'classFeature', 'iron%20chin_pugilist_pugilist2024_1_pugilist2024');
export const importedMoxie = item => item?.type === 'feat' && item.system?.identifier === 'moxie'
  && legacy(item, 'classFeature', 'moxie_pugilist_pugilist2024_2_pugilist2024');
const importedUnarmed = item => item?.type === 'weapon' && item.system?.identifier === 'unarmed-strike-pugilist'
  && legacy(item, 'items.html', 'unarmed%20strike%20(pugilist)_pugilist2024');
export const ownedKey = item => {
  const key = item?.flags?.[MODULE_ID]?.key;
  return key && I[key] === item.system?.identifier ? key : null;
};
export function pugilistLevel(actor) {
  const classes = itemsOf(actor).filter(i => i.type === 'class' && i.system?.identifier === I.pugilist);
  if (classes.length !== 1 || !(ownedKey(classes[0]) === 'pugilist' || importedPugilistClass(classes[0]))) return 0;
  const n = Number(classes[0].system.levels);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 0;
}
export function feature(actor, key) {
  const level = pugilistLevel(actor);
  if (!level || level < (MIN_LEVEL[key] ?? 1)) return null;
  if (SUBCLASS.has(key) && !itemsOf(actor).some(i => i.type === 'subclass' && ownedKey(i) === 'squaredCircle')) return null;
  if (key === 'moxie') {
    const originals = itemsOf(actor).filter(importedMoxie);
    const addon = itemsOf(actor).filter(i => ownedKey(i) === 'moxie');
    // The original contains Brace Up, One-Two Punch and Stick and Move as
    // activities. Prefer that resource without adding a competing counter.
    if (originals.length > 1 || addon.length > 1) return null;
    return originals[0] ?? addon[0] ?? null;
  }
  if (key === 'ironChin') {
    const originals = itemsOf(actor).filter(importedIronChin);
    const addon = itemsOf(actor).filter(i => ownedKey(i) === 'ironChin');
    if (originals.length > 1 || addon.length > 1) return null;
    return originals[0] ?? addon[0] ?? null;
  }
  if (key === 'fisticuffs') {
    const originals = itemsOf(actor).filter(importedFisticuffs);
    const addon = itemsOf(actor).filter(i => ownedKey(i) === 'fisticuffs');
    // Two genuine imports are ambiguous. If the same feature is also present
    // from RPGUp, keep the original active and do not touch either document.
    if (originals.length > 1 || addon.length > 1) return null;
    return originals[0] ?? addon[0] ?? null;
  }
  const found = itemsOf(actor).filter(i => i.system?.identifier === I[key]);
  return found.length === 1 && ownedKey(found[0]) === key ? found[0] : null;
}
export function weaponKind(activity) {
  if (activity?.type !== 'attack') return null;
  if (activity.attack?.type?.classification === 'unarmed' || activity.item?.system?.identifier === 'unarmed-strike') return 'unarmed';
  const kind = activity.item?.type === 'weapon' ? activity.item.system?.type?.value : null;
  return ['simpleM', 'improv'].includes(kind) ? kind : null;
}
export function lightOrNoArmor(actor) {
  return !itemsOf(actor).some(i => i.type === 'equipment' && i.system?.equipped && ['medium', 'heavy', 'shield'].includes(i.system.type?.value));
}
export function fisticuffsEligible(actor) {
  return Boolean(feature(actor, 'fisticuffs')) && lightOrNoArmor(actor) && !itemsOf(actor).some(i =>
    i.type === 'weapon' && i.system?.equipped && !['simpleM', 'improv'].includes(i.system.type?.value)
    && !['unarmed-strike', 'unarmed-strike-pugilist'].includes(i.system?.identifier));
}
export const fisticuffsDie = actor => pugilistLevel(actor) >= 5 ? 10 : 8;
export function activityAllowed(activity, contentApi = null, usageConfig = {}) {
  // Imported Moxie already has One-Two Punch as a bonus-action Utility.
  // Require the exact opt-in DAS item layer before this activity can spend Moxie.
  if (importedMoxie(activity?.item) && activity.id === 'dnd5eactivity001' && activity.type === 'utility') {
    const actor = activity.actor ?? activity.item.actor;
    const item = activity.item;
    const flurry = item.flags?.['dnd5e-combat']?.flurry;
    const mark = item.flags?.[MODULE_ID]?.oneTwoIntegration;
    return feature(actor, 'moxie') === item && mark?.version === 1
      && flurry?.activity === activity.id && flurry?.strikes === 2 && flurry?.weapons !== true
      && !(contentApi?.inspect?.(actor) ?? []).some(row => Number(row.entry?.flurryStrikes) > 2);
  }
  // Original Moxie already contains Brace Up. Preserve it and block duplicates.
  if (importedMoxie(activity?.item) && activity.id === 'dnd5eactivity000' && activity.type === 'heal')
    return feature(activity.actor ?? activity.item.actor, 'moxie') === activity.item;
  // Original Moxie: Dash or Disengage through DAS item-level basicActions.
  // One-Two's independent flurry rule on this item remains untouched.
  if (importedMoxie(activity?.item) && activity.id === 'dnd5eactivity002' && activity.type === 'utility') {
    const actor = activity.actor ?? activity.item.actor;
    const item = activity.item;
    const choice = item.flags?.['dnd5e-combat']?.basicActions?.[activity.id]?.choose;
    return feature(actor, 'moxie') === item
      && item.flags?.[MODULE_ID]?.stickMoveIntegration?.version === 1
      && Array.isArray(choice) && choice.length === 2
      && choice[0] === 'dash' && choice[1] === 'disengage';
  }
  // Preserve the legacy enchant activities; deny use only when Fisticuffs
  // equipment conditions are not met. DAS owns the rest of the activity flow.
  if (importedFisticuffs(activity?.item) && activity.type === 'enchant')
    return fisticuffsEligible(activity.actor ?? activity.item.actor);
  const key = ownedKey(activity?.item);
  if (!key) return true;
  const actor = activity.actor ?? activity.item.actor;
  if (!feature(actor, key)) return false;
  if (key === 'braceUp' && importedMoxie(feature(actor, 'moxie'))) return false;
  if (key === 'oneTwoPunch' && importedMoxie(feature(actor, 'moxie'))) return false;
  if (key === 'stickAndMove' && importedMoxie(feature(actor, 'moxie'))) return false;
  if (key === 'fisticuffs' && feature(actor, key) !== activity.item) return false;
  if (activity.id === A.bonusAttack && !fisticuffsEligible(actor)) return false;
  // Core applies flurryStrikes enhancements to every external flurry. Refuse
  // our use before paying if that would grant more attacks than this feature.
  if (key === 'oneTwoPunch' || key === 'stickAndMove') {
    const count = key === 'oneTwoPunch' ? 2 : 1;
    if ((contentApi?.inspect?.(actor) ?? []).some(row => Number(row.entry?.flurryStrikes) > count)) return false;
  }
  // Event-driven activities are not safe to click directly. Their complements
  // mark the exact validated event before dnd5e is allowed to consume anything.
  if (['swagger', 'compression', 'meatShield'].includes(key)
    && usageConfig?.[MODULE_ID]?.automation !== key) return false;
  if (activity.id === A.digRecharge) {
    const spent = Number(feature(actor, 'digDeep')?.system?.uses?.spent) || 0;
    const exhaustion = Number(actor.system?.attributes?.exhaustion) || 0;
    return spent >= 1 && exhaustion < 6;
  }
  return true;
}

/** Replace the base die only. Keep modifiers and all other damage rolls intact. */
export function applyFisticuffsDamage(config) {
  const activity = config?.subject;
  const actor = activity?.actor;
  const kind = weaponKind(activity);
  if (!kind) return;
  const roll = config.rolls?.find(r => r.base === true);
  if (!roll?.parts?.length) return;
  // 5etools's original Unarmed Strike stores the class-scale formula in the
  // item itself. Never persist edits, but suppress that die when the class
  // equipment restrictions are not satisfied.
  if (!fisticuffsEligible(actor)) {
    if (importedUnarmed(activity.item)
      && /^@scale\.pugilist\.fisticuffs\s*\+\s*@mod$/.test(String(roll.parts[0]).trim()))
      roll.parts[0] = '1 + @mod';
    return;
  }
  const die = fisticuffsDie(actor);
  const original = String(roll.parts[0]);
  if (kind === 'unarmed' && /^1\s*\+\s*@mod$/.test(original)) {
    roll.parts[0] = `1d${die} + @mod`;
    roll.data.mod = Number(actor.system.abilities?.str?.mod) || 0;
    return;
  }
  // Standard native weapons use a single leading base die. Complex imported
  // formulas are deliberately left alone; their equivalence is not guessed.
  const match = original.match(/^1d(\d+)(?=\b|[a-z])/i);
  if (match && Number(match[1]) < die) roll.parts[0] = original.replace(/^1d\d+/i, `1d${die}`);
}

/** A custom initial-phase effect adds an alternative native AC formula. */
export function applyIronChin(actor, change) {
  if (change?.key !== `flags.${MODULE_ID}.ironChin` || !feature(actor, 'ironChin') || !lightOrNoArmor(actor)) return;
  const formulas = actor.system?.attributes?.ac?.formulas;
  if (!Array.isArray(formulas) || formulas.some(f => f.id === `${MODULE_ID}-iron-chin`)) return;
  formulas.push({ id: `${MODULE_ID}-iron-chin`, formula: '12 + @abilities.con.mod', label: 'Iron Chin', shielded: false });
}

/** dnd5e's native conditional immunity suppresses roll and speed reductions.
 * The actual exhaustion condition and its level remain unchanged. Read that
 * condition directly: system.conditions is derived and omits suppressed effects. */
export function applyDigDeep(actor, change) {
  if (change?.key !== `flags.${MODULE_ID}.ignoreExhaustion` || !feature(actor, 'digDeep')) return;
  const exhaustion = Array.from(actor.effects ?? []).find(e => e.type === 'condition' && e.system?.type === 'exhaustion');
  const level = Number(exhaustion?.system?.level) || 0;
  if (level > 0 && level < 6) actor.system?.traits?.ci?.value?.add('exhaustion');
}

export function moxieDiagnostics(actor) {
  const lvl = pugilistLevel(actor);
  const expected = lvl < 2 ? 0 : lvl < 4 ? 2 : lvl < 6 ? 3 : 4;
  const originals = itemsOf(actor).filter(importedMoxie);
  const addon = itemsOf(actor).filter(i => ownedKey(i) === 'moxie');
  const chosen = feature(actor, 'moxie');
  const rawMax = chosen?.system?.uses?.max ?? null;
  const spent = chosen ? Number(chosen.system?.uses?.spent ?? 0) : null;
  const activities = Array.from(chosen?.system?.activities?.values?.() ?? Object.values(chosen?.system?.activities ?? {}));
  return { source: chosen === originals[0] ? '5etools/Plutonium'
      : chosen === addon[0] ? 'RPGUp' : 'ausente',
    originalCount: originals.length, addonCount: addon.length, expectedMax: expected,
    rawMax, spent, expectedAvailable: Number.isFinite(spent) ? expected - spent : null,
    requiresReview: Boolean(chosen && (spent < 0 || spent > expected)) || originals.length > 1 || addon.length > 1,
    activities: activities.map(a => ({ id: a.id ?? a._id, name: a.name, type: a.type,
      costs: Array.from(a.consumption?.targets ?? []).map(t => ({ type: t.type, target: t.target ?? '', value: t.value })) }))
  };
}

export function actorDiagnostics(actor) {
  const list = itemsOf(actor);
  const duplicates = Object.keys(I).filter(key => list.filter(i => i.system?.identifier === I[key]).length > 1);
  const originals = list.filter(importedFisticuffs);
  const addon = list.filter(i => ownedKey(i) === 'fisticuffs');
  const legacyChin = list.filter(importedIronChin);
  const addonChin = list.filter(i => ownedKey(i) === 'ironChin');
  return { level: pugilistLevel(actor), duplicates, fisticuffs: {
    source: originals.length === 1 ? '5etools/Plutonium' : addon.length === 1 ? 'RPGUp' : 'ausente',
    originalCount: originals.length, addonCount: addon.length,
    active: Boolean(feature(actor, 'fisticuffs')),
    duplicateImport: originals.length > 1 || addon.length > 1
  }, ironChin: {
    source: legacyChin.length === 1 ? '5etools/Plutonium' : addonChin.length === 1 ? 'RPGUp' : 'ausente',
    originalCount: legacyChin.length, addonCount: addonChin.length, active: Boolean(feature(actor, 'ironChin'))
  }, moxie: moxieDiagnostics(actor), schemaVersions: [...new Set(list.filter(ownedKey).map(i => i.flags[MODULE_ID].schemaVersion))],
    automation: { swagger: 'hook', compression: 'hook', stopAndDrop: 'hook', meatShield: 'hook', haymaker: 'hook+DAS' } };
}
