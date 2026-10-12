import './globals.css';
import { orbitron, rajdhani, ibmPlexSans, shareTechMono } from './fonts';
import Navigation from '@/components/layout/Navigation';
import Footer from '@/components/layout/Footer';
import DocumentChrome from '@/components/layout/DocumentChrome';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { CartProvider } from '@/context/CartContext';
import { buildPageMetadata, BASE_URL } from '@/lib/metadata';
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration';
import { THEME_INIT_SCRIPT } from '@/lib/theme/themeInitScript';
export const metadata = {
  ...buildPageMetadata({
    title: 'I AM [RESIST]',
    description:
      "A call to awareness. A chronicle of resistance. Here we observe America's authoritarian drift and use our constitutionally protected rights to express dissent.",
  }),
  manifest: '/manifest.json',
  metadataBase: new URL(BASE_URL),
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'RESIST',
  },
};

export default function RootLayout({ children }) {
  const fontClasses = [orbitron.variable, rajdhani.variable, ibmPlexSans.variable, shareTechMono.variable].join(' ');

  return (
    <html lang="en" className={fontClasses} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://img.youtube.com" />
      </head>
      <body className="antialiased">
        <ServiceWorkerRegistration />
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
