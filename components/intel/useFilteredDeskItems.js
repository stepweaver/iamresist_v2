'use client';

import { useMemo, useState } from 'react';

/**
 * Build dropdown options from all desk slices (current lane payload only).
 * @param {Record<string, unknown>} desk
 * @returns {{ value: string, label: string }[]}
 */
export function buildSourceOptionsFromDesk(desk) {
  const seen = new Map();
  const addRows = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const row of arr) {
      const slug = row?.sourceSlug;
      if (typeof slug === 'string' && slug && !seen.has(slug)) {
        const name = typeof row.sourceName === 'string' && row.sourceName.trim() ? row.sourceName.trim() : slug;
        seen.set(slug, name);
      }
    }
  };

  addRows(desk?.leadItems);
  addRows(desk?.secondaryLeadItems);
  addRows(desk?.items);
  addRows(desk?.duplicateItems);
  addRows(desk?.suppressedItems);

  const options = [{ value: '', label: 'All sources' }];
  [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }))
    .forEach(([slug, name]) => options.push({ value: slug, label: name }));
  return options;
}

function filterArray(arr, slug) {
  if (!slug || !Array.isArray(arr)) return arr ?? [];
  return arr.filter((r) => r?.sourceSlug === slug);
}

/**
 * @param {Record<string, unknown>} desk
 * @param {string} sourceSlug empty = all
 */
export function filterDeskBySourceSlug(desk, sourceSlug) {
  if (!sourceSlug) return desk;
  return {
    ...desk,
    leadItems: filterArray(desk.leadItems, sourceSlug),
    secondaryLeadItems: filterArray(desk.secondaryLeadItems, sourceSlug),
    items: filterArray(desk.items, sourceSlug),
    duplicateItems: filterArray(desk.duplicateItems, sourceSlug),
    suppressedItems: filterArray(desk.suppressedItems, sourceSlug),
    metadataOnlyItems: filterArray(desk.metadataOnlyItems, sourceSlug),
  };
}

/**
 * @param {Record<string, unknown>} desk
 */
export function useFilteredDesk(desk) {
  const [sourceSlug, setSourceSlug] = useState('');
  const sourceOptions = useMemo(() => buildSourceOptionsFromDesk(desk), [desk]);
  const filteredDesk = useMemo(() => filterDeskBySourceSlug(desk, sourceSlug), [desk, sourceSlug]);
  return { filteredDesk, sourceSlug, setSourceSlug, sourceOptions };
}
