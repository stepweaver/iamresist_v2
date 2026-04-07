import { Orbitron, Rajdhani, IBM_Plex_Sans, Share_Tech_Mono } from "next/font/google";

// next/font/google downloads font files at build time (needs HTTPS egress to Google Fonts).
// Runtime fallback stacks keep layout readable if a font file ever fails to load.
export const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  weight: ["700", "800", "900"],
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export const rajdhani = Rajdhani({
  subsets: ["latin"],
  variable: "--font-rajdhani",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

export const shareTechMono = Share_Tech_Mono({
  subsets: ["latin"],
  variable: "--font-share-tech-mono",
  weight: "400",
  display: "swap",
  fallback: ["ui-monospace", "Cascadia Code", "Consolas", "monospace"],
});
