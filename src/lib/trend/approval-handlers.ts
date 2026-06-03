/**
 * Telegram callback handlers for trend-engine product approval (Faz 2-A).
 *
 * The webhook route wires up `trend_*` callback prefixes to these.
 *
 * Pending-input state (reject reason, new title) is kept in in-memory Maps —
 * same pattern as existing textEditSessions in the webhook route. This works
 * because the user clicks a button and types within seconds; a Vercel cold
 * start between click and type would lose the session, but the UI is
 * predictable enough that retry is acceptable.
 */

import { db } from '@/lib/db';
import { products, niches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  sendMessage,
  sendPhoto,
  editMessageReplyMarkup,
  editMessageText,
} from '@/lib/telegram/bot';
import {
  productApprovalKeyboard,
  clearedKeyboard,
} from '@/lib/telegram/product-approval-keyboard';
import { generateHeroVisual } from './visual';
import { generateProductPdf } from './pdf-generator';
import { uploadImage } from '@/lib/blob';
import { sendDocument } from '@/lib/telegram/bot';
import type { NicheCandidate } from './discovery';

// ─────────────────────────────────────────────────────────────
// Pending-input session maps (one entry per active user, by chatId)
// ─────────────────────────────────────────────────────────────

export const trendRejectSessions = new Map<number, string>();   // chatId → productId
export const trendEditTitleSessions = new Map<number, string>(); // chatId → productId

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function getProductOrNull(productId: string) {
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return rows[0] ?? null;
}

async function getNicheForProduct(nicheId: string | null) {
  if (!nicheId) return null;
  const rows = await db
    .select()
    .from(niches)
    .where(eq(niches.id, nicheId))
    .limit(1);
  return rows[0] ?? null;
}

// ─────────────────────────────────────────────────────────────
// Button handlers (called from handleCallback in webhook route)
// ─────────────────────────────────────────────────────────────

/**
 * ✅ Onayla → mark approved, sync to Stripe as Product + Price, list in /shop,
 * clear keyboard, confirm with shop URL.
 */
export async function handleTrendApprove(
  chatId: number,
  messageId: number,
  productId: string,
): Promise<void> {
  const product = await getProductOrNull(productId);
  if (!product) {
    await sendMessage({ chatId, text: '⚠️ Ürün bulunamadı.' });
    return;
  }

  // 1) Mark approved in our DB
  await db
    .update(products)
    .set({ status: 'approved', approved_at: new Date(), updated_at: new Date() })
    .where(eq(products.id, productId));

  // 2) Sync to Stripe + Etsy + Pinterest in parallel — all idempotent so retry is safe.
  const [stripeOutcome, etsyOutcome, pinterestOutcome] = await Promise.all([
    syncToStripe(productId, product.slug ?? null),
    syncToEtsy(productId),
    syncToPinterest(productId),
  ]);

  // 3) Confirm in Telegram with channels' status
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: clearedKeyboard() });
  const lines = [
    `✅ Onaylandı: ${product.shop_title ?? product.etsy_title ?? productId}`,
  ];

  // Stripe block
  if (stripeOutcome.url) {
    lines.push('', `🛍️ Shop (canlı): ${stripeOutcome.url}`);
  } else if (stripeOutcome.error) {
    lines.push('', `⚠️ Stripe sync başarısız: ${stripeOutcome.error}`);
  }

  // Etsy block
  if (etsyOutcome.url) {
    const tag = etsyOutcome.alreadyExisted ? '(zaten mevcuttu)' : '(draft — manuel aktive et)';
    lines.push(
      '',
      `🟧 Etsy ${tag}: ${etsyOutcome.url}`,
      `   ${etsyOutcome.imageCount} foto · ${etsyOutcome.fileCount} dosya yüklendi`,
    );
  } else if (etsyOutcome.error) {
    lines.push('', `⚠️ Etsy sync başarısız: ${etsyOutcome.error}`);
  }

  // Pinterest block (only show if relevant — not connected = silent)
  if (pinterestOutcome.pinCount > 0) {
    lines.push('', `📌 Pinterest: ${pinterestOutcome.pinCount} board'a pin atıldı`);
  } else if (pinterestOutcome.error && !pinterestOutcome.error.includes('not connected')) {
    lines.push('', `⚠️ Pinterest sync başarısız: ${pinterestOutcome.error}`);
  }

  await sendMessage({ chatId, text: lines.join('\n') });
}

// ─────────────────────────────────────────────────────────────
// P0.5 — Pinterest sync helper
// ─────────────────────────────────────────────────────────────

async function syncToPinterest(productId: string): Promise<{ pinCount: number; error: string | null }> {
  try {
    const { isPinterestConnected, listBoards, pickBoardsForNiche, createPin } =
      await import('@/lib/publish/pinterest');
    if (!(await isPinterestConnected())) {
      return { pinCount: 0, error: 'not connected' };
    }

    // Re-fetch product + niche to get the latest hero, slug, niche topic
    const rows = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    const product = rows[0];
    if (!product || !product.hero_image_url) return { pinCount: 0, error: null };

    const niche = await getNicheForProduct(product.niche_id);
    if (!niche) return { pinCount: 0, error: null };

    const boards = await listBoards();
    if (boards.length === 0) return { pinCount: 0, error: 'no boards' };

    const target = pickBoardsForNiche(boards, {
      topic: niche.topic,
      gapAngle: niche.gap_angle,
      productHint: product.type,
    });

    const link = product.slug ? `https://shop.fly-froth.com/${product.slug}` : 'https://shop.fly-froth.com';
    const title = (product.shop_title ?? product.etsy_title ?? 'Fly & Froth printable').slice(0, 100);
    const description =
      (product.etsy_description ?? product.shop_description ?? niche.gap_angle).slice(0, 480) +
      '\n\nFly & Froth · printable PDF · instant download.';

    const results = await Promise.allSettled(
      target.map((board) =>
        createPin({
          boardId: board.id,
          imageUrl: product.hero_image_url!,
          title,
          description,
          link,
          altText: title,
        }),
      ),
    );
    const pinCount = results.filter((r) => r.status === 'fulfilled').length;
    return { pinCount, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
    console.error('[trend] Pinterest sync failed', err);
    return { pinCount: 0, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────
// Per-channel sync helpers — kept small and well-typed so Promise.all
// inference stays clean and one failure can't crash the other.
// ─────────────────────────────────────────────────────────────

interface ChannelOutcome {
  url: string | null;
  error: string | null;
}

interface EtsyOutcome extends ChannelOutcome {
  imageCount: number;
  fileCount: number;
  alreadyExisted: boolean;
}

async function syncToStripe(productId: string, slug: string | null): Promise<ChannelOutcome> {
  try {
    const { ensureStripeProduct } = await import('@/lib/stripe/products');
    const { getShopBaseUrl } = await import('@/lib/stripe/client');
    await ensureStripeProduct(productId);
    const base = getShopBaseUrl().replace(/\/+$/, '');
    return { url: slug ? `${base}/${slug}` : null, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
    console.error('[trend] Stripe sync on approval failed', err);
    return { url: null, error: msg };
  }
}

async function syncToEtsy(productId: string): Promise<EtsyOutcome> {
  try {
    const { publishToEtsy } = await import('@/lib/publish/etsy.adapter');
    const r = await publishToEtsy(productId);
    return {
      url: r.url,
      error: null,
      imageCount: r.imageCount,
      fileCount: r.fileCount,
      alreadyExisted: r.alreadyExisted,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
    console.error('[trend] Etsy sync on approval failed', err);
    // Best-effort: log to productListings.error_log so it's visible in admin.
    try {
      const { recordEtsyFailure } = await import('@/lib/publish/etsy.adapter');
      await recordEtsyFailure(productId, msg);
    } catch {
      /* ignore — DB write failure is a tertiary error */
    }
    return { url: null, error: msg, imageCount: 0, fileCount: 0, alreadyExisted: false };
  }
}

/**
 * ❌ Reddet → ask for reason. Reason captured in next text message via
 * handleTrendRejectInput.
 */
export async function handleTrendReject(
  chatId: number,
  productId: string,
): Promise<void> {
  const product = await getProductOrNull(productId);
  if (!product) {
    await sendMessage({ chatId, text: '⚠️ Ürün bulunamadı.' });
    return;
  }

  trendRejectSessions.set(chatId, productId);
  await sendMessage({
    chatId,
    text: [
      `❌ Reddetme sebebi nedir?`,
      ``,
      `(bir sonraki mesajına ne yazarsan o sebep olarak kaydedilir — feedback loop'a negatif sinyal gider)`,
      ``,
      `İptal için: /iptal`,
    ].join('\n'),
  });
}

/**
 * Called from text-message handler when trendRejectSessions has an entry
 * for this chatId. Persists rejected_reason, status='rejected'.
 */
export async function handleTrendRejectInput(
  chatId: number,
  reasonText: string,
): Promise<boolean> {
  const productId = trendRejectSessions.get(chatId);
  if (!productId) return false;

  if (reasonText.trim().toLowerCase() === '/iptal') {
    trendRejectSessions.delete(chatId);
    await sendMessage({ chatId, text: 'İptal edildi — ürün hâlâ awaiting_approval.' });
    return true;
  }

  trendRejectSessions.delete(chatId);
  await db
    .update(products)
    .set({
      status: 'rejected',
      rejected_reason: reasonText.trim().slice(0, 1000),
      updated_at: new Date(),
    })
    .where(eq(products.id, productId));

  await sendMessage({
    chatId,
    text: `❌ Reddedildi.\nSebep kaydedildi: "${reasonText.trim().slice(0, 200)}"\n\nFeedback loop bu sinyali Faz 5'te kullanacak.`,
  });
  return true;
}

/**
 * 🔄 Görseli Yenile → regenerate hero, upload, edit DB, send new photo.
 * The OLD message gets its keyboard removed (so user doesn't double-click).
 * A NEW photo message is sent with fresh buttons.
 */
export async function handleTrendRegenVisual(
  chatId: number,
  messageId: number,
  productId: string,
): Promise<void> {
  const product = await getProductOrNull(productId);
  if (!product) {
    await sendMessage({ chatId, text: '⚠️ Ürün bulunamadı.' });
    return;
  }

  // Tell user it's working (image gen takes 5-25 s depending on provider).
  await sendMessage({ chatId, text: '🔄 Yeni görsel üretiliyor… (10-30 sn)' });

  const niche = await getNicheForProduct(product.niche_id);
  if (!niche) {
    await sendMessage({ chatId, text: '⚠️ İlişkili niche bulunamadı.' });
    return;
  }

  // Reconstruct minimal niche + content shape for visual prompt builder.
  const nicheShape: NicheCandidate = {
    topic: niche.topic,
    gapAngle: niche.gap_angle,
    score: niche.score,
    competition: niche.competition,
    sourceSignals: (niche.source_signals as string[] | null) ?? [],
    productHint: product.type,
  };
  const contentShape = {
    etsyTitle: product.etsy_title ?? '',
    etsyDescription: product.etsy_description ?? '',
    tags: (product.tags as string[] | null) ?? [],
    shopTitle: product.shop_title ?? '',
    shopDescription: product.shop_description ?? '',
    priceCents: product.price_cents,
    slug: product.slug ?? '',
    turkishGapAngle: product.turkish_gap_angle ?? '',
    turkishSummary: product.turkish_summary ?? '',
    pdfBody: (product.pdf_body as Record<string, unknown>) ?? {},
  };

  try {
    const hero = await generateHeroVisual(nicheShape, contentShape, productId);

    // Regenerate PDF too (cover page embeds the new hero).
    let pdfUrl: string | null = null;
    let pdfSize: number | null = null;
    let pdfBuffer: Buffer | null = null;
    try {
      const pdfResult = await generateProductPdf(nicheShape, contentShape, hero.url);
      const pdfFilename = `trend/${productId}/product-${Date.now()}.pdf`;
      const uploaded = await uploadImage(pdfResult.buffer, pdfFilename, 'application/pdf');
      pdfUrl = uploaded.url;
      pdfSize = pdfResult.sizeBytes;
      pdfBuffer = pdfResult.buffer;
    } catch (pdfErr) {
      console.error('[trend] regen PDF failed', pdfErr);
    }

    await db
      .update(products)
      .set({
        hero_image_url: hero.url,
        mockup_image_urls: hero.mockupUrls ?? [],
        digital_file_url: pdfUrl ?? product.digital_file_url,
        digital_file_size_bytes: pdfSize ?? product.digital_file_size_bytes,
        updated_at: new Date(),
      })
      .where(eq(products.id, productId));

    // Use gallery composite if available, otherwise plain hero.
    const photoUrl = hero.galleryUrl ?? hero.url;

    // Clear keyboard on old message and post a fresh one with new photo.
    await editMessageReplyMarkup({ chatId, messageId, replyMarkup: clearedKeyboard() });
    await sendPhoto({
      chatId,
      photo: photoUrl,
      caption: formatProductCaption(product, nicheShape),
      replyMarkup: productApprovalKeyboard(productId),
    });

    // Send fresh PDF too
    if (pdfBuffer) {
      try {
        const sizeKb = pdfSize ? (pdfSize / 1024).toFixed(0) : '?';
        await sendDocument({
          chatId,
          document: pdfBuffer,
          filename: `${product.slug || 'product'}.pdf`,
          mime: 'application/pdf',
          caption: `📄 Yenilenen PDF • ${sizeKb} KB`,
        });
      } catch (docErr) {
        console.error('[trend] regen sendDocument failed', docErr);
      }
    }
  } catch (err) {
    console.error('[trend] regen visual failed', err);
    await sendMessage({
      chatId,
      text: `⚠️ Görsel üretimi başarısız: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    });
  }
}

/**
 * ✏️ Başlığı Düzelt → ask user to type new title (will replace both
 * shop_title and update message caption).
 */
export async function handleTrendEditTitle(
  chatId: number,
  productId: string,
): Promise<void> {
  const product = await getProductOrNull(productId);
  if (!product) {
    await sendMessage({ chatId, text: '⚠️ Ürün bulunamadı.' });
    return;
  }

  trendEditTitleSessions.set(chatId, productId);
  await sendMessage({
    chatId,
    text: [
      `✏️ Yeni shop başlığını yaz:`,
      ``,
      `Mevcut: ${product.shop_title ?? '(yok)'}`,
      ``,
      `(Etsy başlığı değişmez — sadece kendi shop'taki başlık güncellenir)`,
      ``,
      `İptal için: /iptal`,
    ].join('\n'),
  });
}

/**
 * Called from text-message handler when trendEditTitleSessions has an entry.
 */
export async function handleTrendEditTitleInput(
  chatId: number,
  newTitle: string,
): Promise<boolean> {
  const productId = trendEditTitleSessions.get(chatId);
  if (!productId) return false;

  if (newTitle.trim().toLowerCase() === '/iptal') {
    trendEditTitleSessions.delete(chatId);
    await sendMessage({ chatId, text: 'İptal edildi.' });
    return true;
  }

  trendEditTitleSessions.delete(chatId);
  await db
    .update(products)
    .set({ shop_title: newTitle.trim().slice(0, 200), updated_at: new Date() })
    .where(eq(products.id, productId));

  await sendMessage({
    chatId,
    text: `✏️ Shop başlığı güncellendi:\n"${newTitle.trim().slice(0, 200)}"`,
  });
  return true;
}

// ─────────────────────────────────────────────────────────────
// Caption formatter (used by orchestrator + regen handler)
// ─────────────────────────────────────────────────────────────

/**
 * Telegram caption cap is 1024 chars — this stays under by truncating
 * the longest fields. Markdown is intentionally avoided (Telegram's
 * parse_mode is finicky with special chars in titles).
 */
export function formatProductCaption(
  product: typeof products.$inferSelect,
  niche: NicheCandidate,
): string {
  const eur = (product.price_cents / 100).toFixed(2);
  const compIcon =
    niche.competition === 'low' ? '🟢' : niche.competition === 'medium' ? '🟡' : '🔴';

  const lines = [
    `📌 ${niche.topic}`,
    `📊 ${niche.score}/100  ${compIcon} ${niche.competition}`,
  ];

  if (product.turkish_summary) lines.push(`🇹🇷 ${product.turkish_summary}`);
  if (product.turkish_gap_angle) lines.push(`🎯 ${product.turkish_gap_angle.slice(0, 250)}`);

  lines.push(`🛍️ ${product.type} • €${eur}`);

  if (product.etsy_title) {
    lines.push(`📝 Etsy: ${product.etsy_title.slice(0, 100)}${product.etsy_title.length > 100 ? '…' : ''}`);
  }
  if (product.shop_title) {
    lines.push(`🏪 Shop: ${product.shop_title.slice(0, 80)}${product.shop_title.length > 80 ? '…' : ''}`);
  }

  return lines.join('\n').slice(0, 1020);
}
