import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedSwagger, pugilistLevel } from './policy.mjs';
import { sourceUsesMax } from './uses-source.mjs';

export const ORIGINAL_SWAGGER_USE = 'dnd5eactivity000';
export const ORIGINAL_SWAGGER_END = 'dnd5eactivity001';
const CORE = 'dnd5e-combat';
const activityOf = (item, id) => item?.system?.activities?.get?.(id) ?? item?.system?.activities?.[id] ?? null;
const costs = a => Array.from(a?.consumption?.targets ?? []);
const spent = item => Number(item?.system?.uses?.spent ?? 0);
const maxMoxie = level => level < 2 ? 0 : level >= 6 ? 4 : level >= 4 ? 3 : 2;
const available = (item, level) => {
  const value = Number(item?.system?.uses?.value);
  if (Number.isFinite(value)) return value;
  return maxMoxie(level) - spent(item);
};

/** Fail closed unless both ORIGINAL 5etools activities and their costs agree
 * with the Kyros audit. No changes to HTML or activity documents. */
export function originalSwaggerSetup(actor) {
  const item = feature(actor, 'swagger');
  if (!importedSwagger(item)) return null;
  const moxie = feature(actor, 'moxie');
  const use = activityOf(item, ORIGINAL_SWAGGER_USE);
  const end = activityOf(item, ORIGINAL_SWAGGER_END);
  if (!moxie || !use || !end || use.type !== 'utility' || end.type !== 'utility'
      || use.activation?.type !== 'special' || end.activation?.type !== 'special'
      || use.roll?.formula !== '@scale.pugilist.fisticuffs'
      || String(sourceUsesMax(item)) !== '1'
      || !Array.from(item.system.uses?.recovery ?? []).some(r => r.period === 'sr' && r.type === 'recoverAll')) return null;
  const a = costs(use), b = costs(end);
  if (a.length !== 1 || a[0]?.type !== 'itemUses' || a[0]?.target !== moxie.id || String(a[0]?.value) !== '1'
      || b.length !== 2 || b[0]?.type !== 'itemUses' || b[0]?.target !== moxie.id
      || String(b[0]?.value) !== '-1' || b[1]?.type !== 'itemUses' || b[1]?.target
      || String(b[1]?.value) !== '1') return null;
  return { item, moxie, use, end };
}

/** Only the verified automated follow-up can use the imported utility cards. */
export function originalSwaggerAllowed(activity, config = {}) {
  if (!importedSwagger(activity?.item)) return null;
  if (![ORIGINAL_SWAGGER_USE, ORIGINAL_SWAGGER_END].includes(activity.id)) return null;
  const pair = originalSwaggerSetup(activity.actor ?? activity.item.actor);
  if (!pair || pair.item !== activity.item) return false;
  const mode = config?.[MODULE_ID]?.automation;
  return activity.id === ORIGINAL_SWAGGER_USE
    ? mode === 'swaggerUse' && spent(pair.item) === 0 && available(pair.moxie, pugilistLevel(activity.actor)) >= 1
    : mode === 'swaggerEnd';
}

/** Uses the SAME two imported 5etools Utility activities and resource targets.
 * rollFormula posts the original Fisticuffs-die roll; use() pays 1 Moxie;
 * End Streak refunds it and spends the feature's one/rest use if still failed.
 * Does not rewrite the original check or claim to have changed its chat card. */
export async function resolveOriginalSwagger(actor, { total, dc } = {}) {
  const pair = originalSwaggerSetup(actor);
  if (!pair) return { status: 'unsupported-original' };
  const { item, moxie, use, end } = pair;
  if (!Number.isFinite(total) || !Number.isFinite(dc) || total >= dc)
    return { status: 'not-confirmed-failure' };
  if (spent(item) >= 1 || available(moxie, pugilistLevel(actor)) < 1)
    return { status: 'no-uses' };
  if (typeof use.rollFormula !== 'function' || typeof use.use !== 'function' || typeof end.use !== 'function')
    return { status: 'missing-native-method' };

  // First confirm a real die result. If the roll is cancelled, no resources are spent.
  const rolls = await use.rollFormula({}, { configure: false });
  const bonus = Number(rolls?.[0]?.total);
  if (!Array.isArray(rolls) || !rolls.length || !Number.isFinite(bonus) || bonus < 1)
    return { status: 'roll-cancelled' };
  const paid = await use.use({ [CORE]: { confirmed: true }, [MODULE_ID]: { automation: 'swaggerUse' },
    subsequentActions: false }, { configure: false });
  if (!paid) return { status: 'payment-cancelled' };

  const result = { total, bonus, adjusted: total + bonus, dc, success: total + bonus >= dc };
  if (result.success) return { status: 'success', ...result };
  const ended = await end.use({ [CORE]: { confirmed: true }, [MODULE_ID]: { automation: 'swaggerEnd' },
    subsequentActions: false }, { configure: false });
  if (!ended) return { status: 'refund-pending', ...result };
  return { status: 'failed-and-locked', ...result };
}
