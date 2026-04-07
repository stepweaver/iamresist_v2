/**
 * Slug utilities for URL-safe identifiers (book club hash navigation).
 */

export function generateSlug(title) {
  if (!title || typeof title !== 'string') return '';
  return title.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Find a note by hash (e.g. #my-note-title)
 * @param {Array} notes - Array of notes with id, slug, title
 * @param {string} hash - Hash string with or without #
 * @param {function} generateSlugFn - Optional slug generator (default: generateSlug)
 */
export function findNoteByHash(notes, hash, generateSlugFn = generateSlug) {
  if (!hash || !notes?.length) return null;

  const slug = hash.startsWith('#') ? hash.slice(1) : hash;

  let note = notes.find((n) => n.slug === slug);
  if (!note) {
    note = notes.find((n) => {
      const noteSlug = n.slug || generateSlugFn(n.title);
      return noteSlug === slug;
    });
  }

  return note ?? null;
}
