import type { AppVariant } from '@/config/app-variant';

/**
 * Platforms we'd like to support but haven't checked yet: each one needs a spike to see whether its
 * API lets an app hide and restore a personal account's posts (BUILD_PLAN, "Platform roadmap").
 */
export const UPCOMING_PLATFORMS = [
  'Mastodon',
  'Threads',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'X',
] as const;
export type UpcomingPlatform = (typeof UPCOMING_PLATFORMS)[number];

/**
 * Internal builds show the upcoming Platforms, so we can see where the product is heading. Store
 * builds don't: reviewers reject placeholder features (Apple 2.1, 2.3), we'd be promising something
 * we may not be able to build, and we'd be using other companies' names without need.
 */
export function upcomingPlatformsShownIn(variant: AppVariant): readonly UpcomingPlatform[] {
  return variant === 'production' ? [] : UPCOMING_PLATFORMS;
}
