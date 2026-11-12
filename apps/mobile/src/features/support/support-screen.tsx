import { HELPLINE_DIRECTORY_URL, supportFor, type SupportLine } from '@calm-guardian/shared';
import { Linking, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/** "Not a medical device", said the same way everywhere (product rule 7: no medical claims). */
export const NOT_MEDICAL =
  "Calm Guardian isn't a medical device and doesn't give medical advice. It helps you take a break from social media.";

/** The phone's region from its locale, e.g. "en-GB" → "GB". No permission or extra package needed. */
export function deviceRegion(
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
): string | undefined {
  // The language comes first, so a region is any later two-letter part ("en-GB", "zh-Hant-TW").
  const region = locale
    .split(/[-_]/)
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part));
  return region?.toUpperCase();
}

const textLink = (to: string, message?: string) => {
  if (!message) return `sms:${to}`;
  // iOS and Android disagree on how to add the message.
  return Platform.OS === 'ios'
    ? `sms:${to}&body=${encodeURIComponent(message)}`
    : `sms:${to}?body=${encodeURIComponent(message)}`;
};

const open = (url: string) => void Linking.openURL(url);

/**
 * Support right now: who to call or text, for where the phone is. Reachable before and after
 * signing in, and from moments that might be hard (turning Calm Mode on).
 */
export function SupportScreen({
  region = deviceRegion(),
  onClose,
}: {
  region?: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const support = supportFor(region);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-6"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row items-center justify-between">
        <MonoLabel tone="primary">Support</MonoLabel>
        <Button variant="ghost" onPress={onClose}>
          <Text>Close</Text>
        </Button>
      </View>

      <View className="gap-3">
        <Text variant="h3" className="text-3xl">
          You don&apos;t have to go through it alone
        </Text>
        <Text className="text-muted-foreground">
          These services are free and confidential. You can talk to someone any time.
        </Text>
      </View>

      <View className="gap-3 rounded-xl border border-hope bg-card p-4">
        <MonoLabel className="text-hope">If you&apos;re in danger now</MonoLabel>
        <Button
          size="lg"
          onPress={() => open(`tel:${support.emergency}`)}
          aria-label={`Call ${support.emergency}`}
        >
          <Text>{`Call ${support.emergency}`}</Text>
        </Button>
      </View>

      {support.lines.map((line) => (
        <LineCard key={line.name} line={line} />
      ))}

      <View className="gap-2">
        <Text className="text-muted-foreground">
          {support.lines.length > 0
            ? 'Somewhere else?'
            : 'Find free, confidential support near you.'}
        </Text>
        <Button variant="outline" onPress={() => open(HELPLINE_DIRECTORY_URL)}>
          <Text>Find a helpline</Text>
        </Button>
      </View>

      <Text className="text-sm text-muted-foreground">{NOT_MEDICAL}</Text>
    </ScrollView>
  );
}

function LineCard({ line }: { line: SupportLine }) {
  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="gap-1">
        <Text className="font-semibold">{line.name}</Text>
        <Text className="text-muted-foreground">{line.about}</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {line.call ? (
          <Button onPress={() => open(`tel:${line.call}`)} aria-label={`Call ${line.name}`}>
            <Text>Call</Text>
          </Button>
        ) : null}
        {line.text ? (
          <Button
            variant="outline"
            onPress={() => open(textLink(line.text?.to ?? '', line.text?.message))}
            aria-label={`Text ${line.name}`}
          >
            <Text>
              {line.text.message
                ? `Text ${line.text.message} to ${line.text.to}`
                : `Text ${line.text.to}`}
            </Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
