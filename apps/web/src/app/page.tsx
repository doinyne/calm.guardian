import { FadeIn } from '@/components/fade-in';
import BackgroundPaths from '@/components/kokonutui/background-paths';
import { SITE } from '@/lib/site';

const STEPS = [
  {
    title: 'Turn on Calm Mode',
    body: 'One tap when you need a break. Choose how far back to go: the last day, week or month.',
  },
  {
    title: 'Your posts are kept safe',
    body: 'Each post is backed up first, then hidden from Bluesky. Nothing is removed until its backup is confirmed.',
  },
  {
    title: 'Bring them back when you’re ready',
    body: 'Review your posts in your own time. Restore any of them, keep them hidden, or delete them for good.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <BackgroundPaths className="min-h-[70dvh] bg-background text-primary" speed={0.6}>
        <div className="relative flex max-w-2xl flex-col items-center gap-6 px-6 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            {SITE.name}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground sm:text-xl">{SITE.description}</p>
          <p className="rounded-full border border-border bg-background/70 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur">
            Coming soon to iPhone and Android
          </p>
        </div>
      </BackgroundPaths>

      <section aria-labelledby="how-heading" className="mx-auto w-full max-w-4xl px-6 py-20">
        <h2 id="how-heading" className="mb-10 text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <FadeIn delay={index * 0.1}>
                <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-6">
                  <span className="text-sm font-medium text-primary">Step {index + 1}</span>
                  <h3 className="text-lg font-semibold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.body}</p>
                </div>
              </FadeIn>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="guardians-heading" className="mx-auto w-full max-w-4xl px-6 pb-20">
        <FadeIn>
          <div className="flex flex-col gap-3 rounded-xl bg-secondary p-8 text-secondary-foreground">
            <h2 id="guardians-heading" className="text-2xl font-semibold tracking-tight">
              Let someone you trust know
            </h2>
            <p>
              Invite a guardian, a friend or family member, and they&apos;ll get a calm, private
              email when Calm Mode starts. They never see your posts or why you turned it on.
            </p>
          </div>
        </FadeIn>
      </section>
    </main>
  );
}
