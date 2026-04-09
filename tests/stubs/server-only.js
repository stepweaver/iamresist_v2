/**
 * Vitest runs in plain Node; the real `server-only` package throws outside the
 * Next RSC bundler. Re-export nothing so imports are a no-op under test.
 */
export {};
