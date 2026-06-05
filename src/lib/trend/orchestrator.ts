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
import {
  generateAiHeroForPdfCover,
  composeMockupsForHero,
  generateCoverHeroImage,
  generatePosterArtHero,
} from './visual';
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
  /**
   * Restrict discovery seed pool to a single product type. Used by the
   * dedicated poster cron so it doesn't generate planners (and vice versa).
   */
  productHintFilter?: 'planner' | 'poster' | 'sticker' | 'template' | 'social_template';
}

/**
 * V-5: same theme keyword logic as pdf-generator.tsx's pickTheme, but returns
 * the string key directly (we pass it to Nano Banana as a prompt style cue).
 */
function pickPdfThemeKey(topic: string, type: NicheCandidate['productHint']): string {
  const t = (topic ?? '').toLowerCase();
  if (/shadow|dark|moon|dream|anxious|attach|trauma|grief|bound|toxic|inner child|borderline|narciss|abuse/.test(t))
    return 'noir';
  if (/menopau|hrt|perimeno|hormone|cycle|pcos|fertility|woman|mother|matern|pregnan|postpart/.test(t))
    return 'rose';
  if (/deep work|focus|adhd|productiv|planner|time block|work session|async/.test(t))
    return 'forest';
  if (type === 'template' || type === 'social_template') return 'slate';
  if (/template|social|instagram|content|business|brand|seo|market|launch/.test(t)) return 'slate';
  return 'cream';
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
      productHintFilter: opts.productHintFilter,
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

    // C1 — Keyword Optimizer pass (best-effort): refine etsyTitle + tags for
    // discoverability. Fails silent — original content stays if optimizer
    // errors. Runs on EVERY new product automatically (Mehmet requirement).
    try {
      const { optimizeKeywords } = await import('./keyword-optimizer');
      const opt = await optimizeKeywords(candidate, content);
      content.etsyTitle = opt.etsyTitle;
      content.tags = opt.tags;
      console.log(
        `[c1-keyword] optimized "${candidate.topic}" → ${opt.reasoning.slice(0, 100)}`,
      );
    } catch (err) {
      console.warn('[c1-keyword] optimizer failed (using original content)', err);
    }

    // C3 — A/B Title Variants (best-effort): Claude produces 2 alternative
    // titles (variant B + C) for weekly rotation on Etsy. Variants persisted
    // on insert; rotation handled by /api/cron/title-rotate cron.
    let titleVariantB: string | null = null;
    let titleVariantC: string | null = null;
    try {
      const { generateTitleVariants } = await import('./title-ab-test');
      const variants = await generateTitleVariants(candidate, content);
      titleVariantB = variants.b !== content.etsyTitle ? variants.b : null;
      titleVariantC = variants.c !== content.etsyTitle ? variants.c : null;
      console.log(
        `[c3-ab-title] generated variants for "${candidate.topic}"`,
      );
    } catch (err) {
      console.warn('[c3-ab-title] variant generation failed', err);
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
          // B1 — tier variants
          tier_b_price_cents: content.tierBPriceCents ?? null,
          tier_b_description: content.tierBDescription ?? null,
          tier_c_price_cents: content.tierCPriceCents ?? null,
          tier_c_description: content.tierCDescription ?? null,
          // C3 — A/B title variants (alternative title rotations for weekly cron)
          title_variant_b: titleVariantB,
          title_variant_c: titleVariantC,
          title_active_variant: 'a',
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

      // ── V-1 architecture: real PDF render = marketing hero ──
      //   1. AI image (used only as cover image inside PDF)
      //   2. Generate PDF (embeds AI image in cover)
      //   3. Render PDF cover page → THIS becomes hero_image_url
      //   4. Composite mockups around the real PDF render
      //   Consequence: what buyer sees in Etsy listing = what they download
      if (generateVisuals && approvalChatIds.length > 0) {
        try {
          // V-5 — generate the ONE cover image first. This single image becomes
          // the marketing hero, the Nano Banana mockup reference, the Higgsfield
          // video input, and the embedded PDF cover. Single source of truth.
          //
          // Poster Sprint B: posters get a DIFFERENT hero generator. The cover
          // renderer (next/og typography + watercolour BG) is fine for planners
          // but wrong for wall-art — buyers want art they can frame, not a
          // "cover page" with a title overlay. For productHint='poster' we
          // route through generatePosterArtHero which produces the actual
          // print-ready artwork via Banana Pro (no text, no monogram).
          let coverBuffer: Buffer;
          let coverUrl: string;
          try {
            if (candidate.productHint === 'poster') {
              const art = await generatePosterArtHero(
                candidate,
                content,
                insertedProduct.id,
              );
              coverBuffer = art.buffer;
              coverUrl = art.url;
            } else {
              const themeKey = pickPdfThemeKey(candidate.topic, candidate.productHint);
              const cover = await generateCoverHeroImage(
                candidate,
                content,
                themeKey,
                insertedProduct.id,
              );
              coverBuffer = cover.buffer;
              coverUrl = cover.url;
            }
          } catch (coverErr) {
            // Fallback: gpt-image-2 hero so the pipeline can still produce
            // *something* if Nano Banana Pro is down or quota-exhausted.
            console.warn('[trend-v5] cover gen via Nano Banana failed, falling back to gpt-image-2', coverErr);
            const aiHero = await generateAiHeroForPdfCover(candidate, content, insertedProduct.id);
            coverBuffer = aiHero.buffer;
            coverUrl = aiHero.url;
          }

          // Step 2 — PDF generation (re-uses the same cover buffer as cover page)
          let pdfUrl: string | null = null;
          let pdfSize: number | null = null;
          let pdfBuffer: Buffer | null = null;
          try {
            const pdfResult = await generateProductPdf(candidate, content, coverUrl, coverBuffer);
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

          // Step 3 — V-5: cover IS the hero. Nano Banana mockup compositing
          // will place this exact illustrated cover into lifestyle scenes,
          // and Higgsfield video below will animate this exact cover —
          // perfect 1:1 between what the customer sees marketing-side and
          // what they download.
          const realHeroUrl = coverUrl;
          const mockupHeroBuffer: Buffer = coverBuffer;

          // Step 4 + Step 5 — PARALLEL: mockups (Banana Pro, ~15-40s) and
          // video (Higgsfield, ~60-120s) are independent and can run at the
          // same time. Sequential cost was 75-160s; parallel cost is
          // max(mockup, video) ≈ 60-120s. This is the difference between
          // hitting Vercel's 800s timeout (504) and finishing cleanly.
          const enabledRaw = (process.env.ENABLE_AI_VIDEO ?? 'true').toLowerCase();
          const videoEnabled = enabledRaw !== 'false' && enabledRaw !== '0';

          const mockupPromise = composeMockupsForHero(
            mockupHeroBuffer,
            candidate.productHint,
            insertedProduct.id,
            realHeroUrl, // ← Nano Banana reference image (V-2)
          );

          const videoPromise: Promise<{ url: string } | null> = videoEnabled
            ? generateProductVideo(candidate, content, insertedProduct.id, realHeroUrl).then(
                (v) => ({ url: v.url }),
              )
            : Promise.resolve(null);

          const [mockupResult, videoResult] = await Promise.allSettled([
            mockupPromise,
            videoPromise,
          ]);

          let mockupUrls: string[] = [];
          let galleryUrl: string | null = null;
          let enhancedCoverUrl: string | null = null;
          if (mockupResult.status === 'fulfilled') {
            mockupUrls = mockupResult.value.mockupUrls;
            galleryUrl = mockupResult.value.galleryUrl;
            enhancedCoverUrl = mockupResult.value.enhancedCoverUrl ?? null;
          } else {
            console.error('[trend] mockup composite failed', mockupResult.reason);
            summary.errors.push(
              `Mockup compose failed for "${candidate.topic}": ${
                mockupResult.reason instanceof Error
                  ? mockupResult.reason.message.slice(0, 200)
                  : String(mockupResult.reason)
              }`,
            );
          }

          let videoUrl: string | null = null;
          if (videoResult.status === 'fulfilled') {
            videoUrl = videoResult.value?.url ?? null;
          } else {
            console.error('[trend] video generation failed', videoResult.reason);
            summary.errors.push(
              `Video gen failed for "${candidate.topic}": ${
                videoResult.reason instanceof Error
                  ? videoResult.reason.message.slice(0, 200)
                  : String(videoResult.reason)
              }`,
            );
          }

          // V-14: enhanced cover (typography + 4-mockup strip + trust bar) is
          // the marketing hero. Falls back to the plain cover if enhancement
          // didn't run (e.g. Banana Pro failed and we never got mockups).
          const marketingHeroUrl = enhancedCoverUrl ?? realHeroUrl;

          // Shape used by the caption formatter + DB / Telegram payload
          const hero = { url: marketingHeroUrl, mockupUrls, galleryUrl };

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
