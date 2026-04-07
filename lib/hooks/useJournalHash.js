'use client';

import { useState, useEffect } from 'react';
import { findNoteByHash } from '@/lib/utils/slugUtils';

/**
 * Sync selected note ID with URL hash for book club journal views.
 */
export function useJournalHash(notes) {
  const getInitialNoteId = () => {
    if (typeof window === 'undefined' || !notes?.length) return notes?.[0]?.id;
    const hash = window.location.hash;
    const noteFromHash = findNoteByHash(notes, hash);
    return noteFromHash?.id ?? notes[0]?.id;
  };

  const [selectedNoteId, setSelectedNoteId] = useState(getInitialNoteId);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const noteFromHash = findNoteByHash(notes, hash);
      if (noteFromHash) {
        setSelectedNoteId(noteFromHash.id);
      }
    };

    const timeoutId = setTimeout(handleHashChange, 0);
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [notes]);

  return { selectedNoteId, setSelectedNoteId };
}
