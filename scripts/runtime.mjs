import { MODULE_ID, ACTIVITY_IDS as A } from '../src/ids.mjs';
import { feature, pugilistLevel, ownedKey } from './policy.mjs';

/** Only the process executing activity.use() reaches postUseActivity. Broadcast
 * hooks never spend resources here. A per-actor queue serializes our writes. */
export function createRuntime(env) {
  const pending = new Map();
  const seen = new Set();
  const run = (actor, task) => {
    const key = actor.uuid;
    const next = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
    pending.set(key, next);
    next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => {});
    return next;
  };
  const state = actor => actor.getFlag?.(MODULE_ID, 'tempHp') ?? actor.flags?.[MODULE_ID]?.tempHp;
  const hp = actor => actor.system?.attributes?.hp;
  function authority(actor) {
    const gm = env.game.users?.activeGM;
    if (gm) return gm.id === env.game.user?.id;
    const owners = Array.from(env.game.users ?? []).filter(u => u.active && actor.testUserPermission?.(u, 'OWNER')).sort((a, b) => a.id.localeCompare(b.id));
    return owners[0]?.id === env.game.user?.id;
  }
  async function bloodied(activity, config, result) {
    if (ownedKey(activity?.item) !== 'bloodied' || activity.id !== A.bloodied || !result?.message?.id) return;
    const actor = activity.actor;
    const moxie = feature(actor, 'moxie');
    if (!moxie || !feature(actor, 'bloodied')) return;
    const eventKey = `${actor.uuid}:${result.message.id}`;
    if (seen.has(eventKey)) return;
    seen.add(eventKey);
    // No persistent listener or unbounded event history is retained.
    if (seen.size > 256) seen.delete(seen.values().next().value);
    return run(actor, async () => {
      if (actor.getFlag?.(MODULE_ID, 'bloodiedEvent') === result.message.id) return;
      const restored = Number(moxie.system?.uses?.spent) || 0;
      await actor.updateEmbeddedDocuments('Item', [{ _id: moxie.id, 'system.uses.spent': 0 }]);
      const health = hp(actor);
      const amount = 4 * pugilistLevel(actor);
      const updates = { [`flags.${MODULE_ID}.bloodiedEvent`]: result.message.id };
      if (Number(health?.value) <= Number(health?.max) / 2 && amount > Number(health?.temp ?? 0)) {
        updates['system.attributes.hp.temp'] = amount;
        updates[`flags.${MODULE_ID}.tempHp`] = { source: 'bloodied', remaining: amount, expiresAt: null, shortRest: true };
      }
      await actor.update(updates);
      // Reuse the original usage card and its visibility/whisper settings.
      // Numeric output only; no hidden target information is added to chat.
      if (result.message.update && !result.message.getFlag?.(MODULE_ID, 'bloodiedSummary')) {
        const granted = Object.hasOwn(updates, 'system.attributes.hp.temp') ? amount : 0;
        const totalTemp = Number(actor.system?.attributes?.hp?.temp) || 0;
        const summary = `<p data-rpgup-pugilist="bloodied">Moxie recuperada: ${restored}. PV temporários concedidos: ${granted} (total atual: ${totalTemp}).</p>`;
        await result.message.update({ content: `${result.message.content ?? ''}${summary}`, [`flags.${MODULE_ID}.bloodiedSummary`]: true });
      }
    }).catch(error => {
      // A failed document write is retryable. Restoring the reserve to zero
      // spent is idempotent, so a retry cannot duplicate resources or HP.
      seen.delete(eventKey);
      throw error;
    });
  }
  function trackTemporaryHp(actor, amount, updates, options) {
    if (!pugilistLevel(actor)) return;
    const current = Number(hp(actor)?.temp) || 0;
    const next = Number(updates['system.attributes.hp.temp']);
    if (!Number.isFinite(next)) return;
    // `system.activity` on a message is a SourceReferenceField descriptor, not
    // an Activity document. Use the system's public resolver (dnd5e 6.0.6
    // documents/chat-message.mjs:getAssociatedActivity).
    const sourceActivity = options?.origin?.getAssociatedActivity?.();
    if (next > current && ownedKey(sourceActivity?.item) === 'braceUp' && sourceActivity.actor?.uuid === actor.uuid) {
      updates[`flags.${MODULE_ID}.tempHp`] = { source: 'braceUp', remaining: next, expiresAt: Number(env.game.time.worldTime) + 600, shortRest: false };
    } else if (next < current && state(actor)) {
      updates[`flags.${MODULE_ID}.tempHp`] = next > 0 ? { ...state(actor), remaining: next } : null;
    } else if (next > current && state(actor)) updates[`flags.${MODULE_ID}.tempHp`] = null;
    else if (next === current && state(actor)) {
      // Actor5e.applyDamage always includes hp.temp, even for ordinary healing
      // or zero damage. Mark that update as tracked so preUpdateActor does not
      // mistake it for a manual replacement and lose the expiration time.
      updates[`flags.${MODULE_ID}.tempHp`] = { ...state(actor) };
    }
  }
  function manualTemporaryHp(actor, changes) {
    if (!state(actor)) return;
    const get = env.foundry.utils.getProperty;
    const value = Object.hasOwn(changes, 'system.attributes.hp.temp') ? changes['system.attributes.hp.temp'] : get(changes, 'system.attributes.hp.temp');
    if (value === undefined) return;
    if (Object.hasOwn(changes, `flags.${MODULE_ID}.tempHp`) || get(changes, `flags.${MODULE_ID}.tempHp`) !== undefined) return;
    // A direct edit relinquishes provenance; we never delete another source's HP.
    changes[`flags.${MODULE_ID}.tempHp`] = null;
  }
  function expire(actor, { shortRest = false, longRest = false, localRest = false } = {}) {
    // World-time hooks run on every client, hence the election above. The
    // dnd5e restCompleted hook runs only on the client executing that rest;
    // an owning player must be allowed to expire their HP while a GM is online.
    const localOwner = localRest && (env.game.user?.isGM || actor.isOwner === true
      || actor.testUserPermission?.(env.game.user, 'OWNER'));
    if (!state(actor) || !(localOwner || authority(actor))) return Promise.resolve();
    return run(actor, async () => {
      const mark = state(actor);
      if (!mark) return;
      const due = longRest || (shortRest && mark.shortRest) || (mark.expiresAt !== null && Number(env.game.time.worldTime) >= mark.expiresAt);
      if (!due) return;
      const updates = { [`flags.${MODULE_ID}.tempHp`]: null };
      if (Number(hp(actor)?.temp) === mark.remaining) updates['system.attributes.hp.temp'] = 0;
      await actor.update(updates);
    });
  }
  const actors = () => [...(env.game.actors ?? []), ...(env.canvas?.scene?.tokens ?? []).filter(t => !t.actorLink).map(t => t.actor)].filter(Boolean);
  return { bloodied, trackTemporaryHp, manualTemporaryHp, expire,
    expireAll: () => Promise.all(actors().map(a => expire(a))),
    rest: (actor, result, config) => expire(actor, { shortRest: config?.type === 'short', longRest: config?.type === 'long', localRest: true }),
    idle: () => Promise.all([...pending.values()]) };
}
