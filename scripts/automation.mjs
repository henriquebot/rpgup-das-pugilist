import { MODULE_ID, ACTIVITY_IDS as A } from '../src/ids.mjs';
import { feature, fisticuffsEligible, ownedKey, weaponKind, importedSwagger } from './policy.mjs';
import { resolveOriginalSwagger } from './swagger.mjs';

const DAS_ID = 'dnd5e-combat';
export const QUERY = `${MODULE_ID}.choice`;
const ABILITIES = new Set(['str', 'dex', 'con', 'cha']);

const values = collection => Array.from(collection?.values?.() ?? collection ?? []);
const activityOf = (item, id) => item?.system?.activities?.get?.(id)
  ?? item?.system?.activities?.[id]
  ?? values(item?.activities).find(a => a.id === id || a._id === id)
  ?? null;
const left = item => {
  const uses = item?.system?.uses;
  const value = Number(uses?.value);
  if (Number.isFinite(value)) return Math.max(0, value);
  return Math.max(0, (Number(uses?.max) || 0) - (Number(uses?.spent) || 0));
};
const flag = (doc, scope, key) => doc?.getFlag?.(scope, key) ?? doc?.flags?.[scope]?.[key];
const turnKey = (combat, current) => combat?.id && current?.combatantId && Number.isFinite(current.round) && Number.isFinite(current.turn)
  ? `${combat.id}.${current.round}.${current.turn}.${current.combatantId}` : null;

function sourceToken(env, message) {
  const { scene, token } = message?.speaker ?? {};
  return scene && token ? env.game.scenes?.get?.(scene)?.tokens?.get?.(token) ?? null : null;
}

export function targetDescriptor(token) {
  const actor = token?.actor;
  if (!actor) return null;
  const ac = actor.statuses?.has?.('coverTotal') ? null : actor.system?.attributes?.ac?.value;
  return { actor: actor.uuid, ac: ac ?? null, img: token.texture?.src, name: token.name, token: token.uuid };
}

/** Read the paired DAS grapple mark and verify that its target still carries
 * the exact Grappled effect. Hand-applied conditions never qualify. */
export function heldVictims(env, token) {
  const seen = new Set();
  const out = [];
  for (const mark of values(token?.actor?.effects)) {
    const link = flag(mark, DAS_ID, 'grappling');
    if (!link?.target || !link.effect) continue;
    const victim = env.fromUuidSync?.(link.target, { strict: false });
    const effect = env.fromUuidSync?.(link.effect, { strict: false });
    if (!victim?.actor || victim.parent !== token.parent || effect?._destroyed || !effect?.statuses?.has?.('grappled')) continue;
    if (!values(victim.actor.effects).some(e => e === effect || e.uuid === effect.uuid)) continue;
    if ((Number(victim.actor.system?.attributes?.hp?.value) || 0) <= 0 || seen.has(victim.uuid)) continue;
    seen.add(victim.uuid);
    out.push(victim);
  }
  return out;
}

function attackMode(message) {
  return message?.rolls?.[0]?.options?.attackMode ?? message?.system?.mode ?? null;
}

/** Range of the repeated attack in scene units. The DAS public gap API supplies
 * its own 3D footprint distance; dnd5e's public converter handles ft/m. */
export function redirectRange(env, attacker, victim, activity, message) {
  if (!attacker || !victim || attacker.parent !== victim.parent || activity?.type !== 'attack') return { valid: false, longRange: false };
  const gap = env.game.modules?.get(DAS_ID)?.api?.gap?.(attacker, victim);
  if (!gap || !Number.isFinite(gap.cells)) return { valid: false, longRange: false };
  const grid = attacker.parent.grid;
  const mode = attackMode(message);
  const weapon = activity.item?.type === 'weapon' ? activity.item.system?.range : null;
  const thrown = mode?.startsWith?.('thrown') || mode === 'ranged';
  const ranged = activity.attack?.type?.value === 'ranged' || thrown;
  const range = ranged ? {
    value: weapon?.value ?? activity.range?.value,
    long: weapon?.long ?? activity.range?.long,
    units: weapon?.units ?? activity.range?.units
  } : {
    value: weapon?.reach ?? activity.range?.reach ?? activity.range?.value ?? 5,
    long: null,
    units: weapon?.units ?? activity.range?.units ?? 'ft'
  };
  if (!Number.isFinite(Number(range.value)) || !range.units || ['self', 'touch', 'spec'].includes(range.units)) return { valid: false, longRange: false };
  const convert = env.game.dnd5e?.utils?.convertLength;
  let normal = Number(range.value);
  let maximum = Number(range.long) || normal;
  try {
    if (range.units !== grid.units) {
      if (typeof convert !== 'function') return { valid: false, longRange: false };
      normal = convert(normal, range.units, grid.units, { strict: false });
      maximum = convert(maximum, range.units, grid.units, { strict: false });
    }
  } catch { return { valid: false, longRange: false }; }
  const distance = gap.cells * grid.distance;
  return { valid: Number.isFinite(maximum) && distance <= maximum + 1e-6, longRange: ranged && distance > normal + 1e-6, distance, normal, maximum };
}

export function createAutomation(env) {
  const pending = new Map();
  const seenRolls = new WeakSet();
  const seenTurns = new Set();
  const seenResolutions = new Set();
  const report = error => env.console?.error?.(`${MODULE_ID} | automation`, error);
  const remember = (set, key, limit = 500) => {
    if (!key) return false;
    if (set.has(key)) return false;
    set.add(key);
    while (set.size > limit) set.delete(set.values().next().value);
    return true;
  };
  const queue = (key, task) => {
    const next = (pending.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
    pending.set(key, next);
    next.finally(() => { if (pending.get(key) === next) pending.delete(key); }).catch(() => {});
    return next;
  };
  const executor = () => env.game.users?.activeGM?.id === env.game.user?.id;
  const coreApi = () => env.game.modules?.get(DAS_ID)?.api;

  async function localChoice({ title, prompt, options }) {
    const escape = env.foundry?.utils?.escapeHTML ?? (s => String(s));
    const picked = await env.foundry.applications.api.DialogV2.wait({
      window: { title },
      content: `<p>${escape(prompt)}</p>`,
      buttons: options.map((o, i) => ({ action: `pick${i}`, label: o.label, default: i === 0 })),
      rejectClose: false
    });
    const index = Number(String(picked ?? '').replace('pick', ''));
    return Number.isInteger(index) ? options[index]?.id ?? null : null;
  }

  async function choose(actor, payload) {
    const users = values(env.game.users);
    const owner = users.filter(u => u.active && !u.isGM && actor.testUserPermission?.(u, 'OWNER')).sort((a, b) => a.id.localeCompare(b.id))[0];
    const user = owner ?? env.game.users?.activeGM ?? null;
    if (user && user.id !== env.game.user?.id) {
      try { return await user.query(QUERY, payload, { timeout: 30000 }); }
      catch { return null; }
    }
    return localChoice(payload);
  }

  function registerQuery() {
    if (env.CONFIG?.queries) env.CONFIG.queries[QUERY] = localChoice;
  }

  function reactionAvailable(actor) {
    const combat = env.game.combat;
    if (!combat?.started) return true;
    const all = values(combat.getCombatantsByActor?.(actor));
    const combatant = all.find(c => c.id === combat.combatant?.id) ?? all[0];
    const state = combatant ? coreApi()?.ui?.budget?.(combatant) : null;
    return state ? state.reaction === true : false;
  }

  async function usageCard(activity, source, target, event) {
    const descriptor = targetDescriptor(target);
    if (!activity?.item?.system?.getCardData || !descriptor || !source) return null;
    const card = await activity.item.system.getCardData({ activity });
    return env.ChatMessage.implementation.create({
      type: 'usage',
      speaker: env.ChatMessage.implementation.getSpeaker({ token: source }),
      flavor: `${activity.name || activity.item.name}: ${target.name}`,
      system: { ...card, targets: [descriptor] },
      flags: { core: { canPopout: true }, [DAS_ID]: { areaTick: { event, source: source.uuid, token: target.uuid } },
        [MODULE_ID]: { automation: event } }
    });
  }

  async function swagger(rolls, { skill = null, ability = null, subject: actor } = {}) {
    const roll = rolls?.[0];
    const total = Number(roll?.total);
    const dc = Number(roll?.options?.target);
    const used = ability ?? roll?.data?.abilityId ?? (skill ? actor?.system?.skills?.[skill]?.ability : null);
    if (!actor?.isOwner || !roll || seenRolls.has(roll) || !Number.isFinite(total) || !Number.isFinite(dc) || total >= dc || !ABILITIES.has(used)) return;
    const swaggerItem = feature(actor, 'swagger');
    const moxie = feature(actor, 'moxie');
    if (!swaggerItem || !moxie || left(swaggerItem) < 1 || left(moxie) < 1) return;
    seenRolls.add(roll);
    return queue(`swagger:${actor.uuid}`, async () => {
      if (left(swaggerItem) < 1 || left(moxie) < 1) return;
      const answer = await choose(actor, { title: `${swaggerItem.name} — ${actor.name}`, prompt: 'Falha confirmada. Gastar 1 Moxie e somar o dado de Fisticuffs?',
        options: [{ id: 'no', label: 'Não usar' }, { id: 'yes', label: 'Usar Swagger Streak' }] });
      if (answer !== 'yes' || left(swaggerItem) < 1 || left(moxie) < 1) return;
      if (importedSwagger(swaggerItem)) {
        const native = await resolveOriginalSwagger(actor, { total, dc });
        if (native.status === 'success' || native.status === 'failed-and-locked') {
          // The original check card is already rolled: publish a separate,
          // private adjustment. Never alter an evaluated D20Roll retroactively.
          const listeners = values(env.game.users).filter(u => u.isGM || actor.testUserPermission?.(u, 'OWNER')).map(u => u.id);
          const status = native.success ? 'sucesso após Swagger Streak' : 'falha; Moxie devolvido e Swagger Streak esgotado';
          await env.ChatMessage.implementation.create({
            speaker: env.ChatMessage.implementation.getSpeaker({ actor }),
            whisper: listeners,
            content: `<p><strong>Swagger Streak</strong>: ${total} + ${native.bonus} = ${native.adjusted} (${status}).</p>`,
            flags: { [MODULE_ID]: { swagger: { total, bonus: native.bonus, adjusted: native.adjusted,
              success: native.success, status: native.status } } }
          });
        } else if (native.status === 'refund-pending') {
          env.ui?.notifications?.warn?.('Swagger Streak: não foi possível concluir o reembolso de Moxie. Confira a ficha.');
          report(new Error('Swagger Streak: End Streak não concluiu o reembolso.'));
        } else if (!['roll-cancelled', 'payment-cancelled', 'not-confirmed-failure'].includes(native.status)) {
          report(new Error(`Swagger Streak importado: ${native.status}`));
        }
        return;
      }
      const activity = activityOf(swaggerItem, A.swagger);
      const result = await activity?.use?.({ [DAS_ID]: { confirmed: true }, [MODULE_ID]: { automation: 'swagger' }, subsequentActions: false }, { configure: false });
      if (!result) return;
      const formula = env.Roll.replaceFormulaData(activity.roll.formula, activity.getRollData?.() ?? actor.getRollData?.() ?? {}, { missing: '0' });
      const bonus = await new env.Roll(formula, activity.getRollData?.() ?? actor.getRollData?.() ?? {}).evaluate();
      await bonus.toMessage({ speaker: env.ChatMessage.implementation.getSpeaker({ actor }),
        flavor: `${swaggerItem.name}: ${total} + ${bonus.total} = ${total + bonus.total} (CD ${dc})`,
        flags: { [MODULE_ID]: { swagger: { total, bonus: bonus.total, dc, success: total + bonus.total >= dc } } } });
      if (total + bonus.total >= dc) return;
      const mSpent = Number(moxie.system?.uses?.spent) || 0;
      const sSpent = Number(swaggerItem.system?.uses?.spent) || 0;
      await actor.updateEmbeddedDocuments('Item', [
        { _id: moxie.id, 'system.uses.spent': Math.max(0, mSpent - 1) },
        { _id: swaggerItem.id, 'system.uses.spent': Math.min(Number(swaggerItem.system?.uses?.max) || 1, sSpent + 1) }
      ]);
    });
  }

  function haymaker(activity, usageConfig, dialogConfig, messageConfig) {
    const actor = activity?.actor;
    if (activity?.type !== 'attack' || usageConfig?.[MODULE_ID]?.haymakerBypass || usageConfig?.[MODULE_ID]?.redirected) return;
    if (!weaponKind(activity) || !fisticuffsEligible(actor) || !feature(actor, 'haymaker')) return;
    const moxie = feature(actor, 'moxie');
    if (!moxie || left(moxie) < 1 || flag(actor, DAS_ID, 'maxDamage')) return;
    queue(`haymaker:${actor.uuid}`, async () => {
      let armed = false;
      if (left(moxie) > 0 && !flag(actor, DAS_ID, 'maxDamage')) {
        const answer = await choose(actor, { title: `Haymaker — ${actor.name}`, prompt: `Gastar 1 Moxie antes de ${activity.item.name}?`,
          options: [{ id: 'no', label: 'Atacar sem Haymaker' }, { id: 'yes', label: 'Usar Haymaker' }] });
        if (answer === 'yes' && left(moxie) > 0) {
          const item = feature(actor, 'haymaker');
          const own = activityOf(item, A.haymaker);
          armed = Boolean(await own?.use?.({ [DAS_ID]: { confirmed: true }, [MODULE_ID]: { haymakerBypass: true }, subsequentActions: false }, { configure: false }));
        }
      }
      await activity.use({ ...usageConfig, [MODULE_ID]: { ...(usageConfig?.[MODULE_ID] ?? {}), haymakerBypass: true, armed } }, dialogConfig, messageConfig);
    }).catch(report);
    return false;
  }

  function compression(combat, _prior, current) {
    if (!executor()) return;
    const key = turnKey(combat, current);
    const combatant = combat?.combatants?.get?.(current?.combatantId);
    const token = combatant?.token;
    const actor = combatant?.actor;
    if (!key || !token || !actor || seenTurns.has(key) || !feature(actor, 'compression') || (Number(actor.system?.attributes?.hp?.value) || 0) <= 0) return;
    if (!heldVictims(env, token).length || flag(actor, MODULE_ID, 'compressionTurn') === key) return;
    remember(seenTurns, key);
    queue(`compression:${actor.uuid}`, async () => {
      let victims = heldVictims(env, token);
      if (!victims.length || flag(actor, MODULE_ID, 'compressionTurn') === key) return;
      const answer = await choose(actor, { title: `Compression Lock — ${actor.name}`, prompt: `Causar dano a ${victims.map(t => t.name).join(', ')}?`,
        options: [{ id: 'no', label: 'Não usar' }, { id: 'yes', label: 'Usar Compression Lock' }] });
      if (answer !== 'yes') return;
      victims = heldVictims(env, token);
      if (!victims.length) return;
      await actor.setFlag(MODULE_ID, 'compressionTurn', key);
      const activity = activityOf(feature(actor, 'compression'), A.compression);
      for (const victim of victims) await usageCard(activity, token, victim, 'compression');
    }).catch(report);
  }

  async function stopAndDrop(resolution) {
    if (!executor() || !resolution?.id || resolution.step !== 'done' || !resolution.plan?.attack) return;
    const key = `follow:${resolution.id}`;
    if (seenResolutions.has(key)) return;
    const activity = env.fromUuidSync?.(resolution.activity ?? '', { strict: false });
    const actor = activity?.actor;
    const targets = values(resolution.targets);
    const hits = targets.filter(t => t.hit === true);
    if (!actor || targets.length !== 1 || hits.length !== 1 || ownedKey(activity.item) !== 'unarmed' || !feature(actor, 'heavyHitter')) return;
    const target = env.fromUuidSync?.(hits[0].token ?? '', { strict: false });
    const source = sourceToken(env, env.game.messages?.get?.(resolution.attack?.messageId ?? '')) ?? activity.getUsageToken?.();
    if (!target?.actor || !source || (Number(target.actor.system?.attributes?.hp?.value) || 0) <= 0) return;
    const attackMessage = env.game.messages?.get?.(resolution.attack?.messageId ?? '');
    const stop = Boolean(feature(actor, 'stopAndDrop')) && !attackMessage?.system?.mastery;
    remember(seenResolutions, key);
    return queue(`follow:${actor.uuid}`, async () => {
      const options = [{ id: 'none', label: 'Nenhum efeito' }, { id: 'grapple', label: 'Agarrar' }, { id: 'shove', label: 'Empurrar' }];
      if (stop) options.push({ id: 'both', label: 'Agarrar e Empurrar' });
      const answer = await choose(actor, { title: `${stop ? 'Stop and Drop' : 'Heavy Hitter'} — ${actor.name}`,
        prompt: `Escolha o efeito adicional contra ${target.name}.`, options });
      if (!['grapple', 'shove', 'both'].includes(answer)) return;
      const unarmed = feature(actor, 'unarmed');
      const selected = answer === 'both' ? [A.grapple, A.shove] : [answer === 'grapple' ? A.grapple : A.shove];
      for (const id of selected) await usageCard(activityOf(unarmed, id), source, target, 'stopAndDrop');
    });
  }

  async function meatShield(resolution) {
    if (!executor() || !resolution?.id || resolution.step !== 'missed' || !resolution.plan?.attack) return;
    const attackMessage = env.game.messages?.get?.(resolution.attack?.messageId ?? '');
    if (flag(attackMessage, MODULE_ID, 'redirected')) return;
    const attackActivity = env.fromUuidSync?.(resolution.activity ?? '', { strict: false });
    const attacker = sourceToken(env, attackMessage);
    if (!attackActivity || !attacker) return;
    for (const miss of values(resolution.targets).filter(t => t.hit === false)) {
      const reactor = env.fromUuidSync?.(miss.token ?? '', { strict: false });
      const actor = reactor?.actor;
      const key = `meat:${resolution.id}:${miss.token}`;
      if (!actor || seenResolutions.has(key) || !feature(actor, 'meatShield') || attacker.parent !== reactor.parent) continue;
      let held = heldVictims(env, reactor);
      if (held.includes(attacker) || left(feature(actor, 'moxie')) < 1 || !reactionAvailable(actor)) continue;
      let candidates = held.map(token => ({ token, range: redirectRange(env, attacker, token, attackActivity, attackMessage) })).filter(x => x.range.valid);
      if (!candidates.length) continue;
      remember(seenResolutions, key);
      queue(`meat:${actor.uuid}`, async () => {
        const options = [{ id: 'none', label: 'Não usar' }, ...candidates.map(({ token }) => ({ id: token.uuid, label: token.name }))];
        const picked = await choose(actor, { title: `Meat Shield — ${actor.name}`, prompt: `Gastar sua reação e 1 Moxie para redirecionar o ataque de ${attacker.name}?`, options });
        if (!picked || picked === 'none') return;
        held = heldVictims(env, reactor);
        const victim = held.find(t => t.uuid === picked);
        const range = victim ? redirectRange(env, attacker, victim, attackActivity, attackMessage) : { valid: false };
        const moxie = feature(actor, 'moxie');
        if (!victim || !range.valid || held.includes(attacker) || left(moxie) < 1 || !reactionAvailable(actor)) return;
        const meat = activityOf(feature(actor, 'meatShield'), A.meatShield);
        const paid = await meat?.use?.({ [DAS_ID]: { confirmed: true }, [MODULE_ID]: { automation: 'meatShield' }, subsequentActions: false },
          { configure: false }, { data: { flags: { [DAS_ID]: { cost: 'reaction', reaction: true }, [MODULE_ID]: { meatShield: true } } } });
        if (!paid) return;
        const use = await attackActivity.use({ [DAS_ID]: { confirmed: true }, [MODULE_ID]: { redirected: true }, consume: false,
          subsequentActions: false, create: { measuredTemplate: false } }, { configure: false },
        { data: { flags: { [DAS_ID]: { cost: 'free', redirected: reactor.uuid }, [MODULE_ID]: { redirected: true } } } });
        if (!use?.message) return;
        const options0 = attackMessage.rolls?.[0]?.options ?? {};
        const target = targetDescriptor(victim);
        await attackActivity.rollAttack({ ability: attackMessage.system?.ability, ammunition: options0.ammunition, target: target?.ac ?? undefined,
          attackMode: attackMode(attackMessage), mastery: attackMessage.system?.mastery ?? options0.mastery,
          disadvantage: range.longRange || undefined, [DAS_ID]: { confirmed: true, modeChosen: true, ammoChosen: true }, [MODULE_ID]: { redirected: true } },
        { configure: false }, { data: { system: { origin: use.message.id, targets: [target] }, flags: { [MODULE_ID]: { redirected: true } } } });
      }).catch(report);
    }
  }

  function resolution(value) {
    stopAndDrop(value).catch(report);
    meatShield(value).catch(report);
  }

  return { registerQuery, choose, swagger, haymaker, compression, resolution, heldVictims: token => heldVictims(env, token),
    redirectRange: (...args) => redirectRange(env, ...args), idle: () => Promise.all([...pending.values()]) };
}
