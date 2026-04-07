'use client';

import { useJournalHash } from '@/lib/hooks/useJournalHash';
import JournalNoteList from '@/components/bookclub/JournalNoteList';
import JournalNoteContent from '@/components/bookclub/JournalNoteContent';

export default function JournalView({ notes, book, blocksByNoteId = {} }) {
  const { selectedNoteId, setSelectedNoteId } = useJournalHash(notes);

  const selectedNote = notes.find((note) => note.id === selectedNoteId) || notes[0];

  const handleNoteSelect = (noteId) => {
    setSelectedNoteId(noteId);
  };

  return (
    <div className="space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[280px_1fr] lg:gap-8 xl:gap-12">
      <JournalNoteList
        notes={notes}
        selectedNoteId={selectedNoteId}
        onNoteSelect={handleNoteSelect}
        book={book}
      />
      <div>
        {selectedNote && (
          <JournalNoteContent
            note={selectedNote}
            book={book}
            fullContent={blocksByNoteId[selectedNote.id] ?? null}
          />
        )}
      </div>
    </div>
  );
}
