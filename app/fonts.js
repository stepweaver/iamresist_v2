import localFont from "next/font/local";

// Latin subsets of the same families previously loaded through next/font/google.
// Local files avoid a Turbopack failure when Google returns an extensionless font URL.
// Variable families keep the weight range in one file. Static families stay one file per weight.

export const orbitron = localFont({
  src: [
    {
      path: "./font-files/orbitron-latin.woff2",
      weight: "700 900",
      style: "normal",
    },
  ],
  variable: "--font-orbitron",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export const rajdhani = localFont({
  src: [
    { path: "./font-files/rajdhani-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./font-files/rajdhani-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./font-files/rajdhani-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./font-files/rajdhani-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-rajdhani",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export const ibmPlexSans = localFont({
  src: [
    {
      path: "./font-files/ibm-plex-sans-latin.woff2",
      weight: "400 700",
      style: "normal",
    },
  ],
  variable: "--font-ibm-plex-sans",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export const shareTechMono = localFont({
  src: [
    {
      path: "./font-files/share-tech-mono-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-share-tech-mono",
  display: "swap",
  fallback: ["ui-monospace", "Cascadia Code", "Consolas", "monospace"],
});

// Journal archive only. Applied on the journal layout, not the site root.
export const barlowCondensed = localFont({
  src: [
    { path: "./font-files/barlow-condensed-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./font-files/barlow-condensed-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./font-files/barlow-condensed-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-journal-display",
  display: "swap",
  fallback: ["Arial Narrow", "Segoe UI", "sans-serif"],
});

export const sourceSans3 = localFont({
  src: [
    {
      path: "./font-files/source-sans-3-latin.woff2",
      weight: "400 700",
      style: "normal",
    },
    {
      path: "./font-files/source-sans-3-latin-italic.woff2",
      weight: "400 700",
      style: "italic",
    },
  ],
  variable: "--font-journal-body",
  display: "swap",
  fallback: ["Segoe UI", "Helvetica Neue", "sans-serif"],
});
