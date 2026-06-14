export interface Pagination<T> { items: T[]; page: number; limit: number }

export function paginate<T>(items: T[], page: number = 1, limit: number = 20): Pagination<T> {
  const start = (page - 1) * limit;
  return { items: items.slice(start, start + limit), page, limit };
}
