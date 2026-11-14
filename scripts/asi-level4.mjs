/** Read-only level-4 ASI audit for the exact imported 2024 Pugilist.
 * A pre-existing feat/ability bonus is NOT evidence that the class advancement
 * created it. Never grant a duplicate ASI or modify an existing feat. */
const array = data => Array.from(data?.values?.() ?? Object.values(data ?? {}));
const source = (item, page, hash, book) => item?.flags?.plutonium?.page === page
  && item.flags.plutonium.source === book && item.flags.plutonium.hash === hash;
const isOriginalClass = item => item?.type === 'class' && item.system?.identifier === 'pugilist'
  && source(item, 'classes.html', 'pugilist_pugilist2024', 'Pugilist2024');
const idOf = doc => doc?.id ?? doc?._id ?? null;
const advancementOf = item => array(item?.system?.advancement);
const levelFour = item => advancementOf(item).filter(a => a?.type === 'AbilityScoreImprovement'
  && Number(a.level) === 4);
const isOriginalSentinel = item => item?.type === 'feat' && item.system?.identifier === 'sentinel'
  && source(item, 'feats.html', 'sentinel_xphb', 'XPHB')
  && item.system?.source?.rules === '2024'
  && item.system?.type?.value === 'feat'
  && Number(item.system?.prerequisites?.level) === 4;
function featASI(item) {
  const matches = advancementOf(item).filter(a => a?.type === 'AbilityScoreImprovement');
  if (matches.length !== 1) return null;
  const a = matches[0];
  if (a?.value?.type !== 'asi' || Number(a.configuration?.points) !== 1
    || Number(a.configuration?.cap) !== 1) return null;
  const entries = Object.entries(a.value.assignments ?? {});
  if (entries.length !== 1 || !['str', 'dex'].includes(entries[0][0])
    || entries[0][1] !== 1) return null;
  return { id: idOf(a), ability: entries[0][0], points: 1 };
}

export function inspectLevel4ASI(actor) {
  const bare = { readOnly: true, changesApplied: 0, safeToGrantAnotherASI: false };
  if (actor?.type !== 'character') return { ...bare, status: 'not-character', requiresReview: true };
  const items = array(actor.items);
  const classes = items.filter(isOriginalClass);
  if (classes.length !== 1) return { ...bare,
    status: classes.length ? 'duplicate-imported-classes' : 'no-original-pugilist',
    importedClassCount: classes.length, requiresReview: true };
  const cls = classes[0], lvl = Number(cls.system.levels);
  if (!Number.isInteger(lvl) || lvl < 4 || lvl > 6)
    return { ...bare, status: 'outside-level-4-scope', classId: cls.id, level: lvl,
      requiresReview: lvl > 6 };
  const records = levelFour(cls);
  const sentinels = items.filter(isOriginalSentinel);
  const completed = sentinels.map(item => ({ item, entry: featASI(item) })).filter(c => c.entry);
  const summary = { ...bare, level: lvl, classId: cls.id,
    classASIRecordCount: records.length,
    sentinelCount: sentinels.length,
    sentinelASI: completed.length === 1 && sentinels.length === 1 ? {
      featId: completed[0].item.id, advancementId: completed[0].entry.id,
      ability: completed[0].entry.ability, points: completed[0].entry.points,
      currentScore: actor.system?.abilities?.[completed[0].entry.ability]?.value ?? null
    } : null };
  if (records.length > 1 || sentinels.length > 1) return { ...summary,
    status: 'ambiguous-records', requiresReview: true };
  if (records.length === 1) {
    const a = records[0], val = a.value ?? {};
    return { ...summary, classASIId: idOf(a),
      status: val.type === 'asi' && Object.values(val.assignments ?? {}).some(n => Number(n) > 0)
        ? 'class-asi-recorded' : val.type === 'feat' && Object.keys(val.feat ?? {}).length === 1
          ? 'class-feat-recorded' : 'class-asi-unconfigured',
      requiresReview: !((val.type === 'asi' && Object.values(val.assignments ?? {}).some(n => Number(n) > 0))
        || (val.type === 'feat' && Object.keys(val.feat ?? {}).length === 1)) };
  }
  if (summary.sentinelASI) return { ...summary,
    status: 'sentinel-selected-class-asi-unlinked', requiresReview: true,
    note: 'O talento Sentinel e seu +1 estão registrados, mas não existe avanço ASI de nível 4 na classe. Verificar a origem antes de qualquer alteração.' };
  return { ...summary, status: 'class-asi-missing-unverified', requiresReview: true,
    note: 'Não foi comprovado se um ASI/feat já foi concedido manualmente; não conceder automaticamente.' };
}
