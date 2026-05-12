import { db } from '@/lib/db';
import { emailCampaigns } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';

export interface EmailCampaignRecord {
  id: string;
  subjectLine: string;
  conceptTitle: string;
  campaignType: string;
  theme: string;
  contentJson: Record<string, unknown>;
  brevoCampaignId: number | null;
  recipientEmail: string | null;
  createdAt: Date;
}

export async function getRecentCampaigns(limit = 10): Promise<EmailCampaignRecord[]> {
  const rows = await db
    .select()
    .from(emailCampaigns)
    .orderBy(desc(emailCampaigns.created_at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    subjectLine: r.subject_line,
    conceptTitle: r.concept_title,
    campaignType: r.campaign_type,
    theme: r.theme,
    contentJson: r.content_json as Record<string, unknown>,
    brevoCampaignId: r.brevo_campaign_id,
    recipientEmail: r.recipient_email,
    createdAt: r.created_at!,
  }));
}

export async function saveCampaign(opts: {
  subjectLine: string;
  conceptTitle: string;
  campaignType: string;
  theme: string;
  contentJson: Record<string, unknown>;
  brevoCampaignId?: number;
  recipientEmail?: string;
}): Promise<EmailCampaignRecord> {
  const [row] = await db
    .insert(emailCampaigns)
    .values({
      subject_line: opts.subjectLine,
      concept_title: opts.conceptTitle,
      campaign_type: opts.campaignType,
      theme: opts.theme,
      content_json: opts.contentJson,
      brevo_campaign_id: opts.brevoCampaignId ?? null,
      recipient_email: opts.recipientEmail ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to save campaign');
  return {
    id: row.id,
    subjectLine: row.subject_line,
    conceptTitle: row.concept_title,
    campaignType: row.campaign_type,
    theme: row.theme,
    contentJson: row.content_json as Record<string, unknown>,
    brevoCampaignId: row.brevo_campaign_id,
    recipientEmail: row.recipient_email,
    createdAt: row.created_at!,
  };
}
