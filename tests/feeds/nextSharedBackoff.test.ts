import { afterEach, describe, expect, it } from 'vitest';
import {
  assertUpstreamAvailable,
  clearProcessFailureMirrorForTests,
  clearSharedFailureForTests,
  noteUpstreamFailure,
  recallSharedPartial,
  recordSharedFailure,
  sharedFailureActive,
} from '@/lib/feeds/sharedFailureBackoff';

afterEach(() => {
  clearSharedFailureForTests();
  delete (globalThis as { __incrementalCache?: unknown }).__incrementalCache;
});

function prerenderManifest() {
  return {
    version: 4,
    routes: {},
    dynamicRoutes: {},
    notFoundRoutes: [],
    preview: {
      previewModeId: 'test-preview-id',
      previewModeSigningKey: 'signing',
      previewModeEncryptionKey: 'encryption',
    },
  };
}

async function loadNextCache() {
  const cacheMod = await import('next/dist/server/lib/incremental-cache/index.js');
  const fileCacheMod = await import('next/dist/server/lib/incremental-cache/file-system-cache.js');
  const storageMod = await import('next/dist/server/app-render/work-async-storage.external.js');
  return {
    IncrementalCache: cacheMod.IncrementalCache as unknown as new (opts: Record<string, unknown>) => {
      revalidateTag: (tags: string | string[]) => Promise<void>;
    },
    FileSystemCache: fileCacheMod.default as unknown as new (ctx: Record<string, unknown>) => unknown,
    workAsyncStorage: storageMod.workAsyncStorage as unknown as {
      run: (store: Record<string, unknown>, callback: () => Promise<void>) => Promise<void>;
    },
  };
}

function createIncrementalCache(
  IncrementalCache: new (opts: Record<string, unknown>) => {
    revalidateTag: (tags: string | string[]) => Promise<void>;
  },
  Handler: new (ctx: Record<string, unknown>) => unknown,
) {
  return new IncrementalCache({
    dev: false,
    flushToDisk: false,
    minimalMode: false,
    maxMemoryCacheSize: 8 * 1024 * 1024,
    serverDistDir: '/tmp/iamresist-cache-test',
    requestHeaders: {},
    fetchCacheKeyPrefix: 'iamresist-test',
    getPrerenderManifest: prerenderManifest,
    CurCacheHandler: Handler,
    fs: {
      readFile: async () => {
        throw new Error('disk disabled');
      },
      stat: async () => {
        throw new Error('disk disabled');
      },
    },
  });
}

describe('Next.js 15.5 incremental cache failure markers', () => {
  it('stores a marker through the real fetch-cache shape, including inside unstable_cache', async () => {
    const { IncrementalCache, FileSystemCache, workAsyncStorage } = await loadNextCache();
    const { unstable_cache } = await import('next/cache');
    const cache = createIncrementalCache(IncrementalCache, FileSystemCache);
    const key = `real-cache-${Date.now()}`;
    const now = Date.now();

    await workAsyncStorage.run(
      {
        incrementalCache: cache,
        route: '/test',
        fetchCache: 'default-cache',
        isOnDemandRevalidate: false,
        isDraftMode: false,
      },
      async () => {
        const cached = unstable_cache(
          async () => {
            await noteUpstreamFailure(null, key, { now, partial: [{ id: 'kept' }] });
            return ['built'];
          },
          [`probe-${key}`],
          { revalidate: 30, tags: [`probe-${key}`] },
        );
        expect(await cached()).toEqual(['built']);
        expect(await sharedFailureActive(key, now + 1)).toBe(true);
        expect(await recallSharedPartial(key, now + 1)).toEqual([{ id: 'kept' }]);
      },
    );

    const other = createIncrementalCache(IncrementalCache, FileSystemCache);
    await workAsyncStorage.run({ incrementalCache: other, route: '/other', fetchCache: 'default-cache' }, async () => {
      clearProcessFailureMirrorForTests();
      expect(await sharedFailureActive(key, now + 1)).toBe(true);
      expect(await recallSharedPartial(key, now + 1)).toEqual([{ id: 'kept' }]);
      await other.revalidateTag(key);
      clearProcessFailureMirrorForTests();
      expect(await sharedFailureActive(key, now + 1)).toBe(false);
      expect(await recallSharedPartial(key, now + 1)).toBeNull();
    });
  });

  it('ignores a fetch entry the real cache already considers stale', async () => {
    const { IncrementalCache, workAsyncStorage } = await loadNextCache();
    class AgedFetchHandler {
      async get() {
        return {
          lastModified: Date.now() - 130_000,
          value: {
            kind: 'FETCH',
            data: {
              headers: {},
              body: JSON.stringify({ status: 'upstream_failed', until: Date.now() + 60_000 }),
              status: 200,
              url: '',
            },
            revalidate: 120,
            tags: ['upstream-failure-marker', 'aged-marker'],
          },
        };
      }

      async set() {}

      async revalidateTag() {}
    }

    const cache = createIncrementalCache(IncrementalCache, AgedFetchHandler);
    await workAsyncStorage.run({ incrementalCache: cache, route: '/aged' }, async () => {
      expect(await sharedFailureActive('aged-marker')).toBe(false);
    });
  });

  it('does not fail a successful read when the cache handler throws', async () => {
    const { IncrementalCache, workAsyncStorage } = await loadNextCache();
    class BoomHandler {
      async get() {
        throw new Error('cache get failed');
      }

      async set() {
        throw new Error('cache set failed');
      }

      async revalidateTag() {
        throw new Error('cache tag failed');
      }
    }

    const cache = createIncrementalCache(IncrementalCache, BoomHandler);
    let rendered = false;
    await workAsyncStorage.run({ incrementalCache: cache, route: '/boom' }, async () => {
      await expect(assertUpstreamAvailable(null, 'boom-key')).resolves.toBeUndefined();
      await recordSharedFailure('boom-key');
      rendered = true;
    });
    expect(rendered).toBe(true);
  });
});
