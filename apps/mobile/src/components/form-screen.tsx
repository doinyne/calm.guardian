import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { HeaderScrollView } from '@/components/header-scroll-view';
import { MonoLabel } from '@/components/mono-label';
import { Text } from '@/components/ui/text';

/**
 * A screen under a navigation header with a title, a short explanation and a form. It scrolls, so
 * nothing is cut off at large text sizes, and it moves up out of the keyboard's way.
 */
export function FormScreen({
  step,
  title,
  description,
  children,
}: {
  /** A short status label above the title, e.g. "Sign in · Step 1 of 2". */
  step: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background"
    >
      <HeaderScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="grow gap-6 px-6 pt-2"
      >
        <View className="gap-2">
          <MonoLabel tone="primary">{step}</MonoLabel>
          <Text variant="h3">{title}</Text>
          <Text className="text-muted-foreground">{description}</Text>
        </View>
        {children}
      </HeaderScrollView>
    </KeyboardAvoidingView>
  );
}
