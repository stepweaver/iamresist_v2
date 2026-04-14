"use client";

import { useState, useMemo } from "react";
import NewswireHeadlineCard from "./NewswireHeadlineCard";

function buildSourceOptions(stories) {
  const seen = new Map();
  for (const s of stories) {
    if (s.sourceSlug && !seen.has(s.sourceSlug)) {
      seen.set(s.sourceSlug, s.source);
    }
  }
  const options = [{ value: "", label: "All sources" }];
  [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([slug, name]) => options.push({ value: slug, label: name }));
  return options;
}

export default function NewswireHeadlinesSection({ stories = [], sources = [] }) {
  const [sourceFilter, setSourceFilter] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const sourceOptions = useMemo(() => buildSourceOptions(stories), [stories]);
  const filteredStories = useMemo(() => {
    if (!sourceFilter) return stories;
    return stories.filter((s) => s.sourceSlug === sourceFilter);
  }, [stories, sourceFilter]);

  const selectedLabel =
    sourceOptions.find((o) => o.value === sourceFilter)?.label ?? "All sources";

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
        <h2 className="section-title text-base sm:text-lg font-bold text-foreground">
          Latest Headlines
        </h2>
        {sourceOptions.length > 1 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((o) => !o)}
              className="nav-label text-xs px-3 py-1.5 border border-border rounded bg-background hover:border-primary transition-colors"
            >
              {selectedLabel} ▼
            </button>
            {dropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setDropdownOpen(false)}
                />
                <div className="absolute z-20 mt-1 w-full min-w-[180px] bg-background border border-border shadow-lg max-h-60 overflow-y-auto">
                  {sourceOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setSourceFilter(opt.value);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-primary/10 ${
                        sourceFilter === opt.value ? "bg-primary/20 text-primary" : ""
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {!filteredStories.length ? (
        <p className="text-foreground/70 uppercase tracking-wider text-sm py-8">
          {sourceFilter ? "No headlines from this source." : "No headlines yet. Feed ingestion in progress."}
        </p>
      ) : (
        <ul className="space-y-4">
          {filteredStories.map((story) => (
            <li key={story.id}>
              <NewswireHeadlineCard story={story} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
