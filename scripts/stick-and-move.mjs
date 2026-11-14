import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedMoxie } from './policy.mjs';

const DAS = 'dnd5e-combat';
const ACTIVITY = 'dnd5eactivity002';
const KEY = 'stickMoveIntegration';
const PENDING = 'stickMovePending';
const CHOICES = Object.freeze({ [ACTIVITY]: { choose: ['dash', 'disengage'] } });

const activityFrom = item => item?.system?.activities?.get?.(ACTIVITY) ?? item?.system?.activities?.[ACTIVITY];
const sameChoices = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const currentTurn = (actor, game) => {
  const c = game?.combat;
  if (!c?.started || c.combatant?.actor?.uuid !== actor?.uuid || !c.combatant?.id) return null;
  return `${c.id}:${c.round}:${c.turn}:${c.combatant.id}`;
};

/** Only this exact imported Moxie item is eligible for the opt-in integration.
 * Refuses overwriting other item-level DAS basicActions rules. */
function inspect(actor) {
  if (actor?.type !== 'character') return { status: 'not-character' };
  const item = feature(actor, 'moxie');
  if (!importedMoxie(item)) return { status: 'not-original-moxie' };
  const activity = activityFrom(item);
  const costs = Array.from(activity?.consumption?.targets ?? []);
  if (activity?.type !== 'utility' || activity.activation?.type !== 'bonus' || costs.length !== 1
    || costs[0].type !== 'itemUses' || costs[0].target !== item.id || String(costs[0].value) !== '1'
    || item.system?.uses?.max !== '@scale.pugilist.moxie') return { status: 'unsupported-activity', item, activity };
  const rules = item.flags?.[DAS]?.basicActions;
  const marker = item.flags?.[MODULE_ID]?.[KEY];
  const hasRules = Object.hasOwn(item.flags?.[DAS] ?? {}, 'basicActions');
  const hasMarker = Object.hasOwn(item.flags?.[MODULE_ID] ?? {}, KEY);
  if (hasRules || hasMarker) {
    return { status: hasRules && hasMarker && sameChoices(rules, CHOICES) && marker?.version === 1
      ? 'installed' : 'conflict', item, activity };
  }
  return { status: 'ready', item, activity };
}

/** Preview by default; requires explicit GM approval to change the existing item.
 * It leaves the other DAS item rule `flurry` (One-Two Punch) untouched. */
export async function configureStickAndMove(actor, { apply = false, restore = false, isGM = false } = {}) {
  const checked = inspect(actor);
  const { item, activity } = checked;
  const preview = { status: checked.status, itemId: item?.id ?? null,
    activityId: activity?.id ?? activity?._id ?? null, current: item?.flags?.[DAS]?.basicActions ?? null,
    desired: CHOICES, action: restore ? 'restore' : 'install' };
  if (!apply) return preview;
  if (!isGM || actor?.isOwner !== true) throw new Error('Somente o Mestre com permissão pode configurar Stick and Move.');
  if (restore) {
    if (checked.status !== 'installed') return preview;
    await item.update({ [`flags.${DAS}.-=basicActions`]: null, [`flags.${MODULE_ID}.-=${KEY}`]: null });
    if (actor.getFlag?.(MODULE_ID, PENDING)?.itemId === item.id) await actor.unsetFlag(MODULE_ID, PENDING);
    return { ...preview, status: 'restored' };
  }
  if (checked.status !== 'ready') return preview;
  await item.update({ [`flags.${DAS}.basicActions`]: structuredClone(CHOICES), [`flags.${MODULE_ID}.${KEY}`]: { version: 1 } });
  return { ...preview, status: 'installed' };
}

export function originalStickAllowed(activity) {
  if (!importedMoxie(activity?.item) || activity.id !== ACTIVITY || activity.type !== 'utility') return null;
  const actor = activity.actor ?? activity.item.actor;
  return feature(actor, 'moxie') === activity.item && inspect(actor).status === 'installed';
}

/** DAS recognizes cost:'free' on dnd5e.preUseActivity, and reads this from
 * the resulting usage card. This never modifies DAS's turn flags directly.
 * A cancelled attack leaves the grant pending for the next valid attack. */
export function createStickAndMoveIntegration(env) {
  const checkedTurn = actor => currentTurn(actor, env.game);
  const isNativeStrike = activity => activity?.type === 'attack'
    && activity.activation?.type === 'action'
    && activity.attack?.type?.classification === 'unarmed';

  function preUse(activity, usageConfig) {
    if (!isNativeStrike(activity) || !usageConfig) return;
    const actor = activity.actor;
    const pending = actor?.getFlag?.(MODULE_ID, PENDING);
    if (!pending || !checkedTurn(actor) || pending.turn !== checkedTurn(actor)) return;
    if (inspect(actor).status !== 'installed' || pending.itemId !== feature(actor, 'moxie')?.id) return;
    // Never override a deliberate cost choice by the user or another module.
    if (Object.hasOwn(usageConfig[DAS] ?? {}, 'cost')) return;
    usageConfig[DAS] = { ...(usageConfig[DAS] ?? {}), cost: 'free' };
    usageConfig[MODULE_ID] = { ...(usageConfig[MODULE_ID] ?? {}), stickMoveGrant: pending.messageId };
  }

  async function postUse(activity, usageConfig, results) {
    const actor = activity?.actor;
    const message = results?.message;
    if (!actor || !message?.id) return;
    // The native activity already paid one Moxie and the bonus action.
    if (originalStickAllowed(activity) === true) {
      const chosen = message.getFlag?.(DAS, 'basicChoice') ?? usageConfig?.[DAS]?.basicChoice;
      const turn = checkedTurn(actor);
      if (!turn || !['dash', 'disengage'].includes(chosen)) return;
      await actor.setFlag(MODULE_ID, PENDING, { itemId: activity.item.id, messageId: message.id, turn });
      return;
    }
    if (!isNativeStrike(activity)) return;
    const spentGrant = usageConfig?.[MODULE_ID]?.stickMoveGrant;
    const pending = actor.getFlag?.(MODULE_ID, PENDING);
    if (spentGrant && pending?.messageId === spentGrant && pending.turn === checkedTurn(actor))
      await actor.unsetFlag(MODULE_ID, PENDING);
  }
  return { preUse, postUse };
}
