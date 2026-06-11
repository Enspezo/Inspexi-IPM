/**
 * Shared pagination helper for Prisma list queries.
 * Replaces the repeated skip/take + Promise.all([findMany, count]) pattern.
 */

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface PaginateModel<T> {
  findMany(args: any): Promise<T[]>;
  count(args: { where?: any }): Promise<number>;
}

export interface PaginateArgs {
  where?: unknown;
  include?: unknown;
  select?: unknown;
  orderBy?: unknown;
  page?: number;
  limit?: number;
}

/**
 * Run a paginated findMany + count on a Prisma model delegate.
 *
 * ```ts
 * return paginate(this.prisma.task, { where, include, orderBy, page, limit });
 * ```
 */
export async function paginate<T>(
  model: PaginateModel<T>,
  { where, include, select, orderBy, page = 1, limit = 20 }: PaginateArgs,
): Promise<PaginatedResult<T>> {
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    model.findMany({
      where,
      ...(include ? { include } : {}),
      ...(select ? { select } : {}),
      orderBy,
      skip,
      take: limit,
    }),
    model.count({ where }),
  ]);

  return { data, total, page, limit };
}

/**
 * Build a safe orderBy object from user-supplied sortBy/sortOrder.
 * Unknown sort fields fall back to the default.
 */
export function buildOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' = 'desc',
  allowedFields: string[],
  defaultOrderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' },
): Record<string, 'asc' | 'desc'> {
  if (sortBy && allowedFields.includes(sortBy)) {
    return { [sortBy]: sortOrder };
  }
  return defaultOrderBy;
}
