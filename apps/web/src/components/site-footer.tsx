import Link from 'next/link';

import { CRISIS_LINES, SITE } from '@/lib/site';

const FOOTER_LINKS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/support', label: 'Support' },
  { href: '/delete-account', label: 'Delete your account' },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12 text-sm">
        <section aria-labelledby="crisis-heading" className="flex flex-col gap-2">
          <h2 id="crisis-heading" className="font-medium text-foreground">
            If you need help right now
          </h2>
          <p className="text-muted-foreground">
            Calm Guardian is not a medical device and can&apos;t help in an emergency. If
            you&apos;re in danger, call your local emergency number. You can also talk to someone,
            free and any time:
          </p>
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {CRISIS_LINES.map((line) => (
              <li key={line.name}>
                {line.region}: {line.name},{' '}
                <a className="text-primary underline-offset-4 hover:underline" href={line.href}>
                  {line.contact}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-muted-foreground">© {SITE.name}</p>
      </div>
    </footer>
  );
}
