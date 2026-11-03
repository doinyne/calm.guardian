import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccountAuth, useAccountSession } from '@/account/account-session';
import { ErrorMessage } from '@/components/error-message';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

import { deleteAccountOnServer } from './delete-account';

export function SettingsScreen() {
  const auth = useAccountAuth();
  const session = useAccountSession();
  const insets = useSafeAreaInsets();

  const signOut = useMutation({ mutationFn: () => auth.signOutThisDevice() });
  const deleteAccount = useMutation({
    mutationFn: async () => {
      await deleteAccountOnServer();
      await auth.signOutThisDevice();
    },
  });

  const email = session.status === 'signed-in' ? session.account.email : null;
  const isBusy = signOut.isPending || deleteAccount.isPending;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-10 px-6 pt-6"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <Section title="Account">
        {email ? <Text>Signed in as {email}</Text> : null}
        <Button variant="outline" size="lg" onPress={() => signOut.mutate()} disabled={isBusy}>
          <Text>{signOut.isPending ? 'Signing out…' : 'Sign out'}</Text>
        </Button>
        {signOut.error ? (
          <ErrorMessage>We couldn&apos;t sign you out. Please try again.</ErrorMessage>
        ) : null}
      </Section>

      <Section title="Delete account">
        <Text className="text-muted-foreground">
          This permanently deletes your Calm Guardian account and everything we keep for you.
        </Text>
        <ConfirmAccountDeletion onConfirm={() => deleteAccount.mutate()} disabled={isBusy} />
        {deleteAccount.isPending ? <Text role="status">Deleting your account…</Text> : null}
        {deleteAccount.error ? (
          <ErrorMessage>
            We couldn&apos;t finish deleting your account. Please check your connection and try
            again.
          </ErrorMessage>
        ) : null}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-4">
      <Text variant="h4">{title}</Text>
      {children}
    </View>
  );
}

function ConfirmAccountDeletion({
  onConfirm,
  disabled,
}: {
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="lg" disabled={disabled}>
          <Text>Delete account</Text>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your Calm Guardian account and everything we keep for you. It
            can&apos;t be undone. Your Bluesky account isn&apos;t affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Text>Keep my account</Text>
          </AlertDialogCancel>
          <AlertDialogAction className="bg-destructive" onPress={onConfirm}>
            <Text className="text-destructive-foreground">Delete my account</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
