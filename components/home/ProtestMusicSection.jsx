'use client';

import { useState } from 'react';
import Link from 'next/link';
import VoiceCard from '@/components/voices/VoiceCard';
import InlinePlayerModal from '@/components/voices/InlinePlayerModalClean';

export default function ProtestMusicSection({ items = [] }) {
  const [activeItem, setActiveItem] = useState(null);

  if (!items.length) return null;

  return (
    <section className="mb-6 sm:mb-8">
      <div className="flex items-center justify-between mb-4">
        <span className="kicker text-primary text-xs sm:text-sm tracking-[0.4em] font-bold">
          Protest Music
        </span>
        <Link
          href="/telescreen?mode=protest-music"
          className="nav-label text-xs text-foreground/60 hover:text-primary transition-colors font-bold whitespace-nowrap"
        >
          Browse protest music -&gt;
        </Link>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {items.map((item) => (
          <li key={item.id ?? item.url}>
            <VoiceCard item={item} onPlay={setActiveItem} />
          </li>
        ))}
      </ul>
      {activeItem && (
        <InlinePlayerModal
          item={activeItem}
          allItems={items}
          onClose={() => setActiveItem(null)}
          onSelectItem={setActiveItem}
        />
      )}
    </section>
  );
}
