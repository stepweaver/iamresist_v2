'use client';

import { useMemo, useState } from 'react';
import {
  applyBriefFilters,
  briefDiagnostics,
  creatorFilterKey,
  creatorFilterLabel,
  formatBriefTimestampRange,
  referencedSourceLabel,
} from '@/lib/creatorNotes/brief';
import {
  briefContentRoleLabel,
  presentBriefNote,
} from '@/lib/creatorNotes/briefPresentation';
import {
  creatorNamesLabel,
  formatTranscriptRange,
  presentEventNote,
  primaryVerificationLabel,
} from '@/lib/briefEvents/format';

function formatWhen(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
}

function isOpaqueEpisodeLabel(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  const filename = text.split(/[\\/]/).pop() || text;
  if (/\.(mp3|m4a|mp4|wav|aac|ogg|webm|json|txt|vtt|srt)$/i.test(filename)) return true;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
  return !/\s/.test(text) && text.length >= 16 && /^[A-Za-z0-9._-]+$/.test(text);
}

function NoteCard({ note }) {
  const presentation = presentBriefNote(note);
  const quote = note.sourceQuote || note.exactQuote || null;
  const referenced = referencedSourceLabel(note);
  const contentRole = briefContentRoleLabel(note.contentRole);
  const hasEvidence = Boolean(note.sourceExcerpt) || (note.sourceSegmentIndexes || []).length > 0;
  const evidenceRange =
    note.startSeconds != null || note.endSeconds != null
      ? formatBriefTimestampRange(note.startSeconds, note.endSeconds)
      : null;

  return (
    <article
      className="min-w-0 break-words border border-border/60 bg-background/30 p-3"
      data-note-kind={presentation.dataAttrs.noteKind}
      data-statement-role={presentation.dataAttrs.statementRole}
      data-verification-status={presentation.dataAttrs.verificationStatus}
      data-brief-lane={presentation.dataAttrs.briefLane}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="kicker text-primary text-[10px] tracking-[0.22em] font-bold">
          {presentation.kindLabel}
        </span>
        <span className="font-mono text-[11px] text-foreground/55">
          {formatTranscriptRange(note.startSeconds, note.endSeconds)}
        </span>
        {presentation.verificationLabel && (
          <span className="font-mono text-[10px] tracking-wider text-foreground/45" data-verification-badge>
            {presentation.verificationLabel}
          </span>
        )}
        {presentation.statementRoleLabel && (
          <span
            className="font-mono text-[10px] tracking-wider text-foreground/50"
            data-statement-role-label
          >
            {presentation.statementRoleLabel}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-foreground/85 leading-relaxed" data-note-text>
        {presentation.displayText}
      </p>
      {presentation.interpretationAttribution && (
        <p
          className="mt-1 font-mono text-[11px] text-foreground/50"
          data-interpretation-attribution
        >
          Creator analysis · {presentation.interpretationAttribution}
        </p>
      )}
      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-foreground/60">
        {contentRole && (
          <div className="min-w-0">
            <dt className="text-foreground/40">Content role</dt>
            <dd className="break-words">{contentRole}</dd>
          </div>
        )}
        {quote && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-foreground/40">Source quote</dt>
            <dd className="break-words text-foreground/75">“{quote}”</dd>
          </div>
        )}
        {referenced && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-foreground/40">Referenced source</dt>
            <dd className="break-words">{referenced}</dd>
          </div>
        )}
      </dl>
      {hasEvidence && (
        <details className="mt-2 border-t border-border/50 pt-2">
          <summary className="cursor-pointer font-mono text-[11px] tracking-wider text-primary">
            EVIDENCE
          </summary>
          <div className="mt-2 space-y-2 text-sm text-foreground/75" data-evidence="open">
            {evidenceRange && (
              <p className="font-mono text-[11px] text-foreground/50">Time range {evidenceRange}</p>
            )}
            {note.sourceExcerpt ? (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{note.sourceExcerpt}</p>
            ) : (
              <p className="text-foreground/45">Evidence text not stored.</p>
            )}
            <p className="font-mono text-[11px] text-foreground/50 break-words">
              Source segments{' '}
              {(note.sourceSegmentIndexes || []).length
                ? note.sourceSegmentIndexes.join(', ')
                : 'not stored'}
            </p>
          </div>
        </details>
      )}
    </article>
  );
}

function EventSection({ title, notes, attributionMode }) {
  if (!notes?.length) return null;
  return (
    <section className="min-w-0" data-event-section={title}>
      <h4 className="font-mono text-[10px] sm:text-[11px] tracking-[0.22em] text-primary mb-2">
        {title}
      </h4>
      <ul className="space-y-3">
        {notes.map((note) => {
          const presented = presentEventNote(note);
          const who =
            attributionMode === 'creator'
              ? presented.interpretationAttribution || note.attribution
              : null;
          return (
            <li key={note.id} className="min-w-0" data-note-id={note.id}>
              {who && (
                <p className="font-mono text-[11px] text-foreground/50 mb-1" data-creator-analysis-label>
                  Creator analysis · {who}
                </p>
              )}
              {presented.statementRoleLabel && attributionMode !== 'creator' && (
                <p className="font-mono text-[11px] text-foreground/50 mb-1">{presented.statementRoleLabel}</p>
              )}
              <p className="text-sm sm:text-[15px] text-foreground/88 leading-relaxed break-words">
                {presented.displayText}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EventCandidateItem({ event }) {
  const [open, setOpen] = useState(false);
  const timeLabel = formatTranscriptRange(event.startSeconds, event.endSeconds);
  const creators = creatorNamesLabel(event);
  const verification = primaryVerificationLabel(event);
  const noteWord = event.noteCount === 1 ? 'note' : 'notes';

  return (
    <article
      className="min-w-0 border-b border-border/50 last:border-b-0 py-4 first:pt-1"
      data-event-candidate={event.id}
      data-note-count={event.noteCount}
    >
      <button
        type="button"
        className="w-full min-w-0 text-left group"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-event-toggle
      >
        <div className="font-mono text-[11px] sm:text-xs tracking-wider text-foreground/55 mb-1.5">
          {timeLabel}
        </div>
        <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-foreground leading-snug break-words">
          {event.headline}
        </h3>
        <p className="mt-2 font-mono text-[11px] sm:text-xs text-foreground/50 break-words">
          {event.noteCount} {noteWord} · {creators}
          {verification ? ` · ${verification}` : ''}
        </p>
        <span className="mt-2 inline-block font-mono text-[10px] tracking-[0.18em] text-primary/80 group-hover:text-primary">
          {open ? 'COLLAPSE' : 'EXPAND'}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-5 pl-0 sm:pl-1" data-event-expanded>
          <EventSection title="DEVELOPMENTS" notes={event.developments} />
          <EventSection title="REPORTED / THIRD-PARTY CLAIMS" notes={event.reportedClaims} />
          <EventSection title="CREATOR ANALYSIS" notes={event.creatorAnalysis} attributionMode="creator" />
          <EventSection title="WHY IT MATTERS" notes={event.whyItMatters} attributionMode="creator" />
          <EventSection title="CONTEXT" notes={event.context} />
          <EventSection title="EVIDENCE / SOURCE NOTES" notes={event.evidence} />

          <details className="border-t border-border/40 pt-3" data-raw-atomic-notes>
            <summary className="cursor-pointer font-mono text-[11px] tracking-wider text-foreground/55 hover:text-primary">
              View {event.noteCount} Atomic Notes
            </summary>
            <div className="mt-3 space-y-3">
              {event.notes.map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          </details>
        </div>
      )}
    </article>
  );
}

export default function AtomicNotesBrief({ episodes, corpus, configured, loadError }) {
  const [creator, setCreator] = useState('');

  const creators = useMemo(() => {
    const seen = new Map();
    for (const episode of episodes || []) {
      const key = creatorFilterKey(episode);
      if (!key || seen.has(key)) continue;
      seen.set(key, creatorFilterLabel(episode));
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [episodes]);

  const visible = useMemo(
    () => applyBriefFilters(episodes || [], { creator }),
    [episodes, creator],
  );
  const diagnostics = useMemo(() => briefDiagnostics(visible), [visible]);
  const timeline = useMemo(() => {
    const base = corpus || {
      days: [],
      eventCount: 0,
      noteCount: 0,
      participatingNoteIds: [],
      excludedNoteCount: 0,
    };
    if (!creator) return base;
    // Client-side creator filter: rebuild days from precomputed events.
    const events = (base.days || []).flatMap((day) =>
      day.events.filter((event) => {
        const key = creatorFilterKey({
          creatorId: event.episode.creatorId,
          creatorName: event.episode.creatorName,
        });
        return key === creator;
      }),
    );
    const days = [];
    for (const event of events) {
      const dayId = `${event.chronology}:${event.date || 'undated'}`;
      let day = days.find((item) => `${item.chronology}:${item.dayKey}` === dayId);
      if (!day) {
        day = {
          dayKey: event.date || 'undated',
          label:
            !event.date || event.date === 'undated'
              ? 'DATE NOT STORED'
              : event.chronology === 'published'
                ? event.date
                : `${event.date} · extraction day`,
          chronology: event.chronology,
          events: [],
        };
        days.push(day);
      }
      day.events.push(event);
    }
    return {
      ...base,
      days,
      eventCount: events.length,
      noteCount: events.reduce((sum, event) => sum + event.noteCount, 0),
    };
  }, [corpus, creator]);
  return (
    <div className="min-w-0 w-full overflow-x-hidden break-words">
      <section className="mb-8" aria-label="Brief status">
        <p className="kicker text-primary text-[10px] sm:text-xs tracking-[0.28em] mb-3">STATUS</p>
        {loadError ? (
          <p className="font-mono text-xs text-foreground/70 break-words">{loadError}</p>
        ) : (
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-[11px] sm:text-xs">
            <div>
              <dt className="text-foreground/45">Event candidates</dt>
              <dd data-testid="brief-event-count">{timeline.eventCount}</dd>
            </div>
            <div>
              <dt className="text-foreground/45">Atomic notes</dt>
              <dd>{timeline.noteCount}</dd>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <dt className="text-foreground/45">Newest extraction</dt>
              <dd className="break-words">{formatWhen(diagnostics.newestExtractionAt) || '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-foreground/45">Creators</dt>
              <dd className="break-words">
                {diagnostics.creators.length ? diagnostics.creators.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <form className="mb-8 max-w-md" onSubmit={(event) => event.preventDefault()}>
        <label className="min-w-0 font-mono text-[11px] sm:text-xs text-foreground/60">
          Creator
          <select
            className="mt-1 w-full bg-background border border-border text-foreground text-sm p-2"
            value={creator}
            onChange={(event) => setCreator(event.target.value)}
            aria-label="Filter by creator"
          >
            <option value="">All creators</option>
            {creators.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </form>

      {!configured && !loadError && (
        <div className="border-l-2 border-primary/60 pl-4 py-2">
          <p className="nav-label text-primary mb-2">[ NOT CONFIGURED ]</p>
          <p className="text-sm sm:text-base text-foreground/70">
            Supabase is not configured, so persisted Atomic Creator Notes cannot be read.
          </p>
        </div>
      )}

      {configured && !loadError && timeline.days.length === 0 && (
        <div className="border-l-2 border-primary/60 pl-4 py-2" data-testid="brief-empty">
          <p className="nav-label text-primary mb-2">[ NO EVENT CANDIDATES ]</p>
          <p className="text-sm sm:text-base text-foreground/70">
            No editorial Atomic Creator Notes matched the current extraction runs.
          </p>
        </div>
      )}

      <div className="space-y-10" data-brief-timeline>
        {timeline.days.map((day) => (
          <section key={`${day.chronology}-${day.dayKey}`} className="min-w-0" data-brief-day={day.dayKey}>
            <h2 className="font-mono text-xs sm:text-sm tracking-[0.28em] text-primary border-b border-border pb-2 mb-1">
              {day.label}
            </h2>
            <div className="divide-y-0">
              {day.events.map((event) => (
                <EventCandidateItem key={event.id} event={event} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {configured && !loadError && (corpus?.eventCount > 0 || diagnostics.noteCount > 0) && (
        <details className="mt-12 border-t border-border/60 pt-4" data-raw-brief-debug>
          <summary className="cursor-pointer font-mono text-[11px] tracking-wider text-foreground/45 hover:text-primary">
            Raw Atomic Notes debug · {diagnostics.noteCount} stored editorial notes
          </summary>
          <p className="mt-2 mb-4 text-xs text-foreground/50 max-w-2xl leading-relaxed">
            Provenance audit layer. Event Candidates above are a read-only grouping of these notes.
            Non-editorial material (sponsor, housekeeping, intro/outro, uncertain) is excluded from
            the timeline.
            {corpus?.excludedNoteCount > 0
              ? ` ${corpus.excludedNoteCount} note(s) excluded from Event Candidates by content role.`
              : ''}
          </p>
          <div className="space-y-6">
            {visible.map((episode) => (
              <section
                key={episode.runId}
                className="min-w-0"
                data-episode={episode.sourceItemId}
                data-extraction-version={episode.extractionVersion}
              >
                <h3 className="font-mono text-[11px] text-foreground/55 mb-2 break-words">
                  {creatorFilterLabel(episode)}
                  {episode.title && !isOpaqueEpisodeLabel(episode.title) ? ` · ${episode.title}` : ''}
                  {` · ${episode.notes.length} notes`}
                </h3>
                <div className="space-y-3">
                  {episode.notes.map((note) => (
                    <NoteCard key={note.id} note={note} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
