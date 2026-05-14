const BREVO_API = 'https://api.brevo.com/v3';

function apiKey(): string {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error('BREVO_API_KEY is not set');
  return key;
}

async function brevoFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${BREVO_API}${path}`, {
    ...opts,
    headers: {
      'api-key': apiKey(),
      'Content-Type': 'application/json',
      ...opts?.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.message ?? res.statusText;
    throw new Error(`Brevo API error (${res.status}): ${msg}`);
  }
  return body;
}

// ── Contacts ──

export interface BrevoContact {
  email: string;
  attributes?: Record<string, string>;
  listIds?: number[];
}

export async function createContact(contact: BrevoContact) {
  return brevoFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      email: contact.email,
      attributes: contact.attributes ?? {},
      listIds: contact.listIds ?? [2],
      updateEnabled: true,
    }),
  });
}

export async function createContacts(contacts: BrevoContact[]) {
  return brevoFetch('/contacts/import', {
    method: 'POST',
    body: JSON.stringify({
      jsonBody: contacts.map((c) => ({
        email: c.email,
        attributes: c.attributes ?? {},
      })),
      listIds: contacts[0]?.listIds ?? [2],
      updateExistingContacts: true,
    }),
  });
}

export async function getContact(email: string): Promise<BrevoContact | null> {
  try {
    const data = await brevoFetch(`/contacts/${encodeURIComponent(email)}`);
    return {
      email: data.email,
      attributes: data.attributes ?? {},
      listIds: data.listIds?.map((l: { id: number }) => l.id) ?? [],
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) {
      return null;
    }
    throw err;
  }
}

export async function getLists() {
  const data = await brevoFetch('/contacts/lists?limit=50');
  return (data.lists ?? []) as { id: number; name: string; totalSubscribers: number }[];
}

// ── Transactional Email ──

export interface SendEmailOpts {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  textContent?: string;
  sender?: { name: string; email: string };
  replyTo?: { email: string; name?: string };
  tags?: string[];
}

const DEFAULT_SENDER = { name: 'Fly & Froth', email: 'info@fly-froth.com' };

export async function sendEmail(opts: SendEmailOpts) {
  return brevoFetch('/smtp/email', {
    method: 'POST',
    body: JSON.stringify({
      sender: opts.sender ?? DEFAULT_SENDER,
      to: opts.to,
      replyTo: opts.replyTo ?? DEFAULT_SENDER,
      subject: opts.subject,
      htmlContent: opts.htmlContent,
      textContent: opts.textContent,
      tags: opts.tags,
    }),
  });
}

// ── Campaigns ──

export interface CreateCampaignOpts {
  name: string;
  subject: string;
  htmlContent: string;
  listIds: number[];
  sender?: { name: string; email: string };
  scheduledAt?: Date;
}

export async function createCampaign(opts: CreateCampaignOpts) {
  const body: Record<string, unknown> = {
    name: opts.name,
    subject: opts.subject,
    htmlContent: opts.htmlContent,
    sender: opts.sender ? { name: opts.sender.name, email: opts.sender.email } : { name: 'Mehmet Genco', email: 'info@fly-froth.com' },
    recipients: { listIds: opts.listIds },
    type: 'classic',
  };

  if (opts.scheduledAt) {
    body.scheduledAt = opts.scheduledAt.toISOString();
  }

  const data = await brevoFetch('/emailCampaigns', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data as { id: number; status: string };
}

export async function sendCampaignNow(campaignId: number) {
  return brevoFetch(`/emailCampaigns/${campaignId}/sendNow`, { method: 'POST' });
}

export async function getAccount() {
  return brevoFetch('/account') as Promise<{
    email: string;
    firstName: string;
    lastName: string;
    companyName: string;
  }>;
}
