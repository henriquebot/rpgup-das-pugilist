import { MODULE_ID, IDENTIFIERS as I, ACTIVITY_IDS as A } from '../src/ids.mjs';

export const MIN_LEVEL = Object.freeze({ fisticuffs: 1, ironChin: 1, unarmed: 1, moxie: 2, braceUp: 2,
  oneTwoPunch: 2, stickAndMove: 2, bloodied: 2, swagger: 2, heavyHitter: 3, groundwork: 3,
  compression: 3, inescapable: 3, stopAndDrop: 3, muscleMass: 3, digDeep: 4, extraAttack: 5,
  haymaker: 5, fueledFists: 6, meatShield: 6 });
const SUBCLASS = new Set(['groundwork', 'compression', 'inescapable', 'stopAndDrop', 'muscleMass', 'meatShield']);
export const itemsOf = actor => Array.from(actor?.items ?? []);
export const ownedKey = item => {
  const key = item?.flags?.[MODULE_ID]?.key;
  return key && I[key] === item.system?.identifier ? key : null;
};
export function pugilistLevel(actor) {
  const classes = itemsOf(actor).filter(i => i.type === 'class' && i.system?.identifier === I.pugilist);
  if (classes.length !== 1 || ownedKey(classes[0]) !== 'pugilist') return 0;
  const n = Number(classes[0].system.levels);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : 0;
}
export function feature(actor, key) {
  const level = pugilistLevel(actor);
  if (!level || level < (MIN_LEVEL[key] ?? 1)) return null;
  if (SUBCLASS.has(key) && !itemsOf(actor).some(i => i.type === 'subclass' && ownedKey(i) === 'squaredCircle')) return null;
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
    && i.system.identifier !== 'unarmed-strike');
}
export const fisticuffsDie = actor => pugilistLevel(actor) >= 5 ? 10 : 8;
export function activityAllowed(activity) {
  const key = ownedKey(activity?.item);
  if (!key) return true;
  const actor = activity.actor ?? activity.item.actor;
  if (!feature(actor, key)) return false;
  if (activity.id === A.bonusAttack && !fisticuffsEligible(actor)) return false;
  // These activities do not have a faithful event integration in this version.
  // Reject instead of taking Moxie or damaging an arbitrary selected creature.
  if (['swagger', 'compression', 'meatShield'].includes(key)) return false;
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
  if (!kind || !fisticuffsEligible(actor)) return;
  const roll = config.rolls?.find(r => r.base === true);
  if (!roll?.parts?.length) return;
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

export function actorDiagnostics(actor) {
  const list = itemsOf(actor);
  const duplicates = Object.keys(I).filter(key => list.filter(i => i.system?.identifier === I[key]).length > 1);
  return { level: pugilistLevel(actor), duplicates, schemaVersions: [...new Set(list.filter(ownedKey).map(i => i.flags[MODULE_ID].schemaVersion))],
    unsupportedFeatures: ['Swagger Streak', 'Compression Lock', 'Stop and Drop', 'Meat Shield (redirecionamento)'] };
}
