import type { Pagination } from '../gateway/events.js';

export function paginate<T>(items: T[], page: number, limit = 20): Pagination<T> {
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), page, limit };
}
