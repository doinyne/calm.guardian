import type { Metadata } from 'next';

import { ContentPage } from '@/components/content-page';

export const metadata: Metadata = { title: 'Terms of use' };

export default function TermsPage() {
  return (
    <ContentPage title="Terms of use" isDraft>
      <h2>Not a medical service</h2>
      <p>
        Calm Guardian is a social media privacy tool. It is not a medical device and doesn&apos;t
        diagnose, treat or prevent any condition. If you are in crisis, please contact your local
        emergency services or one of the helplines below.
      </p>

      <h2>How hiding and restoring works</h2>
      <p>
        Bluesky has no way to hide a post, so Calm Guardian backs up each post and then deletes it
        from Bluesky. Restoring re-creates the post from the backup. Restored posts show the date
        they were restored, and likes, reposts and replies from other people are not restored.
      </p>

      <h2>Your Bluesky account</h2>
      <p>
        You stay bound by Bluesky&apos;s own terms. You can disconnect Calm Guardian from your
        Bluesky account at any time.
      </p>
    </ContentPage>
  );
}
