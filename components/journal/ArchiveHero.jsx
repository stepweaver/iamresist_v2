export default function ArchiveHero() {
  return (
    <header className="journal-hero">
      <div className="journal-hero__copy-block">
        <p className="journal-kicker">
          <span>I AM [RESIST]</span>
          <span>Journal</span>
        </p>
        <h1 className="journal-hero__title">Essays & Analysis</h1>
        <p className="journal-hero__lede">
          Original writing on power, propaganda, democratic accountability, and
          the responsibility to question what we believe.
        </p>
        <a className="journal-hero__jump" href="#records">
          Browse the archive
        </a>
      </div>
    </header>
  );
}
