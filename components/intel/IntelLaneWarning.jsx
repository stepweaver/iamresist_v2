const LANE_WARNING_COPY = {
  osint: {
    title: 'Primary-source disclosure',
    body:
      'Public and official records are included. The source can be real while the framing is politically interested. Verify key assertions independently.',
  },
  defense_ops: {
    title: 'Operational-source disclosure',
    body:
      'Public military and official records are included. The source can be real while the framing serves an operational interest. Verify key assertions independently.',
  },
  statements: {
    title: 'Claims and statements',
    body:
      'Public political claims and statements are included. They are not confirmed evidence by themselves. Verify them against primary records — filings, transcripts, and official documents — and independent reporting.',
  },
  voices: {
    title: 'Creator commentary',
    body:
      'Creator commentary is included. It is not neutral reporting or a primary record. Verify factual claims at the source.',
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
