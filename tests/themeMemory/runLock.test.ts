import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { acquireThemeMemoryRunLock, ThemeMemoryLockBusyError } from '@/lib/themeMemory/runLock';

describe('Theme Memory run lock', () => {
  it('prevents overlapping acquires until released', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'theme-memory-lock-'));
    const lockPath = path.join(dir, 'daily.lock');
    const first = acquireThemeMemoryRunLock(lockPath);
    expect(() => acquireThemeMemoryRunLock(lockPath)).toThrow(ThemeMemoryLockBusyError);
    first.release();
    const second = acquireThemeMemoryRunLock(lockPath);
    second.release();
  });

  it('replaces a stale lock from a dead pid', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'theme-memory-lock-'));
    const lockPath = path.join(dir, 'daily.lock');
    writeFileSync(lockPath, '99999999\n2026-09-15T00:00:00.000Z\n');
    const handle = acquireThemeMemoryRunLock(lockPath);
    handle.release();
  });
});
