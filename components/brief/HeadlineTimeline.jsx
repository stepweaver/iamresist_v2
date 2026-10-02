function coveredBy(cluster) {
  const creators = cluster.uniqueCreators === 1 ? '1 creator' : `${cluster.uniqueCreators} creators`;
  const news = cluster.uniqueNewsSources === 1 ? '1 news source' : `${cluster.uniqueNewsSources} news sources`;
  return `${creators} · ${news}`;
}

function clusterHasNotes(cluster) {
  return cluster.creators.some((creator) => creator.notes.length > 0);
}

/**
 * Discussed by is for creator commentary.
 * A lone source with no Atomic Notes already appears as the headline and in Sources.
 * Several sources with no notes can still list distinct creator names, without their titles.
 */
function showDiscussedBy(cluster) {
  if (!cluster.creators.length) return false;
  if (clusterHasNotes(cluster)) return true;
  return cluster.itemCount > 1;
}

function SourceItems({ members }) {
  return (
    <ul className="space-y-3">
      {members.map((member) => (
        <li key={member.id} className="min-w-0">
          <p className="font-mono text-[10px] tracking-wider text-foreground/45">{member.sourceName}</p>
          {member.url ? (
            <a
              href={member.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-foreground/80 hover:text-primary break-words"
            >
              {member.title}
            </a>
          ) : (
            <p className="text-sm text-foreground/80 break-words">{member.title}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function SourcesDisclosure({ members }) {
  const creatorSources = members.filter((member) => member.sourceKind === 'creator');
  const newsSources = members.filter((member) => member.sourceKind === 'news');
  const groups = [
    creatorSources.length ? { key: 'creators', label: 'CREATOR SOURCES', members: creatorSources } : null,
    newsSources.length ? { key: 'news', label: 'NEWS SOURCES', members: newsSources } : null,
  ].filter(Boolean);
  const split = groups.length > 1;

  return (
    <details className="mt-4 border-t border-border/50 pt-2">
      <summary className="cursor-pointer font-mono text-[11px] tracking-wider text-primary">SOURCES</summary>
      <div className="mt-3 space-y-4">
        {groups.map((group) => (
          <section key={group.key}>
            {split ? (
              <p className="mb-2 font-mono text-[10px] tracking-[0.18em] text-foreground/55">{group.label}</p>
            ) : null}
            <SourceItems members={group.members} />
          </section>
        ))}
      </div>
    </details>
  );
}

function ClusterCard({ cluster, debug }) {
  return (
    <article className="min-w-0 border-l-4 border-primary/80 pl-4 sm:pl-5 py-2" data-brief-cluster={cluster.id}>
      <h3 className="text-lg sm:text-xl font-bold text-foreground leading-snug break-words">
        {cluster.headlineUrl ? (
          <a href={cluster.headlineUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
            {cluster.headline}
          </a>
        ) : (
          cluster.headline
        )}
      </h3>

      {cluster.summary && (
        <p className="mt-2 max-w-3xl text-sm text-foreground/75 leading-relaxed">
          {cluster.summary}
          {cluster.summarySourceName ? (
            <span className="ml-2 font-mono text-[10px] tracking-wider text-foreground/45">
              {cluster.summarySourceName}
            </span>
          ) : null}
        </p>
      )}

      <p className="mt-3 font-mono text-[11px] tracking-wide text-foreground/70" data-convergence>
        Covered by: {coveredBy(cluster)}
      </p>
      <p className="mt-1 font-mono text-[11px] text-foreground/50">
        {cluster.itemCount} source {cluster.itemCount === 1 ? 'item' : 'items'}
        {' · '}
        latest update {cluster.latestLabel}
        {cluster.crossSource ? ' · creators and news' : ''}
      </p>

      {showDiscussedBy(cluster) && (
        <div className="mt-4 space-y-4" data-discussed-by>
          <p className="kicker text-primary text-[10px] tracking-[0.22em] font-bold">DISCUSSED BY</p>
          {cluster.creators.map((creator) => (
            <section key={creator.creatorId} className="min-w-0">
              <h4 className="text-sm font-bold text-foreground">{creator.creatorName}</h4>
              {creator.notes.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {creator.notes.map((note) => (
                    <li key={note.id} className="text-sm text-foreground/85 leading-relaxed break-words">
                      <span className="text-primary mr-2">•</span>
                      {note.evidenceUrl ? (
                        <a href={note.evidenceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary">
                          {note.text}
                        </a>
                      ) : (
                        note.text
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      <SourcesDisclosure members={cluster.members} />

      {debug && (
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-foreground/55" data-rank-debug>
          <div>score {cluster.score}</div>
          <div>creator points {cluster.rank.creatorPoints}</div>
          <div>news points {cluster.rank.newsPoints}</div>
          <div>cross-source {cluster.rank.crossSourcePoints}</div>
          <div>recency {cluster.rank.recencyPoints}</div>
          <div>repeat {cluster.rank.repeatPoints}</div>
          <div className="sm:col-span-2 break-words">
            shared tokens {cluster.sharedTokens.length ? cluster.sharedTokens.join(', ') : '—'}
          </div>
        </dl>
      )}
    </article>
  );
}

export default function HeadlineTimeline({ timeline, debug = false, loadError = null }) {
  if (loadError) {
    return <p className="text-sm text-foreground/70">{loadError}</p>;
  }
  if (!timeline) {
    return <p className="text-sm text-foreground/70">The brief is empty.</p>;
  }

  const shown = timeline.days.reduce((sum, day) => sum + day.clusters.length, 0);

  return (
    <div className="min-w-0">
      <p className="mb-8 font-mono text-[11px] tracking-wide text-foreground/50">
        Rolling {timeline.windowHours} hours · {timeline.creatorCandidateCount} creator titles · {timeline.newsCandidateCount} news titles · {shown} stories shown
        {timeline.clusterCount > shown ? ` · ${timeline.clusterCount} clusters ranked` : ''}
      </p>

      {timeline.warnings.length > 0 && (
        <ul className="mb-8 space-y-1 text-sm text-foreground/60">
          {timeline.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      {!shown && (
        <p className="text-sm text-foreground/70 leading-relaxed max-w-2xl">
          {timeline.creatorCandidateCount + timeline.newsCandidateCount > 0
            ? 'No converged stories in this window yet. A story appears when at least two creators, two news sources, or a creator and a news source cover the same headline.'
            : 'No recent titles in this window. Source ingest and the Newswire feeds are what fill the brief.'}
        </p>
      )}

      <div className="space-y-12">
        {timeline.days.map((day) => (
          <section key={day.dayKey}>
            <h2 className="mb-6 text-xs sm:text-sm font-bold tracking-[0.22em] text-primary">{day.label}</h2>
            <div className="space-y-8">
              {day.clusters.map((cluster) => (
                <ClusterCard key={cluster.id} cluster={cluster} debug={debug} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
