import { fisticuffsEligible } from './policy.mjs';

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
