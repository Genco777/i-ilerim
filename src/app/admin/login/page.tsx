'use client';

import { signIn } from 'next-auth/react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await signIn('nodemailer', { email, redirect: false });
      if (result?.error) {
        setError(result.error);
      } else {
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Fly &amp; Froth Admin Login</CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-2 text-sm">
              <p>Magic link sent to <strong>{email}</strong>.</p>
              <p className="text-muted-foreground">
                Check your inbox and click the link to sign in.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@fly-froth.com"
                disabled={pending}
              />
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Sending...' : 'Send magic link'}
              </Button>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
