import { fisticuffsEligible, feature } from './policy.mjs';

/** Native improvised weapons do not map to the simple-weapon proficiency.
 * Add their class training only when the prepared native weapon has no
 * proficiency. The standard builder merges these occurrence parts/data. */
export function applyImprovisedTraining(config) {
  const activity = config?.subject;
  const weapon = activity?.item;
  if (activity?.type !== 'attack' || weapon?.type !== 'weapon' || weapon.system?.type?.value !== 'improv'
      || activity.attack?.type?.classification !== 'weapon' || activity.attack.flat
      || !feature(activity.actor, 'fisticuffs') || weapon.system?.prof?.hasProficiency !== false) return;
  const roll = config.rolls?.[0];
  const proficiency = Number(activity.actor.system?.attributes?.prof);
  if (!roll || !(proficiency > 0)) return;
  roll.parts ??= [];
  if (!roll.parts.includes('@rpgupPugilistProf')) roll.parts.push('@rpgupPugilistProf');
  roll.data ??= {};
  roll.data.rpgupPugilistProf = proficiency;
}

/**
 * Native public hook: dnd5e.preRollAttackV2(config, dialog, message).
 * dnd5e 6.0.6 carries config.mastery into the roll options and then
 * message.system.mastery; DAS owns the hit/miss, Sap mark, and its expiry.
 * Only the occurrence is changed. No weapon data or proficiency is rewritten.
 */
export function applyImprovisedSap(config) {
  const activity = config?.subject;
  const item = activity?.item;
  if (activity?.type !== 'attack' || item?.type !== 'weapon'
      || item.system?.type?.value !== 'improv'
      || activity.attack?.type?.classification !== 'weapon'
      || !fisticuffsEligible(activity.actor)) return;
  // A caller's explicit mastery (including false/empty) remains its decision.
  config.mastery ??= 'sap';
}
