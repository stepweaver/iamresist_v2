import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

(globalThis).React = React;

function cluster(overrides = {}) {
  return {
    id: 'cluster-1',
    headline: 'Trump announces $5,000 payment plan',
    headlineUrl: 'https://example.com/headline',
    summary: null,
    summarySourceName: null,
    latestAt: '2026-10-02T16:00:00.000Z',
    latestLabel: '2h ago',
    uniqueCreators: 1,
    uniqueNewsSources: 0,
    itemCount: 1,
    crossSource: false,
    score: 40,
    rank: {},
    sharedTokens: [],
    creators: [],
    members: [],
    ...overrides,
  };
}

function creator(overrides = {}) {
  return {
    creatorId: 'voices:pakman',
    creatorName: 'David Pakman',
    links: [{ title: 'Trump announces $5,000 payment plan', url: 'https://example.com/pakman' }],
    notes: [],
    ...overrides,
  };
}

function member(overrides = {}) {
  return {
    id: 'pakman-1',
    title: 'Trump announces $5,000 payment plan',
    url: 'https://example.com/pakman',
    sourceName: 'David Pakman',
    sourceKind: 'creator',
    channel: 'voices',
    publishedAt: '2026-10-02T16:00:00.000Z',
    ...overrides,
  };
}

function timeline(clusters) {
  return {
    generatedAt: '2026-10-02T18:00:00.000Z',
    windowHours: 36,
    candidateCount: 1,
    creatorCandidateCount: 1,
    newsCandidateCount: 0,
    clusterCount: clusters.length,
    warnings: [],
    days: [{ dayKey: '2026-10-02', label: 'FRIDAY, OCTOBER 2', clusters }],
  };
}

function discussedBy(html) {
  const start = html.indexOf('data-discussed-by');
  if (start < 0) return '';
  const end = html.indexOf('<details', start);
  return html.slice(start, end < 0 ? undefined : end);
}

function sources(html) {
  const start = html.indexOf('<details');
  return start < 0 ? '' : html.slice(start);
}

async function render(clusters) {
  const { default: HeadlineTimeline } = await import('@/components/brief/HeadlineTimeline');
  return renderToStaticMarkup(React.createElement(HeadlineTimeline, { timeline: timeline(clusters) }));
}

describe('brief discussed-by section', () => {
  it('hides Discussed by for a single source with no Atomic Notes', async () => {
    const html = await render([
      cluster({
        creators: [creator()],
        members: [member()],
      }),
    ]);

    expect(html).toContain('Trump announces $5,000 payment plan');
    expect(html).toContain('Covered by:');
    expect(html).toContain('2h ago');
    expect(html).toContain('SOURCES');
    expect(html).not.toContain('DISCUSSED BY');
    expect(sources(html)).toContain('Trump announces $5,000 payment plan');
    expect(sources(html)).toContain('David Pakman');
  });

  it('lists distinct creator names without repeating raw titles when several sources have no notes', async () => {
    const html = await render([
      cluster({
        uniqueCreators: 2,
        itemCount: 2,
        creators: [
          creator(),
          creator({
            creatorId: 'voices:meidas',
            creatorName: 'MeidasTouch',
            links: [{ title: 'Trump $5,000 payment plan draws questions', url: 'https://example.com/meidas' }],
          }),
        ],
        members: [
          member(),
          member({
            id: 'meidas-1',
            title: 'Trump $5,000 payment plan draws questions',
            url: 'https://example.com/meidas',
            sourceName: 'MeidasTouch',
          }),
        ],
      }),
    ]);

    const discussion = discussedBy(html);
    expect(discussion).toContain('DISCUSSED BY');
    expect(discussion).toContain('David Pakman');
    expect(discussion).toContain('MeidasTouch');
    expect(discussion).not.toContain('Trump announces $5,000 payment plan');
    expect(discussion).not.toContain('Trump $5,000 payment plan draws questions');
    expect(sources(html)).toContain('Trump announces $5,000 payment plan');
    expect(sources(html)).toContain('Trump $5,000 payment plan draws questions');
  });

  it('shows Atomic Note commentary and keeps the source title in Sources', async () => {
    const html = await render([
      cluster({
        creators: [
          creator({
            notes: [
              {
                id: 'note-1',
                text: 'Pakman walks through who would receive the payment.',
                kind: 'creator_analysis',
                startSeconds: 120,
                endSeconds: 180,
                evidenceUrl: 'https://www.youtube.com/watch?v=abc&t=120',
              },
            ],
          }),
        ],
        members: [member({ title: 'What Trump\'s $5,000 payment plan means', url: 'https://www.youtube.com/watch?v=abc' })],
      }),
    ]);

    const discussion = discussedBy(html);
    expect(discussion).toContain('DISCUSSED BY');
    expect(discussion).toContain('David Pakman');
    expect(discussion).toContain('Pakman walks through who would receive the payment.');
    expect(discussion).not.toContain('Trump announces $5,000 payment plan');
    expect(discussion).not.toContain('payment plan means');
    expect(sources(html)).toContain('payment plan means');
    expect(sources(html)).not.toContain('CREATOR SOURCES');
    expect(sources(html)).not.toContain('NEWS SOURCES');
  });

  it('separates creator sources and news sources without commentary', async () => {
    const html = await render([
      cluster({
        uniqueCreators: 1,
        uniqueNewsSources: 1,
        itemCount: 2,
        crossSource: true,
        summary: 'The White House described a one-time payment.',
        summarySourceName: 'Associated Press',
        creators: [
          creator({
            notes: [
              {
                id: 'note-1',
                text: 'Pakman walks through who would receive the payment.',
                kind: 'creator_analysis',
                startSeconds: 120,
                endSeconds: 180,
                evidenceUrl: 'https://www.youtube.com/watch?v=abc&t=120',
              },
            ],
          }),
        ],
        members: [
          member({
            title: "What Trump's $5,000 payment plan means",
            url: 'https://www.youtube.com/watch?v=abc',
          }),
          member({
            id: 'ap-1',
            title: 'Trump announces $5,000 payment plan',
            url: 'https://example.com/ap',
            sourceName: 'Associated Press',
            sourceKind: 'news',
            channel: 'newswire',
          }),
        ],
      }),
    ]);

    const discussion = discussedBy(html);
    const sourceHtml = sources(html);
    const creatorHeading = sourceHtml.indexOf('CREATOR SOURCES');
    const newsHeading = sourceHtml.indexOf('NEWS SOURCES');

    expect(discussion).toContain('Pakman walks through who would receive the payment.');
    expect(creatorHeading).toBeGreaterThan(-1);
    expect(newsHeading).toBeGreaterThan(creatorHeading);
    expect(sourceHtml).toContain('David Pakman');
    expect(sourceHtml).toContain('Associated Press');
    expect(sourceHtml).toContain('https://www.youtube.com/watch?v=abc');
    expect(sourceHtml).toContain('https://example.com/ap');
    expect(sourceHtml).toContain('payment plan means');
    expect(sourceHtml).toContain('Trump announces $5,000 payment plan');
    expect(sourceHtml).not.toContain('Pakman walks through who would receive the payment.');
    expect(sourceHtml).not.toContain('The White House described a one-time payment.');
  });
});
