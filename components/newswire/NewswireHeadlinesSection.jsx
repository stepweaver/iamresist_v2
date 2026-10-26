"use client";

import { useEffect, useMemo, useState } from "react";
import NewswireHeadlineCard from "./NewswireHeadlineCard";
import {
  NEWSWIRE_HEADLINE_BATCH,
  filterNewswireStories,
  visibleNewswireStories,
} from "./newswirePresentation";

function buildSourceOptions(stories) {
  const seen = new Map();
  for (const story of stories) {
    if (story.sourceSlug && !seen.has(story.sourceSlug)) {
      seen.set(story.sourceSlug, story.source);
    }
  }
  const options = [{ value: "", label: "All sources" }];
  [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([slug, name]) => options.push({ value: slug, label: name }));
  return options;
}

export default function NewswireHeadlinesSection({ stories = [] }) {
  const [sourceFilter, setSourceFilter] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(NEWSWIRE_HEADLINE_BATCH);

  const sourceOptions = useMemo(() => buildSourceOptions(stories), [stories]);
  const filteredStories = useMemo(
    () => filterNewswireStories(stories, sourceFilter),
    [stories, sourceFilter],
  );
  const windowed = visibleNewswireStories(filteredStories, visibleCount);

  useEffect(() => {
    setVisibleCount(NEWSWIRE_HEADLINE_BATCH);
  }, [sourceFilter]);

  const selectedLabel =
    sourceOptions.find((option) => option.value === sourceFilter)?.label ?? "All sources";

  return (
    <section className="mb-8 sm:mb-12">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="section-title text-base sm:text-lg font-bold text-foreground">
            Latest Headlines
          </h2>
          <a
            href="#source-directory"
            className="nav-label mt-2 inline-flex min-h-11 items-center text-xs font-bold text-foreground/60 hover:text-primary"
          >
            Source directory
          </a>
        </div>
        {sourceOptions.length > 1 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((open) => !open)}
              className="nav-label min-h-11 text-xs px-3 py-1.5 border border-border rounded bg-background hover:border-primary transition-colors"
              aria-expanded={dropdownOpen}
              aria-label="Filter headlines by source"
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
                      key={opt.value || "all"}
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
          {sourceFilter ? "No headlines from this source." : "No headlines yet."}
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {windowed.visible.map((story) => (
              <li key={story.id}>
                <NewswireHeadlineCard story={story} />
              </li>
            ))}
          </ul>
          {windowed.hasMore ? (
            <div className="pt-6">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + NEWSWIRE_HEADLINE_BATCH)}
                className="button-label min-h-11 border border-primary px-5 text-xs font-bold tracking-wider text-primary transition-colors hover:bg-primary hover:text-white"
              >
                Show More
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
