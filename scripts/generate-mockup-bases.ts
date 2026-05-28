/**
 * Generate base mockup PNGs for the trend engine — ONE-TIME setup script.
 *
 * Replicate-blocked sandbox can't run this, so user runs locally:
 *
 *   pnpm tsx scripts/generate-mockup-bases.ts
 *
 * Produces 4 base mockup PNGs (1024×1024) in public/mockup-templates/
 * plus a mockup-coords.json with the detected "active area" rectangle
 * for each base. Detection finds the largest near-white rectangular region
 * in the generated image — where the hero will be sharp-composited.
 *
 * Re-run any time to regenerate variants. Commit the resulting PNGs +
 * JSON so production reads from them.
 */
import 'dotenv/config';
import { config } from 'dotenv';
import Replicate from 'replicate';
import sharp from 'sharp';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env' });

const OUT_DIR = join(process.cwd(), 'public', 'mockup-templates');
const COORDS_PATH = join(OUT_DIR, 'mockup-coords.json');

interface MockupSpec {
  slug: 'frame-wall' | 'tablet-desk' | 'laptop-desk' | 'paper-flatlay';
  prompt: string;
}

const SPECS: MockupSpec[] = [
  {
    slug: 'frame-wall',
    prompt:
      'Photograph of an empty wooden picture frame hanging on a warm beige wall, soft natural side-light, a small monstera leaf peeking in at the edge, minimalist editorial interior style. The inside of the frame is a perfectly clean pure white square taking up the centre of the image. Centred composition, square 1:1 frame. No text, no graphics inside the frame, no decorations on the wall. Highly photorealistic, magazine quality.',
  },
  {
    slug: 'tablet-desk',
    prompt:
      'Top-down photograph of a modern tablet (iPad-style, dark grey aluminium bezel) on a clean light wooden desk, with a ceramic coffee cup and brass pen partially in frame. The tablet screen is a perfectly clean pure white rectangle. Soft morning light. Square 1:1 composition. No text, no app icons, no UI elements visible on the screen. Highly photorealistic, editorial product photography.',
  },
  {
    slug: 'laptop-desk',
    prompt:
      'Photograph of a silver laptop on a clean wooden desk, slightly angled, with a ceramic mug and notebook in soft background blur. The laptop screen displays a perfectly clean pure white rectangle. Soft daylight from the side. Square 1:1 composition. No text, no app windows, no logos visible on the screen. Highly photorealistic, magazine-quality.',
  },
  {
    slug: 'paper-flatlay',
    prompt:
      'Top-down photograph of a single blank white sheet of paper on a soft linen tablecloth, with a brass pen, dried flowers, and a small ceramic dish partially in frame. Soft window light from the upper-left. Square 1:1 composition. The white paper is perfectly empty — no text, no lines, no graphics. Highly photorealistic, editorial flatlay style.',
  },
];

const MODEL = 'black-forest-labs/flux-2-pro' as `${string}/${string}`;

async function main(): Promise<void> {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.error('❌ REPLICATE_API_TOKEN is not set. Add it to .env.local first.');
    process.exit(1);
  }
  const client = new Replicate({ auth: token });

  const coords: Record<string, { x: number; y: number; w: number; h: number }> = {};

  for (const spec of SPECS) {
    console.log(`\n── ${spec.slug} ──`);
    console.log('Generating with Flux 2 Pro…');

    const output = (await client.run(MODEL, {
      input: {
        prompt: spec.prompt,
        aspect_ratio: '1:1',
        output_format: 'png',
        safety_tolerance: 2,
      },
    })) as unknown;

    // Extract URL (same shape-handling as src/lib/trend/video.ts)
    let url: string | null = null;
    if (typeof output === 'string') url = output;
    else if (Array.isArray(output) && typeof output[0] === 'string') url = output[0];
    else if (output && typeof output === 'object' && 'url' in output) {
      const u = (output as { url: unknown }).url;
      if (typeof u === 'string') url = u;
      else if (typeof u === 'function') {
        try {
          url = String((u as () => string | URL)());
        } catch {}
      }
    }
    if (!url) {
      console.error('  ❌ Could not extract URL from Replicate output:', output);
      continue;
    }

    console.log(`  ✓ Got image URL`);
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  ❌ Failed to download: ${res.status}`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());

    // Resize to 1024×1024 PNG
    const resized = await sharp(buf)
      .resize(1024, 1024, { fit: 'cover' })
      .png()
      .toBuffer();

    // Detect the largest near-white rectangular region.
    // Strategy: greyscale → threshold 235 → find columns/rows of mostly-white pixels
    // → derive bounding box of the densest white area.
    const detected = await detectWhiteBox(resized, 1024);
    coords[spec.slug] = detected;
    console.log(
      `  ✓ Detected active area: x=${detected.x} y=${detected.y} w=${detected.w} h=${detected.h}`,
    );

    const outPath = join(OUT_DIR, `${spec.slug}.png`);
    writeFileSync(outPath, resized);
    console.log(`  ✓ Saved ${outPath}`);
  }

  writeFileSync(COORDS_PATH, JSON.stringify(coords, null, 2));
  console.log(`\n✓ Wrote coords manifest: ${COORDS_PATH}`);
  console.log('\nNext step: commit public/mockup-templates/* and push.');
}

async function detectWhiteBox(
  pngBuffer: Buffer,
  size: number,
): Promise<{ x: number; y: number; w: number; h: number }> {
  // Get greyscale raw pixels
  const { data } = await sharp(pngBuffer)
    .resize(size, size, { fit: 'cover' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const threshold = 235; // pixel ≥ 235 = treated as "white"

  // Find rows/cols where >70% of pixels are white
  const colWhite: number[] = new Array(size).fill(0);
  const rowWhite: number[] = new Array(size).fill(0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]! >= threshold) {
        colWhite[x]!++;
        rowWhite[y]!++;
      }
    }
  }

  // Find longest contiguous run of rows/cols that meet the threshold
  const minPct = 0.55; // 55% of the line must be white
  const colThresh = Math.floor(size * minPct);
  const rowThresh = Math.floor(size * minPct);

  const xRange = longestRun(colWhite, colThresh);
  const yRange = longestRun(rowWhite, rowThresh);

  // Fallback to centred 60% if detection failed
  if (xRange.length < 80 || yRange.length < 80) {
    const w = Math.floor(size * 0.6);
    const h = Math.floor(size * 0.6);
    return { x: Math.floor((size - w) / 2), y: Math.floor((size - h) / 2), w, h };
  }

  return { x: xRange.start, y: yRange.start, w: xRange.length, h: yRange.length };
}

function longestRun(arr: number[], thresh: number): { start: number; length: number } {
  let bestStart = 0;
  let bestLen = 0;
  let curStart = 0;
  let curLen = 0;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]! >= thresh) {
      if (curLen === 0) curStart = i;
      curLen++;
    } else {
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
      }
      curLen = 0;
    }
  }
  if (curLen > bestLen) {
    bestLen = curLen;
    bestStart = curStart;
  }
  return { start: bestStart, length: bestLen };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
