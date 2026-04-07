'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { formatJournalMetaDate } from '@/lib/utils/date';

/**
 * Sidebar list of journal entries (mobile dropdown + desktop nav)
 */
export default function JournalNoteList({ notes, selectedNoteId, onNoteSelect, book }) {
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <div className="lg:hidden mb-6">
        <label
          htmlFor="note-select"
          className="block text-xs uppercase tracking-wider font-bold text-primary mb-2"
        >
          Jump to Entry
        </label>
        <select
          id="note-select"
          value={selectedNoteId}
          onChange={(e) => onNoteSelect(e.target.value)}
          className="w-full bg-military-black border border-border text-foreground px-4 py-3 text-sm focus:border-primary focus:outline-none"
        >
          {notes.map((note) => {
            const displayDate = note.createdTime || note.lastEditedTime;
            return (
              <option key={note.id} value={note.id}>
                {displayDate ? formatJournalMetaDate(displayDate) : '—'} - {note.title}
              </option>
            );
          })}
        </select>
      </div>

      <div className="hidden lg:block">
        <h3 className="text-xs uppercase tracking-wider font-bold text-primary mb-4">
          All Entries ({notes.length})
        </h3>
        <nav className="space-y-2">
          {notes.map((note) => {
            const displayDate = note.createdTime || note.lastEditedTime;
            const isSelected = note.id === selectedNoteId;

            return (
              <div key={note.id} className="relative">
                <button
                  type="button"
                  onClick={() => onNoteSelect(note.id)}
                  className={`w-full text-left p-4 border-l-2 transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border hover:border-primary/50 text-foreground/70 hover:text-foreground hover:bg-primary/5'
                  }`}
                >
                  <div className="text-xs font-bold text-primary mb-2">
                    {displayDate ? formatJournalMetaDate(displayDate) : '—'}
                  </div>
                  <div className="text-sm font-semibold line-clamp-2 leading-tight pr-8">
                    {note.title}
                  </div>
                </button>
                {note.slug && (
                  <Link
                    href={`/book-club/${book.slug}/entries/${note.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute top-4 right-4 text-foreground/50 hover:text-primary transition-colors flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Open entry in new tab"
                  >
                    <ExternalLink className="w-4 h-4" aria-hidden />
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
