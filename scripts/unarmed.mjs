import { MODULE_ID } from '../src/ids.mjs';

const DAS = 'dnd5e-combat';
const ORIGINAL_ATTACK = 'dnd5eactivity000';
const ORIGINAL_BONUS = 'dnd5eactivity001';
const LEGACY_SAVES = Object.freeze(Array.from({ length: 6 }, (_, i) => `dnd5eactivity00${i + 2}`));
const SAVE = 'dnd5eCombatGrShv';
const EFFECTS = ['dnd5eCombatGrapl', 'dnd5eCombatProne', 'dnd5eCombatPush0'];
const itemsOf = actor => Array.from(actor?.items ?? []);
const entries = col => Array.from(col?.values?.() ?? Object.values(col ?? {}));
const activityOf = (item, id) => item?.system?.activities?.get?.(id) ?? item?.system?.activities?.[id] ?? null;
const targetsOf = activity => entries(activity?.consumption?.targets);

/** Exact source identity; names/translations do not participate. */
export const importedUnarmed = item => item?.type === 'weapon'
  && item.system?.identifier === 'unarmed-strike-pugilist'
  && item.flags?.plutonium?.source === 'Pugilist2024'
  && item.flags.plutonium.page === 'items.html'
  && item.flags.plutonium.hash === 'unarmed%20strike%20(pugilist)_pugilist2024';

const correctAttack = (activity, activation) => activity?.type === 'attack'
  && activity.activation?.type === activation
  && activity.attack?.type?.classification === 'unarmed'
  && activity.attack?.type?.value === 'melee'
  && activity.damage?.includeBase === true
  && targetsOf(activity).length === 0;

/** Check original Pugilist action/bonus activities without editing them. */
export function originalStrikeReady(item) {
  if (!importedUnarmed(item)) return false;
  if (item.system?.damage?.base?.custom?.enabled !== true
    || item.system.damage.base.custom.formula !== '@scale.pugilist.fisticuffs + @mod') return false;
  return correctAttack(activityOf(item, ORIGINAL_ATTACK), 'action')
    && correctAttack(activityOf(item, ORIGINAL_BONUS), 'bonus');
}

/** Use the already-present DAS Unarmed Strike for Grapple/Shove. The six
 * imported save activities are retained but never directly executed: their
 * split STR/DEX DCs and missing push effect are not the DAS 2024 rule. */
export function nativeGrappleShoveReady(actor) {
  const matches = itemsOf(actor).filter(item => item.type === 'weapon'
    && item.system?.identifier === 'unarmed-strike'
    && item.flags?.[DAS]?.basicAction === 'unarmed');
  if (matches.length !== 1) return false;
  const item = matches[0];
  const save = activityOf(item, SAVE);
  const effects = entries(save?.effects).map(e => e?._id ?? e?.id);
  const abilities = entries(save?.save?.ability);
  const push = entries(item.effects).find(e => (e.id ?? e._id) === 'dnd5eCombatPush0')?.flags?.[DAS]?.push;
  return save?.type === 'save' && save.activation?.type === 'action'
    && JSON.stringify(abilities) === JSON.stringify(['str', 'dex'])
    && save.save?.dc?.calculation === 'str'
    && targetsOf(save).length === 0
    && effects.length === 3 && EFFECTS.every(id => effects.includes(id))
    && push?.distance === 5 && push.units === 'ft';
}

export function inspectUnarmed(actor) {
  const items = itemsOf(actor);
  const original = items.filter(importedUnarmed);
  const addon = items.filter(item => item?.flags?.[MODULE_ID]?.key === 'unarmed'
    && item.system?.identifier === 'unarmed-strike');
  const native = items.filter(item => item?.type === 'weapon'
    && item.system?.identifier === 'unarmed-strike' && item.flags?.[DAS]?.basicAction === 'unarmed');
  const source = original.length === 1 ? original[0] : null;
  const ready = Boolean(source && originalStrikeReady(source));
  const nativeReady = nativeGrappleShoveReady(actor);
  return {
    source: source ? '5etools/Plutonium' : addon.length === 1 ? 'RPGUp' : 'ausente',
    originalCount: original.length, addonCount: addon.length, nativeDASCount: native.length,
    originalId: source?.id ?? null, originalAttackReady: ready,
    attackId: ready ? ORIGINAL_ATTACK : null,
    bonusAttackId: ready ? ORIGINAL_BONUS : null,
    nativeGrappleShoveReady: nativeReady,
    nativeGrappleShoveActivityId: nativeReady ? SAVE : null,
    blockedImportedSaves: source ? [...LEGACY_SAVES] : [],
    requiresReview: original.length > 1 || addon.length > 1 || (source !== null && (!ready || !nativeReady))
  };
}
