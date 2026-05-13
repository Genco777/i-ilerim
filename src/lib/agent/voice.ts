import Anthropic from '@anthropic-ai/sdk';

// Transcribe voice message using OpenAI Whisper
export async function transcribeVoice(oggBuffer: Buffer): Promise<string> {
  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(oggBuffer)], { type: 'audio/ogg' });
    form.append('file', blob, 'voice.ogg');
    form.append('model', 'whisper-1');
    form.append('language', 'de'); // German primary, but Whisper auto-detects

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: form,
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[voice] Whisper error:', err);
      return '';
    }

    const data = (await response.json()) as { text: string };
    return data.text ?? '';
  } catch (err) {
    console.error('[voice] transcription error:', err);
    return '';
  }
}

// Text-to-speech using OpenAI TTS
export async function textToSpeech(text: string): Promise<Buffer | null> {
  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'onyx',
        input: text.slice(0, 4000), // TTS max input
        response_format: 'opus',
      }),
    });

    if (!response.ok) {
      console.error('[voice] TTS error:', await response.text());
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer;
  } catch (err) {
    console.error('[voice] TTS error:', err);
    return null;
  }
}

// Download a Telegram voice message file
export async function downloadTelegramVoice(fileId: string): Promise<Buffer | null> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN!;

    // Get file path
    const getFileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
    );
    const fileData = (await getFileRes.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };

    if (!fileData.ok || !fileData.result?.file_path) {
      console.error('[voice] getFile failed:', fileData);
      return null;
    }

    // Download
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    const downloadRes = await fetch(downloadUrl);
    const buffer = Buffer.from(await downloadRes.arrayBuffer());
    return buffer;
  } catch (err) {
    console.error('[voice] download error:', err);
    return null;
  }
}

// Handle voice message — returns transcribed text
export async function handleVoiceMessage(fileId: string): Promise<{
  transcribed: string;
  success: boolean;
}> {
  const buffer = await downloadTelegramVoice(fileId);
  if (!buffer) {
    return { transcribed: '', success: false };
  }

  const text = await transcribeVoice(buffer);
  if (!text) {
    return { transcribed: '', success: false };
  }

  return { transcribed: text, success: true };
}
