import type { Metadata } from 'next';

import { ContentPage } from '@/components/content-page';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'Delete your account' };

// Google Play requires a web page where people can request account deletion without the app.
export default function DeleteAccountPage() {
  return (
    <ContentPage title="Delete your Calm Guardian account">
      <h2>Before you delete</h2>
      <p>
        Any posts still hidden in your archive will be deleted with your account and can&apos;t be
        recovered. If you want to keep them, restore them to Bluesky in the app first.
      </p>

      <h2>In the app</h2>
      <p>
        Open Calm Guardian, go to <strong>Settings</strong>, then <strong>Delete account</strong>,
        and confirm.
      </p>

      <h2>Without the app</h2>
      <p>
        Email <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> from the address you
        signed up with, asking us to delete your account. We&apos;ll confirm and complete it within
        30 days.
      </p>

      <h2>What gets deleted</h2>
      <ul>
        <li>Your account and sign-in details</li>
        <li>Your connection to Bluesky, including the access Bluesky granted us</li>
        <li>Your archived posts and images</li>
        <li>Your Calm Mode history and guardians</li>
      </ul>
      <p>Your posts that are currently visible on Bluesky are not affected.</p>
    </ContentPage>
  );
}
