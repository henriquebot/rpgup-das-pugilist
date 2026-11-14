import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedHeavyHitter, pugilistLevel } from './policy.mjs';

const DAS = 'dnd5e-combat';
const SAVE_ID = 'dnd5eCombatGrShv';
const EFFECT_IDS = ['dnd5eCombatGrapl', 'dnd5eCombatProne', 'dnd5eCombatPush0'];
const values = c => Array.from(c?.values?.() ?? c ?? []);
const activityOf = (item, id) => item?.system?.activities?.get?.(id) ?? item?.system?.activities?.[id] ?? null;

/** Use the DAS unarmed Grapple/Shove save already found on Kyros.
 * Never build a second attack, spend an action, or apply conditions directly. */
export function nativeGrappleShove(actor) {
  const candidates = values(actor?.items).filter(item => item?.type === 'weapon'
    && item.system?.identifier === 'unarmed-strike' && item.flags?.[DAS]?.basicAction === 'unarmed');
  if (candidates.length !== 1) return null;
  const activity = activityOf(candidates[0], SAVE_ID);
  if (activity?.type !== 'save' || !['str','dex'].every(a => values(activity.save?.ability).includes(a))) return null;
  if (activity.save?.dc?.calculation !== 'str' || values(activity.consumption?.targets).length !== 0) return null;
  const effectIds = values(activity.effects).map(e => e?._id).sort();
  if (JSON.stringify(effectIds) !== JSON.stringify([...EFFECT_IDS].sort())) return null;
  return activity;
}

/** The original Pugilist Unarmed Strike and native DAS unarmed attack both qualify.
 * A saved spell, generic weapon attack or a different actor never qualifies. */
export function qualifyingUnarmedAttack(activity, actor) {
  if (!actor || activity?.actor?.uuid !== actor.uuid || activity?.type !== 'attack'
    || activity.attack?.type?.classification !== 'unarmed') return false;
  const item = activity.item;
  if (!item || item.type !== 'weapon') return false;
  const original = item.system?.identifier === 'unarmed-strike-pugilist'
    && item.flags?.plutonium?.source === 'Pugilist2024'
    && item.flags?.plutonium?.page === 'items.html'
    && item.flags?.plutonium?.hash === 'unarmed%20strike%20(pugilist)_pugilist2024';
  const das = item.system?.identifier === 'unarmed-strike'
    && item.flags?.[DAS]?.basicAction === 'unarmed';
  return original || das;
}

const speakerToken = (env, msg) => {
  const sceneId = msg?.speaker?.scene, tokenId = msg?.speaker?.token;
  return sceneId && tokenId ? env.game.scenes?.get?.(sceneId)?.tokens?.get?.(tokenId) ?? null : null;
};

/** DAS resolves the Grapple/Shove choice, defender's better STR/DEX save,
 * grapple linkage and push/prone effect from the native save card. */
export function createHeavyHitter(env, { choose }) {
  const seen = new Set();
  const authority = () => env.game.users?.activeGM?.id === env.game.user?.id;
  const resolver = uuid => env.fromUuidSync?.(uuid, { strict: false }) ?? null;

  async function resolution(r) {
    if (!authority() || !r?.id || r.step !== 'done' || r.plan?.attack !== true) return;
    const key = `heavy:${r.id}`;
    if (seen.has(key)) return;
    const attack = resolver(r.activity);
    const actor = attack?.actor;
    const heavy = actor && feature(actor, 'heavyHitter');
    if (!importedHeavyHitter(heavy) || pugilistLevel(actor) < 3
      || !qualifyingUnarmedAttack(attack, actor)) return;
    const hit = values(r.targets);
    if (hit.length !== 1 || hit[0]?.hit !== true || hit[0]?.unaffected === true) return;
    const usage = env.game.messages?.get?.(r.origin ?? '');
    const attackMessage = env.game.messages?.get?.(r.attack?.messageId ?? '');
    const source = speakerToken(env, attackMessage) ?? speakerToken(env, usage) ?? attack.getUsageToken?.();
    const target = resolver(hit[0].token);
    const save = nativeGrappleShove(actor);
    if (!source || !target?.actor || !save || source.parent !== target.parent
      || source.actor?.uuid !== actor.uuid || !target.actor.uuid
      || Number(target.actor.system?.attributes?.hp?.value) <= 0) return;
    const gap = env.game.modules?.get(DAS)?.api?.gap?.(source, target);
    if (!gap || !Number.isFinite(gap.cells) || gap.cells > 1) return;
    seen.add(key);
    if (seen.size > 500) seen.delete(seen.values().next().value);
    // Stop and Drop allows BOTH choices only if this exact attack did not use
    // mastery. Missing/unknown mastery metadata never counts as "no mastery".
    const stopped = Boolean(feature(actor, 'stopAndDrop'))
      && Object.hasOwn(attackMessage?.system ?? {}, 'mastery')
      && !attackMessage.system.mastery;
    const options = [{ id: 'no', label: 'Não aplicar' }, { id: 'yes', label: 'Agarrar ou Empurrar' }];
    if (stopped) options.push(
      { id: 'both-prone', label: 'Stop and Drop: Agarrar e Derrubar' },
      { id: 'both-push', label: 'Stop and Drop: Agarrar e Empurrar 1,5 m' }
    );
    const answer = await choose(actor, {
      title: `${stopped ? 'Stop and Drop' : heavy.name} — ${actor.name}`,
      prompt: `Ataque desarmado acertou ${target.name}. Escolha o efeito adicional sem novo ataque.`,
      options
    });
    if (!options.some(o => o.id === answer) || answer === 'no') return;
    // The attack may have caused movement or a KO while the prompt was open.
    if (source.parent !== target.parent || Number(target.actor.system?.attributes?.hp?.value) <= 0) return;
    const effects = answer === 'both-prone' ? ['dnd5eCombatGrapl', 'dnd5eCombatProne']
      : answer === 'both-push' ? ['dnd5eCombatGrapl', 'dnd5eCombatPush0'] : [null];
    for (const chosen of effects) {
      const card = await save.item.system.getCardData({ activity: save });
      const data = { ...card, targets: [{ actor: target.actor.uuid, token: target.uuid,
        name: target.name, img: target.texture?.src ?? null,
        ac: target.actor.statuses?.has?.('coverTotal') ? null : target.actor.system?.attributes?.ac?.value ?? null }] };
      await env.ChatMessage.implementation.create({
        type: 'usage', speaker: env.ChatMessage.implementation.getSpeaker({ token: source }),
        flavor: `${chosen ? 'Stop and Drop' : 'Heavy Hitter'} — ${target.name}${chosen ? `: ${chosen === 'dnd5eCombatGrapl' ? 'Agarrar' : chosen === 'dnd5eCombatProne' ? 'Derrubar' : 'Empurrar'}` : ': escolha Agarrar, Derrubar ou Empurrar'}`,
        system: data,
        flags: { core: { canPopout: true }, [DAS]: {
          areaTick: { event: 'heavyHitter', source: source.uuid, token: target.uuid },
          ...(chosen ? { choice: chosen } : {})
        }, [MODULE_ID]: { heavyHitter: { resolution: r.id, source: source.uuid, target: target.uuid } } }
      });
    }
  }
  return { resolution };
}
