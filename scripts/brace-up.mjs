import { ACTIVITY_IDS as A } from '../src/ids.mjs';
import { feature, importedMoxie, ownedKey } from './policy.mjs';

/** Resolve a healing roll's originating activity via dnd5e 6.0.6 public APIs. */
export function sourceHealingActivity(options = {}) {
  const message = options?.originatingMessage ?? options?.origin;
  return message?.getAssociatedActivity?.()
    ?? message?.getOriginatingMessage?.()?.getAssociatedActivity?.()
    ?? null;
}
const contains = (values, value) => values?.has?.(value) === true
  || values?.includes?.(value) === true;

/** Recognize only the original Pugilist Brace Up or the separate fallback. */
export function isBraceUpHealing(activity, recipient) {
  if (!activity || activity.type !== 'heal' || !recipient || activity.actor?.uuid !== recipient.uuid) return false;
  if (!contains(activity.healing?.types, 'temphp')) return false;
  const item = activity.item;
  if (importedMoxie(item)) {
    return feature(recipient, 'moxie') === item && activity.id === 'dnd5eactivity000';
  }
  return ownedKey(item) === 'braceUp'
    && !importedMoxie(feature(recipient, 'moxie'))
    && feature(recipient, 'braceUp') === item && activity.id === A.braceUp;
}
