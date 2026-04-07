"use client";

import { useState } from "react";
import VoiceCard from "@/components/voices/VoiceCard";
import InlinePlayerModal from "@/components/voices/InlinePlayerModalClean";

export default function VoicesGridWithPlayerClient({ items = [] }) {
  const [activeItem, setActiveItem] = useState(null);

  if (!items?.length) return null;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {items.map((item, index) => (
          <VoiceCard key={item.id ?? item.url ?? index} item={item} onPlay={setActiveItem} priority={index < 6} />
        ))}
      </div>

      {activeItem && (
        <InlinePlayerModal
          item={activeItem}
          allItems={items}
          onClose={() => setActiveItem(null)}
          onSelectItem={setActiveItem}
        />
      )}
    </>
  );
}

