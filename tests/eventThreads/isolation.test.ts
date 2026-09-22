import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildEventThreads } from '@/lib/eventThreads/build';
import { createMemoryAtomicNotesReader, createMemoryEventThreadsWriter } from '@/lib/eventThreads/store';
import { totalWrites } from '@/lib/eventThreads/writes';
import { themeMemoryEnv } from '@/lib/env/themeMemory';
import { THEME_ATTENTION_RANKING, resolveThemeRankingMode } from '@/lib/intel/themeAttentionRanking';
import { makeNote } from './helpers';

const EVENT_THREADS_DIR = join(process.cwd(), 'lib/eventThreads');

function sourceFiles(): string[] {
  return readdirSync(EVENT_THREADS_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => join(EVENT_THREADS_DIR, file));
}

describe('Event Threads isolation', () => {
  it('does not import Theme Memory mutation or ranking write paths', () => {
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8');
      expect(src).not.toMatch(/themeMemory\/themesDb/);
      expect(src).not.toMatch(/theme_memberships/);
      expect(src).not.toMatch(/theme_daily_signals/);
      expect(src).not.toMatch(/processThemeMemory/);
      expect(src).not.toMatch(/from\('themes'\)/);
      expect(src).not.toMatch(/rankingProfile/);
      expect(src).not.toMatch(/rescoreSourceItems/);
      expect(src).not.toMatch(/homepageBriefing/);
      expect(src).not.toMatch(/displayPriority/);
      expect(src).not.toMatch(/from\('source_items'\)[\s\S]{0,240}\.(insert|update)\(/);
      expect(src).not.toMatch(/from\('creator_atomic_notes'\)[\s\S]{0,240}\.(insert|update)\(/);
    }
  });

  it('keeps Theme Memory ranking mode untouched', () => {
    expect('EVENT_THREADS' in themeMemoryEnv).toBe(false);
    expect(resolveThemeRankingMode(themeMemoryEnv)).toBe(themeMemoryEnv.THEME_RANKING_MODE || 'off');
    expect(THEME_ATTENTION_RANKING.MAX_CONTRIBUTION).toBe(5);
  });

  it('does not write Theme Memory, ranking, or Atomic Notes during dry-run', async () => {
    const writer = createMemoryEventThreadsWriter();
    const notes = [
      makeNote({
        kind: 'event',
        text: 'Iran announced a new maritime exclusion zone.',
        startSeconds: 10,
      }),
    ];
    const result = await buildEventThreads({
      sourceItemId: notes[0].sourceItemId,
      dryRun: true,
      reader: createMemoryAtomicNotesReader(notes),
      writer,
      aiConfig: null,
    });
    expect(result.writes.themeMemory).toBe(0);
    expect(result.writes.ranking).toBe(0);
    expect(result.writes.creatorAtomicNotes).toBe(0);
    expect(totalWrites(result.writes)).toBe(0);
    expect(totalWrites(writer.writes)).toBe(0);
  });

  it('sql migration does not mutate Atomic Notes, Theme Memory, or ranking tables', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260921120000_event_threads_v1.sql'), 'utf8');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS intel\.event_threads/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS intel\.event_thread_entries/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS intel\.event_thread_source_links/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS intel\.event_thread_editor_notes/);
    expect(sql).not.toMatch(/ALTER TABLE intel\.creator_atomic_notes/);
    expect(sql).not.toMatch(/UPDATE intel\.creator_atomic_notes/);
    expect(sql).not.toMatch(/theme_memberships/);
    expect(sql).not.toMatch(/theme_daily_signals/);
    expect(sql).not.toMatch(/UPDATE intel\.source_items/);
  });
});
