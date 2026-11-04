import { CALM_PERIOD_PRESETS, type CalmPeriodPreset } from '@calm-guardian/shared';
import { THEME_COLORS } from '@calm-guardian/shared';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorMessage } from '@/components/error-message';
import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

import { DEFAULT_PERIOD, PERIOD_LABEL, previewSentence } from './calm-copy';
import { useCalmPreview, useCalmStatus, useTurnOnCalm, type CalmTarget } from './use-calm';

/**
 * Turning Calm Mode on: choose how far back, see roughly how many posts that is, then confirm. The
 * work runs in the background (ADR-0015), so this closes straight away and home shows the progress.
 */
export function TurnOnCalmScreen({ target, onDone }: { target: CalmTarget; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<CalmPeriodPreset>(DEFAULT_PERIOD);
  const status = useCalmStatus();
  const standingBy = (status.data ?? []).filter(
    (account) => account.calm === null && account.status === 'active',
  );
  const preview = useCalmPreview(
    target,
    standingBy.map((account) => account.id),
    period,
  );
  const turnOn = useTurnOnCalm();

  const handle =
    target === 'all'
      ? undefined
      : status.data?.find((account) => account.id === target.connectedAccountId)?.handle;
  const forWhom = target === 'all' ? 'For all your accounts' : handle ? `For @${handle}` : '';

  const confirm = () =>
    turnOn.mutate(
      { target, period },
      {
        onSuccess: (outcome) => {
          if (outcome === 'started') onDone();
        },
      },
    );

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-6"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between">
        <MonoLabel tone="primary">Calm Mode</MonoLabel>
        <Button variant="ghost" size="icon" onPress={onDone} aria-label="Close">
          <X color={THEME_COLORS.foreground} size={22} aria-hidden />
        </Button>
      </View>

      <View className="gap-3">
        <Text variant="h3" className="text-3xl">
          Turn on Calm Mode
        </Text>
        {forWhom ? <MonoLabel>{forWhom}</MonoLabel> : null}
        <Text className="text-muted-foreground">
          Each post is backed up first, then hidden from Bluesky, newest first. Nothing is lost: you
          choose what comes back, when you&apos;re ready.
        </Text>
      </View>

      <View className="gap-3" role="radiogroup" aria-label="How far back">
        <MonoLabel>How far back</MonoLabel>
        {CALM_PERIOD_PRESETS.map((preset) => {
          const selected = preset === period;
          return (
            <Pressable
              key={preset}
              role="radio"
              aria-checked={selected}
              onPress={() => setPeriod(preset)}
              className={cn(
                'min-h-12 flex-row items-center gap-3 rounded-xl border px-4',
                selected ? 'border-primary bg-card' : 'border-border',
              )}
            >
              <View
                aria-hidden
                className={cn(
                  'size-4 rounded-full border-2',
                  selected ? 'border-primary bg-primary' : 'border-muted-foreground',
                )}
              />
              <Text>{PERIOD_LABEL[preset]}</Text>
            </Pressable>
          );
        })}
      </View>

      <View className="min-h-6" aria-live="polite">
        {preview.isPending && preview.fetchStatus !== 'idle' ? (
          <Text className="text-muted-foreground">Counting posts…</Text>
        ) : null}
        {preview.data ? <Text>{previewSentence(preview.data)}</Text> : null}
        {preview.isError ? (
          <Text className="text-muted-foreground">
            We couldn&apos;t count the posts just now. You can still turn Calm Mode on.
          </Text>
        ) : null}
      </View>

      <Button size="lg" onPress={confirm} disabled={turnOn.isPending}>
        <Text>{turnOn.isPending ? 'Turning on…' : 'Turn on Calm Mode'}</Text>
      </Button>
      {turnOn.data === 'needs-sign-in' ? (
        <ErrorMessage>Please sign in to this account again, then turn on Calm Mode.</ErrorMessage>
      ) : null}
      {turnOn.error ? (
        <ErrorMessage>We couldn&apos;t turn on Calm Mode. Please try again.</ErrorMessage>
      ) : null}
    </ScrollView>
  );
}
