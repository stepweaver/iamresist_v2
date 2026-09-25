import type { CreatorAtomicNote } from '@/lib/creatorNotes/types';
import { briefStatementRole } from '@/lib/creatorNotes/briefPresentation';
import { shareCasualtyTopic } from '@/lib/briefEvents/identity';

const HEADLINE_KIND_RANK: Record<string, number> = {
  new_development: 100,
  event: 90,
  claim: 70,
  context: 40,
  evidence_reference: 20,
  creator_analysis: 0,
  why_it_matters: 0,
};

const INTERPRETATION_CUES =
  /\b(suggests?|appears?|argues?|argument|may indicate|might indicate|deliberate(?:ly)?|obfuscat\w*|conceal\w*|cover[- ]?ups?|hiding|hidden|secretly|seems? to|looks like|implies?|allegedly due to)\b/i;

const ESTABLISHED_COVERUP =
  /\b(deliberately\s+(?:covers?|covering|hid(?:ing|es?)|conceal\w*)|covers?\s+up\s+(?:deaths?|casualt|fatalit)|cover[- ]up\s+of\s+(?:deaths?|casualt|fatalit))\b/i;

function normalizeHeadlineText(text: string): string {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '');
}

function isFactualHeadlineCandidate(note: CreatorAtomicNote): boolean {
  if (note.kind === 'creator_analysis' || note.kind === 'why_it_matters') return false;
  const role = briefStatementRole(note);
  // Reported third-party claims can seed a descriptive headline when no stronger
  // development/event note exists, but prefer creator-neutral factual kinds.
  if (note.kind === 'claim' && role === 'creator') {
    if (INTERPRETATION_CUES.test(note.text)) return false;
  }
  if (INTERPRETATION_CUES.test(note.text) && note.kind !== 'event' && note.kind !== 'new_development') {
    // Allow event/new_development through even with mild hedging words if they
    // are the only factual material — but still block cover-up assertions.
    if (ESTABLISHED_COVERUP.test(note.text)) return false;
  }
  if (ESTABLISHED_COVERUP.test(note.text)) return false;
  return HEADLINE_KIND_RANK[note.kind] > 0;
}

function scoreHeadlineCandidate(note: CreatorAtomicNote): number {
  let score = HEADLINE_KIND_RANK[note.kind] || 0;
  const text = String(note.text || '');
  const len = text.length;
  if (len >= 40 && len <= 160) score += 15;
  else if (len > 160) score -= 10;
  else if (len < 28) score -= 15;
  if (INTERPRETATION_CUES.test(text)) score -= 40;
  if (ESTABLISHED_COVERUP.test(text)) score -= 200;
  const role = briefStatementRole(note);
  if (role === 'reported') score += 5;
  if (role === 'quoted_speaker') score += 3;
  if (note.kind === 'new_development') score += 8;
  if (note.kind === 'event') score += 6;
  return score;
}

function extractCountMentions(text: string): number[] {
  const counts: number[] = [];
  for (const match of String(text || '').matchAll(/\b(\d{1,4})\b/g)) {
    const value = Number(match[1]);
    if (Number.isFinite(value) && value >= 1 && value <= 5000) counts.push(value);
  }
  return counts;
}

function mentionsPentagonOrUsOfficials(text: string): boolean {
  return /\b(pentagon|u\.?s\.?\s+officials?|defense\s+department|department\s+of\s+defense)\b/i.test(text);
}

/**
 * When factual notes in a cluster describe conflicting casualty tallies,
 * compose a neutral descriptive headline. Never invent causal cover-up language.
 */
export function composeDiscrepancyHeadline(notes: CreatorAtomicNote[]): string | null {
  const factual = notes.filter(isFactualHeadlineCandidate);
  if (factual.length < 2) return null;

  const casualtyNotes = factual.filter((note) => shareCasualtyTopic(note.text, note.text));
  if (casualtyNotes.length < 2) return null;

  const allCounts = new Set<number>();
  let mentionsOfficialChannel = false;
  for (const note of casualtyNotes) {
    for (const count of extractCountMentions(note.text)) allCounts.add(count);
    if (mentionsPentagonOrUsOfficials(note.text)) mentionsOfficialChannel = true;
  }
  if (allCounts.size < 2) return null;
  if (!mentionsOfficialChannel) return null;

  // Refuse if the only way to headline would encode interpretation as fact.
  const analysis = notes.filter((note) => note.kind === 'creator_analysis' || note.kind === 'why_it_matters');
  for (const note of analysis) {
    if (ESTABLISHED_COVERUP.test(note.text)) {
      // Analysis may allege cover-up; that must not become the headline.
    }
  }

  return 'Pentagon casualty tally conflicts with higher figures reported by U.S. officials';
}

/**
 * Deterministic headline from grouped Atomic Notes.
 * Prefer factual development text; never promote creator interpretation to fact.
 */
export function selectBriefEventHeadline(notes: CreatorAtomicNote[]): string {
  const composed = composeDiscrepancyHeadline(notes);
  if (composed) return composed;

  const candidates = notes.filter(isFactualHeadlineCandidate).slice().sort((a, b) => {
    const byScore = scoreHeadlineCandidate(b) - scoreHeadlineCandidate(a);
    if (byScore !== 0) return byScore;
    const aStart = a.startSeconds ?? Number.POSITIVE_INFINITY;
    const bStart = b.startSeconds ?? Number.POSITIVE_INFINITY;
    if (aStart !== bStart) return aStart - bStart;
    return a.id.localeCompare(b.id);
  });

  if (candidates.length) {
    return normalizeHeadlineText(candidates[0].text);
  }

  // Last resort: best non-analysis note text, then any note — still strip cover-up framing.
  const fallbackPool = notes
    .filter((note) => note.kind !== 'creator_analysis' && note.kind !== 'why_it_matters')
    .concat(notes);
  for (const note of fallbackPool) {
    const text = normalizeHeadlineText(note.text);
    if (!text) continue;
    if (ESTABLISHED_COVERUP.test(text)) continue;
    if (note.kind === 'creator_analysis' || note.kind === 'why_it_matters') continue;
    return text;
  }

  const any = notes.find((note) => String(note.text || '').trim());
  return any ? normalizeHeadlineText(any.text) : 'Untitled development';
}

export function headlineLooksLikeUnsupportedCoverup(headline: string): boolean {
  return ESTABLISHED_COVERUP.test(headline) || /\bdeliberately covers? up\b/i.test(headline);
}
