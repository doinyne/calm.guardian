/** Site-wide facts, in one place. */
export const SITE = {
  name: 'Calm Guardian',
  description:
    'Take a break from social media whenever you need one. Calm Guardian keeps your posts safe until you are ready to bring them back.',
  // `.example` can never be a real address. Replace when the domain is bought
  // (docs/release/accounts-setup.md).
  supportEmail: 'support@calmguardian.example',
} as const;

/** Shown wherever someone might be struggling. Keep numbers verified and free to call. */
export const CRISIS_LINES = [
  { region: 'UK and Ireland', name: 'Samaritans', contact: '116 123', href: 'tel:116123' },
  {
    region: 'United States',
    name: '988 Suicide & Crisis Lifeline',
    contact: '988',
    href: 'tel:988',
  },
  {
    region: 'Elsewhere',
    name: 'Find a Helpline',
    contact: 'findahelpline.com',
    href: 'https://findahelpline.com',
  },
] as const;
