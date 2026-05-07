import { NextResponse } from 'next/server';
import { sendMessage } from '@/lib/telegram/bot';

interface TelegramUser {
  id: number;
  first_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number };
  text?: string;
  date: number;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
  };
}

function allowedUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function webhookSecret(): string | undefined {
  return process.env.TELEGRAM_WEBHOOK_SECRET;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ secret: string }> },
) {
  const { secret } = await ctx.params;
  const expected = webhookSecret();
  if (!expected || secret !== expected) {
    return new NextResponse('Not found', { status: 404 });
  }

  const update = (await req.json()) as TelegramUpdate;
  const userId =
    update.message?.from?.id ?? update.callback_query?.from?.id ?? 0;
  const chatId = update.message?.chat.id ?? 0;

  // Allowlist: only the operator may use this bot.
  if (!allowedUserIds().includes(userId)) {
    if (chatId) {
      await sendMessage({
        chatId,
        text: 'Bu bot özel — yalnızca yetkili kullanıcı için.',
      }).catch(() => {});
    }
    return NextResponse.json({ ok: true, ignored: 'unauthorized' });
  }

  // Dispatch
  const text = update.message?.text?.trim();
  if (text === '/start') {
    await sendMessage({
      chatId,
      text: [
        '👋 Merhaba Mehmet! Fly & Froth bot aktif.',
        '',
        'Şu an hazır komutlar:',
        '  /start — bu mesaj',
        '  /help  — komut listesi',
        '',
        '🚧 İçerik üretimi (`/post`, `/raw`, `/queue`, `/stats`) sonraki task\'larda gelecek.',
      ].join('\n'),
    });
  } else if (text === '/help') {
    await sendMessage({
      chatId,
      text: [
        '📋 Komut listesi (gelecek):',
        '  /post <konu> — AI metin + görsel üret + onay iste',
        '  /raw <metin> — manuel paylaşım (AI dokunmaz)',
        '  /queue       — bekleyen taslakları listele',
        '  /stats       — son 7 gün istatistikleri',
        '',
        '🚧 Şu an sadece /start ve /help cevap veriyor. Tam komutlar Faz 1 sonunda.',
      ].join('\n'),
    });
  } else if (text) {
    await sendMessage({
      chatId,
      text: `❓ Anlamadım: "${text}". /help yaz.`,
    });
  }

  return NextResponse.json({ ok: true });
}
