export async function paginate(queryFn, { limit } = {}) {
  let cursor = undefined;
  let items = [];

  while (true) {
    const res = await queryFn(cursor);

    items.push(...(res.results ?? []));

    if (limit && items.length >= limit) return items.slice(0, limit);

    if (!res.has_more || !res.next_cursor) return items;

    cursor = res.next_cursor;
  }
}
