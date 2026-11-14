import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedMoxie } from './policy.mjs';
import { sourceUsesMax } from './uses-source.mjs';

const DAS = 'dnd5e-combat';
const ACTIVITY = 'dnd5eactivity001';
const RULE = Object.freeze({ activity: ACTIVITY, strikes: 2 });

/** Only accept Kyros-style Plutonium One-Two Punch. The source item retains
 * its native bonus-action activation, itemUses spending and readable HTML.
 * This code changes only a single DAS item-content flag (and a marker to
 * remove exactly that flag later). It never changes global DAS content. */
function inspect(actor) {
  if (actor?.type !== 'character') return { status: 'not-character' };
  const item = feature(actor, 'moxie');
  if (!importedMoxie(item)) return { status: 'not-original-moxie' };
  const activity = item.system?.activities?.get?.(ACTIVITY) ?? item.system?.activities?.[ACTIVITY];
  const targets = Array.from(activity?.consumption?.targets ?? []);
  const recovery = Array.from(item.system?.uses?.recovery ?? []);
  const hasNativeCost = targets.length === 1 && targets[0].type === 'itemUses'
    && targets[0].target === item.id && String(targets[0].value) === '1';
  if (activity?.type !== 'utility' || activity.activation?.type !== 'bonus'
    || !hasNativeCost || sourceUsesMax(item) !== '@scale.pugilist.moxie'
    || !recovery.some(r => r.period === 'sr' && r.type === 'recoverAll'))
    return { status: 'unsupported-activity', item, activity };

  const flurry = item.flags?.[DAS]?.flurry;
  const marker = item.flags?.[MODULE_ID]?.oneTwoIntegration;
  const hasFlurry = Object.hasOwn(item.flags?.[DAS] ?? {}, 'flurry');
  const hasMarker = Object.hasOwn(item.flags?.[MODULE_ID] ?? {}, 'oneTwoIntegration');
  const exact = flurry?.activity === ACTIVITY && flurry?.strikes === 2
    && flurry?.weapons !== true && Object.keys(flurry).every(key => ['activity', 'strikes'].includes(key));
  if (hasFlurry || hasMarker) {
    return { status: hasFlurry && hasMarker && exact && marker?.version === 1
      ? 'installed' : 'conflict', item, activity };
  }
  return { status: 'ready', item, activity };
}

/** Read-only by default: api.oneTwoPunch(actor).
 * GM opt-in: api.oneTwoPunch(actor,{apply:true}).
 * Undo: api.oneTwoPunch(actor,{apply:true,restore:true}). */
export async function configureOneTwoPunch(actor, { apply = false, restore = false, isGM = false } = {}) {
  const current = inspect(actor);
  const { item } = current;
  const preview = { status: current.status, itemId: item?.id ?? null,
    activityId: current.activity?.id ?? current.activity?._id ?? null,
    current: item?.flags?.[DAS]?.flurry ?? null,
    desired: RULE, action: restore ? 'restore' : 'install' };
  if (!apply) return preview;
  if (!isGM || actor?.isOwner !== true) throw new Error('Somente o Mestre com acesso ao personagem pode aplicar esta configuração.');
  if (restore) {
    if (current.status !== 'installed') return preview;
    await item.update({
      [`flags.${DAS}.-=flurry`]: null,
      [`flags.${MODULE_ID}.-=oneTwoIntegration`]: null
    });
    return { ...preview, status: 'restored' };
  }
  if (current.status !== 'ready') return preview;
  await item.update({
    [`flags.${DAS}.flurry`]: { ...RULE },
    [`flags.${MODULE_ID}.oneTwoIntegration`]: { version: 1 }
  });
  return { ...preview, status: 'installed' };
}
