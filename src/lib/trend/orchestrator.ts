/**
 * Trend Engine Orchestrator — Faz 1
 *
 * Daily pipeline:
 *   1. discoverNiches() → top 1-3 candidates
 *   2. For each candidate: generateProductContent()
 *   3. Persist niches + products to DB
 *      - products.status = 'awaiting_approval'
 *      - assets fields left null (Faz 2 fills them)
 *   4. Return a structured summary (used by cron route to build Telegram digest)
 *
 * Faz 2+ will extend this: visual generation, PDF, Telegram approval msg.
 * For Faz 1, the cron route just sends a text digest with the JSON preview.
 */

import { db } from '@/lib/db';
import { niches, products } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { discoverNiches, type NicheCandidate } from './discovery';
import { generateProductContent, type ProductContent } from './content';
import { generateHeroVisual } from './visual';
import { generateProductPdf } from './pdf-generator';
import { generateProductVideo } from './video';
import { uploadImage } from '@/lib/blob';
import { sendPhoto, sendDocument, sendVideo } from '@/lib/telegram/bot';
import { productApprovalKeyboard } from '@/lib/telegram/product-approval-keyboard';
import { formatProductCaption } from './approval-handlers';

export interface DailyRunSummary {
  runAt: string; // ISO timestamp
  nichesConsidered: number;
  productsCreated: number;
  results: Array<{
    nicheId: string;
    productId: string;
    topic: string;
    gapAngle: string;
    score: number;
    competition: 'low' | 'medium' | 'high';
    productType: NicheCandidate['productHint'];
    etsyTitle: string;
    shopTitle: string;
    priceCents: number;
    tags: string[];
    slug: string;
    turkishGapAngle: string;
    turkishSummary: string;
  }>;
  errors: string[];
}

export interface OrchestratorOptions {
  date?: Date;
  maxProducts?: number; // hard cap, default reads from DAILY_PRODUCT_CAP env
  dryRun?: boolean; // if true, do NOT write to DB
  /**
   * If true, after persisting each product also generate a hero image and
   * send a Telegram card with the approval keyboard. Default true in real
   * runs (Faz 2-A); dry runs always skip visuals.
   */
  generateVisuals?: boolean;
  /**
   * Telegram chat IDs that receive product approval cards. Defaults to
   * ALLOWED_TELEGRAM_USER_IDS env (same as notifyAdmins).
   */
  approvalChatIds?: number[];
}

function getDailyCap(): number {
  const raw = process.env.DAILY_PRODUCT_CAP;
  if (!raw) return 2;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

function getApprovalChatIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export async function runDailyTrendPipeline(
  opts: OrchestratorOptions = {},
): Promise<DailyRunSummary> {
  const date = opts.date ?? new Date();
  const cap = opts.maxProducts ?? getDailyCap();
  const dryRun = opts.dryRun ?? false;
  const generateVisuals = dryRun ? false : (opts.generateVisuals ?? true);
  const approvalChatIds = opts.approvalChatIds ?? getApprovalChatIds();

  const summary: DailyRunSummary = {
    runAt: date.toISOString(),
    nichesConsidered: 0,
    productsCreated: 0,
    results: [],
    errors: [],
  };

  // 1. Discover candidates (asks for slightly more than cap, so we have
  //    leeway if content generation fails for any).
  let candidates: NicheCandidate[];
  try {
    candidates = await discoverNiches({
      date,
      seedCount: 6,
      maxNiches: cap + 1,
    });
  } catch (err) {
    summary.errors.push(
      `Discovery failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return summary;
  }

  summary.nichesConsidered = candidates.length;
  if (candidates.length === 0) {
    summary.errors.push('Discovery returned 0 candidates.');
    return summary;
  }

  // 2. + 3. For each candidate (up to cap that succeed), generate content + persist
  for (const candidate of candidates) {
    if (summary.productsCreated >= cap) break;

    let content: ProductContent;
    try {
      content = await generateProductContent(candidate, candidate.productHint);
    } catch (err) {
      summary.errors.push(
        `Content failed for "${candidate.topic}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      continue;
    }

    if (dryRun) {
      summary.productsCreated++;
      summary.results.push({
        nicheId: 'dry-run',
        productId: 'dry-run',
        topic: candidate.topic,
        gapAngle: candidate.gapAngle,
        score: candidate.score,
        competition: candidate.competition,
        productType: candidate.productHint,
        etsyTitle: content.etsyTitle,
        shopTitle: content.shopTitle,
        priceCents: content.priceCents,
        tags: content.tags,
        slug: content.slug,
        turkishGapAngle: content.turkishGapAngle,
        turkishSummary: content.turkishSummary,
      });
      continue;
    }

    // Persist niche + product in two steps (no transaction needed —
    // failures here are recorded but don't roll back prior successes).
    try {
      const [insertedNiche] = await db
        .insert(niches)
        .values({
          topic: candidate.topic,
          gap_angle: candidate.gapAngle,
          score: candidate.score,
          competition: candidate.competition,
          source_signals: candidate.sourceSignals,
          raw_analysis: {
            productHint: candidate.productHint,
            generatedAt: date.toISOString(),
          },
        })
        .returning({ id: niches.id });

      if (!insertedNiche) {
        summary.errors.push(`Failed to insert niche: ${candidate.topic}`);
        continue;
      }

      const [insertedProduct] = await db
        .insert(products)
        .values({
          niche_id: insertedNiche.id,
          type: candidate.productHint,
          status: 'awaiting_approval',
          slug: content.slug,
          etsy_title: content.etsyTitle,
          etsy_description: content.etsyDescription,
          tags: content.tags,
          shop_title: content.shopTitle,
          shop_description: content.shopDescription,
          turkish_gap_angle: content.turkishGapAngle,
          turkish_summary: content.turkishSummary,
          pdf_body: content.pdfBody,
          price_cents: content.priceCents,
        })
        .returning({ id: products.id });

      if (!insertedProduct) {
        summary.errors.push(`Failed to insert product for: ${candidate.topic}`);
        continue;
      }

      summary.productsCreated++;
      summary.results.push({
        nicheId: insertedNiche.id,
        productId: insertedProduct.id,
        topic: candidate.topic,
        gapAngle: candidate.gapAngle,
        score: candidate.score,
        competition: candidate.competition,
        productType: candidate.productHint,
        etsyTitle: content.etsyTitle,
        shopTitle: content.shopTitle,
        priceCents: content.priceCents,
        tags: content.tags,
        slug: content.slug,
        turkishGapAngle: content.turkishGapAngle,
        turkishSummary: content.turkishSummary,
      });

      // ── Faz 2-A + 2-B + 2-C: hero + mockups + PDF + Telegram approval card ──
      if (generateVisuals && approvalChatIds.length > 0) {
        try {
          const hero = await generateHeroVisual(candidate, content, insertedProduct.id);

          // ── Faz 2-C: generate PDF (best-effort, hero already exists) ──
          let pdfUrl: string | null = null;
          let pdfSize: number | null = null;
          let pdfBuffer: Buffer | null = null;
          try {
            const pdfResult = await generateProductPdf(candidate, content, hero.url);
            const pdfFilename = `trend/${insertedProduct.id}/product-${Date.now()}.pdf`;
            const uploadedPdf = await uploadImage(
              pdfResult.buffer,
              pdfFilename,
              'application/pdf',
            );
            pdfUrl = uploadedPdf.url;
            pdfSize = pdfResult.sizeBytes;
            pdfBuffer = pdfResult.buffer;
          } catch (pdfErr) {
            console.error('[trend] PDF generation failed', pdfErr);
            summary.errors.push(
              `PDF gen failed for "${candidate.topic}": ${
                pdfErr instanceof Error ? pdfErr.message.slice(0, 200) : String(pdfErr)
              }`,
            );
          }

          // ── Faz 2-D: generate cinematic video (best-effort) ──
          let videoUrl: string | null = null;
          try {
            const enabledRaw = (process.env.ENABLE_AI_VIDEO ?? 'true').toLowerCase();
            if (enabledRaw !== 'false' && enabledRaw !== '0') {
              const videoResult = await generateProductVideo(
                candidate,
                content,
                insertedProduct.id,
                hero.url,
              );
              videoUrl = videoResult.url;
            }
          } catch (videoErr) {
            console.error('[trend] video generation failed', videoErr);
            summary.errors.push(
              `Video gen failed for "${candidate.topic}": ${
                videoErr instanceof Error ? videoErr.message.slice(0, 200) : String(videoErr)
              }`,
            );
          }

          await db
            .update(products)
            .set({
              hero_image_url: hero.url,
              mockup_image_urls: hero.mockupUrls ?? [],
              digital_file_url: pdfUrl,
              digital_file_size_bytes: pdfSize,
              video_url: videoUrl,
              updated_at: new Date(),
            })
            .where(eq(products.id, insertedProduct.id));

          // Re-fetch the product so the caption formatter sees the full row.
          const fresh = await db
            .select()
            .from(products)
            .where(eq(products.id, insertedProduct.id))
            .limit(1);

          // Use gallery (2x2 grid) if compositing succeeded, otherwise hero
          const photoUrl = hero.galleryUrl ?? hero.url;

          for (const chatId of approvalChatIds) {
            try {
              const sent = await sendPhoto({
                chatId,
                photo: photoUrl,
                caption: fresh[0] ? formatProductCaption(fresh[0], candidate) : content.shopTitle,
                replyMarkup: productApprovalKeyboard(insertedProduct.id),
              });
              // Persist the message id of the FIRST recipient — used by
              // regen-visual to know which message to clear.
              if (chatId === approvalChatIds[0]) {
                await db
                  .update(products)
                  .set({
                    telegram_approval_chat_id: String(chatId),
                    telegram_approval_msg_id: String(sent.message_id),
                  })
                  .where(eq(products.id, insertedProduct.id));
              }

              // Send PDF as a Telegram document (no buttons — review/download only)
              if (pdfBuffer) {
                try {
                  const sizeKb = pdfSize ? (pdfSize / 1024).toFixed(0) : '?';
                  await sendDocument({
                    chatId,
                    document: pdfBuffer,
                    filename: `${content.slug || 'product'}.pdf`,
                    mime: 'application/pdf',
                    caption: `📄 Ürün PDF • ${sizeKb} KB`,
                  });
                } catch (docErr) {
                  console.error('[trend] sendDocument failed for chat', chatId, docErr);
                }
              }

              // Send video preview (Faz 2-D, Kling cinematic 5-sec clip)
              if (videoUrl) {
                try {
                  await sendVideo({
                    chatId,
                    video: videoUrl,
                    caption: `🎬 5-sn sinematik önizleme (Reels/Pinterest için)`,
                  });
                } catch (vidErr) {
                  console.error('[trend] sendVideo failed for chat', chatId, vidErr);
                }
              }
            } catch (sendErr) {
              console.error('[trend] sendPhoto failed for chat', chatId, sendErr);
            }
          }
        } catch (visualErr) {
          summary.errors.push(
            `Visual gen failed for "${candidate.topic}": ${
              visualErr instanceof Error ? visualErr.message.slice(0, 300) : String(visualErr)
            }`,
          );
          // Don't roll back the product — content is still useful, Mehmet can
          // hit "Görseli Yenile" from the digest message manually if needed.
        }
      }
    } catch (err) {
      // Full error to server console — drizzle errors include query+params
      // which crowd out the actual cause when truncated for Telegram.
      console.error('[trend] DB insert error for', candidate.topic, err);

      // Try to pull out the actual postgres reason from neon-http error shape.
      let reason = err instanceof Error ? err.message : String(err);
      // Common shapes: err.cause.message, err.cause.detail, or err.cause.code
      const cause = (err as { cause?: { message?: string; detail?: string; code?: string } })
        ?.cause;
      if (cause?.message) reason = cause.message;
      if (cause?.detail) reason = `${reason} | detail: ${cause.detail}`;
      if (cause?.code) reason = `${reason} | code: ${cause.code}`;

      summary.errors.push(
        `DB insert failed for "${candidate.topic}": ${reason.slice(0, 400)}`,
      );
    }
  }

  return summary;
}

/**
 * Formats a Telegram-ready digest message for the daily run.
 * Telegram message length cap is 4096 chars — this stays well under
 * by capping tags + truncating long fields.
 */
export function formatDigestMessage(summary: DailyRunSummary): string {
  const lines: string[] = [];
  lines.push('🎯 Trend Engine — günlük rapor');
  lines.push(`📅 ${summary.runAt.slice(0, 10)}`);
  lines.push('');

  if (summary.productsCreated === 0) {
    lines.push('⚠️ Bu çalıştırmada ürün üretilemedi.');
    if (summary.errors.length) {
      lines.push('');
      lines.push('Hata özetleri:');
      summary.errors.slice(0, 3).forEach((e) => lines.push(`• ${e.slice(0, 600)}`));
    }
    return lines.join('\n');
  }

  lines.push(
    `🆕 ${summary.productsCreated} ürün önerisi (${summary.nichesConsidered} niş analiz edildi)`,
  );
  lines.push('');

  summary.results.forEach((r, i) => {
    const eur = (r.priceCents / 100).toFixed(2);
    const compIcon = r.competition === 'low' ? '🟢' : r.competition === 'medium' ? '🟡' : '🔴';
    lines.push(`━━━ #${i + 1} ━━━`);
    lines.push(`📌 ${r.topic}`);
    lines.push(`📊 Skor: ${r.score}/100  ${compIcon} rekabet: ${r.competition}`);
    lines.push(`🇹🇷 ${r.turkishSummary}`);
    lines.push(`🎯 Boşluk (TR): ${r.turkishGapAngle}`);
    lines.push(`🛍️ Tip: ${r.productType} • €${eur}`);
    lines.push(`📝 Etsy başlık: ${r.etsyTitle.slice(0, 120)}${r.etsyTitle.length > 120 ? '…' : ''}`);
    lines.push(`🏪 Shop başlık: ${r.shopTitle.slice(0, 80)}${r.shopTitle.length > 80 ? '…' : ''}`);
    lines.push(`🏷️ Tags: ${r.tags.slice(0, 6).join(', ')}…`);
    lines.push('');
  });

  if (summary.errors.length > 0) {
    lines.push(`⚠️ ${summary.errors.length} hata oluştu:`);
    summary.errors.slice(0, 3).forEach((e) => lines.push(`• ${e.slice(0, 350)}`));
  }

  lines.push('');
  lines.push('💡 Faz 2-A: yukarıdaki foto kartlarından ✅/❌/🔄/✏️ ile onayla. Faz 3 Etsy + kendi shop yayını için bekliyor.');

  return lines.join('\n');
}
