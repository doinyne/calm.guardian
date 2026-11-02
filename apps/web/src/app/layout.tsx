import type { Metadata } from 'next';
import { Geist } from 'next/font/google';

import { SiteFooter } from '@/components/site-footer';
import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

import './globals.css';

// next/font downloads the font at build time and serves it from our own domain, so visitors'
// browsers never contact Google.
const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: { template: `%s · ${SITE.name}`, default: SITE.name },
  description: SITE.description,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GB" className={cn('font-sans antialiased', geist.variable)}>
      <body className="flex min-h-dvh flex-col">
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
