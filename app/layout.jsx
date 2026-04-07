import './globals.css';
import { orbitron, rajdhani, ibmPlexSans, shareTechMono } from './fonts';
import Navigation from '@/components/layout/Navigation';
import Footer from '@/components/layout/Footer';
import DocumentChrome from '@/components/layout/DocumentChrome';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

export const metadata = {
  title: "I AM [RESIST]",
  description:
    "A call to awareness. A chronicle of resistance. Here we observe America's authoritarian drift and use our constitutionally protected rights to express dissent.",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }) {
  const fontClasses = [
    orbitron.variable,
    rajdhani.variable,
    ibmPlexSans.variable,
    shareTechMono.variable,
  ].filter(Boolean).join(' ');

  return (
    <html lang="en" className={fontClasses} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <Navigation />
          <DocumentChrome>{children}</DocumentChrome>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
