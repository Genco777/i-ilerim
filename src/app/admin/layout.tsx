import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/admin/login');
  }

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-slate-900 text-white p-6 flex flex-col">
        <h1 className="text-xl font-bold mb-6">Fly &amp; Froth Admin</h1>
        <nav className="flex flex-col gap-1">
          <Link
            href="/admin"
            className="hover:bg-slate-800 px-3 py-2 rounded transition"
          >
            Dashboard
          </Link>
          <Link
            href="/admin/brand-kit"
            className="hover:bg-slate-800 px-3 py-2 rounded transition"
          >
            Brand Kit
          </Link>
        </nav>
        <div className="mt-auto pt-6 text-xs text-slate-400 break-all">
          {session.user.email}
        </div>
      </aside>
      <main className="flex-1 p-8 bg-slate-50 dark:bg-slate-950">
        {children}
      </main>
    </div>
  );
}
