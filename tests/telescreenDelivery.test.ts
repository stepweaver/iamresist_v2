import { describe, expect, it } from 'vitest';
import { loadTelescreenArchiveDeps } from '@/lib/telescreen/loadArchiveDeps';
import { beginCollectionRefresh, finishCollectionRefresh } from '@/lib/telescreen/refreshLifecycle';

describe('Telescreen archive dependencies', () => {
  it('starts the archive read without waiting for the directory or artist list', async () => {
    let releaseVoices: (value: { title: string }[]) => void = () => {};
    const voicesGate = new Promise<{ title: string }[]>((resolve) => {
      releaseVoices = resolve;
    });
    let archiveStarted = false;

    const pending = loadTelescreenArchiveDeps({
      loadVoices: () => voicesGate,
      loadArtists: async () => {
        throw new Error('notion down');
      },
      loadArchive: async () => {
        archiveStarted = true;
        return { items: [{ id: 'item-1' }], hasMore: true };
      },
    });

    await Promise.resolve();
    expect(archiveStarted).toBe(true);

    releaseVoices([{ title: 'Beta' }]);
    const deps = await pending;
    expect(deps.voices).toEqual([{ title: 'Beta' }]);
    expect(deps.artists).toEqual([]);
    expect(deps.artistsFailed).toBe(true);
    expect(deps.voicesFailed).toBe(false);
    expect(deps.archive).toEqual({ items: [{ id: 'item-1' }], hasMore: true });
  });

  it('still fails the page when the archive itself fails', async () => {
    await expect(
      loadTelescreenArchiveDeps({
        loadVoices: async () => [],
        loadArtists: async () => [],
        loadArchive: async () => {
          throw new Error('archive down');
        },
      }),
    ).rejects.toThrow('archive down');
  });
});

describe('Telescreen refresh lifecycle', () => {
  it('stays refreshing until the matching server props arrive', () => {
    const idle = { requestId: 0, refreshing: false };
    const started = beginCollectionRefresh(idle);
    expect(started).toEqual({ requestId: 1, refreshing: true });
    expect(finishCollectionRefresh(started, 0)).toBe(started);
    expect(finishCollectionRefresh(started, 1)).toEqual({ requestId: 1, refreshing: false });
  });

  it('does not clear a newer refresh when an older server result arrives', () => {
    const first = beginCollectionRefresh({ requestId: 0, refreshing: false });
    const second = beginCollectionRefresh(first);
    expect(finishCollectionRefresh(second, first.requestId)).toBe(second);
    expect(finishCollectionRefresh(second, second.requestId).refreshing).toBe(false);
  });

  it('does not claim a refresh happened when the control is idle', () => {
    const idle = { requestId: 3, refreshing: false };
    expect(finishCollectionRefresh(idle, 3)).toBe(idle);
  });
});
