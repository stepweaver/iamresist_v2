"use client";

import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import useClickOutside from "@/lib/hooks/useClickOutside";

export default function FilterDropdown({
  label,
  selectedLabel,
  options,
  value,
  onChange,
  isOpen,
  onToggle,
  onClose,
  ariaLabel = "Choose option",
  className = "relative flex-1 min-w-0 max-w-xs",
}) {
  const ref = useRef(null);
  useClickOutside(ref, onClose);

  return (
    <div ref={ref} className={className}>
      <label className="block text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
        {label}
      </label>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="flex items-center justify-between gap-2 w-full min-w-0 px-3 py-2.5 rounded border border-border bg-background text-foreground text-sm font-bold uppercase tracking-wider text-left hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span className="min-w-0 truncate text-left">{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-foreground/60" aria-hidden />
      </button>
      {isOpen && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 z-30 mt-1 max-h-60 overflow-auto rounded border border-border bg-background py-1 shadow-lg"
        >
          {options.map((opt) => {
            const isSelected = (opt.value === "" && !value) || opt.value === value;
            return (
              <li key={opt.value || "all"} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => onChange(opt.value)}
                  className={`w-full px-3 py-2.5 text-left text-sm uppercase tracking-wider break-words focus:outline-none ${
                    isSelected
                      ? "bg-military-grey text-primary font-bold"
                      : "text-foreground hover:bg-military-grey"
                  }`}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
