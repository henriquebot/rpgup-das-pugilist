import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedBloodied, pugilistLevel } from './policy.mjs';

const REGULAR = 'dnd5eactivity000';
const BLOODIED = 'dnd5eactivity001';
const ACTIVITY_IDS = [REGULAR, BLOODIED];
const MARKER = 'bloodiedMigration';
const DAMAGE = 'bloodiedDamage';
const USED = 'bloodiedUsedDamage';
const REACTION_WINDOW_MS = 120000;
const activityFrom = (item, id) => item?.system?.activities?.get?.(id) ?? item?.system?.activities?.[id];
const costsOf = activity => Array.from(activity?.consumption?.targets ?? []);
const copy = data => structuredClone(data);

/** Read-only recognition. Never change Plutonium's HTML or heal formula. */
function inspect(actor) {
  if (actor?.type !== 'character') return { status: 'not-character' };
  const item = feature(actor, 'bloodied');
  if (!importedBloodied(item)) return { status: 'not-original-bloodied' };
  const moxie = feature(actor, 'moxie');
  if (!moxie) return { status: 'missing-moxie', item };
  const first = activityFrom(item, REGULAR), second = activityFrom(item, BLOODIED);
  const activities = [first, second];
  const recovery = Array.from(item.system?.uses?.recovery ?? []);
  const correctShape = first?.type === 'utility' && second?.type === 'heal'
    && activities.every(a => a?.activation?.type === 'reaction'
      && costsOf(a).length === 1 && costsOf(a)[0].type === 'itemUses'
      && String(costsOf(a)[0].value) === '1')
    && item.system?.uses?.max === '1'
    && recovery.some(r => r.period === 'sr' && r.type === 'recoverAll')
    && second.healing?.custom?.enabled === true
    && second.healing?.custom?.formula === '@classes.pugilist.levels * 4'
    && Array.from(second.healing?.types ?? []).includes('temphp');
  if (!correctShape) return { status: 'unsupported-activity', item, moxie, activities };
  const targets = activities.map(a => costsOf(a)[0].target);
  const marker = item.flags?.[MODULE_ID]?.[MARKER];
  const flagged = Object.hasOwn(item.flags?.[MODULE_ID] ?? {}, MARKER);
  const backup = marker?.version === 1 && Array.isArray(marker?.targets)
    && marker.targets.length === 2 && marker.targets.every(target => target === moxie.id);
  if (flagged) return { status: backup && targets.every(target => target === item.id)
    ? 'installed' : 'conflict', item, moxie, activities };
  if (targets.every(target => target === moxie.id)) return { status: 'ready', item, moxie, activities };
  return { status: 'conflict', item, moxie, activities };
}

/** Preview by default; migrate the two WRONG costs from Moxie to this feat's
 * once-per-short-rest itemUses. The original activities remain on the item. */
export async function configureBloodied(actor, { apply = false, restore = false, isGM = false } = {}) {
  const state = inspect(actor);
  const item = state.item;
  const preview = { status: state.status, itemId: item?.id ?? null,
    activities: (state.activities ?? []).map(a => ({ id: a?.id ?? a?._id,
      type: a?.type, from: costsOf(a)[0]?.target ?? null,
      to: restore ? state.moxie?.id ?? null : item?.id ?? null })),
    action: restore ? 'restore' : 'migrate' };
  if (!apply) return preview;
  if (!isGM || actor?.isOwner !== true) throw new Error('Somente o Mestre pode corrigir Bloodied But Unbowed.');
  if (restore) {
    if (state.status !== 'installed') return preview;
    const targets = item.flags[MODULE_ID][MARKER].targets;
    await item.update({
      [`system.activities.${REGULAR}.consumption.targets`]: [{ ...copy(costsOf(state.activities[0])[0]), target: targets[0] }],
      [`system.activities.${BLOODIED}.consumption.targets`]: [{ ...copy(costsOf(state.activities[1])[0]), target: targets[1] }],
      [`flags.${MODULE_ID}.-=${MARKER}`]: null
    });
    return { ...preview, status: 'restored' };
  }
  if (state.status !== 'ready') return preview;
  await item.update({
    [`system.activities.${REGULAR}.consumption.targets`]: [{ ...copy(costsOf(state.activities[0])[0]), target: item.id }],
    [`system.activities.${BLOODIED}.consumption.targets`]: [{ ...copy(costsOf(state.activities[1])[0]), target: item.id }],
    [`flags.${MODULE_ID}.${MARKER}`]: { version: 1, targets: state.activities.map(a => costsOf(a)[0].target) }
  });
  return { ...preview, status: 'installed' };
}

export const originalBloodiedConfigured = actor => inspect(actor).status === 'installed';

/** Written into the SAME damage update, no additional HP write, and only for
 * a genuine reduction of HP or temporary HP. Not invoked for healing rolls. */
export function markBloodiedDamage(actor, amount, updates, at = Date.now()) {
  if (!(Number(amount) > 0) || !originalBloodiedConfigured(actor) || !updates) return;
  const hp = actor.system?.attributes?.hp;
  if (!hp) return;
  const nextHp = Number(updates['system.attributes.hp.value']);
  const nextTemp = Number(updates['system.attributes.hp.temp']);
  if (!(nextHp < Number(hp.value) || nextTemp < Number(hp.temp))) return;
  const prev = actor.getFlag?.(MODULE_ID, DAMAGE) ?? actor.flags?.[MODULE_ID]?.[DAMAGE];
  updates[`flags.${MODULE_ID}.${DAMAGE}`] = { seq: (Number(prev?.seq) || 0) + 1, at };
}

function lastDamage(actor) {
  return actor?.getFlag?.(MODULE_ID, DAMAGE) ?? actor?.flags?.[MODULE_ID]?.[DAMAGE];
}
function lastUsed(actor) {
  return actor?.getFlag?.(MODULE_ID, USED) ?? actor?.flags?.[MODULE_ID]?.[USED];
}
export function pendingBloodiedDamage(actor, at = Date.now()) {
  const e = lastDamage(actor);
  return e && Number.isInteger(e.seq) && e.seq > 0
    && Number.isFinite(e.at) && at >= e.at - 10000
    && at - e.at <= REACTION_WINDOW_MS && e.seq !== lastUsed(actor) ? e : null;
}

export function originalBloodiedAllowed(activity, { requireUnspent = true, at = Date.now() } = {}) {
  if (!importedBloodied(activity?.item) || !ACTIVITY_IDS.includes(activity?.id)) return false;
  const actor = activity.actor ?? activity.item.actor;
  if (!originalBloodiedConfigured(actor) || feature(actor, 'bloodied') !== activity.item
    || !feature(actor, 'moxie') || !pendingBloodiedDamage(actor, at)) return false;
  const spent = Number(activity.item.system?.uses?.spent ?? 0);
  if (requireUnspent && spent >= 1) return false;
  const hp = actor.system?.attributes?.hp;
  const max = Number(hp?.max), value = Number(hp?.value);
  if (!(max > 0) || !Number.isFinite(value)) return false;
  return (activity.id === BLOODIED) === (value <= max / 2);
}

/** Recognize the *native* healing roll from imported Bloodied only.
 * The dnd5e heal activity rolls and applies 4 × level. Never grant it again. */
export function isBloodiedHealing(activity, recipient) {
  if (!recipient || !activity || activity.type !== 'heal'
    || activity.id !== BLOODIED || activity.actor?.uuid !== recipient.uuid) return false;
  if (!Array.from(activity.healing?.types ?? []).includes('temphp')) return false;
  return originalBloodiedConfigured(recipient) && activity.item === feature(recipient, 'bloodied');
}

export function usedDamagePatch(actor) {
  const event = lastDamage(actor);
  return event ? { [`flags.${MODULE_ID}.${USED}`]: event.seq } : {};
}
