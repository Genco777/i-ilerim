import { NextResponse } from 'next/server';
import { createContacts } from '@/lib/email/brevo';

const CONTACTS = [
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

export async function GET() {
  const listIds = (process.env.BREVO_LIST_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));

  try {
    const result = await createContacts(
      CONTACTS.map((email) => ({ email, attributes: {}, listIds })),
    );
    return NextResponse.json({ ok: true, count: CONTACTS.length, result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
