"use client";

import { useState } from "react";
import VoiceCard from "@/components/voices/VoiceCard";
import InlinePlayerModal from "@/components/voices/InlinePlayerModalClean";
import { useMediaKeepAlive } from "@/components/useMediaKeepAlive";

export default function VoicesGridWithPlayerClient({ items = [] }) {
  const [activeItem, setActiveItem] = useState(null);
  const { startKeepAlive, stopKeepAlive } = useMediaKeepAlive();

  if (!items?.length) return null;

  function handlePlay(item) {
    setActiveItem(item);
  }

  function handleClose() {
    stopKeepAlive();
    setActiveItem(null);
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {items.map((item, index) => (
          <VoiceCard key={item.id ?? item.url ?? index} item={item} onPlay={handlePlay} priority={index < 6} />
        ))}
      </div>

      {activeItem && (
        <InlinePlayerModal
          item={activeItem}
          allItems={items}
          onClose={handleClose}
          onSelectItem={setActiveItem}
          onPlayStart={startKeepAlive}
        />
      )}
    </>
  );
}

