import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export class ThemeMemoryLockBusyError extends Error {
  constructor(message = 'theme memory daily run already in progress') {
    super(message);
    this.name = 'ThemeMemoryLockBusyError';
  }
}

export type ThemeMemoryLockHandle = {
  path: string;
  release: () => void;
};

export function defaultThemeMemoryLockPath(): string {
  const fromEnv = String(process.env.THEME_MEMORY_LOCK_FILE || '').trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), 'tmp', 'theme-memory-daily.lock');
}

function pidIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function removeStaleLock(lockPath: string): boolean {
  try {
    const raw = readFileSync(lockPath, 'utf8').trim();
    const pid = Number((raw.split(/\r?\n/)[0] || '').trim());
    if (!Number.isInteger(pid) || pid <= 0 || !pidIsRunning(pid)) {
      unlinkSync(lockPath);
      return true;
    }
    return false;
  } catch {
    try {
      unlinkSync(lockPath);
      return true;
    } catch {
      return false;
    }
  }
}

export function acquireThemeMemoryRunLock(lockPath = defaultThemeMemoryLockPath()): ThemeMemoryLockHandle {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const payload = `${process.pid}\n${new Date().toISOString()}\n`;
  try {
    writeFileSync(lockPath, payload, { flag: 'wx' });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
    if (code !== 'EEXIST') throw error;
    if (!removeStaleLock(lockPath)) {
      throw new ThemeMemoryLockBusyError();
    }
    writeFileSync(lockPath, payload, { flag: 'wx' });
  }
  let released = false;
  return {
    path: lockPath,
    release() {
      if (released) return;
      released = true;
      try {
        unlinkSync(lockPath);
      } catch {
        // ignore
      }
    },
  };
}
