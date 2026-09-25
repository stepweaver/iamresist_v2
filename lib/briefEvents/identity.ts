import type { CreatorAtomicNote, CreatorNoteEventFeatures } from '@/lib/creatorNotes/types';
import {
  distinctiveTermsFromText,
  isDistinctiveEventPhrase,
  isDistinctiveIdentityToken,
  isGenericEntity,
  isWeakIdentityToken,
  shouldMergeThreadIdentities,
  tokenizeIdentity,
  type ThreadIdentity,
} from '@/lib/eventThreads/identity';
import { normalizeMatchText } from '@/lib/eventThreads/grounding';

function uniqueNormalized(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = normalizeMatchText(String(value || ''));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function anchorsFromFeatures(features: CreatorNoteEventFeatures | null | undefined): {
  actors: string[];
  actions: string[];
  objects: string[];
  institutions: string[];
  locations: string[];
  documents: string[];
} {
  return {
    actors: uniqueNormalized(features?.actors || []).filter(
      (value) => !isWeakIdentityToken(value) || value.split(' ').length >= 2,
    ),
    actions: uniqueNormalized(features?.action ? [features.action] : []),
    objects: uniqueNormalized(features?.object ? [features.object] : []).filter(
      (value) => !isGenericEntity(value) && (!isWeakIdentityToken(value) || value.split(' ').length >= 2),
    ),
    institutions: uniqueNormalized(features?.institutions || []).filter((value) => !isGenericEntity(value)),
    locations: uniqueNormalized(features?.locations || []),
    documents: uniqueNormalized(features?.referencedDocuments || []).filter((value) => !isGenericEntity(value)),
  };
}

/**
 * Distinctive number+noun phrases (e.g. "19 fatalities", "22 to 23 deaths")
 * that help bind casualty-style clusters without treating bare numbers as identity.
 */
export function numericEventPhrases(text: string): string[] {
  const normalized = normalizeMatchText(text);
  if (!normalized) return [];
  const phrases: string[] = [];
  const re =
    /\b(\d{1,4}(?:\s+to\s+\d{1,4})?)\s+(?:military\s+)?(fatalit(?:y|ies)|deaths?|casualt(?:y|ies)|killed|wounded|dead)\b/gi;
  for (const match of normalized.matchAll(re)) {
    phrases.push(normalizeMatchText(match[0]));
  }
  const topic =
    /\b(casualty|casualties|fatality|fatalities|death count|death toll|body count|military deaths?|military fatalities)\b/gi;
  for (const match of String(normalized).matchAll(new RegExp(topic.source, 'gi'))) {
    phrases.push(normalizeMatchText(match[0]));
  }
  // Separate pass so overlapping "military death" / "death count" both survive.
  if (/\bdeath count\b/i.test(normalized)) phrases.push('death count');
  return uniqueNormalized(phrases);
}

const CASUALTY_OBJECT_RE =
  /\b(casualt(?:y|ies)|fatalit(?:y|ies)|death count|death toll|body count|military deaths?)\b/i;

export function isCasualtyRelatedObject(value: string): boolean {
  return CASUALTY_OBJECT_RE.test(value);
}

export function identityFromAtomicNote(
  note: Pick<CreatorAtomicNote, 'text' | 'eventFeatures' | 'attribution'>,
  creatorName?: string | null,
): ThreadIdentity {
  const exclude = tokenizeIdentity(String(creatorName || note.attribution || ''));
  const fromText = distinctiveTermsFromText(String(note.text || ''), exclude);
  const anchors = anchorsFromFeatures(note.eventFeatures);
  const numeric = numericEventPhrases(String(note.text || ''));

  const locationObject = anchors.locations
    .filter((location) => !isGenericEntity(location))
    .flatMap((location) => anchors.objects.map((object) => `${location} ${object}`));
  const actorAction = anchors.actors
    .filter((actor) => !isGenericEntity(actor))
    .flatMap((actor) => anchors.actions.map((action) => `${actor} ${action}`));
  const institutionAction = anchors.institutions.flatMap((institution) =>
    anchors.actions.map((action) => `${institution} ${action}`),
  );

  const phrases = uniqueNormalized([
    ...fromText.phrases,
    ...numeric,
    ...anchors.objects.filter((value) => value.split(' ').length >= 2 || isDistinctiveIdentityToken(value, exclude)),
    ...anchors.documents,
    ...anchors.institutions,
    ...locationObject.filter((phrase) => isDistinctiveEventPhrase(phrase, exclude) || phrase.split(' ').length >= 2),
    ...actorAction.filter((phrase) => isDistinctiveEventPhrase(phrase, exclude)),
    ...institutionAction,
  ]);

  const terms = uniqueNormalized([
    ...fromText.terms,
    ...anchors.institutions,
    ...anchors.documents.flatMap((value) => value.split(' ')),
    ...anchors.objects.flatMap((value) => value.split(' ')),
    ...anchors.actors,
    ...anchors.locations,
    ...numeric.flatMap((phrase) => phrase.split(' ').filter((part) => !/^\d+$/.test(part))),
  ]).filter((term) => isDistinctiveIdentityToken(term, exclude));

  return {
    terms,
    phrases,
    generic: uniqueNormalized([
      ...fromText.generic,
      ...anchors.actors.filter((actor) => isGenericEntity(actor)),
      ...anchors.locations.filter((location) => isGenericEntity(location)),
    ]),
    actors: anchors.actors,
    actions: anchors.actions,
    objects: anchors.objects,
    institutions: anchors.institutions,
    locations: anchors.locations,
    documents: anchors.documents,
  };
}

/** Shared distinctive casualty / count topic across two note texts. */
export function shareCasualtyTopic(a: string, b: string): boolean {
  const left = numericEventPhrases(a);
  const right = numericEventPhrases(b);
  if (!left.length || !right.length) return false;
  const rightSet = new Set(right);
  if (left.some((phrase) => rightSet.has(phrase))) return true;
  const stripCount = (phrase: string) => phrase.replace(/^\d+(?:\s+to\s+\d+)?\s+/, '');
  const leftTopics = left.map(stripCount).filter(Boolean);
  const rightTopics = right.map(stripCount).filter(Boolean);
  for (const topic of leftTopics) {
    if (rightTopics.some((other) => other === topic || other.includes(topic) || topic.includes(other))) {
      return true;
    }
  }
  const leftCasualty = left.some((phrase) => CASUALTY_OBJECT_RE.test(phrase));
  const rightCasualty = right.some((phrase) => CASUALTY_OBJECT_RE.test(phrase));
  return leftCasualty && rightCasualty;
}

export function notesShouldGroup(
  a: { identity: ThreadIdentity; text: string },
  b: { identity: ThreadIdentity; text: string },
): boolean {
  if (shouldMergeThreadIdentities(a.identity, b.identity)) return true;
  // Conservative casualty-cluster binder: shared fatality/casualty topic phrases
  // plus overlapping casualty-related objects or distinctive non-generic terms.
  if (!shareCasualtyTopic(a.text, b.text)) return false;
  const sharedTerms = a.identity.terms.filter((term) => b.identity.terms.includes(term));
  const sharedObjects = a.identity.objects.filter((value) => b.identity.objects.includes(value) && !isGenericEntity(value));
  const sharedInstitutions = a.identity.institutions.filter(
    (value) => b.identity.institutions.includes(value) && !isGenericEntity(value),
  );
  const casualtyObjects =
    a.identity.objects.some(isCasualtyRelatedObject) && b.identity.objects.some(isCasualtyRelatedObject);
  if (sharedTerms.length >= 1 || sharedObjects.length >= 1 || sharedInstitutions.length >= 1) return true;
  if (casualtyObjects) return true;
  const sharedPhrases = a.identity.phrases.filter((phrase) =>
    b.identity.phrases.some((other) => other === phrase || other.includes(phrase) || phrase.includes(other)),
  );
  return sharedPhrases.length >= 1;
}
