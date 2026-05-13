/**
 * Local Agent Worker — Vercel API üzerinden task polling + execution.
 * Bu script kullanıcının kendi bilgisayarında (local) çalışır.
 *
 * Gereksinimler:
 *   CRON_SECRET — Vercel cron secret (ortak)
 *   DEPLOY_URL  — Vercel deployment URL (örn: https://fly-froth-social.vercel.app)
 *
 * Kullanım:
 *   npx tsx scripts/local-agent.ts
 */

import * as os from 'os';

const WORKER_ID = `local-${os.hostname()}-${process.pid}`;
const BASE = process.env.DEPLOY_URL ?? 'http://localhost:3000';
const SECRET = process.env.CRON_SECRET ?? '';
const POLL_MS = 5000;

if (!SECRET) {
  console.error('[local-agent] CRON_SECRET env var required');
  process.exit(1);
}

async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

interface AgentTask {
  id: string;
  task_type: string;
  title: string;
  payload: Record<string, unknown>;
  priority: number;
  created_at: string;
}

async function poll(): Promise<AgentTask | null> {
  const json = await api(`/api/agent/tasks?worker=${encodeURIComponent(WORKER_ID)}`);
  return json.task ?? null;
}

async function reportResult(taskId: string, result: Record<string, unknown>): Promise<void> {
  await api('/api/agent/tasks', {
    method: 'PATCH',
    body: JSON.stringify({ taskId, status: 'completed', result }),
  });
}

async function reportError(taskId: string, error: string): Promise<void> {
  await api('/api/agent/tasks', {
    method: 'PATCH',
    body: JSON.stringify({ taskId, status: 'failed', error }),
  });
}

async function reportRunning(taskId: string): Promise<void> {
  await api('/api/agent/tasks', {
    method: 'PATCH',
    body: JSON.stringify({ taskId, status: 'running' }),
  });
}

async function executeTask(task: AgentTask): Promise<void> {
  console.log(`[local-agent] Executing: ${task.task_type} — ${task.title} (${task.id})`);
  await reportRunning(task.id);

  try {
    switch (task.task_type) {
      case 'render_video': {
        const composition = (task.payload.composition as string) ?? '';
        if (!composition) throw new Error('Composition HTML required');
        const fs = await import('fs/promises');
        const path = await import('path');
        const { execSync } = await import('child_process');

        const dir = path.join(process.cwd(), 'compositions', `vid_${task.id.slice(0, 8)}`);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'index.html'), composition);

        const outputPath = path.join(dir, 'output.mp4');
        execSync(`npx hyperframes render "${path.join(dir, 'index.html')}" --output "${outputPath}"`, {
          cwd: process.cwd(),
          stdio: 'pipe',
          timeout: 120_000,
        });
        await reportResult(task.id, { outputPath, format: 'mp4' });
        break;
      }

      case 'render_flyer_pdf': {
        const html = (task.payload.html as string) ?? '';
        const flyerFormat = (task.payload.format as string) ?? 'flyer-a5';
        if (!html) throw new Error('HTML required for PDF render');
        const fs = await import('fs/promises');
        const path = await import('path');
        const { execSync } = await import('child_process');

        const dir = path.join(process.cwd(), 'compositions', `flyer_${task.id.slice(0, 8)}`);
        await fs.mkdir(dir, { recursive: true });
        const htmlPath = path.join(dir, 'flyer.html');
        await fs.writeFile(htmlPath, html);
        const pdfPath = path.join(dir, 'flyer.pdf');

        try {
          execSync(`npx puppeteer html "${htmlPath}" --output "${pdfPath}" --format "${flyerFormat.includes('a5') ? 'A5' : flyerFormat.includes('a6') ? 'A6' : flyerFormat.includes('a4') ? 'A4' : 'A5'}" --print-background`, {
            cwd: process.cwd(),
            stdio: 'pipe',
            timeout: 60_000,
          });
        } catch {
          // Puppeteer may not be installed — fallback message
        }

        try {
          const stat = await fs.stat(pdfPath);
          await reportResult(task.id, {
            pdfPath,
            pdfSizeBytes: stat.size,
            htmlPath,
            format: flyerFormat,
            message: stat.size > 0 ? 'PDF rendered successfully' : 'PDF render attempted — verify output',
          });
        } catch {
          await reportResult(task.id, {
            htmlPath,
            format: flyerFormat,
            message: 'HTML saved. Install puppeteer (npm i puppeteer) for PDF rendering, or open HTML in browser → Print → Save as PDF.',
            pdfNote: 'npx puppeteer html flyer.html --output flyer.pdf --format A5 --print-background',
          });
        }
        break;
      }

      case 'video_analysis': {
        const videoPath = (task.payload.videoPath as string) ?? (task.payload.videoUrl as string);
        if (!videoPath) throw new Error('videoPath or videoUrl required');

        const { execSync } = await import('child_process');
        const fs = await import('fs/promises');
        const path = await import('path');

        const dir = path.join(process.cwd(), 'compositions', `analysis_${task.id.slice(0, 8)}`);
        await fs.mkdir(dir, { recursive: true });

        // Extract frames every 2 seconds
        execSync(`ffmpeg -i "${videoPath}" -vf fps=1/2 "${path.join(dir, 'frame_%04d.jpg')}"`, {
          stdio: 'pipe',
          timeout: 120_000,
        });

        // Extract audio waveform data
        try {
          execSync(`ffmpeg -i "${videoPath}" -ac 1 -filter:a "aresample=8000" "${path.join(dir, 'audio.wav')}"`, {
            stdio: 'pipe',
            timeout: 60_000,
          });
        } catch {
          // Audio extraction optional
        }

        const frames = (await fs.readdir(dir))
          .filter((f: string) => f.endsWith('.jpg'))
          .sort()
          .map((f: string) => path.join(dir, f));

        // Return frame paths for analysis; the cloud agent will use Claude Vision
        await reportResult(task.id, {
          frames,
          audioPath: path.join(dir, 'audio.wav'),
          frameCount: frames.length,
          message: 'Frames extracted. Use analyze_video tool to process.',
        });
        break;
      }

      case 'design_critique': {
        const imageUrls = (task.payload.imageUrls as string[]) ?? [];
        const criteria = (task.payload.criteria as string[]) ?? ['composition', 'color', 'typography', 'hierarchy'];
        await reportResult(task.id, {
          imageUrls,
          criteria,
          status: 'ready_for_ai_review',
          message: 'Images ready. Agent will critique based on criteria.',
        });
        break;
      }

      case 'generate_and_embed_images': {
        const html = (task.payload.html as string) ?? '';
        const promptsJson = (task.payload.imagePrompts as string) ?? '[]';
        if (!html) throw new Error('HTML required for image embedding');
        const prompts: string[] = JSON.parse(promptsJson);
        if (!prompts.length) throw new Error('At least one image prompt required');

        const { generateImage } = await import('../src/lib/ai/image.js');
        const fs = await import('fs/promises');
        const path = await import('path');

        const dir = path.join(process.cwd(), 'compositions', `img_${task.id.slice(0, 8)}`);
        await fs.mkdir(dir, { recursive: true });

        let modifiedHtml = html;
        const images: Array<{ blobUrl: string | null; type: string; error?: string }> = [];

        for (let i = 0; i < Math.min(prompts.length, 5); i++) {
          try {
            const result = await generateImage(prompts[i]!, { aspectRatio: '1:1' });
            const imgPath = path.join(dir, `image_${i}.png`);
            await fs.writeFile(imgPath, result.buffer);

            // Upload to Vercel Blob if token available
            let blobUrl: string | null = null;
            const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
            if (blobToken) {
              try {
                const filename = `images/local-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
                const blobRes = await fetch(`https://blob.vercel-storage.com/${filename}`, {
                  method: 'PUT',
                  headers: {
                    Authorization: `Bearer ${blobToken}`,
                    'Content-Type': 'image/png',
                    'X-Content-Type-Options': 'nosniff',
                  },
                  body: new Uint8Array(result.buffer),
                });
                if (blobRes.ok) {
                  const blobData = await blobRes.json() as { url?: string };
                  blobUrl = blobData.url ?? null;
                }
              } catch { /* blob optional */ }
            }

            // Place image in HTML based on index (hero=0, product=1, background=2)
            if (blobUrl) {
              if (i === 0) {
                const heroHtml = `<div style="width:100%;max-height:50%;overflow:hidden;border-radius:4px;margin-bottom:16px;"><img src="${blobUrl}" alt="hero" style="width:100%;height:auto;object-fit:cover;display:block;" /></div>`;
                modifiedHtml = modifiedHtml.replace('<body>', `<body>\n${heroHtml}`);
              } else if (i === 1) {
                const productHtml = `<div style="float:right;width:40%;max-width:300px;margin:0 0 12px 16px;border-radius:6px;overflow:hidden;"><img src="${blobUrl}" alt="product" style="width:100%;height:auto;object-fit:cover;display:block;" /></div>`;
                const headingMatch = modifiedHtml.match(/<(h[12]|div class="panel-header")[^>]*>/);
                if (headingMatch) {
                  const idx = modifiedHtml.indexOf(headingMatch[0]) + headingMatch[0].length;
                  modifiedHtml = modifiedHtml.slice(0, idx) + productHtml + modifiedHtml.slice(idx);
                } else {
                  modifiedHtml = modifiedHtml.replace('<body>', `<body>\n${productHtml}`);
                }
              } else {
                const decorationHtml = `<div style="text-align:center;opacity:0.5;margin-top:16px;"><img src="${blobUrl}" alt="decoration" style="width:80px;height:auto;display:inline-block;" /></div>`;
                modifiedHtml = modifiedHtml.replace('</body>', `${decorationHtml}</body>`);
              }
            }

            images.push({ blobUrl, type: i === 0 ? 'hero' : i === 1 ? 'product' : 'decoration' });
          } catch (err: any) {
            images.push({ blobUrl: null, type: 'error', error: err.message ?? 'Unknown' });
          }
        }

        const htmlPath = path.join(dir, 'embedded.html');
        await fs.writeFile(htmlPath, modifiedHtml);
        await reportResult(task.id, {
          htmlPath,
          html: modifiedHtml,
          images,
          embeddedCount: images.filter(img => img.blobUrl).length,
          message: `${images.filter(img => img.blobUrl).length}/${prompts.length} gorsel uretildi ve HTML'e gomuldu.`,
        });
        break;
      }

      case 'general': {
        const command = task.payload.command as string;
        if (!command) throw new Error('command required for general task');
        const { execSync } = await import('child_process');
        const output = execSync(command, {
          cwd: process.cwd(),
          stdio: 'pipe',
          timeout: 300_000,
        });
        await reportResult(task.id, { output: output.toString(), exitCode: 0 });
        break;
      }

      default:
        await reportError(task.id, `Unknown task_type: ${task.task_type}`);
    }
  } catch (err: any) {
    console.error(`[local-agent] Task ${task.id} failed:`, err.message);
    await reportError(task.id, err.message ?? 'Unknown error');
  }
}

async function main() {
  console.log(`[local-agent] Worker ${WORKER_ID} starting — polling ${BASE}`);
  console.log(`[local-agent] Handlers: render_video, render_flyer_pdf, video_analysis, design_critique, generate_and_embed_images, general`);

  while (true) {
    try {
      const task = await poll();
      if (task) {
        await executeTask(task);
      }
    } catch (err: any) {
      if (err.message?.includes('401')) {
        console.error('[local-agent] Auth failed — check CRON_SECRET');
        process.exit(1);
      }
      console.error('[local-agent] Poll error:', err.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main();
