import { Alert, View } from 'react-native';

import { ErrorMessage } from '@/components/error-message';
import { HeaderScrollView } from '@/components/header-scroll-view';
import { MonoLabel } from '@/components/mono-label';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCalmStatus } from '@/features/calm/use-calm';

import {
  useDeleteForGood,
  useKeepHidden,
  useRestoreAll,
  useRestorePost,
  useReview,
  type ReviewPost,
  type ReviewProblem,
} from './use-review';

const PROBLEM_TEXT: Record<ReviewProblem, string> = {
  'calm-mode-on': 'Calm Mode is on for this account. Turn it off to bring posts back.',
  'needs-sign-in': 'Please sign in to this account again, then try once more.',
  busy: 'Bluesky asked us to slow down. Please try again in a few minutes.',
};

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/**
 * Review (M5): the user's hidden posts, safely backed up, and what happens to each. Posts written
 * during a hard time can be hard to read, so the screen is unhurried: nothing is urgent, and every
 * choice except "delete for good" can be changed later.
 */
export function ReviewScreen() {
  const review = useReview();
  const status = useCalmStatus();
  const restoreAll = useRestoreAll();
  const posts = review.data?.posts ?? [];
  const toReview = posts.filter((post) => post.state === 'to-review');
  const keptHidden = posts.filter((post) => post.state === 'kept-hidden');
  const accountsWithPostsToReview = (status.data ?? []).filter((account) =>
    toReview.some((post) => post.connectedAccountId === account.id),
  );

  return (
    <HeaderScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 px-6 pt-4">
      <View className="gap-2">
        <Text className="text-muted-foreground">
          Your hidden posts are safely backed up. Take your time: you choose what comes back, and
          when.
        </Text>
      </View>

      {review.isPending ? <Text className="text-muted-foreground">Loading…</Text> : null}
      {review.isError ? (
        <ErrorMessage>We couldn&apos;t load your hidden posts. Please try again.</ErrorMessage>
      ) : null}
      {review.isSuccess && posts.length === 0 ? (
        <Text>Nothing to review. All your posts are where you left them.</Text>
      ) : null}

      {accountsWithPostsToReview.map((account) => (
        <Button
          key={account.id}
          variant="outline"
          onPress={() => restoreAll.mutate(account.id)}
          disabled={restoreAll.isPending}
          aria-label={`Bring back all posts for @${account.handle}`}
        >
          <Text>{`Bring back all for @${account.handle}`}</Text>
        </Button>
      ))}
      {restoreAll.isSuccess && restoreAll.data === null ? (
        <Text className="text-muted-foreground">
          Bringing your posts back, oldest first. It carries on if you close the app.
        </Text>
      ) : null}
      {restoreAll.data ? <ErrorMessage>{PROBLEM_TEXT[restoreAll.data]}</ErrorMessage> : null}

      {toReview.length > 0 ? (
        <View className="gap-3">
          <View role="heading">
            <MonoLabel>{`To review · ${toReview.length}`}</MonoLabel>
          </View>
          {toReview.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </View>
      ) : null}

      {keptHidden.length > 0 ? (
        <View className="gap-3">
          <View role="heading">
            <MonoLabel>{`Kept hidden · ${keptHidden.length}`}</MonoLabel>
          </View>
          {keptHidden.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </View>
      ) : null}
    </HeaderScrollView>
  );
}

function PostCard({ post }: { post: ReviewPost }) {
  const restore = useRestorePost();
  const keepHidden = useKeepHidden();
  const deleteForGood = useDeleteForGood();
  const busy = restore.isPending || keepHidden.isPending || deleteForGood.isPending;
  const problem = restore.data ?? keepHidden.data ?? deleteForGood.data;
  const failed = restore.error ?? keepHidden.error ?? deleteForGood.error;

  const confirmDelete = () =>
    Alert.alert(
      'Delete this post for good?',
      "It won't come back to Bluesky, and we won't keep a copy. This can't be undone.",
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete for good',
          style: 'destructive',
          onPress: () => deleteForGood.mutate(post.id),
        },
      ],
    );

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <MonoLabel>{describe(post)}</MonoLabel>
      <Text>{post.text || 'A post with no text.'}</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button onPress={() => restore.mutate(post.id)} disabled={busy}>
          <Text>Bring back</Text>
        </Button>
        {post.state === 'to-review' ? (
          <Button variant="outline" onPress={() => keepHidden.mutate(post.id)} disabled={busy}>
            <Text>Keep hidden</Text>
          </Button>
        ) : null}
        <Button variant="ghost" onPress={confirmDelete} disabled={busy}>
          <Text>Delete for good</Text>
        </Button>
      </View>
      {problem ? <ErrorMessage>{PROBLEM_TEXT[problem]}</ErrorMessage> : null}
      {failed ? <ErrorMessage>Something went wrong. Please try again.</ErrorMessage> : null}
    </View>
  );
}

/** "3 Nov 2026, 9:00 · Reply · 2 images" */
function describe(post: ReviewPost): string {
  const parts = [DATE_FORMAT.format(new Date(post.postedAt))];
  if (post.isReply) parts.push('Reply');
  const images = post.files.filter((type) => type.startsWith('image/')).length;
  const videos = post.files.filter((type) => type.startsWith('video/')).length;
  if (images > 0) parts.push(images === 1 ? '1 image' : `${images} images`);
  if (videos > 0) parts.push(videos === 1 ? '1 video' : `${videos} videos`);
  return parts.join(' · ');
}
