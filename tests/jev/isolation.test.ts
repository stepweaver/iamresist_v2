import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildEventThreads, EVENT_THREADS_PERSISTENCE_DISABLED } from '@/lib/eventThreads/build';
import { createMemoryAtomicNotesReader } from '@/lib/eventThreads/store';
import { parseJevShadowArgs } from '@/lib/jev/args';

const JEV_DIR = join(process.cwd(), 'lib/jev');

function sourceFiles(): string[] {
  return readdirSync(JEV_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => join(JEV_DIR, file));
}

describe('Jev shadow isolation', () => {
  it('does not import event-thread writers, theme writers, or ranking', () => {
    const forbidden = [
      /eventThreads\/store/,
      /eventThreads\/db/,
      /eventThreads\/writes/,
      /eventThreads\/build/,
      /themeMemory\/themesDb/,
      /themeMemory\/db/,
      /rankingProfile/,
      /rescoreSourceItems/,
      /homepageBriefing/,
      /displayPriority/,
      /from\('creator_atomic_notes'\)/,
      /from\('event_threads'\)/,
      /from\('themes'\)/,
    ];
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8');
      for (const pattern of forbidden) {
        expect(src, file).not.toMatch(pattern);
      }
    }
  });

  it('keeps non-dry-run Event Threads disabled', async () => {
    await expect(
      buildEventThreads({
        sourceItemId: 'source-item-1',
        dryRun: false,
        reader: createMemoryAtomicNotesReader([]),
      }),
    ).rejects.toThrow(EVENT_THREADS_PERSISTENCE_DISABLED);
  });

  it('accepts one shadow command at a time', () => {
    expect(parseJevShadowArgs(['--export-labels', '--source-item', 'abc']).exportLabels).toBe(true);
    expect(parseJevShadowArgs(['--report', '--labels', 'labels.json', '--decisions', 'out.jsonl']).report).toBe(true);
    expect(() => parseJevShadowArgs(['--eval', '--report'])).toThrow(/Choose one/);
  });
});
