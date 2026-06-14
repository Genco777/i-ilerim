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

const MODEL_ID = '851-labs/background-remover' as const;

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN env yok — rembg için zorunlu');
    _client = new Replicate({ auth });
  }
  return _client;
}

/**
 * Image buffer'ından background'ı kaldır, transparent PNG buffer döndür.
 *
 * @param input Banana çıktısı PNG/JPG buffer (white bg)
 * @returns transparent PNG buffer
 */
export async function removeBackgroundML(input: Buffer): Promise<Buffer> {
  // Replicate input image: data URI (base64 PNG)
  const dataUri = `data:image/png;base64,${input.toString('base64')}`;

  // 45s timeout — rembg genelde 3-5s, 45 fazlasıyla yeterli
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 45_000);

  try {
    const output = await getClient().run(
      MODEL_ID,
      {
        input: { image: dataUri },
        signal: ac.signal,
      },
    );

    clearTimeout(timer);

    // Output URL parsing (Replicate genelde string ya da {url()} object döner)
    let url: string | undefined;
    if (typeof output === 'string') {
      url = output;
    } else if (Array.isArray(output) && typeof output[0] === 'string') {
      url = output[0];
    } else if (
      output &&
      typeof output === 'object' &&
      'url' in output &&
      typeof (output as { url: unknown }).url === 'function'
    ) {
      url = (output as { url: () => string }).url();
    }

    if (!url) {
      throw new Error('rembg unexpected output shape: ' + JSON.stringify(output).slice(0, 200));
    }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`rembg output fetch failed (${res.status}) for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
