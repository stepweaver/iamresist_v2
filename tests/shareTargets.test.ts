import { describe, expect, it } from 'vitest';
import { buildShareTargets, resolveShareUrl } from '@/lib/shareTargets';

describe('shareTargets', () => {
  it('preserves absolute URLs', () => {
    expect(resolveShareUrl('https://example.com/a?b=c', 'https://irrelevant.test')).toBe(
      'https://example.com/a?b=c',
    );
  });

  it('resolves relative URLs against origin', () => {
    expect(resolveShareUrl('/curated/slug', 'https://iamresist.example')).toBe(
      'https://iamresist.example/curated/slug',
    );
  });

  it('returns empty string when relative URL has no origin', () => {
    expect(resolveShareUrl('/curated/slug', '')).toBe('');
  });

  it('builds deterministic provider URLs', () => {
    const out = buildShareTargets({
      origin: 'https://iamresist.example',
      url: '/curated/abc',
      title: 'Hello World',
      description: 'Some description',
    });

    expect(out.url).toBe('https://iamresist.example/curated/abc');
    expect(out.text).toBe('Some description');

    const tw = new URL(out.providers.twitter);
    expect(tw.origin + tw.pathname).toBe('https://twitter.com/intent/tweet');
    expect(tw.searchParams.get('url')).toBe(out.url);
    expect(tw.searchParams.get('text')).toBe('Hello World');

    const fb = new URL(out.providers.facebook);
    expect(fb.origin + fb.pathname).toBe('https://www.facebook.com/sharer/sharer.php');
    expect(fb.searchParams.get('u')).toBe(out.url);

    const rd = new URL(out.providers.reddit);
    expect(rd.origin + rd.pathname).toBe('https://reddit.com/submit');
    expect(rd.searchParams.get('url')).toBe(out.url);
    expect(rd.searchParams.get('title')).toBe('Hello World');

    expect(out.providers.email.startsWith('mailto:')).toBe(true);
    const email = out.providers.email.replace(/^mailto:\??/, '');
    const emailParams = new URLSearchParams(email);
    expect(emailParams.get('subject')).toBe('Hello World');
    expect(emailParams.get('body')).toBe(`Some description ${out.url}`);
  });

  it('handles missing title/description gracefully', () => {
    const out = buildShareTargets({
      origin: 'https://iamresist.example',
      url: '/x',
      title: undefined,
      description: undefined,
    });

    expect(out.title).toBe('');
    expect(out.text).toBe('');

    const tw = new URL(out.providers.twitter);
    expect(tw.searchParams.get('text')).toBe('');

    const rd = new URL(out.providers.reddit);
    expect(rd.searchParams.get('title')).toBe('');

    const email = out.providers.email.replace(/^mailto:\??/, '');
    const emailParams = new URLSearchParams(email);
    expect(emailParams.get('subject')).toBe('');
    expect(emailParams.get('body')).toBe(out.url);
  });
});

