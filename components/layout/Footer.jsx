import Link from 'next/link';

export const FOOTER_LINKS = [
  { href: '/about', label: 'About / Manifesto' },
  { href: '/about/this-journal', label: 'About This Journal' },
  { href: '/resources', label: 'Resources' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/intel/sources', label: 'Source Transparency' },
  { href: '/legal', label: 'Legal' },
];

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const footerLinks = FOOTER_LINKS;

  return (
    <footer className="border-t border-chrome-border bg-chrome-footer text-chrome-fg" aria-labelledby="footer-heading">
      <h2 id="footer-heading" className="sr-only">Footer</h2>
      <div className="max-w-[1600px] mx-auto px-1 sm:px-2 lg:px-3 py-6 sm:py-8">
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-8" aria-label="Footer navigation">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-label text-sm text-chrome-muted hover:text-chrome-accent transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chrome-accent"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="h-px bg-chrome-border mb-6" role="separator" />
        <div className="text-center space-y-3">
          <p className="system-label text-xs tracking-[0.3em] font-bold text-chrome-muted">
            Independent / Fact-Based / Unapologetically Antifascist
          </p>
          <p className="prose-copy text-xs text-chrome-faint">
            &copy; {currentYear} I AM [RESIST]
          </p>
          <p className="prose-copy text-xs text-chrome-faint">
            Support: <a href="mailto:support@iamresist.org" className="text-chrome-accent hover:text-chrome-accent-hover transition-colors underline decoration-chrome-accent/50 hover:decoration-chrome-accent">support@iamresist.org</a>
          </p>
          <p className="legal-copy text-[10px] text-chrome-muted leading-relaxed max-w-2xl mx-auto mt-4">
            Third-party headlines, excerpts, images, and embeds remain the property of their respective owners and,
            where shown here, are displayed with attribution and links back to the original source.
          </p>
        </div>
      </div>
    </footer>
  );
}
