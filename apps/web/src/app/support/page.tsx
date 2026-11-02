import type { Metadata } from 'next';

import { ContentPage } from '@/components/content-page';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'Support' };

export default function SupportPage() {
  return (
    <ContentPage title="Support">
      <p>
        Questions or problems? Email <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>{' '}
        and we&apos;ll get back to you.
      </p>

      <h2>Does Calm Guardian see my Bluesky password?</h2>
      <p>
        No. You connect through Bluesky&apos;s own sign-in screen, and Bluesky gives Calm Guardian
        limited access that you can remove at any time.
      </p>

      <h2>Why do restored posts show today&apos;s date?</h2>
      <p>
        Bluesky has no &quot;hide&quot; feature, so hidden posts are backed up and removed.
        Restoring re-creates them, and Bluesky dates a post when it&apos;s created.
      </p>

      <h2>What happens if something goes wrong while hiding posts?</h2>
      <p>
        A post is only removed after its backup is confirmed. If a post can&apos;t be hidden, it
        stays visible and the app tells you which ones.
      </p>
    </ContentPage>
  );
}
