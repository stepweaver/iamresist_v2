import { extractBillClusterKeys, extractExecutiveClusterKeys, mergeClusterParts } from '@/lib/intel/clusterKeys';
import { classifyEvent } from '@/lib/intel/eventClassification';
import { storyTextTokens, storyTokenJaccard } from '@/lib/intel/storyCoherence';
import { extractPersonEntitySpans } from '@/lib/themeMemory/entityAnchors';
import {
  featureStrength,
  isDistinctiveActionToken,
  isWeakEntityToken,
  phraseStrength,
  stemThemeToken,
} from '@/lib/themeMemory/featureStrength';
import type { ThemeCandidateItem } from '@/lib/themeMemory/types';
import type { ThemeFingerprint } from '@/lib/themeMemory/themeTypes';

export {
  featureStrength,
  isGenericInstitutionalEventType,
  isWeakEntityToken,
  phraseStrength,
  stemThemeToken,
} from '@/lib/themeMemory/featureStrength';

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function phrasesFromTokens(tokens: string[]): string[] {
  const phrases: string[] = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return unique(phrases).slice(0, 16);
}

function clusterKeysFromItem(item: ThemeCandidateItem): Record<string, string> {
  const fromMeta = item.metadata?.clusterKeys;
  const metaKeys =
    fromMeta && typeof fromMeta === 'object' && !Array.isArray(fromMeta)
      ? Object.fromEntries(
          Object.entries(fromMeta as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string' && v)
            .map(([k, v]) => [k, String(v)]),
        )
      : {};
  return mergeClusterParts(
    metaKeys,
    extractBillClusterKeys(item.canonicalUrl),
    extractExecutiveClusterKeys(item.title),
  );
}

function actionHintsFromTokens(tokens: string[]): string[] {
  return unique(tokens.map(stemThemeToken).filter((token) => isDistinctiveActionToken(token)));
}

export function extractThemeFingerprint(input: {
  title: string;
  summary?: string | null;
  canonicalUrl?: string | null;
  clusterKeys?: Record<string, string> | null;
}): ThemeFingerprint {
  const text = `${input.title || ''}\n${input.summary || ''}`;
  const rawTokens = storyTextTokens(text).map((token) => token.toLowerCase());
  const stemmed = rawTokens.map(stemThemeToken);
  const distinctiveTokens: string[] = [];
  const supportingTokens: string[] = [];
  const weakEntities: string[] = [];
  for (let i = 0; i < rawTokens.length; i += 1) {
    const raw = rawTokens[i];
    const stemmedToken = stemmed[i];
    if (!raw || !stemmedToken) continue;
    const strength = featureStrength(raw);
    if (strength === 'weak' || isWeakEntityToken(stemmedToken)) {
      weakEntities.push(stemmedToken);
    } else if (strength === 'supporting') {
      supportingTokens.push(stemmedToken);
    } else if (stemmedToken.length >= 4) {
      distinctiveTokens.push(stemmedToken);
    }
  }
  const classifiedPhrases = phrasesFromTokens(stemmed);
  const phrases = classifiedPhrases.filter((phrase) => phraseStrength(phrase) === 'strong');
  const weakPhrases = classifiedPhrases.filter((phrase) => phraseStrength(phrase) === 'weak');
  const clusterKeys = mergeClusterParts(
    input.clusterKeys && typeof input.clusterKeys === 'object' ? input.clusterKeys : {},
    extractBillClusterKeys(input.canonicalUrl || ''),
    extractExecutiveClusterKeys(input.title || ''),
  );
  let eventType: string | null = null;
  try {
    eventType = classifyEvent({
      title: input.title,
      summary: input.summary ?? null,
      clusterKeys,
      missionTags: [],
      provenanceClass: 'WIRE',
    }).eventType;
    if (eventType === 'generic_report') eventType = null;
  } catch {
    eventType = null;
  }

  return {
    distinctiveTokens: unique(distinctiveTokens).slice(0, 24),
    supportingTokens: unique(supportingTokens).slice(0, 16),
    phrases: phrases.slice(0, 12),
    weakEntities: unique([...weakEntities, ...weakPhrases]).slice(0, 12),
    clusterKeys,
    actionHints: actionHintsFromTokens(rawTokens).slice(0, 12),
    eventType,
    entitySpans: extractPersonEntitySpans(stemmed),
  };
}

export function fingerprintFromCandidate(item: ThemeCandidateItem): ThemeFingerprint {
  return extractThemeFingerprint({
    title: item.title,
    summary: item.summary,
    canonicalUrl: item.canonicalUrl,
    clusterKeys: clusterKeysFromItem(item),
  });
}

export function emptyThemeFingerprint(): ThemeFingerprint {
  return {
    distinctiveTokens: [],
    supportingTokens: [],
    phrases: [],
    weakEntities: [],
    clusterKeys: {},
    actionHints: [],
    eventType: null,
    entitySpans: [],
  };
}

export function mergeFingerprints(parts: ThemeFingerprint[]): ThemeFingerprint {
  const distinctive: string[] = [];
  const supporting: string[] = [];
  const phrases: string[] = [];
  const weak: string[] = [];
  const hints: string[] = [];
  const entitySpans: string[][] = [];
  let clusterKeys: Record<string, string> = {};
  let eventType: string | null = null;
  for (const part of parts) {
    distinctive.push(...part.distinctiveTokens);
    supporting.push(...(part.supportingTokens || []));
    phrases.push(...part.phrases);
    weak.push(...part.weakEntities);
    hints.push(...part.actionHints);
    entitySpans.push(...(part.entitySpans || []));
    clusterKeys = mergeClusterParts(clusterKeys, part.clusterKeys);
    if (!eventType && part.eventType) eventType = part.eventType;
  }
  return {
    distinctiveTokens: unique(distinctive).slice(0, 32),
    supportingTokens: unique(supporting).slice(0, 20),
    phrases: unique(phrases).slice(0, 16),
    weakEntities: unique(weak).slice(0, 16),
    clusterKeys,
    actionHints: unique(hints).slice(0, 16),
    eventType,
    entitySpans: unique(
      entitySpans.map((span) => [...span].sort().join('|')).filter(Boolean),
    )
      .map((key) => key.split('|').filter(Boolean))
      .filter((span) => span.length >= 2)
      .slice(0, 16),
  };
}

export function fingerprintFromMembership(row: {
  title: string;
  summary?: string | null;
  canonical_url?: string | null;
}): ThemeFingerprint {
  return extractThemeFingerprint({
    title: row.title,
    summary: row.summary,
    canonicalUrl: row.canonical_url,
  });
}

export function deterministicLabelFromFingerprint(fingerprint: ThemeFingerprint, fallbackTitle: string): string {
  const tokens = fingerprint.distinctiveTokens.slice(0, 4);
  if (tokens.length >= 2) {
    return tokens.join(' ');
  }
  const cleaned = String(fallbackTitle || '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 80) || 'untitled theme';
}

export function tokenJaccard(a: string[], b: string[]): number {
  return storyTokenJaccard(a, b);
}
