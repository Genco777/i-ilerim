import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

import { createContacts } from '../src/lib/email/brevo';

const emails = [
  'fuegozbrand@gmail.com',
  'm-drake@web.de',
  'ag-fahrzeugpflege@gmx.de',
  'musie.estifanos@stud.h-da.de',
  'Info@waermebau24.com',
  'david-fortnite@web.de',
  'yasir58@live.de',
  'sahel.hakimi@gmx.de',
  'm.kaemmerer@senshu.de',
  'vargau.robert@yahoo.de',
  'mari.zenka@web.de',
  'info@stefko-trans.de',
  'belfkih@priorizone-services.com',
];

const listIds = (process.env.BREVO_LIST_IDS ?? '')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));

async function main() {
  console.log(`Adding ${emails.length} contacts to Brevo lists: ${listIds.join(', ')}`);
  const result = await createContacts(
    emails.map((email) => ({ email, attributes: {}, listIds })),
  );
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
