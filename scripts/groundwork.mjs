import { MODULE_ID, ACTIVITY_IDS as A } from '../src/ids.mjs';
import { feature, importedGroundwork } from './policy.mjs';

const DAS = 'dnd5e-combat';
const MARK = 'groundworkIntegration';
const IDS = [A.compression, A.inescapable];
const data = (item, id) => item?.system?.activities?.get?.(id) ?? item?.system?.activities?.[id] ?? null;

const compression = () => ({
  _id: A.compression, name: 'Compression Lock', type: 'damage', sort: 0,
  activation: { type: 'special', value: 1, override: false, condition: '' },
  consumption: { targets: [], scaling: { allowed: false }, spellSlot: false },
  damage: { critical: { allow: false, bonus: '' }, parts: [{
    number: null, denomination: null, bonus: '', types: ['bludgeoning'],
    custom: { enabled: true, formula: '@scale.pugilist.fisticuffs + @abilities.str.mod' },
    scaling: { mode: '', number: 1, formula: '' }
  }] },
  target: { affects: { count: '', type: 'creature', choice: false, special: 'Criaturas agarradas por você' },
    template: { type: '', units: 'ft', contiguous: false }, override: false, prompt: false },
  effects: [], range: { override: true, units: 'touch', value: null, special: '' },
  duration: { value: '', units: 'inst', concentration: false, override: false },
  description: { chatFlavor: '' }
});
const inescapable = moxie => ({
  _id: A.inescapable, name: 'Inescapable', type: 'utility', sort: 1,
  activation: { type: 'special', value: 1, override: false, condition: '' },
  consumption: { targets: [{ type: 'itemUses', target: moxie.id, value: '1',
    scaling: { mode: '', formula: '' } }], scaling: { allowed: false }, spellSlot: false },
  roll: { formula: '', name: '', prompt: false, visible: false },
  effects: [], duration: { value: '', units: 'inst', concentration: false, override: false },
  description: { chatFlavor: '' }
});

/** Inspect without changing the original 5etools item. Refuse conflicts. */
export function inspectGroundwork(actor) {
  const item = feature(actor, 'groundwork');
  if (!importedGroundwork(item)) return { status: 'not-imported-groundwork' };
  const moxie = feature(actor, 'moxie');
  if (!moxie) return { status: 'missing-moxie', item };
  const has = IDS.map(id => Boolean(data(item, id)));
  const layer = item.flags?.[DAS] ?? {};
  const mark = item.flags?.[MODULE_ID]?.[MARK];
  const rule = layer.inescapable;
  const flagged = Object.hasOwn(item.flags?.[MODULE_ID] ?? {}, MARK);
  const hasRule = Object.hasOwn(layer, 'inescapable');
  if (flagged || hasRule || has.some(Boolean)) {
    const a = data(item, A.compression), b = data(item, A.inescapable);
    const costs = Array.from(b?.consumption?.targets ?? []);
    const valid = mark?.version === 1 && has.every(Boolean)
      && a.type === 'damage' && b.type === 'utility'
      && a.damage?.parts?.[0]?.custom?.formula === '@scale.pugilist.fisticuffs + @abilities.str.mod'
      && Array.from(a.consumption?.targets ?? []).length === 0
      && costs.length === 1 && costs[0].type === 'itemUses'
      && costs[0].target === moxie.id && String(costs[0].value) === '1'
      && rule?.activity === A.inescapable && Object.keys(rule).length === 1;
    return { status: valid ? 'installed' : 'conflict', item, moxie };
  }
  return { status: 'ready', item, moxie };
}

/** This is NOT an action. Compression Lock is emitted as a no-cost usage card
 * at turn start; DAS spends Inescapable's Moxie directly before the save.
 * Clicking either activity manually must never create extra uses. */
export function originalGroundworkActivityAllowed(activity) {
  if (!importedGroundwork(activity?.item) || !IDS.includes(activity?.id)) return null;
  return false;
}

/** Read-only preview by default. apply=true is an explicit GM migration.
 * No original description, advancement or pre-existing activities are edited. */
export async function configureGroundwork(actor, { apply = false, restore = false, isGM = false } = {}) {
  const inspected = inspectGroundwork(actor);
  const { item, moxie } = inspected;
  const result = { status: inspected.status, itemId: item?.id ?? null,
    activities: IDS, moxieId: moxie?.id ?? null,
    action: restore ? 'restore' : 'install' };
  if (!apply) return result;
  if (!isGM || actor?.isOwner !== true) throw new Error('Somente o Mestre pode configurar Groundwork.');
  if (restore) {
    if (inspected.status !== 'installed') return result;
    await item.update({
      [`system.activities.-=${A.compression}`]: null,
      [`system.activities.-=${A.inescapable}`]: null,
      [`flags.${DAS}.-=inescapable`]: null,
      [`flags.${MODULE_ID}.-=${MARK}`]: null
    });
    return { ...result, status: 'restored' };
  }
  if (inspected.status !== 'ready') return result;
  await item.update({
    [`system.activities.${A.compression}`]: compression(),
    [`system.activities.${A.inescapable}`]: inescapable(moxie),
    [`flags.${DAS}.inescapable`]: { activity: A.inescapable },
    [`flags.${MODULE_ID}.${MARK}`]: { version: 1 }
  });
  return { ...result, status: 'installed' };
}
