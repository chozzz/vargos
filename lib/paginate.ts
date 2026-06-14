import { z } from 'zod';

export interface Pagination<T> { items: T[]; page: number; limit: number }

export function paginate<T>(items: T[], page: number = 1, limit: number = 20): Pagination<T> {
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), page, limit };
}

/** Shared schema for collection `list` methods: optional substring query + pagination. */
export const ListSchema = z.object({
  query: z.string().optional(),
  page: z.number().default(1),
  limit: z.number().default(20),
});
export type ListParams = z.infer<typeof ListSchema>;

/** Filter `items` by a case-insensitive substring over `fields(item)`, then paginate. */
export function filterPaginate<T>(
  items: T[],
  params: ListParams,
  fields: (item: T) => string[],
): Pagination<T> {
  const q = params.query?.toLowerCase();
  const matched = q ? items.filter(i => fields(i).some(f => f.toLowerCase().includes(q))) : items;
  return paginate(matched, params.page, params.limit);
}
