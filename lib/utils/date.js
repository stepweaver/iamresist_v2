const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
];

export function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

/** Calendar YYYY-MM-DD or ISO timestamp → DD-MMM-YYYY (HUD-style). Avoids TZ shift for date-only strings. */
export function formatJournalMetaDate(value) {
  if (!value) return '';
  const s = typeof value === 'string' ? value.trim() : String(value);
  const dateOnlyMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const [, y, m, day] = dateOnlyMatch;
    const monthIdx = parseInt(m, 10) - 1;
    const mon = MONTHS[monthIdx] ?? '???';
    return `${day}-${mon}-${y}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()] ?? '???';
  const y = d.getUTCFullYear();
  return `${day}-${mon}-${y}`;
}
