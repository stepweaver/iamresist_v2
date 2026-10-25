/** Additional desk records kept behind an explicit control. Leads stay fully visible. */
export const DESK_VISIBLE_STACK = 6;

export function splitVisibleDeskStack(entries, limit = DESK_VISIBLE_STACK) {
  const list = Array.isArray(entries) ? entries : [];
  const cap = Number.isFinite(limit) && limit > 0 ? limit : list.length;
  return {
    visible: list.slice(0, cap),
    more: list.slice(cap),
  };
}
