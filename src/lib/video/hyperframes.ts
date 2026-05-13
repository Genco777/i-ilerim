// HyperFrames video composition utilities
// Compositions are HTML files rendered locally via `npx hyperframes render`

import fs from 'fs/promises';
import path from 'path';

const COMPOSITIONS_DIR = path.join(process.cwd(), 'compositions');

export interface VideoComposition {
  id: string;
  title: string;
  description: string;
  html: string;
  durationSeconds: number;
  width: number;
  height: number;
  format: 'mp4' | 'webm';
  status: 'draft' | 'rendering' | 'done' | 'error';
  outputUrl?: string;
  createdAt: Date;
}

// Ensure compositions directory exists
async function ensureDir(): Promise<void> {
  await fs.mkdir(COMPOSITIONS_DIR, { recursive: true });
}

export async function saveComposition(comp: {
  title: string;
  description: string;
  html: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  format?: 'mp4' | 'webm';
}): Promise<VideoComposition> {
  await ensureDir();

  const id = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const composition: VideoComposition = {
    id,
    title: comp.title,
    description: comp.description,
    html: comp.html,
    durationSeconds: comp.durationSeconds ?? 10,
    width: comp.width ?? 1080,
    height: comp.height ?? 1920,
    format: comp.format ?? 'mp4',
    status: 'draft',
    createdAt: new Date(),
  };

  const dir = path.join(COMPOSITIONS_DIR, id);
  await fs.mkdir(dir, { recursive: true });

  // Write composition HTML
  await fs.writeFile(path.join(dir, 'index.html'), comp.html, 'utf-8');

  // Write metadata
  await fs.writeFile(
    path.join(dir, 'hyperframes.json'),
    JSON.stringify(composition, null, 2),
    'utf-8',
  );

  return composition;
}

export async function listCompositions(): Promise<VideoComposition[]> {
  await ensureDir();
  const entries = await fs.readdir(COMPOSITIONS_DIR, { withFileTypes: true });
  const comps: VideoComposition[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(COMPOSITIONS_DIR, entry.name, 'hyperframes.json');
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      comps.push(JSON.parse(raw));
    } catch {
      // skip invalid
    }
  }

  return comps.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getComposition(id: string): Promise<VideoComposition | null> {
  const metaPath = path.join(COMPOSITIONS_DIR, id, 'hyperframes.json');
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Generate a simple social media video composition HTML (HyperFrames format)
export function generateSocialMediaComposition(config: {
  headline: string;
  subheadline?: string;
  cta?: string;
  brandName?: string;
  primaryColor?: string;
  bgColor?: string;
  durationSeconds?: number;
  logoUrl?: string;
  imageUrl?: string;
}): string {
  const {
    headline,
    subheadline = '',
    cta = 'Jetzt anfragen: fly-froth.com',
    brandName = 'Fly & Froth',
    primaryColor = '#6366f1',
    bgColor = '#0f172a',
    durationSeconds = 10,
    logoUrl = '',
    imageUrl = '',
  } = config;

  const half = durationSeconds / 2;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    background: ${bgColor};
    color: white;
    overflow: hidden;
  }
  #stage { width: 100%; height: 100%; position: relative; }
  .bg-gradient {
    position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 40%, ${primaryColor}22, transparent 70%);
  }
  .content {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 120px 80px; text-align: center;
    gap: 40px;
  }
  .logo { font-size: 42px; font-weight: 700; letter-spacing: -0.5px; color: ${primaryColor}; }
  .headline { font-size: 88px; font-weight: 800; line-height: 1.1; letter-spacing: -1px; }
  .subheadline { font-size: 42px; font-weight: 400; color: #94a3b8; max-width: 800px; }
  .cta {
    margin-top: 40px; font-size: 38px; font-weight: 600;
    background: ${primaryColor}; color: white;
    padding: 32px 80px; border-radius: 80px;
  }
  .footer { position: absolute; bottom: 80px; width: 100%; text-align: center; font-size: 32px; color: #64748b; }
  ${imageUrl ? `.bg-image { position: absolute; inset: 0; background: url('${imageUrl}') center/cover; opacity: 0.3; }` : ''}
</style>
</head>
<body>
<div id="stage"
  data-duration="${durationSeconds}"
  data-fps="30"
  data-width="1080"
  data-height="1920">
  ${imageUrl ? '<div class="bg-image"></div>' : ''}
  <div class="bg-gradient"></div>
  <div class="content">
    ${logoUrl ? `<img src="${logoUrl}" alt="logo" class="logo" style="max-height:120px" />` : `<div class="logo">${brandName}</div>`}
    <h1 class="headline"
      data-entrance="fadeInUp"
      data-entrance-duration="0.6"
      data-entrance-delay="0.2">${headline}</h1>
    ${subheadline ? `<p class="subheadline"
      data-entrance="fadeInUp"
      data-entrance-duration="0.5"
      data-entrance-delay="0.6">${subheadline}</p>` : ''}
    <div class="cta"
      data-entrance="fadeInUp"
      data-entrance-duration="0.5"
      data-entrance-delay="1.0">${cta}</div>
  </div>
  <div class="footer">${brandName}</div>
</div>
</body>
</html>`;
}
