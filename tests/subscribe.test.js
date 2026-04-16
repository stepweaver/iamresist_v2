import { describe, it, expect, beforeEach } from 'vitest';

describe('validateSubscribeRequest', () => {
  it('accepts a valid email and optional source', async () => {
    const { validateSubscribeRequest } = await import('@/lib/server/validators/subscribe');
    const out = validateSubscribeRequest({ email: 'User@Example.com', source: 'home' });
    expect(out.ok).toBe(true);
    expect(out.ok && out.email).toBe('user@example.com');
    expect(out.ok && out.source).toBe('home');
  });

  it('rejects invalid email', async () => {
    const { validateSubscribeRequest } = await import('@/lib/server/validators/subscribe');
    const out = validateSubscribeRequest({ email: 'nope' });
    expect(out.ok).toBe(false);
  });

  it('rejects unknown keys', async () => {
    const { validateSubscribeRequest } = await import('@/lib/server/validators/subscribe');
    const out = validateSubscribeRequest({ email: 'a@b.com', extra: 'x' });
    expect(out.ok).toBe(false);
  });
});

describe('subscribeToken', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev, SUBSCRIBE_TOKEN_SECRET: 'test_secret' };
  });

  it('signs and verifies token', async () => {
    const { signSubscribeToken, verifySubscribeToken } = await import('@/lib/subscribeToken');
    const token = signSubscribeToken('User@Example.com');
    const verified = verifySubscribeToken(token);
    expect(verified.ok).toBe(true);
    expect(verified.ok && verified.email).toBe('user@example.com');
  });

  it('rejects tampered token', async () => {
    const { signSubscribeToken, verifySubscribeToken } = await import('@/lib/subscribeToken');
    const token = signSubscribeToken('user@example.com');
    const tampered = token.replace(/\.$/, '.x'); // if no trailing dot, just append garbage
    const verified = verifySubscribeToken(tampered === token ? `${token}x` : tampered);
    expect(verified.ok).toBe(false);
  });
});

