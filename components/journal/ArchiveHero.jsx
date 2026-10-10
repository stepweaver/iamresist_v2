export default function ArchiveHero() {
  return (
    <header className="journal-hero">
      <div className="journal-hero__copy-block">
        <p className="journal-kicker">
          <span>I AM [RESIST]</span>
          <span className="journal-kicker__mark" aria-hidden="true" />
          <span>Journal</span>
        </p>
        <h1 className="journal-hero__title">The Resistance Archive</h1>
        <p className="journal-hero__lede">
          Editorial notes, reflections, and field observations from I AM
          [RESIST]. Published writing, collected as a record.
        </p>
        <a className="journal-hero__jump" href="#records">
          Browse the index
        </a>
      </div>
      <div className="journal-radar" aria-hidden="true">
        <span className="journal-radar__ticks" />
        <span className="journal-radar__ring journal-radar__ring--outer" />
        <span className="journal-radar__ring journal-radar__ring--mid" />
        <span className="journal-radar__ring journal-radar__ring--inner" />
        <span className="journal-radar__cross journal-radar__cross--h" />
        <span className="journal-radar__cross journal-radar__cross--v" />
        <span className="journal-radar__sweep" />
        <span className="journal-radar__hub" />
        <span className="journal-radar__bracket journal-radar__bracket--tl" />
        <span className="journal-radar__bracket journal-radar__bracket--tr" />
        <span className="journal-radar__bracket journal-radar__bracket--bl" />
        <span className="journal-radar__bracket journal-radar__bracket--br" />
      </div>
    </header>
  );
}
