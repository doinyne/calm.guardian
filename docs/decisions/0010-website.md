# 0010: Public website in `apps/web` (Next.js, KokonutUI, Motion)

**Status:** Proposed · **Date:** 2026-11-02

## Context
Both stores need public URLs before launch:
- a privacy policy
- a support page
- (Google) an account deletion page

Bluesky OAuth needs a client metadata URL on our domain. Universal Links and App Links need
`apple-app-site-association` and `assetlinks.json` on the domain too. Dean wants the site to use
KokonutUI, Motion and, if we ever show charts, Bklit UI. All three are web libraries, so this is
where they fit.

## Decision
- `apps/web` is a **Next.js** app (App Router, TypeScript strict) with **Tailwind v4**, **shadcn/ui**
  conventions, **KokonutUI** components via the shadcn CLI registry (`@kokonutui/...`), and **Motion**
  for animation.
- Bklit UI is added only if a page needs a chart. It's MIT, except Bklit Studio, which is proprietary
  and must not be used.
- It shares the canonical brand colours (`packages/shared/src/theme-colors.ts`, ADR-0007). A test
  keeps its CSS in sync.
- Pages:
  - landing
  - privacy policy
  - terms
  - support
  - account deletion request
  - later, the `.well-known` files and the OAuth client metadata (or it proxies them from the API)
- Hosting is decided in M0b, e.g. Cloud Run (same as the API) or Firebase Hosting. It needs HTTPS on
  our own domain.
- **No analytics or tracking scripts.** That keeps the privacy policy simple and matches the app (ADR-0008).

## Consequences
- One repo and one colour system for app and site.
- The legal pages need real content (M7), with placeholder copy until then.
- Animations respect `prefers-reduced-motion`.
- Pro components from KokonutUI are paid. We stick to the free MIT set unless Dean decides otherwise.
