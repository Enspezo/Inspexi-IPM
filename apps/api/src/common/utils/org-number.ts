/**
 * Generate the next per-org sequential document number (e.g. `P-2026-0001`,
 * `OFF-2026-0007`). Single-sources the identical logic that lived in
 * projects/quotes: find the highest existing number for `{ orgId, <field> startsWith prefix }`,
 * parse the trailing sequence, increment, zero-pad.
 *
 * The caller supplies the full `prefix` (including any year segment) so this
 * helper stays deterministic/testable. The per-org `@@unique([orgId, <field>])`
 * constraint remains the real correctness guard against races.
 *
 * NB: the sequence is read positionally as `value.split('-')[2]`, so this assumes
 * a `<a>-<b>-<seq>` shape (e.g. `P-2026-0001`, `OFF-2026-0007`). A prefix with a
 * different number of hyphen segments would need this index revisited.
 */
interface SequentialNumberModel {
  findFirst(args: {
    where: Record<string, unknown>;
    orderBy: Record<string, 'asc' | 'desc'>;
    select: Record<string, true>;
  }): Promise<Record<string, unknown> | null>;
}

export async function generateOrgSequentialNumber(
  model: SequentialNumberModel,
  opts: { orgId: string; field: string; prefix: string; pad?: number },
): Promise<string> {
  const { orgId, field, prefix, pad = 4 } = opts;

  const latest = await model.findFirst({
    where: { orgId, [field]: { startsWith: prefix } },
    orderBy: { [field]: 'desc' },
    select: { [field]: true },
  });

  let seq = 1;
  if (latest) {
    const lastSeq = parseInt(String(latest[field]).split('-')[2], 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(pad, '0')}`;
}
