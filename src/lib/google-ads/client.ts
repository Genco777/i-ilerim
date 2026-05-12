import { GoogleAdsApi, Customer } from 'google-ads-api';
import { getSecret } from '@/lib/crypto/secrets';

// Secret keys mirror env-var names for consistency
const SECRET_KEYS = {
  developer_token: 'google_ads.developer_token',
  client_id: 'google_ads.client_id',
  client_secret: 'google_ads.client_secret',
  refresh_token: 'google_ads.refresh_token',
  customer_id: 'google_ads.customer_id',
  login_customer_id: 'google_ads.login_customer_id',
} as const;

async function resolveCredential(envVar: string, secretKey: string): Promise<string | null> {
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return getSecret(secretKey);
}

let cachedCustomer: Customer | null = null;

export async function getCustomer(): Promise<Customer> {
  if (cachedCustomer) return cachedCustomer;

  const [developer_token, client_id, client_secret, refresh_token, customer_id, login_customer_id] =
    await Promise.all([
      resolveCredential('GOOGLE_ADS_DEVELOPER_TOKEN', SECRET_KEYS.developer_token),
      resolveCredential('GOOGLE_ADS_CLIENT_ID', SECRET_KEYS.client_id),
      resolveCredential('GOOGLE_ADS_CLIENT_SECRET', SECRET_KEYS.client_secret),
      resolveCredential('GOOGLE_ADS_REFRESH_TOKEN', SECRET_KEYS.refresh_token),
      resolveCredential('GOOGLE_ADS_CUSTOMER_ID', SECRET_KEYS.customer_id),
      resolveCredential('GOOGLE_ADS_LOGIN_CUSTOMER_ID', SECRET_KEYS.login_customer_id),
    ]);

  const required = { developer_token, client_id, client_secret, refresh_token, customer_id };
  for (const [k, v] of Object.entries(required)) {
    if (!v) throw new Error(`Google Ads credential missing: ${k}`);
  }

  const api = new GoogleAdsApi({
    client_id: client_id!,
    client_secret: client_secret!,
    developer_token: developer_token!,
  });

  cachedCustomer = api.Customer({
    customer_id: customer_id!,
    login_customer_id: login_customer_id || undefined,
    refresh_token: refresh_token!,
  });
  return cachedCustomer;
}

export async function getCustomerCurrency(): Promise<string> {
  const customer = await getCustomer();
  const rows = await customer.query(
    `SELECT customer.currency_code FROM customer LIMIT 1`,
  );
  const code = (rows as { customer?: { currency_code?: string } }[])[0]?.customer?.currency_code;
  if (!code) throw new Error('Could not read customer currency');
  return code;
}

// For tests only: reset the cached customer
export function __resetCustomerCache(): void {
  cachedCustomer = null;
}
