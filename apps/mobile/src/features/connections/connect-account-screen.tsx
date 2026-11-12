import { X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorMessage } from '@/components/error-message';
import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { THEME_COLORS } from '@calm-guardian/shared';

import type { ConnectOutcome } from './connect-bluesky';
import type { UpcomingPlatform } from './platforms';
import { useConnectBluesky } from './use-connections';

/** What to say after a connect attempt that didn't connect anything. */
const OUTCOME_MESSAGE: Record<
  Exclude<ConnectOutcome, 'connected'>,
  { text: string; isProblem: boolean }
> = {
  cancelled: {
    text: 'No account was connected. You can try again whenever you like.',
    isProblem: false,
  },
  'connected-elsewhere': {
    text: 'That Bluesky account is already connected to another Calm Guardian account.',
    isProblem: true,
  },
  failed: { text: "We couldn't connect your Bluesky account. Please try again.", isProblem: true },
};

/**
 * Choose a Platform and connect an account on it. Connecting closes the screen, so the new account
 * shows up on home; anything else keeps it open with a calm explanation.
 */
export function ConnectAccountScreen({
  upcomingPlatforms,
  onDone,
}: {
  upcomingPlatforms: readonly UpcomingPlatform[];
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const connect = useConnectBluesky();

  const connectBluesky = () =>
    connect.mutate(undefined, {
      onSuccess: (outcome) => {
        if (outcome === 'connected') onDone();
      },
    });

  const outcome = connect.error
    ? OUTCOME_MESSAGE.failed
    : connect.data && connect.data !== 'connected'
      ? OUTCOME_MESSAGE[connect.data]
      : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-6"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between">
        <MonoLabel tone="primary">Connect</MonoLabel>
        <Button variant="ghost" size="icon" onPress={onDone} aria-label="Close">
          <X color={THEME_COLORS.foreground} size={22} aria-hidden />
        </Button>
      </View>

      <View className="gap-3">
        <Text variant="h3" className="text-3xl">
          Connect an account
        </Text>
        <Text className="text-muted-foreground">
          Add as many as you like, even several on one platform. You sign in on the platform&apos;s
          own page, so we never see your password.
        </Text>
        <View className="gap-1 rounded-xl border border-hope p-3" role="note">
          <MonoLabel className="text-hope">Demo</MonoLabel>
          <Text className="text-sm">
            This is a demo. Please connect a test Bluesky account, not one you rely on: Calm Mode
            really does hide its posts.
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <AvailableCard>
          <MonoLabel>Available</MonoLabel>
          <View className="flex-row items-center gap-3">
            <PlatformBadge name="Bluesky" />
            <View className="flex-1 gap-0.5">
              <Text className="font-semibold">Bluesky</Text>
              <Text className="text-sm text-muted-foreground">Hide and restore your posts</Text>
            </View>
            <Button
              onPress={connectBluesky}
              disabled={connect.isPending}
              aria-label="Connect Bluesky"
            >
              <Text>{connect.isPending ? 'Connecting…' : 'Connect'}</Text>
            </Button>
          </View>
        </AvailableCard>
        {outcome?.isProblem ? <ErrorMessage>{outcome.text}</ErrorMessage> : null}
        {outcome && !outcome.isProblem ? (
          <Text className="text-muted-foreground">{outcome.text}</Text>
        ) : null}
      </View>

      {upcomingPlatforms.length > 0 ? (
        <View className="gap-4 rounded-xl border border-dashed border-border p-4">
          <View className="gap-1">
            <MonoLabel>Not available yet</MonoLabel>
            <Text className="text-sm text-muted-foreground">
              We&apos;re checking what each platform allows.
            </Text>
          </View>
          {upcomingPlatforms.map((platform) => (
            <View key={platform} className="flex-row items-center gap-3">
              <PlatformBadge name={platform} />
              <Text>{platform}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

/** A card with aqua corner brackets, the control-room cue for "this one is ready". */
function AvailableCard({ children }: { children: ReactNode }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View
        aria-hidden
        className="absolute -left-px -top-px size-5 rounded-tl-xl border-l-2 border-t-2 border-primary"
      />
      <View
        aria-hidden
        className="absolute -bottom-px -right-px size-5 rounded-br-xl border-b-2 border-r-2 border-primary"
      />
      {children}
    </View>
  );
}

/** The Platform's initial in a ring. Decorative: its name is always written next to it. */
function PlatformBadge({ name }: { name: string }) {
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="size-9 items-center justify-center rounded-full border border-border"
    >
      <MonoLabel className="tracking-normal">{name.charAt(0)}</MonoLabel>
    </View>
  );
}
