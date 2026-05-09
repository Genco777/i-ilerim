import {
  posts,
  brandKit,
  secrets,
  incomingMessages,
  failedJobs,
  mailDrafts,
} from '@/lib/db/schema';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;
export type BrandKit = InferSelectModel<typeof brandKit>;
export type NewBrandKit = InferInsertModel<typeof brandKit>;
export type Secret = InferSelectModel<typeof secrets>;
export type IncomingMessage = InferSelectModel<typeof incomingMessages>;
export type NewIncomingMessage = InferInsertModel<typeof incomingMessages>;
export type FailedJob = InferSelectModel<typeof failedJobs>;
export type NewFailedJob = InferInsertModel<typeof failedJobs>;
export type MailDraft = InferSelectModel<typeof mailDrafts>;
export type NewMailDraft = InferInsertModel<typeof mailDrafts>;

export type ImageProvider = 'openai' | 'replicate';
export type LogoPosition =
  | 'bottom_right'
  | 'bottom_left'
  | 'top_right'
  | 'top_left'
  | 'none';

export interface Draft {
  id: string;
  text: string;
  hashtags: string[];
  imageUrl: string;
  rawImageUrl?: string;
  imageProvider: ImageProvider;
}
