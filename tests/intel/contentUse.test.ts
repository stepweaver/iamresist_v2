import { describe, expect, it } from 'vitest';
import { decodeIntelPlainText, stripHtmlToText } from '@/lib/intel/contentUse';

describe('decodeIntelPlainText', () => {
  it('normalizes non-breaking space entities and whitespace', () => {
    expect(decodeIntelPlainText('Foo&nbsp;Bar')).toBe('Foo Bar');
    expect(decodeIntelPlainText('Foo&nbspBar')).toBe('Foo Bar');
    expect(decodeIntelPlainText('Foo&#160;Bar')).toBe('Foo Bar');
    expect(decodeIntelPlainText('Foo&#xA0;Bar')).toBe('Foo Bar');
    expect(decodeIntelPlainText('A &amp; B')).toBe('A & B');
  });
});

describe('stripHtmlToText', () => {
  it('decodes entities after tag strip', () => {
    expect(stripHtmlToText('<p>Hi&nbsp;there</p>')).toBe('Hi there');
  });
});
