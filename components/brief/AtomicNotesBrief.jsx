'use client';

import { useMemo, useState } from 'react';
import { CREATOR_NOTE_KINDS } from '@/lib/creatorNotes/constants';
import {
  applyBriefFilters,
  briefDiagnostics,
  creatorFilterKey,
  creatorFilterLabel,
  formatBriefTimestampRange,
  groupBriefEpisodes,
  referencedSourceLabel,
} from '@/lib/creatorNotes/brief';
import {
  briefContentRoleLabel,
  briefKindLabel,
  presentBriefNote,
} from '@/lib/creatorNotes/briefPresentation';

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

function episodeHeading(episode) {
  const title = String(episode.title || '').trim();
  if (!title || title === episode.sourceItemId || isOpaqueEpisodeLabel(title)) return null;
  return title;
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
      className="min-w-0 break-words border border-border bg-background/40 p-3 sm:p-4"
      data-note-kind={presentation.dataAttrs.noteKind}
      data-statement-role={presentation.dataAttrs.statementRole}
      data-verification-status={presentation.dataAttrs.verificationStatus}
      data-brief-lane={presentation.dataAttrs.briefLane}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="kicker text-primary text-[10px] sm:text-xs tracking-[0.28em] font-bold">
          {presentation.kindLabel}
        </span>
        <span className="font-mono text-[11px] sm:text-xs text-foreground/70">
          {formatBriefTimestampRange(note.startSeconds, note.endSeconds)}
        </span>
        {presentation.verificationLabel && (
          <span
            className="font-mono text-[10px] sm:text-xs tracking-wider text-foreground/50"
            data-verification-badge
          >
            {presentation.verificationLabel}
          </span>
        )}
        {presentation.statementRoleLabel && (
          <span
            className="font-mono text-[10px] sm:text-xs tracking-wider text-foreground/55"
            data-statement-role-label
          >
            {presentation.statementRoleLabel}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm sm:text-base text-foreground/90 leading-relaxed" data-note-text>
        {presentation.displayText}
      </p>
      {presentation.interpretationAttribution && (
        <p
          className="mt-1 font-mono text-[11px] sm:text-xs text-foreground/55"
          data-interpretation-attribution
        >
          Interpretation · {presentation.interpretationAttribution}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] sm:text-xs text-foreground/70">
        {contentRole && (
          <div className="min-w-0">
            <dt className="text-foreground/45">Content role</dt>
            <dd className="break-words">{contentRole}</dd>
          </div>
        )}
        {quote && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-foreground/45">Source quote</dt>
            <dd className="break-words text-foreground/80">“{quote}”</dd>
          </div>
        )}
        {referenced && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-foreground/45">Referenced source</dt>
            <dd className="break-words">{referenced}</dd>
          </div>
        )}
      </dl>
      {hasEvidence && (
        <details className="mt-3 border-t border-border/70 pt-2">
          <summary className="cursor-pointer font-mono text-[11px] sm:text-xs tracking-wider text-primary">
            EVIDENCE
          </summary>
          <div className="mt-2 space-y-2 text-sm text-foreground/80" data-evidence="open">
            {evidenceRange && (
              <p className="font-mono text-[11px] sm:text-xs text-foreground/60">Time range {evidenceRange}</p>
            )}
            {note.sourceExcerpt ? (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{note.sourceExcerpt}</p>
            ) : (
              <p className="text-foreground/50">Evidence text not stored.</p>
            )}
            <p className="font-mono text-[11px] sm:text-xs text-foreground/60 break-words">
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

export default function AtomicNotesBrief({ episodes, configured, loadError }) {
  const [creator, setCreator] = useState('');
  const [kind, setKind] = useState('');

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
    () => applyBriefFilters(episodes || [], { creator, kind }),
    [episodes, creator, kind],
  );
  const days = useMemo(() => groupBriefEpisodes(visible), [visible]);
  const diagnostics = useMemo(() => briefDiagnostics(visible), [visible]);

  return (
    <div className="min-w-0 w-full overflow-x-hidden break-words">
      <section className="machine-panel mb-6 p-3 sm:p-4" aria-label="Brief status">
        <p className="kicker text-primary text-[10px] sm:text-xs tracking-[0.28em] mb-3">STATUS</p>
        {loadError ? (
          <p className="font-mono text-xs text-foreground/70 break-words">{loadError}</p>
        ) : (
          <dl className="grid grid-cols-2 lg:grid-cols-5 gap-3 font-mono text-[11px] sm:text-xs">
            <div>
              <dt className="text-foreground/45">Episodes</dt>
              <dd>{diagnostics.episodeCount}</dd>
            </div>
            <div>
              <dt className="text-foreground/45">Atomic notes</dt>
              <dd>{diagnostics.noteCount}</dd>
            </div>
            <div className="col-span-2 lg:col-span-1">
              <dt className="text-foreground/45">Newest extraction</dt>
              <dd className="break-words">{formatWhen(diagnostics.newestExtractionAt) || '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-foreground/45">Creators</dt>
              <dd className="break-words">{diagnostics.creators.length ? diagnostics.creators.join(', ') : '—'}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-foreground/45">Extraction versions</dt>
              <dd className="break-words">
                {diagnostics.extractionVersions.length ? diagnostics.extractionVersions.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <form className="mb-8 flex flex-col sm:flex-row gap-3" onSubmit={(event) => event.preventDefault()}>
        <label className="min-w-0 flex-1 font-mono text-[11px] sm:text-xs text-foreground/60">
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
        <label className="min-w-0 flex-1 font-mono text-[11px] sm:text-xs text-foreground/60">
          Note kind
          <select
            className="mt-1 w-full bg-background border border-border text-foreground text-sm p-2"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-label="Filter by note kind"
          >
            <option value="">All kinds</option>
            {CREATOR_NOTE_KINDS.map((value) => (
              <option key={value} value={value}>
                {briefKindLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </form>

      {!configured && !loadError && (
        <div className="machine-panel border border-border p-6 sm:p-8">
          <p className="nav-label text-primary mb-3">[ NOT CONFIGURED ]</p>
          <p className="text-sm sm:text-base text-foreground/70">
            Supabase is not configured, so persisted Atomic Creator Notes cannot be read.
          </p>
        </div>
      )}

      {configured && !loadError && days.length === 0 && (
        <div className="machine-panel border border-border p-6 sm:p-8" data-testid="brief-empty">
          <p className="nav-label text-primary mb-3">[ NO EDITORIAL NOTES ]</p>
          <p className="text-sm sm:text-base text-foreground/70">
            No editorial Atomic Creator Notes matched the current extraction runs.
          </p>
        </div>
      )}

      <div className="space-y-10">
        {days.map((day) => (
          <section key={`${day.chronology}-${day.dayKey}`} className="min-w-0">
            <h2 className="font-mono text-xs sm:text-sm tracking-[0.22em] text-primary border-b border-border pb-2 mb-4">
              {day.label}
            </h2>
            <div className="space-y-8">
              {day.creators.map((creatorGroup) => (
                <div key={creatorGroup.creatorKey} className="min-w-0" data-creator={creatorGroup.creatorKey}>
                  <h3 className="text-lg sm:text-xl font-bold text-foreground mb-3 break-words">
                    {creatorFilterLabel(creatorGroup)}
                  </h3>
                  <div className="space-y-6">
                    {creatorGroup.episodes.map((episode) => {
                      const heading = episodeHeading(episode);
                      return (
                      <section
                        key={episode.runId}
                        className="min-w-0 border-l-2 border-primary/70 pl-3 sm:pl-4"
                        data-episode={episode.sourceItemId}
                        data-extraction-version={episode.extractionVersion}
                      >
                        <header className="mb-3">
                          {heading && (
                            <h4 className="text-base sm:text-lg text-foreground break-words">
                              {heading}
                            </h4>
                          )}
                          <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] sm:text-xs text-foreground/65">
                            <div>
                              <dt className="text-foreground/40">Published</dt>
                              <dd className="break-words">{formatWhen(episode.publishedAt) || 'not stored'}</dd>
                            </div>
                            <div>
                              <dt className="text-foreground/40">Extraction</dt>
                              <dd className="break-words">
                                {episode.extractionVersion}
                                {episode.extractedAt ? ` · ${formatWhen(episode.extractedAt)}` : ''}
                              </dd>
                            </div>
                            {episode.transcriptSource && (
                              <div>
                                <dt className="text-foreground/40">Transcript source</dt>
                                <dd className="break-words">{episode.transcriptSource}</dd>
                              </div>
                            )}
                            <div>
                              <dt className="text-foreground/40">Notes</dt>
                              <dd>{episode.notes.length}</dd>
                            </div>
                            {episode.sourceUrl && (
                              <div className="min-w-0 sm:col-span-2">
                                <dt className="text-foreground/40">Source URL</dt>
                                <dd className="break-words">
                                  <a
                                    href={episode.sourceUrl}
                                    className="text-primary underline break-all"
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {episode.sourceUrl}
                                  </a>
                                </dd>
                              </div>
                            )}
                          </dl>
                        </header>
                        <div className="space-y-3">
                          {episode.notes.map((note) => (
                            <NoteCard key={note.id} note={note} />
                          ))}
                        </div>
                      </section>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
