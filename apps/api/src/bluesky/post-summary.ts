import { z } from 'zod';

/** What Review shows of a Bluesky post. The one place outside the adapter that reads a post record. */
const PostSummarySchema = z.looseObject({
  text: z.string().catch(''),
  reply: z.unknown().optional(),
});

export function summarisePost(record: Readonly<Record<string, unknown>>) {
  const { text, reply } = PostSummarySchema.parse(record);
  return { text, isReply: reply !== undefined };
}
