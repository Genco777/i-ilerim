'use client';

import { useState, type ChangeEvent } from 'react';
import type { BrandKit } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const POSITIONS = [
  'bottom_right',
  'bottom_left',
  'top_right',
  'top_left',
  'none',
] as const;

const MANUAL_DEFAULTS = [
  { value: 'ask', label: 'Sor (her seferinde)' },
  { value: 'always', label: 'Her zaman bindir' },
  { value: 'never', label: 'Asla bindirme' },
] as const;

export function BrandKitForm({ initial }: { initial: BrandKit }) {
  const [kit, setKit] = useState<BrandKit>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function uploadLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      setKit({ ...kit, logo_url: data.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/brand-kit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kit),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {kit.logo_url && (
            <div className="bg-slate-900 p-4 inline-block rounded">
              {/* Use plain <img> here: brand kit logos vary in host;
                  next/image needs explicit domain config per host. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={kit.logo_url}
                alt="logo"
                style={{ maxWidth: '180px', maxHeight: '120px' }}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="logo-upload">Logo PNG (transparan)</Label>
            <Input
              id="logo-upload"
              type="file"
              accept="image/png"
              onChange={uploadLogo}
              disabled={uploading}
            />
            {uploading && (
              <p className="text-sm text-muted-foreground">Yükleniyor…</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo-position">Konum</Label>
            <select
              id="logo-position"
              className="border rounded p-2 w-full bg-background"
              value={kit.logo_position}
              onChange={(e) =>
                setKit({ ...kit, logo_position: e.target.value })
              }
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Boyut: %{kit.logo_size_pct.toFixed(0)}</Label>
            <Slider
              min={5}
              max={40}
              step={1}
              value={[kit.logo_size_pct]}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value;
                setKit({ ...kit, logo_size_pct: v ?? kit.logo_size_pct });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Opaklık: {kit.logo_opacity.toFixed(2)}</Label>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={[kit.logo_opacity]}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value;
                setKit({ ...kit, logo_opacity: v ?? kit.logo_opacity });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo-padding">Padding (px)</Label>
            <Input
              id="logo-padding"
              type="number"
              min={0}
              max={200}
              value={kit.logo_padding_px}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) {
                  setKit({ ...kit, logo_padding_px: n });
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="manual-default">
              Manuel görsel default davranış
            </Label>
            <select
              id="manual-default"
              className="border rounded p-2 w-full bg-background"
              value={kit.manual_upload_logo_default}
              onChange={(e) =>
                setKit({
                  ...kit,
                  manual_upload_logo_default: e.target.value,
                })
              }
            >
              {MANUAL_DEFAULTS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Metin Tonu Rehberi (Almanca)</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={8}
            value={kit.text_tone_guide}
            onChange={(e) =>
              setKit({ ...kit, text_tone_guide: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground mt-2">
            Her Claude çağrısının system prompt&apos;una eklenir. Marka sesi,
            Almanca ton, hashtag stratejisi.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Görsel Stil Rehberi</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={8}
            value={kit.visual_style_guide}
            onChange={(e) =>
              setKit({ ...kit, visual_style_guide: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground mt-2">
            Her görsel üretiminde prompt&apos;a eklenir. AI&apos;nin marka
            estetiğine sadık kalmasını sağlar.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Yasak Kelimeler (virgülle)</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            value={kit.negative_words.join(', ')}
            onChange={(e) =>
              setKit({
                ...kit,
                negative_words: e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
          <p className="text-xs text-muted-foreground mt-2">
            Bu kelimeler AI metninde geçmesin.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4 sticky bottom-0 bg-slate-50 dark:bg-slate-950 py-4 border-t">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? 'Kaydediliyor…' : 'Brand Kit&apos;i Kaydet'}
        </Button>
        {savedAt && (
          <span className="text-sm text-green-600">
            ✓ Kaydedildi {savedAt}
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
