const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export interface ParsedMailCommand {
  recipient: string;
  instruction: string;
}

export function parseMailCommand(text: string): ParsedMailCommand | null {
  const match = text.match(EMAIL_REGEX);
  if (!match) return null;
  const recipient = match[0];
  const instruction = text.replace(EMAIL_REGEX, '').replace(/\s+/g, ' ').trim();
  if (!instruction) return null;
  return { recipient, instruction };
}
