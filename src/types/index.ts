import {
  posts,
  brandKit,
  secrets,
  incomingMessages,
  failedJobs,
  mailDrafts,
  mailInbox,
  invoices,
  kleinanzeigenThreads,
  businessProfileOverrides,
  contentPlans,
  contentSlots,
  products,
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
export type MailInbox = InferSelectModel<typeof mailInbox>;
export type NewMailInbox = InferInsertModel<typeof mailInbox>;
export type Invoice = InferSelectModel<typeof invoices>;
export type NewInvoice = InferInsertModel<typeof invoices>;
export type KleinanzeigenThread = InferSelectModel<typeof kleinanzeigenThreads>;
export type NewKleinanzeigenThread = InferInsertModel<typeof kleinanzeigenThreads>;
export type BusinessProfileOverride = InferSelectModel<typeof businessProfileOverrides>;
export type NewBusinessProfileOverride = InferInsertModel<typeof businessProfileOverrides>;
export type ContentPlan = InferSelectModel<typeof contentPlans>;
export type NewContentPlan = InferInsertModel<typeof contentPlans>;
export type ContentSlot = InferSelectModel<typeof contentSlots>;
export type NewContentSlot = InferInsertModel<typeof contentSlots>;
export type Product = InferSelectModel<typeof products>;
export type NewProduct = InferInsertModel<typeof products>;
export type ContentPillar = 'vitrine' | 'prozess' | 'insight' | 'lokal' | 'reel';
export type { KleinanzeigenAnalysis } from '@/lib/db/schema';
export type { MailAttachment } from '@/lib/db/schema';

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
