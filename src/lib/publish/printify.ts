/**
 * Printify Apparel API v1 — Sprint K
 *
 * Mehmet'in fly-froth Etsy mağazasına bağlı Printify hesabı üzerinden apparel
 * (T-shirt, Hoodie, Tote) ürünleri yaratır. "publish to Etsy" toggle'ı ile
 * Printify otomatik Etsy listing oluşturur (24-48 saatte aktive olur).
 *
 * Flow:
 *   1. uploadImage(designBuffer) → Printify Image API'ye PNG yükle, image_id
 *   2. createApparelProduct({ shopId, blueprintId, providerId, title, image_id, ... })
 *      → ürün oluştur, variants set et
 *   3. publishProduct(productId) → Printify-Etsy sync tetikle
 *
 * Default apparel blueprints (en popüler 3, Etsy'de iyi satılır):
 *   - 384 — Bella+Canvas 3001 T-shirt (provider 99 — Monster Digital)
 *   - 6   — Gildan 18500 Hoodie (provider 29 — Monster Digital)
 *   - 49  — Liberty Bags 8502 Canvas Tote (provider 1 — SwiftPOD)
 *
 * Env:
 *   PRINTIFY_API_TOKEN — Personal access token (1 yıl, 1 yıl yenile)
 */

const PRINTIFY_API_BASE = 'https://api.printify.com/v1';

// ─────────────────────────────────────────────────────────────
// HTTP client
// ─────────────────────────────────────────────────────────────

function getToken(): string {
  const v = process.env.PRINTIFY_API_TOKEN;
  if (!v) throw new Error('PRINTIFY_API_TOKEN is not set');
  return v;
}

interface PrintifyFetchOpts {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown; // serialize to JSON
}

async function printifyFetch<T>(path: string, opts: PrintifyFetchOpts = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${PRINTIFY_API_BASE}${path}`;
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      'User-Agent': 'fly-froth-social/1.0',
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Printify API ${res.status} on ${opts.method ?? 'GET'} ${path}: ${txt.slice(0, 400)}`);
  }

  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────
// Shop / connection
// ─────────────────────────────────────────────────────────────

export interface PrintifyShop {
  id: number;
  title: string;
  sales_channel: 'etsy' | 'shopify' | 'ebay' | 'manual' | string;
}

/** Hesabına bağlı tüm Printify shop'larını listele (Etsy / Shopify / vs). */
export async function listPrintifyShops(): Promise<PrintifyShop[]> {
  return printifyFetch<PrintifyShop[]>('/shops.json');
}

/** Etsy'ye bağlı ilk Printify shop'unu döndür. */
export async function getEtsyShop(): Promise<PrintifyShop> {
  const shops = await listPrintifyShops();
  const etsy = shops.find((s) => s.sales_channel === 'etsy');
  if (!etsy) throw new Error('No Etsy-connected Printify shop found. Connect via Printify Settings → Shops.');
  return etsy;
}

// ─────────────────────────────────────────────────────────────
// Image upload
// ─────────────────────────────────────────────────────────────

interface UploadImageResponse {
  id: string;
  file_name: string;
  height: number;
  width: number;
  size: number;
  mime_type: string;
  preview_url: string;
  upload_time: string;
}

/** Apparel tasarımını Printify Image library'ye yükle (URL veya base64 buffer). */
export async function uploadImageByUrl(url: string, fileName?: string): Promise<UploadImageResponse> {
  return printifyFetch<UploadImageResponse>('/uploads/images.json', {
    method: 'POST',
    body: {
      file_name: fileName ?? `apparel-${Date.now()}.png`,
      url,
    },
  });
}

export async function uploadImageByBase64(base64: string, fileName: string): Promise<UploadImageResponse> {
  return printifyFetch<UploadImageResponse>('/uploads/images.json', {
    method: 'POST',
    body: {
      file_name: fileName,
      contents: base64,
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Product creation
// ─────────────────────────────────────────────────────────────

/** Apparel blueprint preset'leri — Etsy'de en çok satan 3 kategori. */
export const APPAREL_PRESETS = {
  tshirt: {
    blueprint_id: 384,    // Bella+Canvas 3001 — unisex t-shirt, premium
    provider_id: 99,      // Monster Digital (US, fast shipping)
    sizes: ['S', 'M', 'L', 'XL', '2XL'] as const,
    colors: ['White', 'Black', 'Heather Grey'] as const,
    placement: 'front' as const,
  },
  hoodie: {
    blueprint_id: 6,      // Gildan 18500 — heavy blend hoodie
    provider_id: 29,      // Monster Digital
    sizes: ['S', 'M', 'L', 'XL', '2XL'] as const,
    colors: ['Black', 'Navy', 'Charcoal'] as const,
    placement: 'front' as const,
  },
  tote: {
    blueprint_id: 49,     // Liberty Bags 8502 — canvas tote
    provider_id: 1,       // SwiftPOD
    sizes: ['One Size'] as const,
    colors: ['Natural', 'Black'] as const,
    placement: 'front' as const,
  },
} as const;

export type ApparelType = keyof typeof APPAREL_PRESETS;

interface CreatePrintifyProductOpts {
  shopId: number;
  type: ApparelType;
  title: string;
  description: string;
  imageId: string;       // uploadImage'den dönen id
  priceCents: number;    // satış fiyatı (€ cents, Printify USD ister — Etsy locale dönüştürür)
  tags?: string[];       // max 13
}

interface PrintifyProduct {
  id: string;
  title: string;
  description: string;
  shop_id: number;
  blueprint_id: number;
  visible: boolean;
  is_locked: boolean;
  variants: Array<{ id: number; price: number; is_enabled: boolean; sku: string }>;
  images: Array<{ src: string; variant_ids: number[] }>;
}

/**
 * Belirli bir apparel tipinde ürün oluştur. Printify variantları otomatik
 * doldurur (blueprint + provider'a göre tüm size/color kombinasyonları).
 *
 * NOT: variants — burada basic implementation tüm variant'ları $25 ile etkin
 * yapıyor. Production'da Printify catalog'unu sorgulayıp variant_ids list'ini
 * gerçek catalog'tan almak gerek.
 */
export async function createApparelProduct(opts: CreatePrintifyProductOpts): Promise<PrintifyProduct> {
  const preset = APPAREL_PRESETS[opts.type];
  const priceUsd = Math.round(opts.priceCents); // Printify USD cents bekliyor

  // 1. Catalog'tan variantları al — blueprint + provider için tüm size+color combos
  const variants = await printifyFetch<{
    variants: Array<{ id: number; title: string; options: Record<string, string> }>;
  }>(`/catalog/blueprints/${preset.blueprint_id}/print_providers/${preset.provider_id}/variants.json`);

  // Tüm variantları enabled hale getir, fiyat set et
  const variantsPayload = variants.variants.map((v) => ({
    id: v.id,
    price: priceUsd,
    is_enabled: true,
  }));

  // 2. Print area config — front placement, tek image
  const printAreasPayload = [{
    variant_ids: variants.variants.map((v) => v.id),
    placeholders: [{
      position: 'front' as const,
      images: [{
        id: opts.imageId,
        x: 0.5,
        y: 0.5,
        scale: 1.0,
        angle: 0,
      }],
    }],
  }];

  // 3. Product create
  const product = await printifyFetch<PrintifyProduct>(
    `/shops/${opts.shopId}/products.json`,
    {
      method: 'POST',
      body: {
        title: opts.title.slice(0, 140),
        description: opts.description.slice(0, 2000),
        blueprint_id: preset.blueprint_id,
        print_provider_id: preset.provider_id,
        variants: variantsPayload,
        print_areas: printAreasPayload,
        tags: (opts.tags ?? []).slice(0, 13),
      },
    },
  );

  return product;
}

// ─────────────────────────────────────────────────────────────
// Etsy sync trigger
// ─────────────────────────────────────────────────────────────

/**
 * Printify ürününü Etsy'ye publish et. Printify Etsy'ye otomatik draft listing
 * oluşturur (24-48 saatte Etsy'de aktive olur, Etsy seller dashboard'undan
 * Mehmet manuel "publish" yapacak).
 *
 * publishing_succeeded webhook gelirse external_id (Etsy listing ID) alınır.
 */
export async function publishProduct(shopId: number, productId: string): Promise<{ ok: true }> {
  await printifyFetch(`/shops/${shopId}/products/${productId}/publish.json`, {
    method: 'POST',
    body: {
      title: true,
      description: true,
      images: true,
      variants: true,
      tags: true,
      keyFeatures: true,
      shipping_template: true,
    },
  });
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Diagnostic helpers
// ─────────────────────────────────────────────────────────────

export interface PrintifyConnectionInfo {
  shops: PrintifyShop[];
  etsyShop: PrintifyShop | null;
  apiTokenValid: boolean;
  error?: string;
}

/** Connection sağlık kontrolü — env doğru, shop bağlı, token geçerli. */
export async function diagnosePrintify(): Promise<PrintifyConnectionInfo> {
  try {
    const shops = await listPrintifyShops();
    const etsyShop = shops.find((s) => s.sales_channel === 'etsy') ?? null;
    return { shops, etsyShop, apiTokenValid: true };
  } catch (err) {
    return {
      shops: [],
      etsyShop: null,
      apiTokenValid: false,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  }
}
