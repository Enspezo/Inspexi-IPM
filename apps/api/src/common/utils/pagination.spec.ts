import { buildOrderBy, paginate } from './pagination';

describe('paginate', () => {
  const rows = [{ id: '1' }, { id: '2' }];
  const model = {
    findMany: jest.fn().mockResolvedValue(rows),
    count: jest.fn().mockResolvedValue(42),
  };

  beforeEach(() => jest.clearAllMocks());

  it('runs findMany and count with skip/take and returns the paginated shape', async () => {
    const where = { orgId: 'org-1' };
    const result = await paginate(model, { where, page: 3, limit: 10 });

    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, skip: 20, take: 10 }),
    );
    expect(model.count).toHaveBeenCalledWith({ where });
    expect(result).toEqual({ data: rows, total: 42, page: 3, limit: 10 });
  });

  it('defaults to page 1, limit 20', async () => {
    await paginate(model, {});
    expect(model.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it('passes include/select/orderBy only when provided', async () => {
    const include = { assignee: true };
    const orderBy = { createdAt: 'desc' as const };
    await paginate(model, { include, orderBy });

    const args = model.findMany.mock.calls[0][0];
    expect(args.include).toEqual(include);
    expect(args.orderBy).toEqual(orderBy);
    expect('select' in args).toBe(false);
  });
});

describe('buildOrderBy', () => {
  const allowed = ['title', 'createdAt'];

  it('uses sortBy when whitelisted', () => {
    expect(buildOrderBy('title', 'asc', allowed)).toEqual({ title: 'asc' });
  });

  it('falls back to default for unknown fields', () => {
    expect(buildOrderBy('passwordHash', 'asc', allowed)).toEqual({ createdAt: 'desc' });
    expect(buildOrderBy(undefined, 'desc', allowed)).toEqual({ createdAt: 'desc' });
  });

  it('respects a custom default', () => {
    expect(buildOrderBy(undefined, 'desc', allowed, { name: 'asc' })).toEqual({ name: 'asc' });
  });
});
