'use client';

import { useMemo, useState } from 'react';
import { CONSENT_TEXT } from '@/lib/subscribeConsent';

function isProbablyEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (!e) return false;
  if (/\s/.test(e)) return false;
  const at = e.indexOf('@');
  if (at < 1 || at !== e.lastIndexOf('@')) return false;
  const domain = e.slice(at + 1);
  if (!domain || !domain.includes('.')) return false;
  return true;
}

export default function SubscribeFormClient({ source = null, compact = false }) {
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [error, setError] = useState('');

  const canSubmit = useMemo(() => isProbablyEmail(email) && status !== 'loading', [email, status]);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    if (!isProbablyEmail(email)) {
      setStatus('error');
      setError('Enter a valid email address.');
      return;
    }

    setStatus('loading');
    try {
      const resp = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source,
          hp,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = typeof data?.error === 'string' ? data.error : "We couldn't start your signup. Try again later.";
        setStatus('error');
        setError(msg);
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setError("We couldn't start your signup. Try again later.");
    }
  }

  const inputClass = compact
    ? 'w-full px-3 py-2 bg-background/50 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/40'
    : 'w-full px-4 py-3 bg-background/50 border border-border rounded-md text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary/40';

  const buttonClass = compact
    ? 'button-label px-4 py-2 bg-primary hover:bg-primary-dark border border-primary font-bold text-xs tracking-wider transition-all duration-200 text-center whitespace-nowrap text-white disabled:opacity-60 disabled:cursor-not-allowed'
    : 'button-label px-6 py-3 bg-primary hover:bg-primary-dark border border-primary font-bold text-xs sm:text-sm tracking-wider transition-all duration-200 text-center whitespace-nowrap text-white disabled:opacity-60 disabled:cursor-not-allowed';

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div className="sr-only" aria-hidden="true">
        <label>
          Leave this empty
          <input value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className={compact ? 'flex flex-col sm:flex-row gap-2' : 'flex flex-col sm:flex-row gap-3'}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@domain.com"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === 'loading' || status === 'success'}
          aria-label="Email address"
        />
        <button type="submit" className={buttonClass} disabled={!canSubmit || status === 'success'}>
          {status === 'loading' ? 'Sending...' : status === 'success' ? 'Check your email' : 'Join the list'}
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {status === 'success' ? (
          <p className="prose-copy text-xs sm:text-sm text-foreground/70">
            Check your email to confirm. If you do not see it, check spam. This is a coming-soon list,
            so issues may not arrive weekly yet.
          </p>
        ) : null}

        {status === 'error' && error ? (
          <p className="prose-copy text-xs sm:text-sm text-primary">{error}</p>
        ) : null}

        <p className="legal-copy text-[10px] sm:text-xs text-foreground/60 leading-relaxed">
          {CONSENT_TEXT}
        </p>
      </div>
    </form>
  );
}
