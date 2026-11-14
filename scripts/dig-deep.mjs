import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedDigDeep } from './policy.mjs';
import { sourceUsesMax } from './uses-source.mjs';

const BASE = 'dnd5eactivity000';
const RECHARGE = 'dnd5eactivity001';
const MARKER = 'digDeepMigration';
const RECHARGE_EFFECT_ID = 'DsBQqR6L92pVrZJR';
const RESISTANCES = ['bludgeoning', 'piercing', 'slashing'];
const BONUSES = [
  'system.bonuses.msak.attack', 'system.bonuses.mwak.attack',
  'system.bonuses.rwak.attack', 'system.bonuses.rsak.attack',
  'system.bonuses.abilities.check', 'system.bonuses.abilities.save'
];
const SLOW = 'system.attributes.movement.bonus';
const IMMUNITY = `flags.${MODULE_ID}.ignoreExhaustion`;
const clone = value => structuredClone(value);
const values = collection => Array.from(collection?.values?.() ?? collection ?? []);
const activityOf = (item, id) => item?.system?.activities?.get?.(id) ?? item?.system?.activities?.[id];
const idOf = effect => effect?.id ?? effect?._id;
const effectOf = item => values(item?.effects).filter(e => e.flags?.plutonium?.dedupeId === 'dig-deep');
const plain = d => d?.toObject?.() ?? d;
const changesOf = effect => clone(plain(effect)?.system?.changes ?? values(effect?.system?.changes).map(plain));
const targetsOf = activity => values(activity?.consumption?.targets).map(v => clone(plain(v)));
const linksOf = activity => values(activity?.effects).map(v => clone(plain(v)));
const usesSource = item => String(sourceUsesMax(item)) === '1'
  && values(item.system?.uses?.recovery).some(r => r.period === 'lr' && r.type === 'recoverAll');
const isRegular = (activity, effectId) => activity?.type === 'utility' && activity.activation?.type === 'bonus'
  && targetsOf(activity).length === 1 && targetsOf(activity)[0].type === 'itemUses'
  && !targetsOf(activity)[0].target && String(targetsOf(activity)[0].value) === '1'
  && linksOf(activity).length === 1 && linksOf(activity)[0]?._id === effectId;
const isLegacyRecharge = (activity, effectId) => activity?.type === 'utility'
  && activity.activation?.type === 'bonus' && targetsOf(activity).length === 1
  && targetsOf(activity)[0].type === 'attribute'
  && targetsOf(activity)[0].target === 'attributes.exhaustion'
  && String(targetsOf(activity)[0].value) === '-1'
  && linksOf(activity).length === 1 && linksOf(activity)[0]?._id === effectId;
const isFixedRecharge = activity => activity?.type === 'utility'
  && activity.activation?.type === 'special' && linksOf(activity).length === 0
  && targetsOf(activity).length === 2
  && targetsOf(activity)[0].type === 'attribute'
  && targetsOf(activity)[0].target === 'attributes.exhaustion'
  && String(targetsOf(activity)[0].value) === '-1'
  && targetsOf(activity)[1].type === 'itemUses'
  && !targetsOf(activity)[1].target && String(targetsOf(activity)[1].value) === '-1';

const normalize = changes => changes.map(c => [c.key, c.type, String(c.value)]).sort((a,b)=>a[0].localeCompare(b[0]));
function legacyChanges(changes) {
  const expected = [
    ...RESISTANCES.map(v => ['system.traits.dr.value', 'add', v]),
    ...BONUSES.map(key => [key, 'add', '@attributes.exhaustion * 2']),
    [SLOW, 'add', '@attributes.exhaustion * 5']
  ].sort((a,b)=>a[0].localeCompare(b[0]));
  return Array.isArray(changes) && changes.length === 10
    && JSON.stringify(normalize(changes)) === JSON.stringify(expected);
}
function patchedChanges(changes) {
  return Array.isArray(changes) && changes.length === 4
    && RESISTANCES.every(value => changes.some(c => c.key === 'system.traits.dr.value' && c.value === value && c.type === 'add'))
    && changes.some(c => c.key === IMMUNITY && c.type === 'custom' && c.value === 'true');
}
function newChanges(original) {
  const resist = original.filter(c => c.key === 'system.traits.dr.value').map(clone);
  const custom = { ...clone(original.find(c => c.key === SLOW)),
    key: IMMUNITY, type: 'custom', value: 'true', priority: 20, phase: 'initial' };
  return [...resist, custom];
}
function source(actor) {
  if (actor?.type !== 'character') return { status: 'not-character' };
  const item = feature(actor, 'digDeep');
  if (!importedDigDeep(item)) return { status: 'not-original-dig-deep' };
  if (!usesSource(item)) return { status: 'unsupported-uses', item };
  const effects = effectOf(item);
  if (effects.length !== 1) return { status: 'ambiguous-effect', item };
  const effect = effects[0], effectId = idOf(effect);
  if (effect.type !== 'base' || effect.transfer || effect.disabled
      || Number(effect.duration?.value) !== 600 || effect.duration?.units !== 'seconds'
      || !effectId) return { status: 'unsupported-effect', item };
  const normal = activityOf(item, BASE), recharge = activityOf(item, RECHARGE);
  if (!isRegular(normal, effectId)) return { status: 'unsupported-regular', item };
  const changes = changesOf(effect);
  const marker = item.flags?.[MODULE_ID]?.[MARKER] ?? null;
  if (marker) {
    const valid = marker.version === 1 && marker.effectId === effectId
      && Array.isArray(marker.changes) && legacyChanges(marker.changes)
      && marker.activation === 'bonus' && Array.isArray(marker.targets)
      && marker.targets.length === 1 && Array.isArray(marker.effects)
      && marker.effects.length === 1 && marker.effects[0]?._id === effectId
      && patchedChanges(changes) && isFixedRecharge(recharge);
    return { status: valid ? 'installed' : 'conflict', item, effect, normal, recharge, changes, marker };
  }
  if (!legacyChanges(changes) || !isLegacyRecharge(recharge, effectId))
    return { status: 'unsupported-original', item, effect };
  // Never migrate while an old, already-applied actor effect is active.
  const active = values(actor.effects).some(e => e.origin?.includes?.(`Item.${item.id}`)
    && (e.name === effect.name || e.flags?.plutonium?.dedupeId === 'dig-deep'));
  if (active) return { status: 'active-effect-present', item, effect };
  return { status: 'ready', item, effect, normal, recharge, changes };
}

export function inspectDigDeep(actor) {
  const s = source(actor);
  return { status: s.status, itemId: s.item?.id ?? null, effectId: idOf(s.effect) ?? null,
    regularActivityId: s.normal?.id ?? s.normal?._id ?? null,
    rechargeActivityId: s.recharge?.id ?? s.recharge?._id ?? null,
    spent: s.item ? Number(s.item.system?.uses?.spent ?? 0) : null,
    exhaustion: Number(actor?.system?.attributes?.exhaustion ?? 0),
    suppressesExhaustion: s.status === 'installed' };
}

/** Only the two imported activities. The original Regular keeps its native
 * bonus-action use and 10-minute resistances. The exhaustion recharge is
 * a SPECIAL no-action use that both adds 1 Exhaustion and refunds a use. */
export function originalDigDeepActivityAllowed(activity) {
  if (!importedDigDeep(activity?.item) || ![BASE, RECHARGE].includes(activity.id)) return null;
  const actor = activity.actor ?? activity.item.actor;
  const data = source(actor);
  if (data.status !== 'installed' || data.item !== activity.item) return false;
  const spent = Number(data.item.system?.uses?.spent ?? 0);
  if (!Number.isInteger(spent) || spent < 0 || spent > 1) return false;
  if (activity.id === BASE) return spent === 0;
  const exhaustion = Number(actor.system?.attributes?.exhaustion);
  // Never let the automated recharge cause the lethal sixth level.
  return spent === 1 && Number.isInteger(exhaustion) && exhaustion >= 0 && exhaustion < 5;
}

async function updatePair(item, effect, nextEffect, nextItem, rollbackEffect) {
  const id = idOf(effect);
  await item.updateEmbeddedDocuments('ActiveEffect', [{ _id: id, 'system.changes': nextEffect }]);
  try { await item.update(nextItem); }
  catch (error) {
    try { await item.updateEmbeddedDocuments('ActiveEffect', [{ _id: id, 'system.changes': rollbackEffect }]); }
    catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'Dig Deep: falha na migração e na reversão do efeito. Verifique a ficha.');
    }
    throw error;
  }
}

/** GM preview by default; migrate only if both native imported activities and
 * the effect match the exact audit. Changes are individually reversible. */
export async function configureDigDeep(actor, { apply = false, restore = false, isGM = false } = {}) {
  const s = source(actor);
  const preview = { ...inspectDigDeep(actor), action: restore ? 'restore' : 'install' };
  if (!apply) return preview;
  if (!isGM || actor?.isOwner !== true) throw new Error('Somente o Mestre pode corrigir Dig Deep.');
  if (restore) {
    if (s.status !== 'installed') return preview;
    const backup = s.marker;
    const oldEffect = changesOf(s.effect);
    await updatePair(s.item, s.effect, clone(backup.changes), {
      [`system.activities.${RECHARGE}.activation.type`]: backup.activation,
      [`system.activities.${RECHARGE}.consumption.targets`]: clone(backup.targets),
      [`system.activities.${RECHARGE}.effects`]: clone(backup.effects),
      [`flags.${MODULE_ID}.-=${MARKER}`]: null
    }, oldEffect);
    return { ...preview, status: 'restored' };
  }
  if (s.status !== 'ready') return preview;
  const previous = { version: 1, effectId: idOf(s.effect), changes: clone(s.changes),
    activation: s.recharge.activation.type, targets: targetsOf(s.recharge), effects: linksOf(s.recharge) };
  const fixed = targetsOf(s.recharge);
  fixed.push({ type: 'itemUses', target: '', value: '-1', scaling: {} });
  await updatePair(s.item, s.effect, newChanges(s.changes), {
    [`system.activities.${RECHARGE}.activation.type`]: 'special',
    [`system.activities.${RECHARGE}.consumption.targets`]: fixed,
    [`system.activities.${RECHARGE}.effects`]: [],
    [`flags.${MODULE_ID}.${MARKER}`]: previous
  }, s.changes);
  return { ...preview, status: 'installed' };
}
