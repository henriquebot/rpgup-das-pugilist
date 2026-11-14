import { MODULE_ID } from '../src/ids.mjs';
import { feature, importedMuscleMass, pugilistLevel } from './policy.mjs';

const FLAG = 'muscleMassChoice';
const OPTIONS = Object.freeze({ acr: 'Acrobacia', ath: 'Atletismo' });
const supported = skill => Object.hasOwn(OPTIONS, skill);
const markerOf = actor => actor?.getFlag?.(MODULE_ID, FLAG) ?? actor?.flags?.[MODULE_ID]?.[FLAG] ?? null;
const validRank = value => Number.isInteger(value) && value >= 0 && value <= 2;

/** Read-only status for an existing 5etools Muscle Mass. The dnd5e 6 Trait
 * advancement's "upgrade" mode uses exactly 0 -> 1 and 1 -> 2.
 * Kyros was imported at level 4 without a Trait advancement for this choice;
 * attaching one now would not retroactively grant a proficiency. */
export function inspectMuscleMass(actor, { skill = null } = {}) {
  if (actor?.type !== 'character') return { status: 'not-character' };
  const item = feature(actor, 'muscleMass');
  if (!importedMuscleMass(item)) return { status: 'not-imported-muscle-mass' };
  const mark = markerOf(actor);
  if (mark !== null) {
    const rank = actor.system?.skills?.[mark.skill]?.value;
    const expected = mark.version === 1 && mark.itemId === item.id && supported(mark.skill)
      && validRank(mark.before) && validRank(mark.granted)
      && mark.granted === Math.min(2, mark.before + 1);
    return { status: expected && rank === mark.granted ? 'installed' : 'conflict',
      itemId: item.id, choice: mark.skill, previous: mark.before, current: rank,
      granted: mark.granted };
  }
  if (skill === null) return { status: 'choose-skill', itemId: item.id,
    choices: Object.entries(OPTIONS).map(([key, label]) => ({ key, label })) };
  if (!supported(skill)) return { status: 'invalid-skill', itemId: item.id };
  const raw = actor.system?.skills?.[skill]?.value;
  if (!validRank(raw)) return { status: 'unsupported-skill-data', itemId: item.id, choice: skill };
  return { status: 'ready', itemId: item.id, choice: skill, previous: raw,
    granted: Math.min(2, raw + 1), level: pugilistLevel(actor) };
}

/** No write without GM opt-in. Store proficiency and provenance in one actor
 * update, never in the source class/subclass or feature HTML.
 * Restore refuses to erase later proficiency changes. */
export async function configureMuscleMass(actor, { skill = null, apply = false, restore = false, isGM = false } = {}) {
  const state = inspectMuscleMass(actor, { skill });
  const preview = { ...state, action: restore ? 'restore' : 'install' };
  if (!apply) return preview;
  if (!isGM || actor?.isOwner !== true)
    throw new Error('Somente o Mestre com permissão sobre o personagem pode configurar Muscle Mass.');
  if (restore) {
    if (state.status !== 'installed') return preview;
    await actor.update({
      [`system.skills.${state.choice}.value`]: state.previous,
      [`flags.${MODULE_ID}.-=${FLAG}`]: null
    });
    return { ...preview, status: 'restored' };
  }
  if (state.status !== 'ready') return preview;
  await actor.update({
    [`system.skills.${state.choice}.value`]: state.granted,
    [`flags.${MODULE_ID}.${FLAG}`]: { version: 1, itemId: state.itemId,
      skill: state.choice, before: state.previous, granted: state.granted }
  });
  return { ...preview, status: 'installed' };
}
