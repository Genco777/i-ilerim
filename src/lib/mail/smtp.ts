import nodemailer, { type Transporter } from 'nodemailer';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;
  const host = process.env.ZOHO_SMTP_HOST;
  const port = Number(process.env.ZOHO_SMTP_PORT ?? 465);
  const user = process.env.ZOHO_SMTP_USER;
  const pass = process.env.ZOHO_SMTP_PASS;
  if (!host || !user || !pass) {
    throw new Error('ZOHO_SMTP_* env vars are not set');
  }
  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return _transporter;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  body: string;
  attachments?: { filename: string; mime: string; base64: string }[];
}

export async function sendMail(
  opts: SendMailOptions,
): Promise<{ messageId: string }> {
  const from = process.env.ZOHO_SMTP_USER;
  if (!from) throw new Error('ZOHO_SMTP_USER is not set');

  const info = await getTransporter().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.body,
    attachments: (opts.attachments ?? []).map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.base64, 'base64'),
      contentType: a.mime,
    })),
  });
  return { messageId: info.messageId };
}
