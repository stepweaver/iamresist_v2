import { AsyncLocalStorage } from 'node:async_hooks';
import { vi } from 'vitest';

// Next.js 15 installs this before loading its cache storage. Tests that use the
// real incremental cache need the same order, or that storage stays a no-op.
if (typeof globalThis.AsyncLocalStorage !== 'function') {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}

vi.mock('server-only', () => ({}));
