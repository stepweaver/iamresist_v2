const LANE_WARNING_COPY = {
  osint: {
    title: 'Primary-source disclosure',
    body:
      'This lane includes authentic public primary and official channels. Provenance is real, but framing can be source-controlled or politically interested. Verify key assertions independently.',
  },
  defense_ops: {
    title: 'Operational-source disclosure',
    body:
      'This lane includes authentic public military and official channels. Provenance is real, but framing can be operationally interested or source-controlled. Verify key assertions independently.',
  },
  statements: {
    title: 'Claims & statements disclosure',
    body:
      'This lane captures public political claims, statements, and circulating assertions. These items are not confirmed evidence by themselves. Verify against primary records (filings, transcripts, official documents) and independent reporting before treating anything here as true.',
  },
  voices: {
    title: 'Voices lane disclosure',
    body:
      'This lane includes creator commentary and public-feed previews. Items may be insightful or timely but are not neutral reporting or primary records. Verify factual claims independently at the source.',
  },
};

export function getLaneWarningCopy(deskLane) {
  return LANE_WARNING_COPY[deskLane] ?? null;
}

export default function IntelLaneWarning({ deskLane }) {
  const copy = getLaneWarningCopy(deskLane);

  if (!copy) return null;

  return (
    <aside className="border border-border/70 bg-foreground/[0.025] px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/75">{copy.title}</p>
      <p className="mt-1 text-xs text-foreground/72 leading-relaxed">{copy.body}</p>
    </aside>
  );
}
