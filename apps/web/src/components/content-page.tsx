import Link from 'next/link';
import type { ReactNode } from 'react';

import { SITE } from '@/lib/site';

type ContentPageProps = {
  title: string;
  /** Shown under the title, e.g. "Last updated 2 November 2026". */
  subtitle?: string;
  /** Marks content that hasn't been reviewed for launch yet. */
  isDraft?: boolean;
  children: ReactNode;
};

/** Layout for text pages: privacy, terms, support, account deletion. */
export function ContentPage({ title, subtitle, isDraft = false, children }: ContentPageProps) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
        ← {SITE.name}
      </Link>

      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
      </header>

      {isDraft ? (
        <p
          role="note"
          className="rounded-lg border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground"
        >
          Draft: this page will be reviewed and finalised before Calm Guardian launches.
        </p>
      ) : null}

      <div className="flex flex-col gap-6 leading-7 [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
        {children}
      </div>
    </main>
  );
}
