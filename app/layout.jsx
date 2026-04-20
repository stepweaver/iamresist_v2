import { cookies } from 'next/headers';
import './globals.css';
import { orbitron, rajdhani, ibmPlexSans, shareTechMono } from './fonts';
import Navigation from '@/components/layout/Navigation';
import Footer from '@/components/layout/Footer';
import DocumentChrome from '@/components/layout/DocumentChrome';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { CartProvider } from '@/context/CartContext';
import { buildPageMetadata, BASE_URL } from '@/lib/metadata';

export const metadata = {
  ...buildPageMetadata({
    title: 'I AM [RESIST]',
    description:
      "A call to awareness. A chronicle of resistance. Here we observe America's authoritarian drift and use our constitutionally protected rights to express dissent.",
  }),
  manifest: '/manifest.json',
  metadataBase: new URL(BASE_URL),
};

export default async function RootLayout({ children }) {
  const themeCookie = (await cookies()).get('theme')?.value;
  const isLight = themeCookie === 'light';

  const fontClasses = [
    orbitron.variable,
    rajdhani.variable,
    ibmPlexSans.variable,
    shareTechMono.variable,
    isLight ? 'light' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <html lang="en" className={fontClasses} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://img.youtube.com" />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <CartProvider>
            <Navigation />
            <DocumentChrome>{children}</DocumentChrome>
            <Footer />
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
