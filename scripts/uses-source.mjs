/** Read the persisted uses formula before dnd5e's prepared system replaces it with a number.
 * The live value is a fallback only for tests and document versions without raw source.
 * A derived numeric maximum cannot establish the provenance of a Moxie scale formula. */
export function sourceUsesMax(item) {
  const raw = item?._source?.system?.uses?.max;
  if (raw != null) return raw;
  const snapshot = item?.toObject?.()?.system?.uses?.max;
  return snapshot ?? item?.system?.uses?.max ?? null;
}
