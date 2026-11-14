import { MODULE_ID } from '../src/ids.mjs';
import { importedIronChin, importedPugilistClass, itemsOf, feature } from './policy.mjs';

/** Specific, opt-in migration of Plutonium's pre-dnd5e-6 AC override.
 * Does not alter HTML, item activities, other effects, or unrelated actors.
 * Legacy v5 'ac.calc=custom' adds an unrestricted formula in dnd5e 6.0.6.
 * The new CUSTOM change is interpreted by our existing applyIronChin hook,
 * which checks the actual equipped armor and shield before adding a formula.
 */
const MARKER_KEY = `flags.${MODULE_ID}.ironChin`;
const BACKUP_KEY = 'legacyIronChinOriginal';
const LEGACY_KEYS = ['system.attributes.ac.calc', 'system.attributes.ac.formula'];
const byKey = c => c?.key;
const asArray = collection => Array.from(collection ?? []);

function source(actor) {
  if (actor?.type !== 'character') return { status: 'not-character' };
  const classes = itemsOf(actor).filter(i => i.type === 'class' && i.system?.identifier === 'pugilist');
  if (classes.length !== 1 || !importedPugilistClass(classes[0])) return { status: 'not-imported-class' };
  const candidates = itemsOf(actor).filter(importedIronChin);
  if (candidates.length !== 1 || feature(actor, 'ironChin') !== candidates[0])
    return { status: candidates.length > 1 ? 'ambiguous' : 'not-imported-iron-chin' };
  const item = candidates[0];
  const effects = asArray(item.effects);
  const migrated = effects.filter(e => e.flags?.[MODULE_ID]?.[BACKUP_KEY]);
  if (migrated.length === 1) return { status: 'migrated', item, effect: migrated[0] };
  if (migrated.length > 1) return { status: 'ambiguous' };
  const originals = effects.filter(e => {
    const changes = asArray(e.system?.changes);
    return e.type === 'base' && e.transfer === true && !e.disabled
      && changes.length === 2
      && changes.map(byKey).sort().join('|') === [...LEGACY_KEYS].sort().join('|')
      && changes.every(c => c.type === 'override')
      && changes.find(c => c.key === LEGACY_KEYS[0])?.value === 'custom'
      && changes.find(c => c.key === LEGACY_KEYS[1])?.value === '12 + @abilities.con.mod';
  });
  if (originals.length !== 1) return { status: originals.length > 1 ? 'ambiguous' : 'unsupported-effect' };
  return { status: 'ready', item, effect: originals[0] };
}

function describe(found) {
  return { status: found.status, item: found.item?.name ?? null, itemId: found.item?.id ?? null,
    effectId: found.effect?.id ?? found.effect?._id ?? null, changes: found.effect?.system?.changes?.map?.(c => ({ key: c.key, type: c.type, value: c.value })) ?? [] };
}

export async function migrateIronChin(actor, { apply = false, restore = false, isGM = false } = {}) {
  const found = source(actor);
  if (restore && found.status !== 'migrated') return describe(found);
  if (!restore && found.status !== 'ready') return describe(found);
  if (!apply) return { ...describe(found), next: restore ? 'restore' : 'migrate' };
  if (!isGM || !actor?.isOwner) throw new Error('Somente o Mestre, com permissão sobre o ator, pode alterar Iron Chin.');
  const original = found.effect.toObject?.().system?.changes ?? asArray(found.effect.system.changes).map(c => ({ ...c }));
  let update;
  if (restore) {
    const backup = found.effect.flags[MODULE_ID][BACKUP_KEY];
    if (!Array.isArray(backup?.changes) || backup.changes.length !== 2)
      throw new Error('Backup de Iron Chin inválido; nenhuma alteração feita.');
    update = { _id: found.effect.id, 'system.changes': backup.changes,
      [`flags.${MODULE_ID}.-=${BACKUP_KEY}`]: null };
  } else {
    const prior = structuredClone(original);
    const change = { ...prior[0], key: MARKER_KEY, type: 'custom', value: 'true', phase: 'initial' };
    update = { _id: found.effect.id, 'system.changes': [change],
      [`flags.${MODULE_ID}.${BACKUP_KEY}`]: { version: 1, changes: prior } };
  }
  await found.item.updateEmbeddedDocuments('ActiveEffect', [update]);
  return { status: restore ? 'restored' : 'migrated', item: found.item.name,
    itemId: found.item.id, effectId: found.effect.id, changes: update['system.changes'].map(c => c.key) };
}
