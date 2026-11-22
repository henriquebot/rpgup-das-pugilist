/**
 * World-specific compatibility for Rulzus's two manually created Haymaker
 * maximum-damage activities. The damage formula is already permanent in the
 * activities; only Force hits need the missing Moxie refund.
 *
 * Deliberately does not alter the regular bludgeoning path or change any
 * activity, die formula, or the DAS maxDamage contract.
 */
const ACTOR_ID = 'WZFriX7PU7LgtNBf';
const HAYMAKER_ITEM_ID = 'nlqCQckbec30oU0u';
const HAYMAKER_ACTIVITY_ID = 'utilityHaymclNe0';
const MOXIE_ITEM_ID = 'n15NbdC47uOsjVuE';
const MAX_ATTACK_IDS = new Set(['9NBgk9m9fXuGBzqM', 'K2f6Ix6yKT7U3UvN']);

const spent = item => Number(item?.system?.uses?.spent);
const turnKey = game => {
  const c = game?.combat;
  return c?.started ? `${c.id}.${c.round}.${c.turn}` : 'outside-combat';
};

export function createRulzusForceRefund(env) {
  let pending = null;
  let lastSpend = null;
  let observed = NaN;

  const actor = () => env.game.actors?.get?.(ACTOR_ID);
  const moxie = () => actor()?.items?.get?.(MOXIE_ITEM_ID);
  const currentTurn = () => turnKey(env.game);
  const getSpent = () => spent(moxie());

  function beforeUse(activity) {
    if (activity?.actor?.id !== ACTOR_ID || activity?.item?.id !== HAYMAKER_ITEM_ID
      || activity?.id !== HAYMAKER_ACTIVITY_ID) return;
    const before = getSpent();
    if (!Number.isFinite(before)) return;
    pending = { turn: currentTurn(), before, paidAt: null };
  }

  function resourceUpdate(item, changes) {
    if (item?.id !== MOXIE_ITEM_ID || item?.parent?.id !== ACTOR_ID) return;
    const next = Number(changes?.system?.uses?.spent);
    if (!Number.isFinite(next)) return;
    const previous = Number.isFinite(observed) ? observed : NaN;
    observed = next;
    if (!Number.isFinite(previous) || next <= previous) return;
    lastSpend = { turn: currentTurn(), previous, amount: next, at: Date.now() };
    if (pending?.turn === currentTurn() && next > pending.before) pending.paidAt = next;
  }

  function usageCard(message) {
    if (message?.type !== 'usage' || message?.speaker?.actor !== ACTOR_ID
      || message?.system?.activity?.uuid !==
        `Actor.${ACTOR_ID}.Item.${HAYMAKER_ITEM_ID}.Activity.${HAYMAKER_ACTIVITY_ID}`) return;

    const nowSpent = getSpent();
    if (!Number.isFinite(nowSpent)) return;
    const recent = lastSpend && lastSpend.turn === currentTurn()
      && (Date.now() - lastSpend.at) < 15000 && lastSpend.amount === nowSpent;
    if (!pending || pending.turn !== currentTurn())
      pending = { turn: currentTurn(), before: recent ? lastSpend.previous : nowSpent, paidAt: null };
    if (recent) pending.paidAt = nowSpent;
  }

  async function resolution(result) {
    if (!pending || result?.source !== actor()?.uuid
      || !result?.plan?.attack || !['done', 'missed'].includes(result.step)) return;
    // The first resolved attack uses or forfeits this Haymaker activation.
    const activation = pending;
    pending = null;
    if (activation.turn !== currentTurn() || result.step !== 'done') return;
    const attackId = String(result.activity ?? '').split('.Activity.').at(-1);
    if (!MAX_ATTACK_IDS.has(attackId) || !result.targets?.some(t => t.hit === true)
      || !result.damageRoll?.damages?.some(d => d.type === 'force')) return;
    // One authority writes to a shared actor; no duplicate player/GM refunds.
    const activeGM = env.game.users?.activeGM;
    if (!activeGM || activeGM.id !== env.game.user?.id) return;
    const resource = moxie();
    const nowSpent = spent(resource);
    // DAS may already have refunded the point during preRollDamageV2.
    // Never issue a second refund, nor overwrite a concurrent resource edit.
    if (!Number.isFinite(activation.paidAt) || !Number.isFinite(nowSpent)
      || nowSpent !== activation.paidAt || nowSpent < 1) return;
    await resource.update({ 'system.uses.spent': nowSpent - 1 });
    env.console?.log?.('rpgup-das-pugilist | Rulzus: Haymaker Force refunded 1 Moxie');
  }

  function initialize() {
    observed = getSpent();
  }
  return { initialize, beforeUse, resourceUpdate, usageCard, resolution };
}
