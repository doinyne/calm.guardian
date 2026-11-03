# 0011: Calm Mode per connected account; Guardians may turn it on for accounts the user allows

**Status:** Accepted · **Date:** 2026-11-03 · **Amends:** the Guardian definition (notify-only) and
M3/M6 in `docs/BUILD_PLAN.md`

## Context
People will connect several accounts, sometimes several on one Platform, and won't always want the
same protection on all of them. Someone in a hard moment may also be unable, or not think, to turn
Calm Mode on themselves. Dean wants:
- a Calm control for each connected account, plus one for all of them
- Guardians able to turn Calm Mode on for the user, but only for accounts the user has chosen
- the user in complete control of who their Guardians are, changing them whenever they like

Letting one person act on another person's account is the most sensitive thing the app does. In the
wrong hands, for example a controlling partner, it could be used to silence someone. Every choice
below is about keeping the user in control.

## Decision

**Calm Mode is per connected account.**
- A **Calm session** belongs to one connected account. "Turn on for all" starts one for each
  connected account that can be protected, and each start is retry-safe on its own (product rule 2).
- The result is reported per account. An account that needs signing in again can't be protected, and
  the app says so rather than claiming everything is covered.
- Every Calm session records **who started it**: the user, or which Guardian.

**Guardians can turn Calm Mode on, and nothing else.**
- The user chooses, for each connected account, whether their Guardians may turn Calm Mode on for it
  ("Guardians can turn this on"). It is **off by default**, and the user changes it whenever they like.
- A Guardian can only **turn Calm Mode on**, and only for those accounts. They can't turn it off,
  restore or delete posts, see the Archive, or change any settings.
- Guardians never see post content or the reason (product rule 3). They see the account's handle,
  whether Calm Mode is on, and nothing more.
- The **user is told straight away** when a Guardian turns Calm Mode on, and who did it.
- **The user can always turn it off**, at once, whoever turned it on (product rule 6). A Guardian's
  action is a safety net, not a lock.
- The user can remove a Guardian, or withdraw their permission for any account, at any time, and the
  change takes effect immediately. A Guardian can also step down.
- A Guardian-started session goes through exactly the same backup-before-delete core as any other
  (product rule 1). There is no separate path.
- **A Guardian can turn Calm Mode on for an account only when none of that account's archived posts
  are waiting in Review.** Restore, Keep hidden and Delete for good all count as dealing with a post.
  So after a session, the Guardian can't turn it on again until the user has been through Review, at
  their own pace. The user can always turn Calm Mode on themselves. *Dean's rule, 2026-11-03.*

**Guardians sign in.** A Guardian acts from their own Calm Guardian Account in the same app, signed in
with the email address that accepted the invitation. A link in an email is not enough, because it
could be forwarded. *Default chosen by Claude; Dean can still choose a web-only flow instead.*

## Consequences
- Guardians become Account holders, so their email address, the link between Guardian and user, and
  the per-account permissions are new personal data. They go in the store-readiness data inventory,
  the privacy policy and the store labels.
- Activation needs an actor: the API checks that the caller is the account's owner, or a Guardian with
  permission for that connected account. Tests must cover a Guardian without permission, a removed
  Guardian, a Guardian trying to turn Calm Mode off, and a Guardian trying to read the Archive.
- The Calm Mode state machine and screens work per connected account, with a summary for all of them.
- App Review notes must explain the Guardian feature and its safeguards. Reviewers will ask how it
  can't be used against someone.
- **Trade-offs of the Review rule:**
  - While posts are waiting in Review, a Guardian can't step in, even if the user is struggling
    again. That's accepted: the user can still turn it on, and the rule stops sessions stacking up
    faster than the user can respond.
  - Once Review is clear, a Guardian could turn it on again straight away. The defence is that the user
    is told every time and can remove the Guardian or withdraw permission in one step. When the user
    turns off a session a Guardian started, the app offers "Change what <Guardian> can do?".
