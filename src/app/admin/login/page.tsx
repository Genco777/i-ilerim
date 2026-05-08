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
            <div className="space-y-4">
              <form onSubmit={submit} className="space-y-3">
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
              </form>

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <div className="flex-1 h-px bg-border" />
                <span>OR</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={() =>
                  signIn('facebook', { callbackUrl: '/admin' }).catch((e) =>
                    setError(e instanceof Error ? e.message : 'Facebook login failed'),
                  )
                }
              >
                Continue with Facebook
              </Button>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
