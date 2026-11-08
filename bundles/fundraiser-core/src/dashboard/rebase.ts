/**
 * Brings an editor's copy of a list up to date with the saved one, for a list
 * edited in two places at once (a laptop's editor and the phone). Each field
 * takes the saved value unless it's been changed here since the last saved
 * version (`before`): what's being typed here wins, everything else follows
 * the other device. Items come in the saved order; one added here and not
 * saved yet is dropped, as the editor's autosave sends it again.
 */
export function rebase<T extends { id: string }>(local: T[], before: T[], saved: T[]): T[] {
  return saved.map((next) => {
    const mine = local.find((item) => item.id === next.id);
    const was = before.find((item) => item.id === next.id);
    if (!mine || !was) return next;
    const merged = { ...next };
    for (const key of Object.keys(next) as (keyof T)[]) {
      if (JSON.stringify(mine[key]) !== JSON.stringify(was[key])) merged[key] = mine[key];
    }
    return merged;
  });
}
