import { config } from 'dotenv';
import { GoogleAdsApi } from 'google-ads-api';

config({ path: '.env.local' });
config({ path: '.env' });

const REQUIRED = [
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
] as const;

async function main() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing env vars:', missing.join(', '));
    process.exit(1);
  }

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });

  const customer = client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  });

  try {
    const rows = await customer.query(`
      SELECT customer.id, customer.descriptive_name, customer.currency_code,
             customer.time_zone, customer.conversion_tracking_setting.conversion_tracking_status
      FROM customer
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      console.error('❌ No customer row returned. Check customer_id and permissions.');
      process.exit(1);
    }
    console.log('✓ Connected to Google Ads');
    console.log('  Account:', row.customer?.descriptive_name);
    console.log('  Currency:', row.customer?.currency_code);
    console.log('  Time zone:', row.customer?.time_zone);
    console.log(
      '  Conversion tracking:',
      row.customer?.conversion_tracking_setting?.conversion_tracking_status,
    );
    if (row.customer?.currency_code !== 'EUR') {
      console.warn('⚠️  Customer currency is not EUR. Budget guard assumes EUR — review before going live.');
    }
  } catch (err) {
    console.error('❌ Google Ads API call failed:', err);
    process.exit(1);
  }
}

main();
