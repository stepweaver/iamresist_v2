export type ShareProvider = 'twitter' | 'facebook' | 'reddit' | 'email';

export type ShareTargetInput = {
  url?: string | null;
  title?: string | null;
  description?: string | null;
  origin?: string | null;
};

export type ShareTargets = {
  /** Absolute URL used for copy, provider, and native share payloads. */
  url: string;
  title: string;
  text: string;
  native: { title: string; text: string; url: string };
  providers: Record<ShareProvider, string>;
};

function cleanString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isLikelyAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function resolveShareUrl(inputUrl: ShareTargetInput['url'], origin?: ShareTargetInput['origin']): string {
  const raw = cleanString(inputUrl);
  if (!raw) return '';

  if (isLikelyAbsoluteHttpUrl(raw)) return raw;

  const base = cleanString(origin);
  if (!base) return '';

  try {
    return new URL(raw, base).toString();
  } catch {
    return '';
  }
}

function buildProviderUrl(base: string, params: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function buildShareTargets(input: ShareTargetInput): ShareTargets {
  const title = cleanString(input.title);
  const description = cleanString(input.description);
  const url = resolveShareUrl(input.url, input.origin);
  const text = description || title;

  const providers: ShareTargets['providers'] = {
    twitter: buildProviderUrl('https://twitter.com/intent/tweet', { url, text: title }),
    facebook: buildProviderUrl('https://www.facebook.com/sharer/sharer.php', { u: url }),
    reddit: buildProviderUrl('https://reddit.com/submit', { url, title }),
    email: buildProviderUrl('mailto:', {
      subject: title,
      body: [text, url].filter(Boolean).join(' ').trim(),
    }),
  };

  return {
    url,
    title,
    text,
    native: { title, text, url },
    providers,
  };
}

