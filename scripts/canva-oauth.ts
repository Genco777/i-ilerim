/**
 * scripts/canva-oauth.ts
 *
 * Canva OAuth ilk bağlantı scripti — tek seferlik çalıştır.
 *
 * Kullanım:
 *   npx tsx scripts/canva-oauth.ts
 *
 * Gereksinimler (önce bunları yap):
 *   1. https://developer.canva.com → "Create an app"
 *      - Integration: Connect API
 *      - Scopes: design:content:read, design:content:write,
 *                asset:read, asset:write,
 *                brandtemplate:content:read, brandtemplate:meta:read
 *      - Redirect URI: http://localhost:3333/callback
 *   2. .env dosyasına ekle:
 *        CANVA_CLIENT_ID=AAA...
 *        CANVA_CLIENT_SECRET=BBB...
 *        DATABASE_URL=...   (mevcut Neon URL)
 */

import 'dotenv/config';
import * as http from 'http';
import * as crypto from 'crypto';
import { exchangeCodeForTokens } from '../src/lib/canva/client';

const CLIENT_ID = process.env.CANVA_CLIENT_ID;
const REDIRECT_URI = 'http://localhost:3333/callback';

if (!CLIENT_ID) {
  console.error('CANVA_CLIENT_ID eksik. .env dosyasını kontrol et.');
  process.exit(1);
}

// PKCE
const codeVerifier = crypto.randomBytes(64).toString('base64url');
const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
const state = crypto.randomBytes(16).toString('hex');

const authUrl = new URL('https://www.canva.com/api/oauth/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', [
  'design:content:read',
  'design:content:write',
  'asset:read',
  'asset:write',
  'brandtemplate:content:read',
  'brandtemplate:meta:read',
].join(' '));
authUrl.searchParams.set('state', state);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

console.log('\n─────────────────────────────────────────────');
console.log('Canva OAuth bağlantısı başlatılıyor...');
console.log('─────────────────────────────────────────────');
console.log('\nŞu URL\'yi tarayıcında aç:\n');
console.log(authUrl.toString());
console.log('\n─────────────────────────────────────────────\n');

// Callback sunucusu
const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://localhost:3333');
  if (url.pathname !== '/callback') return;

  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    res.end(`<h2>Hata: ${error}</h2>`);
    console.error('OAuth hata:', error);
    server.close();
    process.exit(1);
  }

  if (!code || returnedState !== state) {
    res.end('<h2>Geçersiz callback</h2>');
    server.close();
    process.exit(1);
  }

  try {
    const tokens = await exchangeCodeForTokens(code!, REDIRECT_URI);
    res.end('<h2>Canva bağlandı! Bu sekmeyi kapatabilirsin.</h2>');
    console.log('\n✅ Canva bağlantısı başarılı!');
    console.log('   Access token DB\'ye kaydedildi.');
    console.log('   expires_at:', new Date(tokens.expires_at).toLocaleString());
    console.log('\nŞimdi .env dosyasına şablon ID\'lerini ekle:');
    console.log('   CANVA_TEMPLATE_ID_DEFAULT=DAXXXXXXXX');
    console.log('   CANVA_TEMPLATE_ID_VITRINE=DAXXXXXXXX  (opsiyonel)');
    console.log('   CANVA_TEMPLATE_ID_REEL=DAXXXXXXXX      (opsiyonel)');
  } catch (e) {
    res.end(`<h2>Token alınamadı: ${e instanceof Error ? e.message : e}</h2>`);
    console.error('Token exchange hatası:', e);
  }

  server.close();
  process.exit(0);
});

server.listen(3333, () => {
  console.log('Callback sunucusu localhost:3333\'te hazir, tarayicida oturum ac...\n');
});
