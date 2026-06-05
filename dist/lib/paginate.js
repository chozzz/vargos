export function paginate(items, page = 1, limit = 20) {
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), page, limit };
}
//# sourceMappingURL=paginate.js.map