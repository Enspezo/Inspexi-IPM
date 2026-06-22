import { generateOrgSequentialNumber } from './org-number';

describe('generateOrgSequentialNumber', () => {
  const makeModel = (latest: Record<string, unknown> | null) => ({
    findFirst: jest.fn().mockResolvedValue(latest),
  });

  it('returns ...0001 when no rows exist yet', async () => {
    const model = makeModel(null);
    const result = await generateOrgSequentialNumber(model, {
      orgId: 'org-1',
      field: 'projectNumber',
      prefix: 'P-2026-',
    });
    expect(result).toBe('P-2026-0001');
  });

  it('increments the trailing sequence of the latest row', async () => {
    const model = makeModel({ quoteNumber: 'OFF-2026-0007' });
    const result = await generateOrgSequentialNumber(model, {
      orgId: 'org-1',
      field: 'quoteNumber',
      prefix: 'OFF-2026-',
    });
    expect(result).toBe('OFF-2026-0008');
  });

  it('rolls over past 9999 without truncating', async () => {
    const model = makeModel({ projectNumber: 'P-2026-9999' });
    const result = await generateOrgSequentialNumber(model, {
      orgId: 'org-1',
      field: 'projectNumber',
      prefix: 'P-2026-',
    });
    expect(result).toBe('P-2026-10000');
  });

  it('falls back to ...0001 when the latest value is unparseable', async () => {
    const model = makeModel({ projectNumber: 'P-2026-BROKEN' });
    const result = await generateOrgSequentialNumber(model, {
      orgId: 'org-1',
      field: 'projectNumber',
      prefix: 'P-2026-',
    });
    expect(result).toBe('P-2026-0001');
  });

  it('scopes the query to the org + prefix and sorts descending', async () => {
    const model = makeModel(null);
    await generateOrgSequentialNumber(model, {
      orgId: 'org-9',
      field: 'projectNumber',
      prefix: 'P-2026-',
    });
    expect(model.findFirst).toHaveBeenCalledWith({
      where: { orgId: 'org-9', projectNumber: { startsWith: 'P-2026-' } },
      orderBy: { projectNumber: 'desc' },
      select: { projectNumber: true },
    });
  });
});
