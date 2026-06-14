/**
 * remove-bg.ts — Sprint K Faz 4.1
 *
 * Replicate 851-labs/background-remover (BiRefNet/U2Net based ML) — image'in
 * background'ını ML ile keser, transparent PNG döner.
 *
 * Banana 2'nin white background output'unu temizlemek için. Sharp threshold-
 * based mask "vintage stamp" gibi distressed texture + anti-aliased edges'da
 * yeterince temiz mask vermedi → ML-based çözüm.
 *
 * Maliyet: ~$0.005 per run. Banana $0.04 + rembg $0.005 = $0.045 toplam.
 * Süre: ~3-5 saniye (lambda'da ek 3-5s latency).
 */

import Replicate from 'replicate';

// Fallback chain — Replicate'de en stable + public bg remover modelleri.
// 851-labs/background-remover 404 dönüyordu (private ya da kaldırıldı).
// Sıralı dene: ilk başarılı olanı kullan.
const MODEL_CANDIDATES = [
  'cjwbw/rembg',                  // U2Net based, eski klasik, public
  'lucataco/remove-bg',           // Modnet based, popüler
  'pollinations/modnet',          // alternatif
] as const;

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN env yok — rembg için zorunlu');
    _client = new Replicate({ auth });
  }
  return _client;
}

function parseReplicateOutput(output: unknown): string | undefined {
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
  if (
    output &&
    typeof output === 'object' &&
    'url' in output &&
    typeof (output as { url: unknown }).url === 'function'
  ) {
    return (output as { url: () => string }).url();
  }
  return undefined;
}

/**
 * Image buffer'ından background'ı kaldır, transparent PNG buffer döndür.
 * Birden çok modeli sırayla dener, ilk başarılı olanı kullanır.
 *
 * @throws son fail eden model'in hatası (önceki modellerin hatası bir araya getirilir)
 */
export async function removeBackgroundML(input: Buffer): Promise<Buffer> {
  const dataUri = `data:image/png;base64,${input.toString('base64')}`;
  const errors: string[] = [];

  for (const modelId of MODEL_CANDIDATES) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 45_000);
    try {
      const output = await getClient().run(
        modelId as `${string}/${string}`,
        {
          input: { image: dataUri },
          signal: ac.signal,
        },
      );
      clearTimeout(timer);

      const url = parseReplicateOutput(output);
      if (!url) {
        throw new Error(`unexpected output shape from ${modelId}: ${JSON.stringify(output).slice(0, 150)}`);
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`output fetch failed (${res.status}) for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message.slice(0, 180) : String(err);
      errors.push(`${modelId}: ${msg}`);
      // Try next model
    }
  }

  throw new Error(`All ${MODEL_CANDIDATES.length} rembg models failed:\n  ${errors.join('\n  ')}`);
}
