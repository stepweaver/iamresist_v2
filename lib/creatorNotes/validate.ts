import {
  ATTRIBUTION_REQUIRED_KINDS,
  CREATOR_NOTE_KINDS,
  CREATOR_NOTES_ACTION_MAX,
  CREATOR_NOTES_ATTRIBUTION_MAX,
  CREATOR_NOTES_EVENT_FEATURE_STRING_MAX,
  CREATOR_NOTES_MAX_ACTORS,
  CREATOR_NOTES_MAX_INSTITUTIONS,
  CREATOR_NOTES_MAX_LOCATIONS,
  CREATOR_NOTES_MAX_REFERENCED_DOCUMENTS,
  CREATOR_NOTES_OBJECT_MAX,
  CREATOR_NOTES_TEXT_MAX_CHARS,
  CREATOR_NOTES_TEXT_MIN_CHARS,
  creatorNotesMaxNotesPerChunk,
  type AttributionRequiredKind,
  type CreatorNoteKind,
} from '@/lib/creatorNotes/constants';
import { dedupeStringsCaseInsensitive, normalizeAttribution, normalizeNoteText } from '@/lib/creatorNotes/identity';
import type { CreatorNoteEventFeatures, RawCreatorNote } from '@/lib/creatorNotes/types';
import { extractJsonObject } from '@/lib/themeMemory/ai/validate';

export class CreatorNotesValidationError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'CreatorNotesValidationError';
    this.code = code;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCreatorNoteKind(value: string): value is CreatorNoteKind {
  return (CREATOR_NOTE_KINDS as readonly string[]).includes(value);
}

function isAttributionRequired(kind: CreatorNoteKind): kind is AttributionRequiredKind {
  return (ATTRIBUTION_REQUIRED_KINDS as readonly string[]).includes(kind);
}

function boundedOptionalString(value: unknown, field: string, max: number): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new CreatorNotesValidationError(`${field}_not_string`);
  }
  const cleaned = normalizeNoteText(value);
  if (!cleaned) return null;
  if (cleaned.length > max) {
    throw new CreatorNotesValidationError(`${field}_too_long`);
  }
  return cleaned;
}

function parseTimestamp(value: unknown, field: string): number | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CreatorNotesValidationError(`${field}_not_number`);
  }
  if (value < 0) {
    throw new CreatorNotesValidationError(`${field}_negative`);
  }
  return value;
}

function parseStringArray(value: unknown, field: string, maxItems: number): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new CreatorNotesValidationError(`${field}_not_array`);
  }
  if (value.length > maxItems) {
    throw new CreatorNotesValidationError(`${field}_too_many`);
  }
  const strings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new CreatorNotesValidationError(`${field}_item_not_string`);
    }
    const cleaned = normalizeNoteText(entry);
    if (!cleaned) continue;
    if (cleaned.length > CREATOR_NOTES_EVENT_FEATURE_STRING_MAX) {
      throw new CreatorNotesValidationError(`${field}_item_too_long`);
    }
    strings.push(cleaned);
  }
  return dedupeStringsCaseInsensitive(strings, maxItems);
}

export function emptyEventFeatures(): CreatorNoteEventFeatures {
  return {
    actors: [],
    action: null,
    object: null,
    institutions: [],
    locations: [],
    referencedDocuments: [],
  };
}

export function eventFeaturesAreEmpty(features: CreatorNoteEventFeatures): boolean {
  return (
    features.actors.length === 0 &&
    features.institutions.length === 0 &&
    features.locations.length === 0 &&
    features.referencedDocuments.length === 0 &&
    !features.action &&
    !features.object
  );
}

export function parseEventFeatures(value: unknown): CreatorNoteEventFeatures | null {
  if (value == null) return null;
  if (!isPlainObject(value)) {
    throw new CreatorNotesValidationError('event_features_not_object');
  }
  const features: CreatorNoteEventFeatures = {
    actors: parseStringArray(value.actors, 'actors', CREATOR_NOTES_MAX_ACTORS),
    action: boundedOptionalString(value.action, 'action', CREATOR_NOTES_ACTION_MAX),
    object: boundedOptionalString(value.object, 'object', CREATOR_NOTES_OBJECT_MAX),
    institutions: parseStringArray(value.institutions, 'institutions', CREATOR_NOTES_MAX_INSTITUTIONS),
    locations: parseStringArray(value.locations, 'locations', CREATOR_NOTES_MAX_LOCATIONS),
    referencedDocuments: parseStringArray(
      value.referencedDocuments ?? value.referenced_documents,
      'referencedDocuments',
      CREATOR_NOTES_MAX_REFERENCED_DOCUMENTS,
    ),
  };
  return eventFeaturesAreEmpty(features) ? null : features;
}

export function validateRawCreatorNote(
  value: unknown,
  opts: { knownCreatorName?: string | null } = {},
): RawCreatorNote {
  if (!isPlainObject(value)) {
    throw new CreatorNotesValidationError('note_not_object');
  }
  if (typeof value.kind !== 'string') {
    throw new CreatorNotesValidationError('kind_not_string');
  }
  if (!isCreatorNoteKind(value.kind)) {
    throw new CreatorNotesValidationError('kind_invalid');
  }
  if (typeof value.text !== 'string') {
    throw new CreatorNotesValidationError('text_not_string');
  }
  const text = normalizeNoteText(value.text);
  if (!text) {
    throw new CreatorNotesValidationError('text_empty');
  }
  if (text.length < CREATOR_NOTES_TEXT_MIN_CHARS) {
    throw new CreatorNotesValidationError('text_too_short');
  }
  if (text.length > CREATOR_NOTES_TEXT_MAX_CHARS) {
    throw new CreatorNotesValidationError('text_too_long');
  }

  const startSeconds = parseTimestamp(value.startSeconds ?? value.start_seconds, 'startSeconds');
  const endSeconds = parseTimestamp(value.endSeconds ?? value.end_seconds, 'endSeconds');
  if (startSeconds != null && endSeconds != null && endSeconds < startSeconds) {
    throw new CreatorNotesValidationError('end_before_start');
  }

  let attribution = normalizeAttribution(
    boundedOptionalString(value.attribution, 'attribution', CREATOR_NOTES_ATTRIBUTION_MAX),
  );
  const knownCreator = normalizeAttribution(opts.knownCreatorName);
  if (!attribution && knownCreator) {
    attribution = knownCreator;
  }
  if (isAttributionRequired(value.kind) && !attribution) {
    throw new CreatorNotesValidationError('attribution_required');
  }

  return {
    kind: value.kind,
    startSeconds,
    endSeconds,
    text,
    attribution,
    eventFeatures: parseEventFeatures(value.eventFeatures ?? value.event_features),
  };
}

export function parseCreatorNotesOutput(
  text: string,
  opts: { knownCreatorName?: string | null; maxNotes?: number } = {},
): { notes: RawCreatorNote[]; rejected: number } {
  const parsed = extractJsonObject(text);
  if (!isPlainObject(parsed)) {
    throw new CreatorNotesValidationError('envelope_not_object');
  }
  if (!Array.isArray(parsed.notes)) {
    throw new CreatorNotesValidationError('notes_not_array');
  }

  const maxNotes = opts.maxNotes ?? creatorNotesMaxNotesPerChunk();
  const notes: RawCreatorNote[] = [];
  let rejected = 0;
  const extra = Math.max(0, parsed.notes.length - maxNotes);
  rejected += extra;

  for (const entry of parsed.notes.slice(0, maxNotes)) {
    try {
      notes.push(validateRawCreatorNote(entry, { knownCreatorName: opts.knownCreatorName }));
    } catch (error) {
      if (error instanceof CreatorNotesValidationError) {
        rejected += 1;
        continue;
      }
      throw error;
    }
  }

  return { notes, rejected };
}
