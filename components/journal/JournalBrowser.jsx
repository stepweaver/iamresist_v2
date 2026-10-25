'use client';

import { useEffect, useState } from 'react';
import JournalIndex from '@/components/journal/JournalIndex';
import { readJournalTagParam, toggleJournalTag } from '@/components/journal/journalFormat';

function scrollToArchive() {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.getElementById('records')?.scrollIntoView({
    behavior: reduce ? 'auto' : 'smooth',
    block: 'start',
  });
}

function writeTagUrl(tag) {
  const path = tag ? `/journal?tag=${encodeURIComponent(tag)}` : '/journal';
  window.history.replaceState(null, '', `${path}#records`);
}

export default function JournalBrowser({
  subjects = [],
  records,
  searchCoversArchive,
  pinnedIds = [],
}) {
  const [activeTag, setActiveTag] = useState('');

  useEffect(() => {
    const tag = readJournalTagParam(new URLSearchParams(window.location.search).get('tag'));
    if (!tag) return;
    setActiveTag(tag);
    document.getElementById('records')?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }, []);

  function selectTag(tag) {
    const next = toggleJournalTag(activeTag, tag);
    setActiveTag(next);
    writeTagUrl(next);
    scrollToArchive();
  }

  return (
    <>
      {subjects.length > 0 ? (
        <nav className="journal-subjects" aria-label="Explore by subject">
          <h2 className="journal-subjects__title">Explore by subject</h2>
          <ul className="journal-subjects__list">
            {subjects.map((tag) => {
              const pressed = activeTag.trim().toLowerCase() === tag.trim().toLowerCase();
              return (
                <li key={tag}>
                  <button
                    type="button"
                    className="journal-subject"
                    aria-pressed={pressed}
                    onClick={() => selectTag(tag)}
                  >
                    {tag}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
      <JournalIndex
        records={records}
        searchCoversArchive={searchCoversArchive}
        activeTag={activeTag}
        pinnedIds={pinnedIds}
        onClearTag={() => selectTag(activeTag)}
      />
    </>
  );
}
