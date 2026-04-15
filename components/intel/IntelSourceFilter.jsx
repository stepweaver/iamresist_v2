'use client';

import { useState } from 'react';

/**
 * Compact source filter for intel desk payloads (lane-scoped by parent data).
 */
export default function IntelSourceFilter({ options = [], value, onChange }) {
  const [open, setOpen] = useState(false);
  if (!Array.isArray(options) || options.length <= 1) return null;

  const selected = options.find((o) => o.value === value) ?? options[0];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="nav-label text-xs px-3 py-1.5 border border-border rounded bg-background hover:border-primary transition-colors text-foreground/90"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        Source: {selected?.label ?? 'All sources'} ▼
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
          <div
            className="absolute z-20 right-0 mt-1 min-w-[200px] max-w-[min(100vw-2rem,280px)] bg-background border border-border shadow-lg max-h-60 overflow-y-auto"
            role="listbox"
          >
            {options.map((opt) => (
              <button
                key={opt.value || '__all'}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  requestAnimationFrame(() => {
                    const primary = document.getElementById('intel-desk-primary-stack');
                    const filterBar = document.getElementById('intel-desk-source-filter-bar');
                    const target =
                      primary && primary.getBoundingClientRect().height > 2 ? primary : filterBar;
                    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  });
                }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-primary/10 ${
                  value === opt.value ? 'bg-primary/15 text-primary' : 'text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
