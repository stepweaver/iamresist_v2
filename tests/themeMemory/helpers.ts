import type { ThemeAIProvider, ThemeMembershipClassifyInput } from '@/lib/themeMemory/ai/types';
import { ThemeAIUnavailableError, ThemeAIValidationError } from '@/lib/themeMemory/ai/types';
import {
  normalizeIntelThemeCandidate,
  normalizeNewswireThemeCandidate,
  normalizeVoiceThemeCandidate,
} from '@/lib/themeMemory/normalize';
import type { ThemeCandidateItem } from '@/lib/themeMemory/types';
import type { ThemeLabelResult, ThemeMembershipDecision } from '@/lib/themeMemory/themeTypes';

const FETCHED = '2026-09-15T16:00:00.000Z';

export function voiceCandidate(input: {
  slug: string;
  name?: string;
  title: string;
  url?: string;
  publishedAt: string;
  summary?: string;
  id?: string;
}): ThemeCandidateItem {
  const id = input.id || input.url || `${input.slug}-${input.publishedAt}`;
  const item = normalizeVoiceThemeCandidate(
    {
      id,
      sourceId: id,
      title: input.title,
      url: input.url || `https://${input.slug}.test/episodes/${encodeURIComponent(id)}`,
      publishedAt: input.publishedAt,
      description: input.summary || input.title,
      voice: {
        id: `voice-${input.slug}`,
        title: input.name || input.slug,
        slug: input.slug,
        homeUrl: `https://${input.slug}.test`,
        platform: 'YouTube',
      },
    },
    FETCHED,
  );
  if (!item) throw new Error('expected voice candidate');
  return item;
}

export function newswireCandidate(input: {
  slug: string;
  source?: string;
  title: string;
  url: string;
  publishedAt: string;
  summary?: string;
  isCurated?: boolean;
}): ThemeCandidateItem {
  const item = normalizeNewswireThemeCandidate(
    {
      id: input.url,
      source: input.source || input.slug,
      sourceSlug: input.slug,
      title: input.title,
      url: input.url,
      excerpt: input.summary || input.title,
      publishedAt: input.publishedAt,
      isCurated: Boolean(input.isCurated),
    },
    FETCHED,
  );
  if (!item) throw new Error('expected newswire candidate');
  return item;
}

export function intelCandidate(input: {
  id: string;
  slug: string;
  name?: string;
  title: string;
  url: string;
  publishedAt: string;
  summary?: string;
  provenance: 'PRIMARY' | 'SPECIALIST' | 'WIRE' | 'INDIE' | 'COMMENTARY';
  sourceFamily?: string;
}): ThemeCandidateItem {
  const item = normalizeIntelThemeCandidate({
    id: input.id,
    canonical_url: input.url,
    title: input.title,
    summary: input.summary || input.title,
    published_at: input.publishedAt,
    fetched_at: FETCHED,
    content_hash: `hash-${input.id}`,
    desk_lane: 'osint',
    sources: {
      slug: input.slug,
      name: input.name || input.slug,
      provenance_class: input.provenance,
      desk_lane: 'osint',
      source_family: input.sourceFamily || 'general',
    },
  });
  if (!item) throw new Error('expected intel candidate');
  return item;
}

export function createTestThemeAIProvider(opts: {
  mode?: 'overlap' | 'reject' | 'malformed' | 'unavailable';
  classify?: (input: ThemeMembershipClassifyInput) => ThemeMembershipDecision | Promise<ThemeMembershipDecision>;
} = {}): ThemeAIProvider {
  const mode = opts.mode || 'overlap';
  return {
    name: 'test',
    model: 'test-model',
    async classifyMembership(input) {
      if (opts.classify) return opts.classify(input);
      if (mode === 'unavailable') throw new ThemeAIUnavailableError('ollama_timeout');
      if (mode === 'malformed') throw new ThemeAIValidationError('belongs_not_boolean');
      if (mode === 'reject') {
        return { belongs: false, confidence: 0.1, reasons: ['test_reject'] };
      }
      const belongs = input.fingerprintOverlap.sharedDistinctive.length >= 1 || input.fingerprintOverlap.sharedPhrases.length >= 1;
      return {
        belongs,
        confidence: belongs ? 0.86 : 0.12,
        reasons: belongs ? ['test_shared_subject'] : ['test_no_shared_subject'],
      };
    },
    async generateThemeLabel(input): Promise<ThemeLabelResult> {
      if (mode === 'unavailable') throw new ThemeAIUnavailableError('ollama_timeout');
      if (mode === 'malformed') throw new ThemeAIValidationError('canonicalLabel_not_string');
      const label = input.currentLabel || 'test theme';
      return {
        canonicalLabel: label.slice(0, 80),
        headline: `Legal coverage of ${label} continues`.slice(0, 140),
        summary: `Tracked creators continued covering ${label} this week.`.slice(0, 400),
      };
    },
  };
}
