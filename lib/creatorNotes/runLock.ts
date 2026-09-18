import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export class CreatorNotesLockBusyError extends Error {
  constructor(message = 'creator-notes batch already running') {
    super(message);
    this.name = 'CreatorNotesLockBusyError';
  }
}

export type CreatorNotesLockHandle = {
  path: string;
  release: () => void;
};

export function defaultCreatorNotesLockPath(): string {
  const fromEnv = String(process.env.CREATOR_NOTES_LOCK_FILE || '').trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), 'tmp', 'creator-notes-batch.lock');
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

export function acquireCreatorNotesRunLock(lockPath = defaultCreatorNotesLockPath()): CreatorNotesLockHandle {
  mkdirSync(path.dirname(lockPath), { recursive: true });
  const payload = `${process.pid}\n${new Date().toISOString()}\n`;
  try {
    writeFileSync(lockPath, payload, { flag: 'wx' });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
    if (code !== 'EEXIST') throw error;
    if (!removeStaleLock(lockPath)) {
      throw new CreatorNotesLockBusyError();
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
