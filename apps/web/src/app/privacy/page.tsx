import type { Metadata } from 'next';

import { ContentPage } from '@/components/content-page';
import { SITE } from '@/lib/site';

export const metadata: Metadata = { title: 'Privacy policy' };

// Keep in step with the data inventory in docs/release/store-readiness.md.
export default function PrivacyPage() {
  return (
    <ContentPage title="Privacy policy" isDraft>
      <p>
        Calm Guardian exists to protect your privacy, so we collect as little as we can and never
        sell or share your data for advertising.
      </p>

      <h2>What we collect, and why</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your email address and, if you use them, your Apple or
          Google sign-in ID. We use these to sign you in.
        </li>
        <li>
          <strong>Your connected Bluesky account:</strong> its ID, handle and the access Bluesky
          grants us, which is stored encrypted. We use this only to back up, hide and restore your
          posts when you ask.
        </li>
        <li>
          <strong>Posts you hide:</strong> a full copy of each post, including images, so it can be
          restored exactly.
        </li>
        <li>
          <strong>Calm Mode history:</strong> when Calm Mode was turned on and off.
        </li>
        <li>
          <strong>Guardians:</strong> the name and email of anyone you invite, so we can email them
          when Calm Mode starts.
        </li>
        <li>
          <strong>Crash reports:</strong> technical details when the app crashes, with personal
          information removed.
        </li>
      </ul>

      <h2>What we never collect</h2>
      <p>
        Your Bluesky password, any diagnosis or health information, the reason you turn on Calm
        Mode, your location, your contacts, or advertising identifiers. There is no tracking or
        analytics on this website or in the app.
      </p>

      <h2>Who can see it</h2>
      <p>
        Only you. Guardians receive a short email saying Calm Mode has started. They never see your
        posts or the reason. We use trusted providers to run the service (hosting, database and
        email delivery) under contracts that stop them using your data for anything else.
      </p>

      <h2>Where it&apos;s stored</h2>
      <p>In the United Kingdom, on Supabase and Google Cloud servers in London.</p>

      <h2>How long we keep it</h2>
      <p>
        Hidden posts are kept until you restore them or delete them for good. Everything is deleted
        when you delete your account.
      </p>

      <h2>Your rights</h2>
      <p>
        Under UK data protection law you can ask for a copy of your data, ask us to correct or
        delete it, or object to how we use it. Email{' '}
        <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>. You can also complain to
        the Information Commissioner&apos;s Office (ico.org.uk).
      </p>
    </ContentPage>
  );
}
