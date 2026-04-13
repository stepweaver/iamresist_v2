import Link from 'next/link';
import SectionDivider from '@/components/ui/Divider';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const footerLinks = [
    { href: '/', label: 'BRIEFING' },
    { href: '/about', label: 'MISSION' },
    { href: '/telescreen', label: 'INTEL' },
    { href: '/journal', label: 'JOURNAL' },
    { href: '/timeline', label: 'TIMELINE' },
    { href: '/shop', label: 'SUPPLY' },
    { href: '/legal', label: 'LEGAL' },
  ];

  return (
    <footer className="border-t border-border bg-military-black" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-6 sm:py-8">
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-8" aria-label="Footer navigation">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-label text-sm text-foreground/60 hover:text-primary transition-colors duration-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <SectionDivider className="mb-6" />
        <div className="text-center space-y-3">
          <p className="system-label text-xs tracking-[0.3em] font-bold text-foreground/60">
            Independent / Fact-Based / Unapologetically Antifascist
          </p>
          <p className="prose-copy text-xs text-foreground/70">
            &copy; {currentYear} I AM [RESIST]
          </p>
          <p className="prose-copy text-xs text-foreground/70">
            Support: <a href="mailto:support@iamresist.org" className="text-primary hover:text-primary-light transition-colors underline decoration-primary/50 hover:decoration-primary">support@iamresist.org</a>
          </p>
          <p className="legal-copy text-[10px] text-foreground/60 leading-relaxed max-w-2xl mx-auto mt-4">
            External content is attributed to original creators. Book cover images are used for identification
            purposes only. All rights reserved by their respective publishers. All rights to third-party content
            remain with their respective owners.
          </p>
        </div>
      </div>
    </footer>
  );
}
