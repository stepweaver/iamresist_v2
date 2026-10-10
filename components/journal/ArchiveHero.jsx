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
    </header>
  );
}
