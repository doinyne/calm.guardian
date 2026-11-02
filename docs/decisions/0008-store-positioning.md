# 0008: Store positioning and distribution

**Status:** Proposed · **Date:** 2026-11-02

## Context
Calm Guardian is free, built by a solo developer, and serves people with episodic mental health
conditions. How we describe and publish it decides which store rules and regulations apply.

## Decision

**Developer accounts**
- **Personal developer accounts** with Apple (USD 99 a year) and Google Play (USD 25 one-off).
- **Google:** new personal accounts must run a **closed test with at least 12 testers opted in for
  14 continuous days** before they can publish to production. This is planned into M8.
- **Apple guideline 5.1.1(ix)** says apps that "require sensitive user information" should be
  submitted by a legal entity. That's a review risk for an individual. We mitigate it by:
  - being clearly a social media privacy tool
  - collecting the minimum data
  - having a clear privacy policy
  - writing thorough review notes

  If Apple rejects on this ground, the fallback is to form a Ltd and transfer the app.

**Positioning and audience**
- **Category:** Social Networking (primary) or Utilities. **Not** Medical or Health & Fitness.
- **We make no medical claims**: no diagnosis, treatment or prevention language. The app shows a
  "not a medical device" disclaimer and region-aware crisis resources.
- **We do not collect** diagnoses, symptoms or the *reason* for Calm Mode.
- **Adult target audience** in Play Console, so the Families policy doesn't apply. Age ratings are
  answered honestly in each store's questionnaire.
- **Google Play's health apps declaration** is completed honestly. The product is adjacent to
  wellbeing, so we declare what applies.

## Consequences
- Data minimisation keeps the privacy label and data safety form short, and lowers our UK GDPR risk.
- Marketing copy and store listings must follow the no-medical-claims rule.
- Recruiting 12+ closed-test testers is on the critical path to launch.
