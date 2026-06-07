/**
 * canva/share.ts
 *
 * Canva design'ı için public "use as template" share URL üreten modül.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ÖNEMLİ — Canva Connect API v1 sınırlaması (Haziran 2026 itibarıyla):
 *
 * Canva Connect API, design'lar için **programatik public share-link
 * oluşturma endpoint'i sunmuyor**. (Yalnızca `folder:permission:write`
 * scope'u mevcut; design-permission endpoint'i yok.)
 *
 * Manuel UI üzerinden Canva "Share → Template link" kullanılarak public
 * copyable link üretilebiliyor, ama bu API'den tetiklenemiyor.
 *
 * Bu modül **hibrit strateji** uygular:
 *
 *  1. `GET /designs/{id}` ile design metadata + `urls.edit_url` alır
 *     (sadece API çağıran user için, 30 gün geçerli).
 *
 *  2. Public "use as template" deeplink pattern'ini de üretir:
 *       https://www.canva.com/design/{designId}/view?mode=preview
 *     Bu URL, design'ın paylaşım ayarı UI'dan "Anyone with the link →
 *     Can use as template" olarak işaretlendiğinde alıcının kendi
 *     hesabında "Use template" düğmesi gösterir. (Manuel ön-koşul.)
 *
 *  3. `canCopy` flag'i, deeplink pattern'in üretildiğini gösterir; ama
 *     gerçekten copyable olup olmadığı manuel ayara bağlıdır.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Required OAuth scope:
 *   - design:meta:read   (mevcut entegrasyonda zaten talep ediliyor)
 *
 * Yeni scope eklemeye GEREK YOK — mevcut `client.ts` setup'ı yeterli.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { canvaJson } from './client';

// ── Tipler ────────────────────────────────────────────────────────────────────

export interface CanvaShareUrlResult {
  /** Alıcı tıklayınca Canva'da design açılır (öncelik: public template URL). */
  shareUrl: string;
  /** Template olarak kopyalanabilir mi (deeplink pattern üretildiyse true). */
  canCopy: boolean;
  /** Input echo — caller debug için. */
  designId: string;
}

interface GetDesignResponse {
  design: {
    id: string;
    title?: string;
    urls: {
      edit_url: string;
      view_url: string;
    };
    created_at: number;
    updated_at: number;
  };
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

/**
 * Hata mesajını 200 char ile sınırla — caller'ın log/UI'ında patlamasın.
 */
function clampError(msg: string): string {
  const trimmed = msg.trim();
  return trimmed.length > 200 ? `${trimmed.slice(0, 197)}...` : trimmed;
}

/**
 * Canva designId temel sanity-check.
 * Format örneği: "DAFVztcvd9z" — alfanumerik, ~11 char, "DA" ile başlar.
 */
function isValidDesignId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (trimmed.length < 5 || trimmed.length > 64) return false;
  // Canva ID'leri alfanumerik + tire/alt-çizgi; başka karakter şüpheli.
  return /^[A-Za-z0-9_-]+$/.test(trimmed);
}

/**
 * Public "use as template" deeplink pattern'i üret.
 *
 * Bu URL, Canva'nın template-share UI'ı tarafından üretilen pattern'e
 * uygundur. Alıcı tıkladığında:
 *  - Eğer design'ın paylaşım ayarı "Anyone with link can use as template"
 *    ise → "Use template" düğmesi görünür.
 *  - Değilse → 404 veya "no access" sayfası görünür.
 *
 * NOT: Bu adımın manuel UI ön-koşulu var — bkz. dosya başı uyarısı.
 */
function buildTemplateDeeplink(designId: string): string {
  // mode=preview Canva'nın "use as template" landing'ini açar.
  // utm parametreleri tracking için (Canva kendi share URL'lerinde kullanır).
  const params = new URLSearchParams({
    utm_content: designId,
    utm_campaign: 'designshare',
    utm_medium: 'link',
    utm_source: 'connect_api',
    mode: 'preview',
  });
  return `https://www.canva.com/design/${encodeURIComponent(designId)}/view?${params.toString()}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Bir Canva design'ı için copyable share URL üretir.
 *
 * Strateji:
 *  1. `GET /designs/{designId}` ile design varlığını doğrula
 *     (yanlış ID erken hata verir, 404'ü açıkça raporlar).
 *  2. Public "use as template" deeplink pattern'ini döndür.
 *  3. canCopy=true → deeplink üretildi; ama gerçek copyability
 *     Canva UI'da paylaşım ayarına bağlı (bkz. dosya başı not).
 *
 * Hata fırlatır:
 *  - designId boş/geçersiz format
 *  - design bulunamadı (404)
 *  - Canva API rate limit (429) veya auth (401/403) sorunu
 *
 * @param designId Canva design ID (örn: "DAFVztcvd9z")
 * @returns Public share URL + metadata
 */
export async function createCopyableShareUrl(
  designId: string,
): Promise<CanvaShareUrlResult> {
  // ── 1. Input validation ────────────────────────────────────────────────────
  if (!isValidDesignId(designId)) {
    throw new Error(
      clampError(
        `Geçersiz Canva designId: "${designId}". ` +
          `Beklenen format: alfanumerik 5-64 karakter (örn: "DAFVztcvd9z").`,
      ),
    );
  }

  const cleanId = designId.trim();

  // ── 2. Design metadata'sını çek (varlık doğrulama + edit_url fallback) ────
  //
  // Polling pattern'e gerek YOK — get-design senkron endpoint, async job değil.
  // (generate.ts'deki polling sadece /asset-uploads, /autofills, /exports gibi
  //  job-based endpoint'ler için kullanılıyor.)
  let design: GetDesignResponse['design'];
  try {
    const res = await canvaJson<GetDesignResponse>(
      `/designs/${encodeURIComponent(cleanId)}`,
      { method: 'GET' },
    );
    design = res.design;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);

    // canvaJson zaten "Canva API error (status) path: msg" formatında fırlatıyor.
    // Status'a göre daha açıklayıcı mesaj sun:
    if (raw.includes('(404)')) {
      throw new Error(
        clampError(`Canva design bulunamadı: "${cleanId}". Silinmiş veya yanlış ID.`),
      );
    }
    if (raw.includes('(401)') || raw.includes('(403)')) {
      throw new Error(
        clampError(
          `Canva auth hatası (${raw.includes('(401)') ? '401' : '403'}). ` +
            `Token yenilenemedi veya design bu hesaba ait değil.`,
        ),
      );
    }
    if (raw.includes('(429)')) {
      throw new Error(
        clampError(`Canva API rate limit (429). Birkaç saniye sonra tekrar dene.`),
      );
    }
    throw new Error(clampError(`Canva share URL üretilemedi: ${raw}`));
  }

  // ── 3. Public template deeplink üret ──────────────────────────────────────
  //
  // edit_url 30 gün geçerli ve sadece API çağıran user için — bu yüzden onu
  // public link olarak kullanmıyoruz. Deeplink pattern alıcı için çalışır
  // (design'ın share ayarı doğru kuruluysa).
  const shareUrl = buildTemplateDeeplink(design.id);

  return {
    shareUrl,
    canCopy: true,
    designId: design.id,
  };
}

/**
 * Internal/debug yardımcısı — sadece test/admin için.
 *
 * Design'ın hem public deeplink'ini hem de geçici (30 gün, owner-only)
 * edit_url'ini döndürür. Bazı flow'larda (örn: Telegram approval) admin
 * tarafının kendi hesabında design'ı açması gerektiğinde kullanılabilir.
 *
 * @internal
 */
export async function getCanvaDesignUrls(designId: string): Promise<{
  publicShareUrl: string;
  temporaryEditUrl: string;
  temporaryViewUrl: string;
  designId: string;
}> {
  if (!isValidDesignId(designId)) {
    throw new Error(clampError(`Geçersiz Canva designId: "${designId}".`));
  }

  const cleanId = designId.trim();
  let design: GetDesignResponse['design'];
  try {
    const res = await canvaJson<GetDesignResponse>(
      `/designs/${encodeURIComponent(cleanId)}`,
      { method: 'GET' },
    );
    design = res.design;
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    throw new Error(clampError(`Canva design metadata alınamadı: ${raw}`));
  }

  return {
    publicShareUrl: buildTemplateDeeplink(design.id),
    temporaryEditUrl: design.urls.edit_url,
    temporaryViewUrl: design.urls.view_url,
    designId: design.id,
  };
}
